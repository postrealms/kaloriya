-- Калорія — відгуки тестувальників (оцінка точності розбору + повідомлення розробнику).
-- Окремий модуль: можна прибрати, запустивши supabase/feedback_rollback.sql.
-- Запуск: Supabase → SQL Editor → New query → встав увесь файл → Run. Можна запускати повторно.

-- Оцінка «точно / неточно» для конкретного розбору (одна на розбір; повторний клік змінює її)
create table if not exists public.meal_ratings (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  meal_id     text not null,
  rating      smallint not null check (rating in (-1, 1)),
  comment     text check (char_length(comment) <= 1000),
  lang        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, meal_id)
);
alter table public.meal_ratings enable row level security;
drop policy if exists "ratings: read own"   on public.meal_ratings;
drop policy if exists "ratings: insert own" on public.meal_ratings;
drop policy if exists "ratings: update own" on public.meal_ratings;
drop policy if exists "ratings: delete own" on public.meal_ratings;
create policy "ratings: read own"   on public.meal_ratings for select to authenticated using (auth.uid() = user_id);
create policy "ratings: insert own" on public.meal_ratings for insert to authenticated with check (auth.uid() = user_id);
create policy "ratings: update own" on public.meal_ratings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ratings: delete own" on public.meal_ratings for delete to authenticated using (auth.uid() = user_id);

-- Вільні повідомлення розробнику з налаштувань
create table if not exists public.feedback_messages (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  message     text not null check (char_length(message) between 1 and 2000),
  lang        text,
  app_version text,
  created_at  timestamptz not null default now()
);
alter table public.feedback_messages enable row level security;
drop policy if exists "messages: read own"   on public.feedback_messages;
drop policy if exists "messages: insert own" on public.feedback_messages;
create policy "messages: read own"   on public.feedback_messages for select to authenticated using (auth.uid() = user_id);
create policy "messages: insert own" on public.feedback_messages for insert to authenticated with check (auth.uid() = user_id);
