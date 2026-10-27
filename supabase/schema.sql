-- Калорія — схема бази Supabase.
-- Запуск: Supabase → SQL Editor → New query → встав увесь файл → Run.
-- Скрипт можна запускати повторно: він нічого не дублює і не стирає дані.

-- ---------- Профіль: денна ціль і мова ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  goal        int check (goal between 500 and 10000),
  lang        text,
  updated_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: insert own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own"   on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- Історія розборів ----------
create table if not exists public.meals (
  id          text primary key,                       -- генерується в застосунку
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  dish        text,
  weight      int,
  kcal        int,
  protein     real,
  fat         real,
  carbs       real,
  hint        text,
  lang        text,
  analysis    jsonb not null,
  thumb_path  text                                    -- шлях у бакеті thumbs
);
create index if not exists meals_user_created on public.meals (user_id, created_at desc);
alter table public.meals enable row level security;

drop policy if exists "meals: read own"   on public.meals;
drop policy if exists "meals: insert own" on public.meals;
drop policy if exists "meals: update own" on public.meals;
drop policy if exists "meals: delete own" on public.meals;
create policy "meals: read own"   on public.meals for select to authenticated using (auth.uid() = user_id);
create policy "meals: insert own" on public.meals for insert to authenticated with check (auth.uid() = user_id);
create policy "meals: update own" on public.meals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meals: delete own" on public.meals for delete to authenticated using (auth.uid() = user_id);

-- ---------- Денний ліміт аналізів (пише тільки сервер) ----------
create table if not exists public.usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  count    int  not null default 0,
  primary key (user_id, day)
);
alter table public.usage enable row level security;
drop policy if exists "usage: read own" on public.usage;
create policy "usage: read own" on public.usage for select to authenticated using (auth.uid() = user_id);

-- +1 аналіз, якщо ліміт не вичерпано. Повертає новий лічильник або NULL, коли ліміт досягнуто.
create or replace function public.use_analysis(p_user uuid, p_limit int)
returns int language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into public.usage as u (user_id, day, count)
  values (p_user, (now() at time zone 'Europe/Kyiv')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1 where u.count < p_limit
  returning u.count into c;
  return c;
end $$;

-- Повертає аналіз у ліміт, якщо Claude не впорався (щоб збій не з'їдав спробу).
create or replace function public.refund_analysis(p_user uuid)
returns void language sql security definer set search_path = public as $$
  update public.usage set count = greatest(count - 1, 0)
  where user_id = p_user and day = (now() at time zone 'Europe/Kyiv')::date;
$$;

revoke all on function public.use_analysis(uuid, int)  from public, anon, authenticated;
revoke all on function public.refund_analysis(uuid)    from public, anon, authenticated;
grant execute on function public.use_analysis(uuid, int) to service_role;
grant execute on function public.refund_analysis(uuid)   to service_role;

-- ---------- Мініатюри фото (приватний бакет, кожен бачить лише свою папку) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('thumbs', 'thumbs', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "thumbs: read own"   on storage.objects;
drop policy if exists "thumbs: insert own" on storage.objects;
drop policy if exists "thumbs: update own" on storage.objects;
drop policy if exists "thumbs: delete own" on storage.objects;
create policy "thumbs: read own"   on storage.objects for select to authenticated
  using (bucket_id = 'thumbs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "thumbs: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "thumbs: update own" on storage.objects for update to authenticated
  using (bucket_id = 'thumbs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "thumbs: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'thumbs' and (storage.foldername(name))[1] = auth.uid()::text);
