-- ChipaWAT — paso 1: login seguro + perfiles + grupos
-- Pegar y ejecutar este archivo completo en Supabase → SQL Editor → New query → Run.
-- Es seguro volver a correrlo si algo falla a la mitad (usa "if not exists" / "or replace").

-- ============================================================
-- 1. PROFILES
-- Cada usuaria de Supabase Auth (auth.users) tiene una fila acá
-- con los datos que SÍ queremos mostrar en la app (nombre, color).
-- La contraseña, el email, etc. quedan en auth.users, que maneja
-- Supabase Auth de forma segura (hasheada) — nunca la tocamos nosotras.
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  color text not null default '#d36a97',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: cualquier usuaria logueada puede verlas" on public.profiles;
create policy "profiles: cualquier usuaria logueada puede verlas"
  on public.profiles for select
  to authenticated
  using (true);

drop policy if exists "profiles: cada una edita su propio perfil" on public.profiles;
create policy "profiles: cada una edita su propio perfil"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Crea automáticamente el profile apenas alguien se registra en Supabase Auth.
-- El nombre sale de las opciones que mandamos desde el frontend en el signUp
-- (options.data.name); si no viene, usa la parte antes del @ del email.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. GROUPS y GROUP_MEMBERS
-- Un "group" es, por ejemplo, la casa/viaje compartido (ChipaWAT).
-- group_members dice quién pertenece a qué grupo y con qué rol.
-- ============================================================

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

drop policy if exists "groups: ver solo los grupos propios" on public.groups;
create policy "groups: ver solo los grupos propios"
  on public.groups for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "group_members: ver membresias de mis grupos" on public.group_members;
create policy "group_members: ver membresias de mis grupos"
  on public.group_members for select
  to authenticated
  using (
    exists (
      select 1 from public.group_members my
      where my.group_id = group_members.group_id and my.user_id = auth.uid()
    )
  );

drop policy if exists "group_members: admins agregan integrantes" on public.group_members;
create policy "group_members: admins agregan integrantes"
  on public.group_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.group_members my
      where my.group_id = group_members.group_id
        and my.user_id = auth.uid()
        and my.role in ('owner', 'admin')
    )
  );

drop policy if exists "group_members: admins sacan integrantes" on public.group_members;
create policy "group_members: admins sacan integrantes"
  on public.group_members for delete
  to authenticated
  using (
    exists (
      select 1 from public.group_members my
      where my.group_id = group_members.group_id
        and my.user_id = auth.uid()
        and my.role in ('owner', 'admin')
    )
  );

-- Crear un grupo nuevo y sumarte como owner, todo junto y sin líos de RLS.
-- Desde el frontend se llama con: supabase.rpc('create_group', { group_name, group_description })
create or replace function public.create_group(group_name text, group_description text default '')
returns public.groups
language plpgsql
security definer set search_path = public
as $$
declare
  new_group public.groups;
begin
  insert into public.groups (name, description, created_by)
  values (group_name, group_description, auth.uid())
  returning * into new_group;

  insert into public.group_members (group_id, user_id, role)
  values (new_group.id, auth.uid(), 'owner');

  return new_group;
end;
$$;
