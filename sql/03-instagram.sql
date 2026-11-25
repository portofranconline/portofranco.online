-- ============================================================
-- 03 — ANÁLISE DE INSTAGRAM
-- Cria a tabela onde a função "instagram" guarda o token renovado.
-- Ninguém do site lê essa tabela: só a própria função (chave de serviço).
-- Rode uma vez no SQL Editor do projeto portofranco.online.
-- ============================================================
begin;

create table if not exists public.segredos (
  nome text primary key,
  valor text not null,
  atualizado timestamptz not null default now()
);
alter table public.segredos enable row level security;
-- sem nenhuma política: o site (anon e logados) não lê nem grava
revoke all on public.segredos from anon, authenticated;

commit;

select 'segredos criada' as ok;
