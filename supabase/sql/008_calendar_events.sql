-- ChipaWAT — paso 8: calendario personal y grupal en la base
-- Requiere 001 a 007 corridos antes.
-- Pegar y ejecutar completo en Supabase → SQL Editor → New query → Run.

-- ============================================================
-- 1. Calendario personal
-- ============================================================
-- Mismo criterio que personal_expenses: es privado, sin bypass de admin.

create table if not exists public.personal_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'Recordatorio',
  event_date date not null,
  start_time time,
  end_time time,
  all_day boolean not null default false,
  recurrence_frequency text not null default 'none'
    check (recurrence_frequency in ('none', 'daily', 'weekly', 'weekdays', 'monthly')),
  recurrence_interval integer not null default 1,
  recurrence_days_of_week integer[],
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'skipped', 'rescheduled')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists personal_calendar_events_user_idx
  on public.personal_calendar_events (user_id, event_date);

alter table public.personal_calendar_events enable row level security;

drop policy if exists "personal_calendar_events: ver los propios" on public.personal_calendar_events;
create policy "personal_calendar_events: ver los propios"
  on public.personal_calendar_events for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "personal_calendar_events: cargar los propios" on public.personal_calendar_events;
create policy "personal_calendar_events: cargar los propios"
  on public.personal_calendar_events for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "personal_calendar_events: editar los propios" on public.personal_calendar_events;
create policy "personal_calendar_events: editar los propios"
  on public.personal_calendar_events for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "personal_calendar_events: borrar los propios" on public.personal_calendar_events;
create policy "personal_calendar_events: borrar los propios"
  on public.personal_calendar_events for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 2. Calendario grupal
-- ============================================================
-- Igual que con los gastos: quién es responsable y quién participa va en
-- tablas aparte (una fila por persona), así la base garantiza que cada
-- una existe de verdad y las policies pueden preguntar "¿esto me toca?".

create table if not exists public.group_calendar_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  kind text not null default 'responsibility' check (kind in ('responsibility', 'plan')),
  title text not null,
  description text,
  category text not null default 'Casa',
  event_date date not null,
  start_time time,
  end_time time,
  all_day boolean not null default false,
  recurrence_frequency text not null default 'none'
    check (recurrence_frequency in ('none', 'daily', 'weekly', 'weekdays', 'monthly')),
  recurrence_interval integer not null default 1,
  recurrence_days_of_week integer[],
  recurrence_rotation_user_ids uuid[],
  priority text not null default 'normal' check (priority in ('normal', 'important', 'urgent')),
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'skipped', 'rescheduled')),
  notes text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.group_calendar_event_responsible (
  event_id uuid not null references public.group_calendar_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (event_id, user_id)
);

create table if not exists public.group_calendar_event_participants (
  event_id uuid not null references public.group_calendar_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (event_id, user_id)
);

create index if not exists group_calendar_events_group_idx
  on public.group_calendar_events (group_id, event_date);

-- ============================================================
-- 3. Helper para las tablas hijas (mismo patrón anti-recursión que gastos)
-- ============================================================

create or replace function public.can_touch_group_calendar_event(target_event_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_calendar_events gce
    join public.group_members gm on gm.group_id = gce.group_id
    where gce.id = target_event_id and gm.user_id = auth.uid()
  );
$$;

-- ============================================================
-- 4. RLS
-- ============================================================
-- Mismo criterio que gastos grupales: cualquier integrante ve, completa y
-- borra los acontecimientos del grupo (agenda compartida de la casa).

alter table public.group_calendar_events enable row level security;
alter table public.group_calendar_event_responsible enable row level security;
alter table public.group_calendar_event_participants enable row level security;

drop policy if exists "group_calendar_events: los del grupo" on public.group_calendar_events;
create policy "group_calendar_events: los del grupo"
  on public.group_calendar_events for select
  to authenticated
  using (public.is_group_member(group_calendar_events.group_id));

drop policy if exists "group_calendar_events: borrar los del grupo" on public.group_calendar_events;
create policy "group_calendar_events: borrar los del grupo"
  on public.group_calendar_events for delete
  to authenticated
  using (public.is_group_member(group_calendar_events.group_id));

drop policy if exists "group_calendar_event_responsible: los del grupo" on public.group_calendar_event_responsible;
create policy "group_calendar_event_responsible: los del grupo"
  on public.group_calendar_event_responsible for select
  to authenticated
  using (public.can_touch_group_calendar_event(group_calendar_event_responsible.event_id));

drop policy if exists "group_calendar_event_participants: los del grupo" on public.group_calendar_event_participants;
create policy "group_calendar_event_participants: los del grupo"
  on public.group_calendar_event_participants for select
  to authenticated
  using (public.can_touch_group_calendar_event(group_calendar_event_participants.event_id));

-- El alta y la edición completa pasan por save_group_calendar_event(), que
-- valida todo junto (por eso no hay policies de insert/update directas acá).
-- Marcar como completada/pendiente pasa por set_group_calendar_event_status().

-- ============================================================
-- 5. Guardar un acontecimiento del grupo (alta y edición)
-- ============================================================
-- event_id null = acontecimiento nuevo. Valida que responsables, participantes
-- y (si hay) la rotación sean todas integrantes del grupo.

create or replace function public.save_group_calendar_event(
  p_group_id uuid,
  p_event_id uuid,
  p_kind text,
  p_title text,
  p_description text,
  p_category text,
  p_event_date date,
  p_start_time time,
  p_end_time time,
  p_all_day boolean,
  p_recurrence_frequency text,
  p_recurrence_interval integer,
  p_recurrence_days_of_week integer[],
  p_recurrence_rotation_user_ids uuid[],
  p_priority text,
  p_notes text,
  p_responsible_ids uuid[],
  p_participant_ids uuid[]
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  saved_id uuid;
  stranger uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'No sos integrante de este grupo.';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'El título no puede estar vacío.';
  end if;

  if p_participant_ids is null or array_length(p_participant_ids, 1) is null then
    raise exception 'Tenés que elegir al menos una participante.';
  end if;

  if p_responsible_ids is null or array_length(p_responsible_ids, 1) is null then
    raise exception 'Tenés que elegir al menos una responsable.';
  end if;

  select unnested into stranger
  from unnest(
    p_participant_ids || p_responsible_ids || coalesce(p_recurrence_rotation_user_ids, array[]::uuid[])
  ) as unnested
  where not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = unnested
  )
  limit 1;

  if stranger is not null then
    raise exception 'Hay personas asignadas que no son integrantes del grupo.';
  end if;

  if p_event_id is null then
    insert into public.group_calendar_events (
      group_id, kind, title, description, category, event_date, start_time, end_time,
      all_day, recurrence_frequency, recurrence_interval, recurrence_days_of_week,
      recurrence_rotation_user_ids, priority, notes
    )
    values (
      p_group_id,
      coalesce(p_kind, 'responsibility'),
      p_title,
      nullif(p_description, ''),
      coalesce(nullif(p_category, ''), 'Casa'),
      p_event_date,
      case when p_all_day then null else p_start_time end,
      case when p_all_day then null else p_end_time end,
      coalesce(p_all_day, false),
      coalesce(p_recurrence_frequency, 'none'),
      coalesce(p_recurrence_interval, 1),
      p_recurrence_days_of_week,
      p_recurrence_rotation_user_ids,
      coalesce(p_priority, 'normal'),
      nullif(p_notes, '')
    )
    returning id into saved_id;
  else
    update public.group_calendar_events gce
    set kind = coalesce(p_kind, 'responsibility'),
        title = p_title,
        description = nullif(p_description, ''),
        category = coalesce(nullif(p_category, ''), 'Casa'),
        event_date = p_event_date,
        start_time = case when p_all_day then null else p_start_time end,
        end_time = case when p_all_day then null else p_end_time end,
        all_day = coalesce(p_all_day, false),
        recurrence_frequency = coalesce(p_recurrence_frequency, 'none'),
        recurrence_interval = coalesce(p_recurrence_interval, 1),
        recurrence_days_of_week = p_recurrence_days_of_week,
        recurrence_rotation_user_ids = p_recurrence_rotation_user_ids,
        priority = coalesce(p_priority, 'normal'),
        notes = nullif(p_notes, '')
    where gce.id = p_event_id and gce.group_id = p_group_id
    returning gce.id into saved_id;

    if saved_id is null then
      raise exception 'Ese acontecimiento no existe en este grupo.';
    end if;

    delete from public.group_calendar_event_responsible where event_id = saved_id;
    delete from public.group_calendar_event_participants where event_id = saved_id;
  end if;

  insert into public.group_calendar_event_responsible (event_id, user_id)
  select saved_id, unnested from unnest(p_responsible_ids) as unnested
  on conflict do nothing;

  insert into public.group_calendar_event_participants (event_id, user_id)
  select saved_id, unnested from unnest(p_participant_ids) as unnested
  on conflict do nothing;

  return saved_id;
end;
$$;

-- ============================================================
-- 6. Marcar un acontecimiento del grupo como completado / pendiente
-- ============================================================
-- Cambia solo el estado, sin tocar el resto: lo puede hacer cualquier
-- integrante del grupo, no hace falta abrir el formulario completo.

create or replace function public.set_group_calendar_event_status(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.can_touch_group_calendar_event(p_event_id) then
    raise exception 'No podés modificar este acontecimiento.';
  end if;

  if p_status not in ('pending', 'completed', 'skipped', 'rescheduled') then
    raise exception 'Estado inválido.';
  end if;

  update public.group_calendar_events set status = p_status where id = p_event_id;
end;
$$;

-- ============================================================
-- 7. Chequeo rápido
-- ============================================================
-- Después de crear un acontecimiento desde la app, esto tiene que mostrarlo:

-- select title, event_date, start_time, end_time, status
-- from public.personal_calendar_events
-- order by event_date desc;

-- select title, event_date, kind, status
-- from public.group_calendar_events
-- order by event_date desc;
