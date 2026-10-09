-- Conecta Mantiqueira: @ (nome de usuário) único por pessoa.
-- Cole no Supabase > SQL Editor > Run. Pode rodar mais de uma vez sem problema.
-- Sem isso o @ já funciona, mas duas pessoas poderiam escolher o mesmo @ ao mesmo tempo.
create unique index if not exists profiles_handle_uniq
  on public.profiles ((lower(extras->>'handle')))
  where coalesce(extras->>'handle','') <> '';

-- busca mais rápida pelo @
create index if not exists profiles_handle_idx
  on public.profiles ((lower(extras->>'handle')));
