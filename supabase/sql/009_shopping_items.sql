-- ChipaWAT — paso 9: super personal y grupal en la base
-- Requiere 001 a 008 corridos antes.
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.

-- ============================================================
-- 1. Super personal
-- ============================================================
-- Mismo criterio que personal_expenses y personal_calendar_events: privado,
-- sin bypass de admin. Nadie más lo carga a tu nombre, así que "comprado
-- por" siempre sos vos misma: no hace falta una columna aparte para eso.

create table if not exists public.personal_shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null,
  quantity text not null default '1',
  category text not null default 'Super',
  suggested_store text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'bought')),
  bought_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists personal_shopping_items_user_idx
  on public.personal_shopping_items (user_id, created_at desc);

alter table public.personal_shopping_items enable row level security;

drop policy if exists "personal_shopping_items: ver los propios" on public.personal_shopping_items;
create policy "personal_shopping_items: ver los propios"
  on public.personal_shopping_items for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "personal_shopping_items: cargar los propios" on public.personal_shopping_items;
create policy "personal_shopping_items: cargar los propios"
  on public.personal_shopping_items for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "personal_shopping_items: editar los propios" on public.personal_shopping_items;
create policy "personal_shopping_items: editar los propios"
  on public.personal_shopping_items for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "personal_shopping_items: borrar los propios" on public.personal_shopping_items;
create policy "personal_shopping_items: borrar los propios"
  on public.personal_shopping_items for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 2. Super grupal
-- ============================================================
-- A diferencia de gastos y calendario, acá no hace falta pasar por un RPC:
-- nadie carga ni marca un item "a nombre de" otra persona (created_by y
-- bought_by son siempre quien hace el click, via auth.uid()), así que las
-- policies simples alcanzan. Mismo criterio de "libreta compartida" que el
-- resto: cualquier integrante del grupo puede editar o borrar cualquier item.

create table if not exists public.group_shopping_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null,
  quantity text not null default '1',
  category text not null default 'Super',
  suggested_store text,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'bought')),
  created_by uuid not null default auth.uid() references public.profiles (id),
  bought_by uuid references public.profiles (id),
  bought_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists group_shopping_items_group_idx
  on public.group_shopping_items (group_id, created_at desc);

alter table public.group_shopping_items enable row level security;

drop policy if exists "group_shopping_items: los del grupo" on public.group_shopping_items;
create policy "group_shopping_items: los del grupo"
  on public.group_shopping_items for select
  to authenticated
  using (public.is_group_member(group_shopping_items.group_id));

drop policy if exists "group_shopping_items: cargar en el grupo" on public.group_shopping_items;
create policy "group_shopping_items: cargar en el grupo"
  on public.group_shopping_items for insert
  to authenticated
  with check (public.is_group_member(group_shopping_items.group_id) and created_by = auth.uid());

drop policy if exists "group_shopping_items: editar los del grupo" on public.group_shopping_items;
create policy "group_shopping_items: editar los del grupo"
  on public.group_shopping_items for update
  to authenticated
  using (public.is_group_member(group_shopping_items.group_id))
  with check (public.is_group_member(group_shopping_items.group_id));

drop policy if exists "group_shopping_items: borrar los del grupo" on public.group_shopping_items;
create policy "group_shopping_items: borrar los del grupo"
  on public.group_shopping_items for delete
  to authenticated
  using (public.is_group_member(group_shopping_items.group_id));

-- ============================================================
-- 3. Chequeo rápido
-- ============================================================
-- Después de cargar un item desde la app, esto tiene que mostrarlo:

-- select name, quantity, status from public.personal_shopping_items order by created_at desc;
-- select name, quantity, status from public.group_shopping_items order by created_at desc;
