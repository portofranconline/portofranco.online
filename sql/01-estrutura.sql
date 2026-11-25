-- ============================================================
-- SISTEMA PORTO FRANCO ONLINE — INSTALAÇÃO DO BANCO (Supabase)
-- Estrutura do banco: tabelas, funções e regras de acesso (sem dados).
-- Já instalado em 25/11/2026. Pode rodar de novo com segurança: não apaga dados.
-- Projeto Supabase: portofranco.online (lbvhvusppihzwtptgnxx).
-- ============================================================

begin;

create extension if not exists pgcrypto with schema extensions;

-- 1. Documentos do sistema (cada módulo guarda seus dados aqui)
create table if not exists public.app_docs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2. Perfis de acesso: admin (tudo). Outros papéis não veem os dados.
create table if not exists public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login text not null,
  papel text not null check (papel in ('admin','editor','leitura')),
  criado_em timestamptz not null default now()
);
create unique index if not exists perfis_login_unico on public.perfis (lower(login));

-- 3. Funções de apoio
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select papel from public.perfis where user_id = auth.uid();
$$;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = 'admin', false);
$$;

-- só o administrador vê e altera os dados (Publicidade, Painel, Tabelas)
create or replace function public.pode_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_papel() = 'admin', false);
$$;

create or replace function public.tem_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where papel = 'admin');
$$;

-- login "Kaliel" vira e-mail interno kaliel@pfonline.local (nunca recebe mensagens)
create or replace function public.email_do_login(p_login text) returns text
language sql immutable as $$
  select case when position('@' in p_login) > 0 then lower(trim(p_login)) else
    regexp_replace(lower(translate(trim(p_login),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]', '', 'g') || '@pfonline.local' end;
$$;

create or replace function public.criar_usuario_auth(p_email text, p_senha text) returns uuid
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_id uuid := gen_random_uuid();
begin
  if length(coalesce(p_senha,'')) < 6 then raise exception 'Use uma senha com pelo menos 6 caracteres.'; end if;
  if exists (select 1 from auth.users where email = p_email) then raise exception 'Esse login já existe.'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
      extensions.crypt(p_senha, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_id,
      jsonb_build_object('sub', v_id::text, 'email', p_email, 'email_verified', true, 'phone_verified', false),
      'email', v_id::text, now(), now(), now());
  return v_id;
end $$;

-- primeiro administrador (só funciona enquanto não houver nenhum)
create or replace function public.criar_primeiro_admin(p_login text, p_senha text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_id uuid; v_email text := public.email_do_login(p_login);
begin
  if public.tem_admin() then raise exception 'Já existe um administrador.'; end if;
  if trim(coalesce(p_login,'')) = '' then raise exception 'Digite o login.'; end if;
  v_id := public.criar_usuario_auth(v_email, p_senha);
  insert into public.perfis (user_id, login, papel) values (v_id, trim(p_login), 'admin');
  return v_email;
end $$;

-- administrador cria login (papel: admin, editor ou leitura)
create or replace function public.criar_login(p_login text, p_senha text, p_papel text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_id uuid;
begin
  if not public.eh_admin() then raise exception 'Apenas o administrador cria logins.'; end if;
  if trim(coalesce(p_login,'')) = '' then raise exception 'Digite o login.'; end if;
  if p_papel not in ('admin','editor','leitura') then raise exception 'Tipo de acesso inválido.'; end if;
  if exists (select 1 from public.perfis where lower(login) = lower(trim(p_login))) then raise exception 'Esse login já existe.'; end if;
  v_id := public.criar_usuario_auth(public.email_do_login(p_login), p_senha);
  insert into public.perfis (user_id, login, papel) values (v_id, trim(p_login), p_papel);
end $$;

create or replace function public.mudar_papel(p_login text, p_papel text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Apenas o administrador muda acessos.'; end if;
  if p_papel not in ('admin','editor','leitura') then raise exception 'Tipo de acesso inválido.'; end if;
  update public.perfis set papel = p_papel where lower(login) = lower(trim(p_login));
  if not public.tem_admin() then raise exception 'O sistema precisa de pelo menos um administrador.'; end if;
end $$;

create or replace function public.redefinir_senha(p_login text, p_senha text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_id uuid;
begin
  if not public.eh_admin() then raise exception 'Apenas o administrador redefine senhas.'; end if;
  if length(coalesce(p_senha,'')) < 6 then raise exception 'Use uma senha com pelo menos 6 caracteres.'; end if;
  select user_id into v_id from public.perfis where lower(login) = lower(trim(p_login));
  if v_id is null then raise exception 'Login não encontrado.'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_senha, extensions.gen_salt('bf')), updated_at = now() where id = v_id;
end $$;

-- remover login: apaga a conta (a pessoa perde o acesso na hora)
create or replace function public.remover_login(p_login text) returns void
language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not public.eh_admin() then raise exception 'Apenas o administrador remove logins.'; end if;
  select user_id into v_id from public.perfis where lower(login) = lower(trim(p_login));
  if v_id is null then raise exception 'Login não encontrado.'; end if;
  if v_id = auth.uid() then raise exception 'Você não pode remover o seu próprio login.'; end if;
  delete from auth.users where id = v_id;
end $$;

-- atualização parcial de um documento (mescla campos de primeiro nível)
create or replace function public.doc_merge(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_editar() then raise exception 'seu login não tem permissão para alterar'; end if;
  insert into public.app_docs (id, data, updated_at) values (p_id, p_patch, now())
  on conflict (id) do update set data = public.app_docs.data || excluded.data, updated_at = now();
end $$;

-- 4. Regras de acesso (RLS)
alter table public.app_docs enable row level security;
alter table public.perfis enable row level security;

drop policy if exists docs_ler on public.app_docs;
drop policy if exists docs_inserir on public.app_docs;
drop policy if exists docs_atualizar on public.app_docs;
drop policy if exists docs_apagar on public.app_docs;
create policy docs_ler on public.app_docs for select to authenticated using (public.eh_admin());
create policy docs_inserir on public.app_docs for insert to authenticated with check (public.pode_editar());
create policy docs_atualizar on public.app_docs for update to authenticated using (public.pode_editar()) with check (public.pode_editar());
create policy docs_apagar on public.app_docs for delete to authenticated using (public.eh_admin());

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (user_id = auth.uid() or public.eh_admin());

-- 5. Permissões das funções
revoke all on function public.criar_usuario_auth(text,text) from public, anon, authenticated;
revoke all on function public.doc_merge(text,jsonb) from public, anon;
revoke all on function public.criar_login(text,text,text) from public, anon;
revoke all on function public.mudar_papel(text,text) from public, anon;
revoke all on function public.redefinir_senha(text,text) from public, anon;
revoke all on function public.remover_login(text) from public, anon;
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.eh_admin() to authenticated;
grant execute on function public.pode_editar() to authenticated;
grant execute on function public.tem_admin() to anon, authenticated;
grant execute on function public.email_do_login(text) to anon, authenticated;
grant execute on function public.criar_primeiro_admin(text,text) to anon, authenticated;
grant execute on function public.criar_login(text,text,text) to authenticated;
grant execute on function public.mudar_papel(text,text) to authenticated;
grant execute on function public.redefinir_senha(text,text) to authenticated;
grant execute on function public.remover_login(text) to authenticated;
grant execute on function public.doc_merge(text,jsonb) to authenticated;

commit;

-- conferência
select id, jsonb_typeof(data) as tipo, updated_at from public.app_docs order by id;
