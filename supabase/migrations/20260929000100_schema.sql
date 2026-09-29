-- =============================================================================
-- Escuela Visible — esquema base
-- Privacidad: ninguna tabla almacena datos individuales de estudiantes.
-- Las necesidades de estudiantes se expresan de forma agregada.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('supporter', 'school_rep', 'admin');

create type public.org_type as enum ('persona', 'empresa', 'universidad', 'organizacion', 'otro');

create type public.need_kind as enum ('need', 'campaign');

create type public.need_category as enum (
  'infraestructura',
  'conectividad',
  'mobiliario',
  'materiales',
  'agua_saneamiento',
  'mantenimiento',
  'comunitaria'
);

create type public.need_priority as enum ('alta', 'media', 'baja');

-- Escuela crea → pending_validation → admin valida → published → completed
create type public.need_status as enum ('pending_validation', 'published', 'completed', 'cancelled');

-- Aliado se compromete → committed → reporta entrega → delivery_reported → escuela confirma → confirmed
create type public.commitment_status as enum ('committed', 'delivery_reported', 'confirmed', 'cancelled');

create type public.hedera_event_type as enum (
  'NEED_CREATED',
  'NEED_VALIDATED',
  'COMMITMENT_CREATED',
  'DELIVERY_REPORTED',
  'SCHOOL_CONFIRMED'
);

create type public.hedera_submission_status as enum ('pending', 'submitted', 'failed');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Escuelas (datos institucionales, no sensibles)
-- -----------------------------------------------------------------------------
create table public.schools (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text not null,
  department       text not null default 'Santander',
  municipality     text not null,
  vereda           text,
  latitude         numeric(9, 6) not null check (latitude between -90 and 90),
  longitude        numeric(9, 6) not null check (longitude between -180 and 180),
  description      text not null default '',
  students_range   text,              -- agregado, p. ej. '20–40'
  cover_image_path text,              -- solo imágenes de infraestructura, nunca menores
  is_demo          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger schools_updated_at before update on public.schools
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Perfiles (1:1 con auth.users). El email vive en auth.users, no aquí.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null,
  role          public.user_role not null default 'supporter',
  org_type      public.org_type,
  org_name      text,
  school_id     uuid references public.schools (id) on delete set null,
  show_publicly boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint school_rep_has_school check (role <> 'school_rep' or school_id is not null)
);

create index profiles_school_id_idx on public.profiles (school_id);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Todo usuario nuevo nace como supporter. El rol NUNCA se toma de los metadatos
-- enviados por el cliente; solo un admin (secret key) puede cambiarlo.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Necesidades (incluye campañas / eventos comunitarios con kind = 'campaign')
-- -----------------------------------------------------------------------------
create table public.needs (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete restrict,
  kind          public.need_kind not null default 'need',
  title         text not null check (char_length(title) between 3 and 120),
  description   text not null default '' check (char_length(description) <= 2000),
  category      public.need_category not null,
  priority      public.need_priority not null default 'media',
  goal_quantity numeric(12, 2) not null check (goal_quantity > 0),
  goal_unit     text not null,        -- 'kits', 'm²', 'COP (simulado)', ...
  event_date    date,                 -- solo para campañas
  status        public.need_status not null default 'pending_validation',
  created_by    uuid references public.profiles (id) on delete set null,
  validated_by  uuid references public.profiles (id) on delete set null,
  validated_at  timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index needs_school_id_idx on public.needs (school_id);
create index needs_status_idx on public.needs (status);

create trigger needs_updated_at before update on public.needs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Compromisos (incluye la entrega: una entrega por compromiso)
-- -----------------------------------------------------------------------------
create table public.commitments (
  id                     uuid primary key default gen_random_uuid(),
  need_id                uuid not null references public.needs (id) on delete restrict,
  supporter_id           uuid not null references public.profiles (id) on delete restrict,
  quantity               numeric(12, 2) not null check (quantity > 0),
  note                   text check (char_length(note) <= 500),
  status                 public.commitment_status not null default 'committed',
  delivery_note          text check (char_length(delivery_note) <= 1000),
  delivery_evidence_path text,        -- Storage bucket 'evidence'; sin EXIF, sin menores
  delivery_reported_at   timestamptz,
  confirmed_by           uuid references public.profiles (id) on delete set null,
  confirmed_at           timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index commitments_need_id_idx on public.commitments (need_id);
create index commitments_supporter_id_idx on public.commitments (supporter_id);

create trigger commitments_updated_at before update on public.commitments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Eventos Hedera (outbox + historial verificable + fuente del feed)
--
-- `payload_canonical` es el texto EXACTO sobre el que se calcula el SHA-256.
-- Se guarda como texto (no solo jsonb) porque jsonb reordena claves.
-- El contenido del evento es inmutable una vez creado; solo cambian los
-- campos de envío a Hedera.
-- -----------------------------------------------------------------------------
create table public.hedera_events (
  id                  uuid primary key default gen_random_uuid(),  -- = eventId del payload
  event_type          public.hedera_event_type not null,
  need_id             uuid not null references public.needs (id) on delete restrict,
  school_id           uuid not null references public.schools (id) on delete restrict,
  commitment_id       uuid references public.commitments (id) on delete restrict,
  actor_role          public.user_role not null,
  payload             jsonb not null,
  payload_canonical   text not null,
  payload_hash        text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  submission_status   public.hedera_submission_status not null default 'pending',
  topic_id            text,
  transaction_id      text,
  sequence_number     bigint,
  consensus_timestamp text,           -- formato Hedera 'seconds.nanos'
  submission_error    text,
  attempts            integer not null default 0,
  created_at          timestamptz not null default now(),
  submitted_at        timestamptz
);

create index hedera_events_need_id_idx on public.hedera_events (need_id, created_at);
create index hedera_events_created_at_idx on public.hedera_events (created_at desc);
create index hedera_events_pending_idx on public.hedera_events (submission_status)
  where submission_status <> 'submitted';

create or replace function public.protect_hedera_event_content()
returns trigger
language plpgsql
as $$
begin
  if new.id                is distinct from old.id
  or new.event_type        is distinct from old.event_type
  or new.need_id           is distinct from old.need_id
  or new.school_id         is distinct from old.school_id
  or new.commitment_id     is distinct from old.commitment_id
  or new.actor_role        is distinct from old.actor_role
  or new.payload           is distinct from old.payload
  or new.payload_canonical is distinct from old.payload_canonical
  or new.payload_hash      is distinct from old.payload_hash
  or new.created_at        is distinct from old.created_at then
    raise exception 'El contenido de un evento Hedera es inmutable (evento %)', old.id;
  end if;
  return new;
end;
$$;

create trigger hedera_events_immutable before update on public.hedera_events
  for each row execute function public.protect_hedera_event_content();

create or replace function public.prevent_hedera_event_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Los eventos Hedera no se pueden eliminar (evento %)', old.id;
end;
$$;

create trigger hedera_events_no_delete before delete on public.hedera_events
  for each row execute function public.prevent_hedera_event_delete();
