-- ChipaWAT — paso 7: gastos del grupo y alquiler en la base
-- Requiere 001 a 006 corridos antes.
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.

-- ============================================================
-- 1. Gastos del grupo
-- ============================================================
-- Quién participó de cada gasto va en una tabla aparte
-- (group_expense_participants), una fila por persona. Así la base puede
-- garantizar que cada participante existe de verdad, y es fácil preguntar
-- "¿en qué gastos participé yo?".

create table if not exists public.group_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  type text not null default 'other' check (type in ('grocery', 'other')),
  category text not null default 'Otros',
  description text not null,
  amount_cents integer not null check (amount_cents > 0),
  spent_on date not null,
  paid_by uuid not null references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.group_expense_participants (
  expense_id uuid not null references public.group_expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (expense_id, user_id)
);

create index if not exists group_expenses_group_idx
  on public.group_expenses (group_id, spent_on desc);

-- ============================================================
-- 2. Alquiler
-- ============================================================
-- rent_payments cumple doble función: dice quiénes participan del alquiler
-- de ese mes Y en qué estado está el pago de cada una.

create table if not exists public.rent_months (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  label text not null,
  month text not null default '',
  total_cents integer not null check (total_cents > 0),
  due_date date not null,
  paid_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.rent_payments (
  rent_month_id uuid not null references public.rent_months (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  primary key (rent_month_id, user_id)
);

create index if not exists rent_months_group_idx
  on public.rent_months (group_id, due_date desc);

-- ============================================================
-- 3. Helpers para las tablas hijas
-- ============================================================
-- Las tablas de participantes y de pagos no tienen group_id encima, así que
-- para saber si podés tocarlas hay que mirar la tabla padre. Lo hacemos con
-- funciones security definer para no volver a caer en recursión de policies.

create or replace function public.can_touch_group_expense(target_expense_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_expenses ge
    join public.group_members gm on gm.group_id = ge.group_id
    where ge.id = target_expense_id and gm.user_id = auth.uid()
  );
$$;

create or replace function public.can_touch_rent_month(target_rent_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.rent_months rm
    join public.group_members gm on gm.group_id = rm.group_id
    where rm.id = target_rent_id and gm.user_id = auth.uid()
  );
$$;

-- ============================================================
-- 4. RLS
-- ============================================================
-- Criterio: si sos integrante del grupo, ves y editás los gastos del grupo.
-- Es una libreta compartida entre amigas; cualquiera puede corregir un gasto
-- mal cargado. Si algún día querés que solo lo edite quien lo cargó, se
-- cambia el "using" de las policies de update y delete por created_by = auth.uid().

alter table public.group_expenses enable row level security;
alter table public.group_expense_participants enable row level security;
alter table public.rent_months enable row level security;
alter table public.rent_payments enable row level security;

drop policy if exists "group_expenses: los del grupo" on public.group_expenses;
create policy "group_expenses: los del grupo"
  on public.group_expenses for select
  to authenticated
  using (public.is_group_member(group_expenses.group_id));

drop policy if exists "group_expenses: borrar los del grupo" on public.group_expenses;
create policy "group_expenses: borrar los del grupo"
  on public.group_expenses for delete
  to authenticated
  using (public.is_group_member(group_expenses.group_id));

drop policy if exists "group_expense_participants: los del grupo" on public.group_expense_participants;
create policy "group_expense_participants: los del grupo"
  on public.group_expense_participants for select
  to authenticated
  using (public.can_touch_group_expense(group_expense_participants.expense_id));

drop policy if exists "rent_months: los del grupo" on public.rent_months;
create policy "rent_months: los del grupo"
  on public.rent_months for select
  to authenticated
  using (public.is_group_member(rent_months.group_id));

drop policy if exists "rent_months: borrar los del grupo" on public.rent_months;
create policy "rent_months: borrar los del grupo"
  on public.rent_months for delete
  to authenticated
  using (public.is_group_member(rent_months.group_id));

drop policy if exists "rent_payments: los del grupo" on public.rent_payments;
create policy "rent_payments: los del grupo"
  on public.rent_payments for select
  to authenticated
  using (public.can_touch_rent_month(rent_payments.rent_month_id));

-- Marcar el alquiler como pagado o pendiente: cualquiera del grupo.
drop policy if exists "rent_payments: marcar pagos del grupo" on public.rent_payments;
create policy "rent_payments: marcar pagos del grupo"
  on public.rent_payments for update
  to authenticated
  using (public.can_touch_rent_month(rent_payments.rent_month_id))
  with check (public.can_touch_rent_month(rent_payments.rent_month_id));

-- Los alta de gastos y de alquiler pasan por las funciones de abajo, que
-- validan todo junto. Por eso no hay policies de insert directas.

-- ============================================================
-- 5. Guardar un gasto del grupo (alta y edición)
-- ============================================================
-- expense_id null = gasto nuevo. Valida que quien carga, quien pagó y todas
-- las participantes sean del grupo: si no, no hay forma de meter a alguien
-- de afuera en la cuenta.

create or replace function public.save_group_expense(
  target_group_id uuid,
  expense_id uuid,
  expense_type text,
  expense_category text,
  expense_description text,
  expense_amount_cents integer,
  expense_spent_on date,
  expense_paid_by uuid,
  participant_ids uuid[]
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  saved_id uuid;
  stranger uuid;
begin
  if not public.is_group_member(target_group_id) then
    raise exception 'No sos integrante de este grupo.';
  end if;

  if participant_ids is null or array_length(participant_ids, 1) is null then
    raise exception 'Tenés que elegir al menos una participante.';
  end if;

  if expense_amount_cents is null or expense_amount_cents <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id and gm.user_id = expense_paid_by
  ) then
    raise exception 'Quien pagó no es integrante del grupo.';
  end if;

  select unnested into stranger
  from unnest(participant_ids) as unnested
  where not exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id and gm.user_id = unnested
  )
  limit 1;

  if stranger is not null then
    raise exception 'Hay participantes que no son integrantes del grupo.';
  end if;

  if expense_id is null then
    insert into public.group_expenses (
      group_id, type, category, description, amount_cents, spent_on, paid_by
    )
    values (
      target_group_id,
      coalesce(expense_type, 'other'),
      coalesce(nullif(expense_category, ''), 'Otros'),
      expense_description,
      expense_amount_cents,
      expense_spent_on,
      expense_paid_by
    )
    returning id into saved_id;
  else
    update public.group_expenses ge
    set type = coalesce(expense_type, 'other'),
        category = coalesce(nullif(expense_category, ''), 'Otros'),
        description = expense_description,
        amount_cents = expense_amount_cents,
        spent_on = expense_spent_on,
        paid_by = expense_paid_by
    where ge.id = expense_id and ge.group_id = target_group_id
    returning ge.id into saved_id;

    if saved_id is null then
      raise exception 'Ese gasto no existe en este grupo.';
    end if;

    delete from public.group_expense_participants gep where gep.expense_id = saved_id;
  end if;

  insert into public.group_expense_participants (expense_id, user_id)
  select saved_id, unnested from unnest(participant_ids) as unnested
  on conflict do nothing;

  return saved_id;
end;
$$;

-- ============================================================
-- 6. Crear el alquiler de un mes
-- ============================================================

create or replace function public.create_rent_month(
  target_group_id uuid,
  rent_label text,
  rent_month text,
  rent_total_cents integer,
  rent_due_date date,
  rent_paid_by uuid,
  participant_ids uuid[]
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  new_rent_id uuid;
  stranger uuid;
begin
  if not public.is_group_member(target_group_id) then
    raise exception 'No sos integrante de este grupo.';
  end if;

  if participant_ids is null or array_length(participant_ids, 1) is null then
    raise exception 'Tenés que elegir al menos una participante.';
  end if;

  select unnested into stranger
  from unnest(participant_ids) as unnested
  where not exists (
    select 1 from public.group_members gm
    where gm.group_id = target_group_id and gm.user_id = unnested
  )
  limit 1;

  if stranger is not null then
    raise exception 'Hay participantes que no son integrantes del grupo.';
  end if;

  insert into public.rent_months (group_id, label, month, total_cents, due_date, paid_by)
  values (target_group_id, rent_label, coalesce(rent_month, ''), rent_total_cents, rent_due_date, rent_paid_by)
  returning id into new_rent_id;

  -- Quien adelantó la plata ya tiene su parte cubierta.
  insert into public.rent_payments (rent_month_id, user_id, status)
  select new_rent_id, unnested, case when unnested = rent_paid_by then 'paid' else 'pending' end
  from unnest(participant_ids) as unnested
  on conflict do nothing;

  return new_rent_id;
end;
$$;
