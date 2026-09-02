-- ChipaWAT — paso 5: ARREGLO de "infinite recursion detected in policy
-- for relation group_members"
--
-- Qué pasaba: la policy de group_members preguntaba "¿esta persona es
-- integrante del grupo?" haciendo un select sobre group_members. Pero ese
-- select vuelve a pasar por la misma policy, que hace otro select, y así
-- para siempre. Postgres lo detecta y corta con ese error.
--
-- La solución estándar: sacar esa pregunta a una función security definer.
-- Al correr como dueña de la tabla, la función NO pasa por las policies,
-- entonces el ciclo se rompe. Es el mismo truco que ya usábamos en is_admin().
--
-- Requiere 001, 002, 003 y 004 corridos antes.
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.

-- ============================================================
-- 1. Funciones que responden las preguntas sin disparar policies
-- ============================================================

create or replace function public.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id and gm.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_manager(target_group_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
      and gm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_group_owner(target_group_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  );
$$;

-- ============================================================
-- 2. GROUPS: policies reescritas
-- ============================================================

drop policy if exists "groups: ver solo los grupos propios" on public.groups;
drop policy if exists "groups: ver los propios (la admin ve todos)" on public.groups;
create policy "groups: ver los propios (la admin ve todos)"
  on public.groups for select
  to authenticated
  using (public.is_admin() or public.is_group_member(groups.id));

drop policy if exists "groups: editar (owner/admin del grupo o admin global)" on public.groups;
create policy "groups: editar (owner/admin del grupo o admin global)"
  on public.groups for update
  to authenticated
  using (public.is_admin() or public.is_group_manager(groups.id))
  with check (public.is_admin() or public.is_group_manager(groups.id));

drop policy if exists "groups: borrar (owner del grupo o admin global)" on public.groups;
create policy "groups: borrar (owner del grupo o admin global)"
  on public.groups for delete
  to authenticated
  using (public.is_admin() or public.is_group_owner(groups.id));

-- ============================================================
-- 3. GROUP_MEMBERS: acá estaba la recursión
-- ============================================================

drop policy if exists "group_members: ver membresias de mis grupos" on public.group_members;
drop policy if exists "group_members: ver las de mis grupos (la admin ve todas)" on public.group_members;
create policy "group_members: ver las de mis grupos (la admin ve todas)"
  on public.group_members for select
  to authenticated
  using (public.is_admin() or public.is_group_member(group_members.group_id));

drop policy if exists "group_members: admins agregan integrantes" on public.group_members;
create policy "group_members: admins agregan integrantes"
  on public.group_members for insert
  to authenticated
  with check (public.is_admin() or public.is_group_manager(group_members.group_id));

drop policy if exists "group_members: admins sacan integrantes" on public.group_members;
create policy "group_members: admins sacan integrantes"
  on public.group_members for delete
  to authenticated
  using (public.is_admin() or public.is_group_manager(group_members.group_id));

drop policy if exists "group_members: cambiar rol (owner/admin o admin global)" on public.group_members;
create policy "group_members: cambiar rol (owner/admin o admin global)"
  on public.group_members for update
  to authenticated
  using (public.is_admin() or public.is_group_manager(group_members.group_id))
  with check (public.is_admin() or public.is_group_manager(group_members.group_id));

-- ============================================================
-- 4. GROUP_INVITES: mismo problema por rebote
-- ============================================================
-- Su policy también consultaba group_members, así que arrastraba la recursión.

drop policy if exists "group_invites: verlos si sos del grupo" on public.group_invites;
create policy "group_invites: verlos si sos del grupo"
  on public.group_invites for select
  to authenticated
  using (public.is_admin() or public.is_group_member(group_invites.group_id));

-- ============================================================
-- 5. Chequeo rápido
-- ============================================================
-- Después de correr esto, estas dos consultas tienen que responder sin error
-- (pueden devolver cero filas si todavía no estás en ningún grupo):

-- select * from public.group_members;
-- select * from public.groups;
