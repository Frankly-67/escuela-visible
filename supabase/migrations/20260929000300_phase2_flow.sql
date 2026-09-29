-- =============================================================================
-- Escuela Visible — Phase 2: flujo de trazabilidad
--
--  1. Categorías definitivas (6).
--  2. Guards de transición de estado (needs, commitments) a nivel de base.
--  3. Consistencia y anti-duplicados de hedera_events.
--  4. RPC atómicas flow_*: validan actor, rol, escuela, ownership, estado y el
--     evento (payload + SHA-256), y en UNA transacción cambian el estado e
--     insertan el evento en hedera_events (outbox, submission_status=pending).
--
-- Las flow_* solo las puede ejecutar service_role (servidor con secret key).
-- Replican las reglas de src/lib/domain: la app las comprueba para dar buenos
-- mensajes; la base de datos es la autoridad final.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Categorías definitivas
--    Se recrea el enum (no hay necesidades todavía; si las hubiera con una
--    categoría eliminada, el cast fallaría y la migración se abortaría).
-- -----------------------------------------------------------------------------
alter type public.need_category rename to need_category_old;

create type public.need_category as enum (
  'infraestructura',
  'materiales',
  'alimentacion',
  'conectividad',
  'transporte',
  'actividad_comunitaria'
);

alter table public.needs
  alter column category type public.need_category
  using category::text::public.need_category;

drop type public.need_category_old;

-- -----------------------------------------------------------------------------
-- 2. Guards de transición
--    Se aplican a TODA escritura (incluida la secret key), no solo a las RPC.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_need_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_validation' then
      raise exception 'INVALID_TRANSITION: una necesidad nueva debe empezar en pending_validation (recibido %)', new.status
        using errcode = 'P0001', hint = 'INVALID_TRANSITION';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and (old.status::text, new.status::text) not in (
       ('pending_validation', 'published'),
       ('pending_validation', 'cancelled'),
       ('published', 'completed')
     ) then
    raise exception 'INVALID_TRANSITION: transición de necesidad no permitida: % → %', old.status, new.status
      using errcode = 'P0001', hint = 'INVALID_TRANSITION';
  end if;
  return new;
end;
$$;

create trigger needs_status_guard
  before insert or update on public.needs
  for each row execute function public.enforce_need_status();

create or replace function public.enforce_commitment_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'committed' then
      raise exception 'INVALID_TRANSITION: un compromiso nuevo debe empezar en committed (recibido %)', new.status
        using errcode = 'P0001', hint = 'INVALID_TRANSITION';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and (old.status::text, new.status::text) not in (
       ('committed', 'delivery_reported'),
       ('delivery_reported', 'confirmed')
     ) then
    raise exception 'INVALID_TRANSITION: transición de compromiso no permitida: % → %', old.status, new.status
      using errcode = 'P0001', hint = 'INVALID_TRANSITION';
  end if;
  return new;
end;
$$;

create trigger commitments_status_guard
  before insert or update on public.commitments
  for each row execute function public.enforce_commitment_status();

-- -----------------------------------------------------------------------------
-- 3. hedera_events: consistencia y anti-duplicados
-- -----------------------------------------------------------------------------
-- Eventos de necesidad sin compromiso; eventos de compromiso con compromiso.
alter table public.hedera_events
  add constraint hedera_events_commitment_matches_type check (
    (event_type in ('NEED_CREATED', 'NEED_VALIDATED')) = (commitment_id is null)
  );

-- Un único evento de cada tipo por necesidad / por compromiso (doble clic,
-- reintentos, carreras). El id del evento ya es PK.
create unique index hedera_events_need_event_uniq
  on public.hedera_events (need_id, event_type)
  where commitment_id is null;

create unique index hedera_events_commitment_event_uniq
  on public.hedera_events (commitment_id, event_type)
  where commitment_id is not null;

-- -----------------------------------------------------------------------------
-- 4. Helpers internos del flujo
-- -----------------------------------------------------------------------------

-- Error con código legible por la app: mensaje 'CODE: texto' y HINT = CODE.
create or replace function public.flow_fail(p_code text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%: %', p_code, p_message using errcode = 'P0001', hint = p_code;
end;
$$;

create or replace function public.flow_get_actor(p_actor_id uuid)
returns public.profiles
language plpgsql
stable
set search_path = ''
as $$
declare
  v_actor public.profiles;
begin
  select * into v_actor from public.profiles where id = p_actor_id;
  if not found then
    perform public.flow_fail('ACTOR_NOT_FOUND', 'El usuario no tiene perfil.');
  end if;
  return v_actor;
end;
$$;

-- Cantidad positiva con máximo 2 decimales (numeric(12,2) redondearía en silencio).
create or replace function public.flow_assert_quantity(p_quantity numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_quantity is null or p_quantity <= 0 or p_quantity <> round(p_quantity, 2) then
    perform public.flow_fail('INVALID_QUANTITY', 'La cantidad debe ser mayor que cero y tener como máximo 2 decimales.');
  end if;
end;
$$;

/*
  Valida el evento y lo inserta en hedera_events (submission_status = pending).

  - SHA-256 (UTF-8) de p_payload_canonical debe ser exactamente p_payload_hash.
  - El payload debe tener EXACTAMENTE los 9 campos aprobados.
  - Cada campo debe coincidir con lo que la RPC está registrando (id, tipo,
    necesidad, escuela, compromiso, rol). La escuela sale de la base, no del
    cliente.
  - timestamp ISO UTC con milisegundos y a menos de 10 minutos de now().
*/
create or replace function public.flow_insert_event(
  p_event_id          uuid,
  p_event_type        public.hedera_event_type,
  p_need_id           uuid,
  p_school_id         uuid,
  p_commitment_id     uuid,
  p_actor_role        public.user_role,
  p_payload_canonical text,
  p_payload_hash      text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_keys    text[];
  v_ts      timestamptz;
begin
  if p_event_id is null or p_payload_canonical is null or p_payload_hash is null then
    perform public.flow_fail('INVALID_EVENT', 'Faltan datos del evento.');
  end if;

  if p_payload_hash !~ '^[0-9a-f]{64}$' then
    perform public.flow_fail('INVALID_EVENT', 'El hash debe ser SHA-256 hex en minúsculas.');
  end if;

  if encode(sha256(convert_to(p_payload_canonical, 'UTF8')), 'hex') <> p_payload_hash then
    perform public.flow_fail('INVALID_EVENT', 'El SHA-256 del payload no coincide con el hash declarado.');
  end if;

  begin
    v_payload := p_payload_canonical::jsonb;
  exception when others then
    perform public.flow_fail('INVALID_EVENT', 'El payload no es JSON válido.');
  end;

  if jsonb_typeof(v_payload) <> 'object' then
    perform public.flow_fail('INVALID_EVENT', 'El payload debe ser un objeto JSON.');
  end if;

  select array_agg(k order by k) into v_keys from jsonb_object_keys(v_payload) as k;
  if v_keys is distinct from array['actorRole', 'app', 'commitmentId', 'eventId', 'needId', 'schoolId', 'timestamp', 'type', 'v'] then
    perform public.flow_fail('INVALID_EVENT', 'El payload debe tener exactamente los campos aprobados.');
  end if;

  if v_payload -> 'v' is distinct from '1'::jsonb
     or v_payload ->> 'app' is distinct from 'escuela-visible'
     or v_payload ->> 'eventId' is distinct from p_event_id::text
     or v_payload ->> 'type' is distinct from p_event_type::text
     or v_payload ->> 'needId' is distinct from p_need_id::text
     or v_payload ->> 'schoolId' is distinct from p_school_id::text
     or v_payload -> 'commitmentId' is distinct from coalesce(to_jsonb(p_commitment_id::text), 'null'::jsonb)
     or v_payload ->> 'actorRole' is distinct from p_actor_role::text then
    perform public.flow_fail('INVALID_EVENT', 'El payload no coincide con la operación registrada.');
  end if;

  if coalesce(v_payload ->> 'timestamp', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' then
    perform public.flow_fail('INVALID_EVENT', 'timestamp debe ser ISO 8601 UTC con milisegundos.');
  end if;
  v_ts := (v_payload ->> 'timestamp')::timestamptz;
  if abs(extract(epoch from (now() - v_ts))) > 600 then
    perform public.flow_fail('INVALID_EVENT', 'timestamp del evento fuera de la ventana permitida (10 minutos).');
  end if;

  begin
    insert into public.hedera_events (
      id, event_type, need_id, school_id, commitment_id, actor_role,
      payload, payload_canonical, payload_hash
    ) values (
      p_event_id, p_event_type, p_need_id, p_school_id, p_commitment_id, p_actor_role,
      v_payload, p_payload_canonical, p_payload_hash
    );
  exception when unique_violation then
    perform public.flow_fail('DUPLICATE_EVENT', 'Este evento ya fue registrado.');
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. RPC del flujo
--    Orden de bloqueo: necesidad → compromiso (evita deadlocks entre RPC).
--    Orden de comprobaciones = src/lib/domain/permissions.ts:
--    rol → escuela/ownership → necesidad abierta → transición → cantidad.
-- -----------------------------------------------------------------------------

-- NEED_CREATED: el school_rep de ESA escuela crea la necesidad (pending_validation).
create or replace function public.flow_create_need(
  p_actor_id          uuid,
  p_need_id           uuid,
  p_school_id         uuid,
  p_kind              public.need_kind,
  p_title             text,
  p_description       text,
  p_category          public.need_category,
  p_priority          public.need_priority,
  p_goal_quantity     numeric,
  p_goal_unit         text,
  p_event_date        date,
  p_event_id          uuid,
  p_payload_canonical text,
  p_payload_hash      text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor public.profiles := public.flow_get_actor(p_actor_id);
begin
  if v_actor.role <> 'school_rep' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo el representante de la escuela puede crear necesidades.');
  end if;
  if v_actor.school_id is distinct from p_school_id then
    perform public.flow_fail('NOT_SCHOOL_MEMBER', 'Solo puedes crear necesidades para tu propia escuela.');
  end if;
  perform public.flow_assert_quantity(p_goal_quantity);

  insert into public.needs (
    id, school_id, kind, title, description, category, priority,
    goal_quantity, goal_unit, event_date, created_by
  ) values (
    p_need_id, p_school_id, p_kind, p_title, coalesce(p_description, ''), p_category, p_priority,
    p_goal_quantity, p_goal_unit, p_event_date, p_actor_id
  );

  perform public.flow_insert_event(
    p_event_id, 'NEED_CREATED', p_need_id, p_school_id, null, 'school_rep',
    p_payload_canonical, p_payload_hash
  );

  return jsonb_build_object('eventId', p_event_id, 'needId', p_need_id, 'needStatus', 'pending_validation');
end;
$$;

-- NEED_VALIDATED: admin valida → published (pública y abierta a compromisos).
create or replace function public.flow_validate_need(
  p_actor_id          uuid,
  p_need_id           uuid,
  p_event_id          uuid,
  p_payload_canonical text,
  p_payload_hash      text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor public.profiles := public.flow_get_actor(p_actor_id);
  v_need  public.needs;
begin
  if v_actor.role <> 'admin' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo la administración de la plataforma puede validar necesidades.');
  end if;

  select * into v_need from public.needs where id = p_need_id for update;
  if not found then
    perform public.flow_fail('NOT_FOUND', 'La necesidad no existe.');
  end if;
  if v_need.status <> 'pending_validation' then
    perform public.flow_fail('INVALID_TRANSITION', 'Esta necesidad no está pendiente de validación.');
  end if;

  update public.needs
     set status = 'published', validated_by = p_actor_id, validated_at = now()
   where id = p_need_id;

  perform public.flow_insert_event(
    p_event_id, 'NEED_VALIDATED', p_need_id, v_need.school_id, null, 'admin',
    p_payload_canonical, p_payload_hash
  );

  return jsonb_build_object('eventId', p_event_id, 'needId', p_need_id, 'needStatus', 'published');
end;
$$;

-- Rechazo: admin → cancelled. Sin evento HCS en Phase 2. La necesidad y su
-- NEED_CREATED se conservan en el historial (visible para admin y su escuela).
create or replace function public.flow_reject_need(
  p_actor_id uuid,
  p_need_id  uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor public.profiles := public.flow_get_actor(p_actor_id);
  v_need  public.needs;
begin
  if v_actor.role <> 'admin' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo la administración de la plataforma puede rechazar necesidades.');
  end if;

  select * into v_need from public.needs where id = p_need_id for update;
  if not found then
    perform public.flow_fail('NOT_FOUND', 'La necesidad no existe.');
  end if;
  if v_need.status <> 'pending_validation' then
    perform public.flow_fail('INVALID_TRANSITION', 'Esta necesidad no está pendiente de validación.');
  end if;

  update public.needs set status = 'cancelled' where id = p_need_id;

  return jsonb_build_object('needId', p_need_id, 'needStatus', 'cancelled');
end;
$$;

-- COMMITMENT_CREATED: supporter sobre una necesidad publicada, hasta lo disponible.
-- El bloqueo de la necesidad serializa compromisos concurrentes: el límite de
-- cantidad no se puede sobrepasar por carreras.
create or replace function public.flow_create_commitment(
  p_actor_id          uuid,
  p_commitment_id     uuid,
  p_need_id           uuid,
  p_quantity          numeric,
  p_note              text,
  p_event_id          uuid,
  p_payload_canonical text,
  p_payload_hash      text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor     public.profiles := public.flow_get_actor(p_actor_id);
  v_need      public.needs;
  v_committed numeric;
  v_available numeric;
begin
  if v_actor.role <> 'supporter' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo los aliados pueden comprometerse a ayudar.');
  end if;

  select * into v_need from public.needs where id = p_need_id for update;
  if not found then
    perform public.flow_fail('NOT_FOUND', 'La necesidad no existe.');
  end if;
  if v_need.status <> 'published' then
    perform public.flow_fail('NEED_NOT_OPEN', 'Esta necesidad no está abierta a compromisos.');
  end if;

  perform public.flow_assert_quantity(p_quantity);

  select coalesce(sum(quantity), 0) into v_committed
    from public.commitments
   where need_id = p_need_id and status <> 'cancelled';
  v_available := greatest(v_need.goal_quantity - v_committed, 0);
  if p_quantity > v_available then
    perform public.flow_fail('QUANTITY_EXCEEDS_AVAILABLE', format('La cantidad supera lo disponible (%s).', v_available));
  end if;

  insert into public.commitments (id, need_id, supporter_id, quantity, note)
  values (p_commitment_id, p_need_id, p_actor_id, p_quantity, nullif(btrim(p_note), ''));

  perform public.flow_insert_event(
    p_event_id, 'COMMITMENT_CREATED', p_need_id, v_need.school_id, p_commitment_id, 'supporter',
    p_payload_canonical, p_payload_hash
  );

  return jsonb_build_object('eventId', p_event_id, 'commitmentId', p_commitment_id, 'commitmentStatus', 'committed');
end;
$$;

-- DELIVERY_REPORTED: el MISMO supporter informa la entrega. No es recepción.
-- La nota queda solo en Supabase; nunca va al payload HCS.
create or replace function public.flow_report_delivery(
  p_actor_id          uuid,
  p_commitment_id     uuid,
  p_delivery_note     text,
  p_event_id          uuid,
  p_payload_canonical text,
  p_payload_hash      text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor      public.profiles := public.flow_get_actor(p_actor_id);
  v_need_id    uuid;
  v_need       public.needs;
  v_commitment public.commitments;
begin
  if v_actor.role <> 'supporter' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo el aliado que se comprometió puede reportar la entrega.');
  end if;

  select need_id into v_need_id from public.commitments where id = p_commitment_id;
  if not found then
    perform public.flow_fail('NOT_FOUND', 'El compromiso no existe.');
  end if;
  select * into v_need from public.needs where id = v_need_id for update;
  select * into v_commitment from public.commitments where id = p_commitment_id for update;

  if v_commitment.supporter_id <> p_actor_id then
    perform public.flow_fail('NOT_COMMITMENT_OWNER', 'Solo puedes reportar la entrega de tus propios compromisos.');
  end if;
  if v_need.status <> 'published' then
    perform public.flow_fail('NEED_NOT_OPEN', 'Esta necesidad ya no está abierta.');
  end if;
  if v_commitment.status <> 'committed' then
    perform public.flow_fail('INVALID_TRANSITION', 'La entrega de este compromiso ya fue reportada o cerrada.');
  end if;

  update public.commitments
     set status = 'delivery_reported',
         delivery_note = nullif(btrim(p_delivery_note), ''),
         delivery_reported_at = now()
   where id = p_commitment_id;

  perform public.flow_insert_event(
    p_event_id, 'DELIVERY_REPORTED', v_need.id, v_need.school_id, p_commitment_id, 'supporter',
    p_payload_canonical, p_payload_hash
  );

  return jsonb_build_object('eventId', p_event_id, 'commitmentId', p_commitment_id, 'commitmentStatus', 'delivery_reported');
end;
$$;

-- SCHOOL_CONFIRMED: el school_rep de la escuela de la necesidad confirma la
-- recepción. Cierra la ayuda. Si lo confirmado alcanza la meta → completed.
create or replace function public.flow_confirm_receipt(
  p_actor_id          uuid,
  p_commitment_id     uuid,
  p_event_id          uuid,
  p_payload_canonical text,
  p_payload_hash      text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor      public.profiles := public.flow_get_actor(p_actor_id);
  v_need_id    uuid;
  v_need       public.needs;
  v_commitment public.commitments;
  v_confirmed  numeric;
  v_completed  boolean := false;
begin
  if v_actor.role <> 'school_rep' then
    perform public.flow_fail('FORBIDDEN_ROLE', 'Solo el representante de la escuela puede confirmar la recepción.');
  end if;

  select need_id into v_need_id from public.commitments where id = p_commitment_id;
  if not found then
    perform public.flow_fail('NOT_FOUND', 'El compromiso no existe.');
  end if;
  select * into v_need from public.needs where id = v_need_id for update;
  select * into v_commitment from public.commitments where id = p_commitment_id for update;

  if v_actor.school_id is distinct from v_need.school_id then
    perform public.flow_fail('NOT_SCHOOL_MEMBER', 'Solo puedes confirmar recepciones de tu propia escuela.');
  end if;
  if v_need.status <> 'published' then
    perform public.flow_fail('NEED_NOT_OPEN', 'Esta necesidad ya no está abierta.');
  end if;
  if v_commitment.status <> 'delivery_reported' then
    perform public.flow_fail(
      'INVALID_TRANSITION',
      case when v_commitment.status = 'committed'
        then 'El aliado todavía no ha reportado la entrega.'
        else 'Esta recepción ya fue confirmada o el compromiso está cerrado.'
      end
    );
  end if;

  update public.commitments
     set status = 'confirmed', confirmed_by = p_actor_id, confirmed_at = now()
   where id = p_commitment_id;

  perform public.flow_insert_event(
    p_event_id, 'SCHOOL_CONFIRMED', v_need.id, v_need.school_id, p_commitment_id, 'school_rep',
    p_payload_canonical, p_payload_hash
  );

  select coalesce(sum(quantity), 0) into v_confirmed
    from public.commitments
   where need_id = v_need.id and status = 'confirmed';

  if v_confirmed >= v_need.goal_quantity then
    update public.needs set status = 'completed', completed_at = now() where id = v_need.id;
    v_completed := true;
  end if;

  return jsonb_build_object(
    'eventId', p_event_id,
    'commitmentId', p_commitment_id,
    'commitmentStatus', 'confirmed',
    'needCompleted', v_completed,
    'needStatus', case when v_completed then 'completed' else 'published' end
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Permisos: las flow_* solo desde el servidor (service_role).
--    Postgres concede EXECUTE a PUBLIC por defecto y Supabase además a
--    anon/authenticated: se revoca explícitamente.
-- -----------------------------------------------------------------------------
do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'flow\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;
