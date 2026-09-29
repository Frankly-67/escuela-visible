@AGENTS.md

# Escuela Visible — reglas del proyecto

- **Privacidad:** nunca nombres/fotos identificables de menores, datos médicos, direcciones
  particulares ni datos individuales de estudiantes. Necesidades de estudiantes solo agregadas.
  A Hedera solo van identificadores, tipo, rol y fecha; nunca texto libre.
- **Honestidad técnica:** Hedera verifica el *evento* registrado por la plataforma, no filas
  completas ni que la ayuda ocurrió. Texto aprobado: "Este registro permite comprobar que el
  evento registrado por Escuela Visible coincide con el registro publicado en Hedera."
- **Flujo:** escuela crea → admin valida → pública → aliado se compromete → aliado reporta
  entrega → escuela confirma (SCHOOL_CONFIRMED).
- **Roles:** solo `supporter`, `school_rep`, `admin`.
- **Supabase:** publishable key en cliente; secret key solo en servidor (`src/lib/supabase/admin.ts`),
  nunca `NEXT_PUBLIC_`. Escrituras solo vía Server Actions que validan rol y transición.
- **Demo:** escuelas ficticias, siempre marcadas DEMO.
- **Alcance:** sin pagos, cripto, tokens, NFTs, smart contracts, chat, red social, marketplace,
  ORM, Redis, Realtime ni backend separado.
- Antes de terminar una fase: `npm run lint`, `npm run typecheck`, `npm run build`.
