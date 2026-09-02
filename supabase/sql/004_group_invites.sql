-- ChipaWAT — paso 4: cualquiera puede crear grupos e invitar por link
-- Requiere 001, 002 y 003 corridos antes.
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.
--
-- Idea: como un grupo de WhatsApp. Quien crea el grupo queda como dueña,
-- genera un link con un código, y quien abre ese link se suma sola.

-- ============================================================
-- 1. Tabla de invitaciones
-- ============================================================

create table if not exists public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer,
  uses_count integer not null default 0,
  revoked boolean not null default false
);

create index if not exists group_invites_group_id_idx on public.group_invites (group_id);

alter table public.group_invites enable row level security;

-- Las integrantes del grupo pueden VER los links (para copiarlos y compartirlos).
-- Crear, dar de baja y usar un link pasa siempre por las funciones de abajo,
-- así que no hay policies de insert/update/delete: quedan prohibidos directo.
drop policy if exists "group_invites: verlos si sos del grupo" on public.group_invites;
create policy "group_invites: verlos si sos del grupo"
  on public.group_invites for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = group_invites.group_id and gm.user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. Generador de códigos
-- ============================================================
-- 10 caracteres, sin i/l/o/0/1 para que no se confundan al leerlos.

create or replace function public.generate_invite_code()
returns text
language sql
volatile
as $$
  select string_agg(
    substr('abcdefghjkmnpqrstuvwxyz23456789', floor(random() * 31)::int + 1, 1),
    ''
  )
  from generate_series(1, 10);
$$;

-- ============================================================
-- 3. Crear una invitación
-- ============================================================
-- Solo la dueña o una admin del grupo (o la admin global).
-- expires_in_days = null → no vence. invite_max_uses = null → usos ilimitados.

create or replace function public.create_group_invite(
  target_group_id uuid,
  expires_in_days integer default 7,
  invite_max_uses integer default null
)
returns public.group_invites
language plpgsql
security definer set search_path = public
as $$
declare
  new_invite public.group_invites;
  new_code text;
begin
  if not public.is_admin() and not exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner', 'admin')
  ) then
    raise exception 'Solo quien administra el grupo puede crear invitaciones.';
  end if;

  loop
    new_code := public.generate_invite_code();
    exit when not exists (select 1 from public.group_invites gi where gi.code = new_code);
  end loop;

  insert into public.group_invites (group_id, code, created_by, expires_at, max_uses)
  values (
    target_group_id,
    new_code,
    auth.uid(),
    case when expires_in_days is null then null else now() + make_interval(days => expires_in_days) end,
    invite_max_uses
  )
  returning * into new_invite;

  return new_invite;
end;
$$;

-- ============================================================
-- 4. Dar de baja una invitación
-- ============================================================

create or replace function public.revoke_group_invite(invite_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  found_invite public.group_invites;
begin
  select * into found_invite from public.group_invites gi where gi.id = invite_id;

  if found_invite.id is null then
    raise exception 'Esa invitación no existe.';
  end if;

  if not public.is_admin() and not exists (
    select 1 from public.group_members gm
    where gm.group_id = found_invite.group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner', 'admin')
  ) then
    raise exception 'Solo quien administra el grupo puede dar de baja invitaciones.';
  end if;

  update public.group_invites set revoked = true where id = invite_id;
end;
$$;

-- ============================================================
-- 5. Ver de qué grupo es un link, ANTES de unirse
-- ============================================================
-- Hace falta que sea security definer: quien abre el link todavía no es
-- integrante, así que las policies de groups no la dejarían ver el nombre.

create or replace function public.preview_group_invite(invite_code text)
returns table (
  group_id uuid,
  group_name text,
  group_description text,
  already_member boolean
)
language plpgsql
stable
security definer set search_path = public
as $$
declare
  found_invite public.group_invites;
  found_group public.groups;
begin
  select * into found_invite
  from public.group_invites gi
  where gi.code = invite_code and gi.revoked = false;

  if found_invite.id is null then
    raise exception 'Esta invitación no existe o fue dada de baja.';
  end if;

  if found_invite.expires_at is not null and found_invite.expires_at < now() then
    raise exception 'Esta invitación ya venció. Pedile a tu amiga que te mande una nueva.';
  end if;

  if found_invite.max_uses is not null and found_invite.uses_count >= found_invite.max_uses then
    raise exception 'Esta invitación ya se usó el máximo de veces.';
  end if;

  select * into found_group from public.groups g where g.id = found_invite.group_id;

  return query
    select
      found_group.id,
      found_group.name,
      found_group.description,
      exists (
        select 1 from public.group_members gm
        where gm.group_id = found_group.id and gm.user_id = auth.uid()
      );
end;
$$;

-- ============================================================
-- 6. Unirse con el código
-- ============================================================

create or replace function public.join_group_with_code(invite_code text)
returns public.groups
language plpgsql
security definer set search_path = public
as $$
declare
  found_invite public.group_invites;
  found_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión para unirte al grupo.';
  end if;

  select * into found_invite
  from public.group_invites gi
  where gi.code = invite_code and gi.revoked = false;

  if found_invite.id is null then
    raise exception 'Esta invitación no existe o fue dada de baja.';
  end if;

  if found_invite.expires_at is not null and found_invite.expires_at < now() then
    raise exception 'Esta invitación ya venció.';
  end if;

  if found_invite.max_uses is not null and found_invite.uses_count >= found_invite.max_uses then
    raise exception 'Esta invitación ya se usó el máximo de veces.';
  end if;

  select * into found_group from public.groups g where g.id = found_invite.group_id;

  -- Si ya era parte, no la sumamos de nuevo ni gastamos un uso del link.
  if exists (
    select 1 from public.group_members gm
    where gm.group_id = found_invite.group_id and gm.user_id = auth.uid()
  ) then
    return found_group;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (found_invite.group_id, auth.uid(), 'member');

  update public.group_invites set uses_count = uses_count + 1 where id = found_invite.id;

  return found_group;
end;
$$;

-- ============================================================
-- 7. Salir de un grupo
-- ============================================================
-- Con un cuidado: si sos la única dueña no te podés ir, porque el grupo
-- quedaría sin nadie que lo administre.

create or replace function public.leave_group(target_group_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  my_role text;
  owners_count integer;
begin
  select gm.role into my_role
  from public.group_members gm
  where gm.group_id = target_group_id and gm.user_id = auth.uid();

  if my_role is null then
    raise exception 'No sos parte de este grupo.';
  end if;

  if my_role = 'owner' then
    select count(*) into owners_count
    from public.group_members gm
    where gm.group_id = target_group_id and gm.role = 'owner';

    if owners_count <= 1 then
      raise exception 'Sos la única dueña del grupo. Pasale ese rol a otra integrante antes de salir.';
    end if;
  end if;

  delete from public.group_members gm
  where gm.group_id = target_group_id and gm.user_id = auth.uid();
end;
$$;
