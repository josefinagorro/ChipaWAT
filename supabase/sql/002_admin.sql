-- ChipaWAT — paso 2: usuaria ADMIN GLOBAL
-- Requiere haber corrido antes 001_auth_profiles_groups.sql
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.
--
-- Ojo con la diferencia:
--   * el rol 'owner' / 'admin' de group_members manda SOLO dentro de un grupo.
--   * is_admin (este archivo) es admin de TODA la app: ve y toca todo.

-- ============================================================
-- 1. Columna is_admin en profiles
-- ============================================================

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- IMPORTANTE: sin esto, cualquiera podría hacerse admin sola editando su
-- propio perfil (la policy de update permite tocar la fila propia).
-- Le sacamos a las usuarias logueadas el permiso de UPDATE sobre toda la
-- tabla y se lo devolvemos SOLO para name y color.
revoke update on public.profiles from authenticated;
grant update (name, color) on public.profiles to authenticated;

-- ============================================================
-- 2. Funciones helper
-- ============================================================

-- ¿La usuaria que está haciendo la consulta es admin?
-- Va con security definer para que pueda leer profiles sin quedar atrapada
-- en las mismas policies que estamos escribiendo (evita recursión infinita).
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Única forma de dar o sacar admin desde la app: solo una admin puede llamarla.
-- Desde el frontend: supabase.rpc('set_admin', { target_user_id: '...', value: true })
create or replace function public.set_admin(target_user_id uuid, value boolean default true)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo una admin puede cambiar permisos de admin.';
  end if;

  update public.profiles set is_admin = value where id = target_user_id;
end;
$$;

-- ============================================================
-- 3. Políticas: la admin puede todo
-- ============================================================

-- ---------- profiles ----------
drop policy if exists "profiles: cada una edita su propio perfil" on public.profiles;
drop policy if exists "profiles: edita su perfil (la admin, cualquiera)" on public.profiles;
create policy "profiles: edita su perfil (la admin, cualquiera)"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

drop policy if exists "profiles: solo la admin borra perfiles" on public.profiles;
create policy "profiles: solo la admin borra perfiles"
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

-- ---------- groups ----------
drop policy if exists "groups: ver solo los grupos propios" on public.groups;
drop policy if exists "groups: ver los propios (la admin ve todos)" on public.groups;
create policy "groups: ver los propios (la admin ve todos)"
  on public.groups for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid()
    )
  );

drop policy if exists "groups: editar (owner/admin del grupo o admin global)" on public.groups;
create policy "groups: editar (owner/admin del grupo o admin global)"
  on public.groups for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role in ('owner', 'admin')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role in ('owner', 'admin')
    )
  );

drop policy if exists "groups: borrar (owner del grupo o admin global)" on public.groups;
create policy "groups: borrar (owner del grupo o admin global)"
  on public.groups for delete
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.group_members gm
      where gm.group_id = groups.id and gm.user_id = auth.uid() and gm.role = 'owner'
    )
  );

-- ---------- group_members ----------
drop policy if exists "group_members: ver membresias de mis grupos" on public.group_members;
drop policy if exists "group_members: ver las de mis grupos (la admin ve todas)" on public.group_members;
create policy "group_members: ver las de mis grupos (la admin ve todas)"
  on public.group_members for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.group_members my
      where my.group_id = group_members.group_id and my.user_id = auth.uid()
    )
  );

drop policy if exists "group_members: admins agregan integrantes" on public.group_members;
create policy "group_members: admins agregan integrantes"
  on public.group_members for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
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
    public.is_admin()
    or exists (
      select 1 from public.group_members my
      where my.group_id = group_members.group_id
        and my.user_id = auth.uid()
        and my.role in ('owner', 'admin')
    )
  );

drop policy if exists "group_members: cambiar rol (owner/admin o admin global)" on public.group_members;
create policy "group_members: cambiar rol (owner/admin o admin global)"
  on public.group_members for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.group_members my
      where my.group_id = group_members.group_id
        and my.user_id = auth.uid()
        and my.role in ('owner', 'admin')
    )
  )
  with check (
    public.is_admin()
    or exists (
      select 1 from public.group_members my
      where my.group_id = group_members.group_id
        and my.user_id = auth.uid()
        and my.role in ('owner', 'admin')
    )
  );

-- ============================================================
-- 4. Crear la PRIMERA admin (esto se hace a mano, una sola vez)
-- ============================================================
-- Paso A) Panel de Supabase → Authentication → Users → Add user → Create new user
--         Poné email + contraseña y TILDÁ "Auto Confirm User".
--         El trigger de 001 le crea el profile solo.
--
-- Paso B) Cambiá el email de abajo por el de esa usuaria, descomentá y corré:

-- update public.profiles
-- set is_admin = true, name = 'Josefina'
-- where id = (select id from auth.users where email = 'jgorrochategui@dongaston.com.ar');

-- Paso C) Para chequear que quedó bien:

-- select p.name, p.is_admin, u.email
-- from public.profiles p
-- join auth.users u on u.id = p.id;
