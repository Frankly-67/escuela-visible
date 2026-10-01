-- =============================================================================
-- Escuela Visible — B0: restricción de columnas sensibles (solo permisos SELECT)
--
-- Antes: anon y authenticated tenían SELECT sobre TODAS las columnas de
-- commitments y hedera_events (RLS filtra filas, no columnas). Eso permitía
-- leer desde la API pública, entre otras, supporter_id y confirmed_by (que se
-- pueden cruzar con profiles), notas, evidencias y errores internos.
--
-- Después: SELECT solo sobre las columnas que usan las consultas públicas,
-- las vistas y la verificación en vivo. No se elimina ninguna columna ni se
-- cambian políticas RLS, datos ni otros privilegios. service_role (servidor
-- con secret key, scripts y RPC del flujo) conserva acceso completo.
--
-- Efecto secundario conocido: `select *` desde anon/authenticated falla en
-- estas dos tablas; las consultas deben listar columnas explícitas.
-- Columnas nuevas futuras quedan sin SELECT para anon/authenticated salvo
-- que se concedan explícitamente.
-- =============================================================================

-- commitments ------------------------------------------------------------------
-- Protegidas: supporter_id, confirmed_by, note, delivery_note,
-- delivery_evidence_path (y updated_at, que no se usa).
revoke select on table public.commitments from anon, authenticated;

grant select (
  id,
  need_id,               -- RLS de commitments y vista need_progress
  quantity,              -- need_progress, historial
  status,                -- need_progress, historial
  created_at,
  delivery_reported_at,
  confirmed_at           -- bloque de confirmación
) on table public.commitments to anon, authenticated;

-- hedera_events ----------------------------------------------------------------
-- Protegidas: submission_error, attempts, payload (jsonb redundante con
-- payload_canonical; no lo usa ninguna consulta pública).
revoke select on table public.hedera_events from anon, authenticated;

grant select (
  id,
  event_type,
  need_id,               -- RLS de hedera_events y vista impact_feed
  school_id,
  commitment_id,
  actor_role,
  payload_canonical,     -- verificación en vivo (/verify/[id])
  payload_hash,
  submission_status,
  topic_id,
  transaction_id,
  sequence_number,
  consensus_timestamp,
  created_at,
  submitted_at
) on table public.hedera_events to anon, authenticated;
