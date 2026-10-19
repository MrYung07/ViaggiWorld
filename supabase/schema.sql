-- ViaggiWorld: schema Supabase (PostgreSQL)
-- Supabase Dashboard -> SQL Editor -> New query -> incolla ed esegui.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '',
  image_url text,
  price numeric(10,2) not null check (price > 0),
  currency text not null default 'eur' check (currency = 'eur'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'Viaggiatore',
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  offer_id uuid references public.offers(id) on delete set null,
  amount_total integer not null check (amount_total > 0),
  currency text not null default 'eur',
  stripe_session_id text unique,
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists chat_messages_created_at_idx on public.chat_messages (created_at desc);
create index if not exists offers_active_created_at_idx on public.offers (active, created_at desc);
create index if not exists orders_user_id_idx on public.orders (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.offers enable row level security;
alter table public.chat_messages enable row level security;
alter table public.orders enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'); $$;

drop policy if exists "Profiles readable by owner or admin" on public.profiles;
create policy "Profiles readable by owner or admin" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());
drop policy if exists "Anyone can read active offers" on public.offers;
create policy "Anyone can read active offers" on public.offers for select to anon, authenticated
using (active = true or public.is_admin());
drop policy if exists "Admins can insert offers" on public.offers;
create policy "Admins can insert offers" on public.offers for insert to authenticated
with check (public.is_admin() and created_by = auth.uid());
drop policy if exists "Admins can update offers" on public.offers;
create policy "Admins can update offers" on public.offers for update to authenticated
using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Admins can delete offers" on public.offers;
create policy "Admins can delete offers" on public.offers for delete to authenticated
using (public.is_admin());

drop policy if exists "Authenticated users read chat" on public.chat_messages;
create policy "Authenticated users read chat" on public.chat_messages for select to authenticated using (true);
drop policy if exists "Users send their own messages" on public.chat_messages;
create policy "Users send their own messages" on public.chat_messages for insert to authenticated
with check (user_id = auth.uid() and char_length(content) between 1 and 1000);
drop policy if exists "Users delete own messages or admins moderate" on public.chat_messages;
create policy "Users delete own messages or admins moderate" on public.chat_messages for delete to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "Users can read own orders" on public.orders;
create policy "Users can read own orders" on public.orders for select to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Abilita Realtime per i nuovi messaggi chat.
do $$ begin
  alter publication supabase_realtime add table public.chat_messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;

-- Dopo aver creato il tuo account, sostituisci l'email e lancia:
-- update public.profiles p set role = 'admin'
-- from auth.users u where p.id = u.id and u.email = 'LA_TUA_EMAIL';
