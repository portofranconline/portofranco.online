-- ============================================================
-- 04 — PROTEÇÃO DOS DADOS (26/11/2026)
-- Rodar uma vez no Supabase › SQL Editor › New query › Run.
-- 1) doc_merge passa a JUNTAR as alterações em todos os níveis
--    (antes trocava a lista inteira de clientes pelo cliente alterado).
-- 2) Bloqueia qualquer gravação que apague vários clientes de uma vez.
-- 3) Guarda uma cópia automática de cada documento antes de cada gravação
--    (tabela app_docs_historico, últimas 200 por documento).
-- Pode rodar de novo sem problema.
-- ============================================================

create or replace function public.jsonb_juntar(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
      (select coalesce(jsonb_object_agg(k,
          case when a ? k and b ? k then public.jsonb_juntar(a -> k, b -> k)
               when b ? k then b -> k else a -> k end), '{}'::jsonb)
       from (select jsonb_object_keys(a) k union select jsonb_object_keys(b)) chaves)
    else b end
$$;

create or replace function public.doc_merge(p_id text, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_editar() then raise exception 'seu login não tem permissão para alterar'; end if;
  insert into public.app_docs (id, data, updated_at) values (p_id, p_patch, now())
  on conflict (id) do update set data = public.jsonb_juntar(public.app_docs.data, excluded.data), updated_at = now();
end $$;
revoke all on function public.doc_merge(text,jsonb) from public, anon;
grant execute on function public.doc_merge(text,jsonb) to authenticated;

create table if not exists public.app_docs_historico (
  n bigserial primary key, id text not null, data jsonb, gravado_em timestamptz default now());
alter table public.app_docs_historico enable row level security;
drop policy if exists hist_ler on public.app_docs_historico;
create policy hist_ler on public.app_docs_historico for select to authenticated using (public.eh_admin());

create or replace function public.proteger_app_docs() returns trigger
language plpgsql security definer set search_path = public as $$
declare a int; d int;
begin
  if tg_op = 'UPDATE' then
    a := case when jsonb_typeof(old.data -> 'clientes') = 'object' then (select count(*) from jsonb_object_keys(old.data -> 'clientes')) else 0 end;
    d := case when jsonb_typeof(new.data -> 'clientes') = 'object' then (select count(*) from jsonb_object_keys(new.data -> 'clientes')) else 0 end;
    if a >= 3 and d < a - 1 then
      raise exception 'Gravação bloqueada para proteger os dados: apagaria % clientes de %.', a - d, new.id;
    end if;
    insert into public.app_docs_historico (id, data) values (old.id, old.data);
    delete from public.app_docs_historico h where h.id = old.id
      and h.n not in (select n from public.app_docs_historico where id = old.id order by n desc limit 200);
  end if;
  return new;
end $$;

drop trigger if exists proteger_app_docs on public.app_docs;
create trigger proteger_app_docs before update on public.app_docs
  for each row execute function public.proteger_app_docs();

select 'proteção instalada' as resultado;
