-- Conecta Mantiqueira: Eventos completos, iguais ao mockup.
-- Horário de término, várias categorias, etiquetas (ex.: "Ao ar livre"), galeria de fotos,
-- visualizações (uma por pessoa) e comentários.
-- Cole no Supabase > SQL Editor > Run. Pode rodar mais de uma vez sem problema.
-- Sem isso a tela de Eventos continua funcionando, só sem esses detalhes.

-- 1) novos campos do evento
alter table public.serra_posts add column if not exists ends_at timestamptz;
alter table public.serra_posts add column if not exists categories text[] not null default '{}';
alter table public.serra_posts add column if not exists tags text[] not null default '{}';
alter table public.serra_posts add column if not exists gallery text[] not null default '{}';

do $$ begin
  alter table public.serra_posts add constraint serra_posts_categories_max check (cardinality(categories) <= 4);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.serra_posts add constraint serra_posts_tags_max check (cardinality(tags) <= 6);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.serra_posts add constraint serra_posts_gallery_max check (cardinality(gallery) <= 8);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.serra_posts add constraint serra_posts_ends_after check (ends_at is null or event_at is null or ends_at >= event_at);
exception when duplicate_object then null; end $$;

-- 2) visualizações: cada pessoa conta uma vez por evento
create table if not exists public.serra_event_views (
  post_id uuid not null references public.serra_posts(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.serra_event_views enable row level security;

drop policy if exists event_views_insert_own on public.serra_event_views;
create policy event_views_insert_own on public.serra_event_views
  for insert to authenticated with check (user_id = auth.uid());

-- só a própria pessoa e quem criou o evento enxergam as visualizações
drop policy if exists event_views_select on public.serra_event_views;
create policy event_views_select on public.serra_event_views
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.serra_posts p where p.id = post_id and p.user_id = auth.uid())
  );

-- 3) comentários do evento
create table if not exists public.serra_event_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.serra_posts(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists serra_event_comments_post_idx on public.serra_event_comments (post_id, created_at);
alter table public.serra_event_comments enable row level security;

drop policy if exists event_comments_select on public.serra_event_comments;
create policy event_comments_select on public.serra_event_comments
  for select to authenticated using (true);

drop policy if exists event_comments_insert_own on public.serra_event_comments;
create policy event_comments_insert_own on public.serra_event_comments
  for insert to authenticated with check (user_id = auth.uid());

-- apaga quem escreveu ou quem criou o evento
drop policy if exists event_comments_delete on public.serra_event_comments;
create policy event_comments_delete on public.serra_event_comments
  for delete to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.serra_posts p where p.id = post_id and p.user_id = auth.uid())
  );
