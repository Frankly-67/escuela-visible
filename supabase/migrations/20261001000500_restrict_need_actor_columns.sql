-- =============================================================================
-- Escuela Visible — B0.1: protección de identificadores de actores en needs
--
-- Antes: anon y authenticated tenían SELECT sobre todas las columnas de needs,
-- incluidas created_by y validated_by (UUIDs de usuarios). Junto con profiles
-- permitían saber quién creó o validó cada necesidad.
--
-- Después: SELECT solo sobre las columnas que usan las páginas públicas, las
-- políticas RLS (status, school_id, id), las subconsultas RLS de commitments y
-- hedera_events (id) y las vistas need_progress (id, goal_quantity) e
-- impact_feed (id, title, kind). No se eliminan columnas ni se cambian datos,
-- políticas RLS ni otros privilegios. service_role conserva acceso completo.
--
-- Efecto secundario: `select *` sobre needs desde anon/authenticated falla;
-- las consultas deben listar columnas explícitas.
-- =============================================================================

revoke select on table public.needs from anon, authenticated;

grant select (
  id,
  school_id,
  kind,
  title,
  description,
  category,
  priority,
  goal_quantity,
  goal_unit,
  event_date,
  status,
  validated_at,
  completed_at,
  created_at,
  updated_at
) on table public.needs to anon, authenticated;
-- Protegidas (sin SELECT para anon/authenticated): created_by, validated_by.
