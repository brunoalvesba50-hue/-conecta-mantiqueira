-- Conecta: destaques pagos (evento em destaque e classificado em destaque).
-- Só o administrador ativa. Pode rodar mais de uma vez; não apaga nada.
create table if not exists public.cm_boosts (
  kind text not null check (kind in ('event','classified')),
  item_id text not null,
  until timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (kind, item_id)
);
create index if not exists cm_boosts_until_idx on public.cm_boosts (until);
alter table public.cm_boosts enable row level security;
drop policy if exists "destaques: todos podem ver" on public.cm_boosts;
create policy "destaques: todos podem ver" on public.cm_boosts for select using (true);
drop policy if exists "destaques: só admin cria" on public.cm_boosts;
create policy "destaques: só admin cria" on public.cm_boosts for insert to authenticated with check (cm_is_admin());
drop policy if exists "destaques: só admin muda" on public.cm_boosts;
create policy "destaques: só admin muda" on public.cm_boosts for update to authenticated using (cm_is_admin()) with check (cm_is_admin());
drop policy if exists "destaques: só admin apaga" on public.cm_boosts;
create policy "destaques: só admin apaga" on public.cm_boosts for delete to authenticated using (cm_is_admin());
