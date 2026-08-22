# MVP-1 — Brief para Claude Code

**Producto:** Prospecting Copilot — primera versión real, multi-usuario, con backend.
**Primera usuaria:** la hermana de Santiago (Tenders & Opportunities + outreach diario).
**Siguientes usuarios:** Santiago (3 workspaces: vender la app, networking, servicios de datos), su esposa.
**Este documento es el contrato de alcance.** Claude Code: ejecutá los sprints en orden,
no re-abras las decisiones cerradas de §1, y no toques nada de §8 (fuera de alcance).
Leé también `docs/PRODUCTIZATION_PLAN.md` (arquitectura y razones) y
`docs/FUTURE_ARCHITECTURE.md` (interfaces ya diseñadas).

---

## 1. Decisiones cerradas (no re-discutir)

**D1 — Web app con login real. No desktop.**
La seguridad viene del servidor (auth, RLS, custodia de keys), no del empaquetado.
Una desktop app sin backend es _menos_ segura: estado y API key en texto plano en el
disco del usuario. Si algún día se quiere desktop, se hace un wrapper Tauri sobre el
mismo código — fase posterior, no ahora.

**D2 — El selector de workspace desaparece; entra login.**
Supabase Auth con magic link (cero passwords que custodiar). Cada usuario ve solo
sus workspaces. `workspace_members` permite compartir un workspace más adelante.

**D3 — BYOK estricto: cada cuenta conecta su propia API key de Anthropic.**
Nadie usa la key de nadie. No existe conexión con la suscripción de claude.ai
(€20/mes): no es programable por terceros. El onboarding guía a crear cuenta en
console.anthropic.com, poner billing y límite de gasto, y pegar la key.
La app valida la key con una llamada mínima (~$0.001) antes de aceptarla.
La key puede definirse a nivel cuenta (default) y sobreescribirse por workspace
(para el caso de Santiago: costos separados por workspace).

**D4 — LinkedIn: envío SIEMPRE manual. Cero automatización. Permanente.**
Ni browser automation, ni extensión, ni Claude in Chrome, ni "solo leer".
Automatizar = riesgo de ban de la cuenta del usuario, catastrófico.
Lo que sí se construye (§4.4): cola de envío asistida + import del export oficial
de conexiones de LinkedIn para detectar aceptados. Esta regla es además la defensa
anti prompt-injection del producto: un humano lee y envía todo.

**D5 — Región EU (Frankfurt) desde el minuto uno.** Supabase EU. No negociable (GDPR).

**D6 — Plan free/paid existe en el schema desde el día 1, todo es free por ahora.**
`plan` en la tabla de perfiles. La facturación de suscripciones (Stripe) es MVP-2+.

**D7 — Ninguna llamada paga se escribe antes de que existan contador y freno.**
Metering (`usage_events`) y caps server-side van ANTES del primer request a Anthropic.

**D8 — La UI validada no se rediseña.** ProspectCard, MessageEditor, shortcuts,
kanban y el módulo Opportunities quedan como están. Solo se les cambia la fuente
de datos y se agregan las pantallas nuevas de §4.

---

## 2. Arquitectura (resumen — detalle en PRODUCTIZATION_PLAN.md §4–5)

- **Frontend:** la misma app React/Vite/TS, deployada en Cloudflare Pages (repo privado).
- **Backend:** Supabase (EU): Postgres + RLS, Auth magic link, Storage (documentos
  de propósito), Vault/pgsodium (keys cifradas), Edge Functions (todo lo que toca
  una API key). PostgREST cubre el CRUD — no escribir un servidor CRUD propio.
- **Jobs:** GitHub Actions cron (runs nocturnos, backups `pg_dump`, ping anti-pausa).
- **La API key nunca llega al browser ni a `localStorage`.** Se envía una vez por
  HTTPS a una Edge Function, se cifra, y solo las Edge Functions la leen.
- **Errores:** Sentry free, con filtro que redacta `sk-ant-*` de todo log.

## 3. Schema — delta sobre el modelo existente

Traducir `types.ts` + `opportunityTypes.ts` a Postgres como está mapeado en
`PRODUCTIZATION_PLAN.md` §5 (tablas, RLS, índices). Agregar:

```
profiles                    user_id → auth.users, display_name, plan
                            ('free' default), created_at

provider_credentials        id, owner_type ('account'|'workspace'), owner_id,
                            provider ('anthropic'), ciphertext, key_last4,
                            status ('active'|'invalid'|'revoked'),
                            created_at, rotated_at, last_used_at, last_validated_at

workspace_purpose           workspace_id (PK), purpose_text (el "para qué quiero
                            esto" en detalle), target_channel
                            ('linkedin_invite'|'linkedin_inmail'|'email'),
                            updated_at

purpose_documents           id, workspace_id, storage_path, filename, mime,
                            extracted_text, uploaded_at
                            ← archivos en Supabase Storage (bucket privado, RLS);
                              el texto se extrae server-side al subir

channel_limits              channel (PK), max_chars, note
                            ← seed: linkedin_invite=300, linkedin_inmail=1900,
                              email=NULL (sin límite). Editable en settings.

linkedin_imports            id, workspace_id, imported_at, row_count,
                            matched_count
                            ← auditoría de cada import de Connections.csv

runs, usage_events, spend_limits, do_not_contact, company_research_cache
                            ← exactamente como PRODUCTIZATION_PLAN.md §5
```

RLS en todo lo que tenga `workspace_id` u `owner`. El test de aislamiento
cross-tenant (intentar leer el workspace de otro y esperar fallo) es parte del
exit criteria del Sprint 1, no un nice-to-have.

## 4. Funcionalidad nueva

### 4.1 Onboarding de cuenta

1. Magic link → crear perfil.
2. "Conectá tu Anthropic" — pantalla dedicada, con capturas: crear cuenta en
   console.anthropic.com → cargar billing → **configurar límite de gasto en SU
   consola** (insistir: es su freno maestro) → crear key → pegarla.
3. Validación en vivo de la key (Edge Function, llamada mínima). Feedback claro
   si es inválida. Solo se muestran los últimos 4 caracteres, para siempre.

### 4.2 Onboarding de workspace: el propósito

Al crear un workspace, pantalla "¿Para qué querés esto?":

- Textarea grande con guía: "Explicá en el mayor detalle posible para qué querés
  la app, cómo la vas a usar, cuál es tu necesidad (ventas, networking, licitaciones,
  servicios). Tip: podés pedirle esto a otra IA — describile tu situación y pegá acá
  su respuesta."
- Upload de documentos (PDF/DOCX/MD/TXT) → Storage privado → extracción de texto
  server-side → `purpose_documents.extracted_text`.
- Elegir canal objetivo (invitación LinkedIn / InMail / email) → define el límite
  de caracteres del editor.
  Este propósito + documentos es el contexto de TODAS las llamadas de IA del
  workspace (con prompt caching: es idéntico entre candidatos, cache-read = 0.1×).

### 4.3 El loop diario (pantalla "Hoy")

Lo primero que ve el usuario al entrar:

1. **Respuestas pendientes:** follow-ups vencidos + conexiones aceptadas sin
   respuesta, con botón "generar mensaje de agradecimiento + pregunta" (batch).
2. **Nuevo batch:** cuántos mensajes quiero hoy (N) + slider de profundidad
   (shallow/normal/deep) + **selector de modelo** (Haiku 4.5 / Sonnet / Opus, con
   precio por 100 candidatos al lado) → **proyección de costo en € en vivo** antes
   de confirmar, más "este mes llevás gastado €X".
3. Revisión tarjeta por tarjeta (la UI existente, sin cambios).

### 4.4 Cola de envío asistida (reemplaza cualquier idea de automatización)

- Al terminar la revisión: "Enviar los N aprobados" abre el modo cola:
  por cada prospect, la app copia el mensaje final al portapapeles, abre el perfil
  de LinkedIn en una pestaña, y muestra "pegar → Connect → volver"; al volver,
  un click marca `sent` y avanza al siguiente. Contador de progreso.
- El editor **bloquea exceder el límite de caracteres del canal** (300 para
  invitación, configurable en `channel_limits`) con contador visible.
- **Import de aceptados:** pantalla que recibe el `Connections.csv` del export
  oficial de LinkedIn (Settings → Get a copy of your data). Matching por URL de
  perfil y nombre+empresa contra prospects en `connection_sent` → los pasa a
  `connection_accepted` y sugiere follow-up. Registrar en `linkedin_imports`.

### 4.5 Dashboard de consumo

`CostEstimator` evoluciona a panel real: gasto del mes por workspace, por run y
por modelo, proyección fin de mes, costo por candidato y por contacto realizado.
Datos de `usage_events`, precios congelados por evento (`unit_price_snapshot`).

## 5. Sprints (cada uno = una sesión de Claude Code, en orden)

### Sprint 1 — Auth + DB + sync (exit: dos usuarios aislados)

Supabase EU; schema completo + RLS + índices; magic link; migración del store por
write-through (PRODUCTIZATION_PLAN §6, paso 1–2: `AppState` se hidrata del server
al login y cada `setState` escribe a Supabase; `localStorage` queda como cache);
importador one-shot del backup JSON del prototipo (que la hermana no pierda lo
que ya cargó); `pg_dump` semanal + ping anti-pausa por Actions; Sentry.
**Tests obligatorios:** aislamiento cross-tenant; que `provider_credentials`
jamás aparezca en el estado persistido del cliente.

### Sprint 2 — BYOK + metering + primera llamada (exit: draft con IA real y costo visible)

Vault de keys + Edge Function `connect-anthropic` (validación) — primero.
`usage_events` + `spend_limits` + enforcement server-side — segundo.
Edge Function `draft-message` implementando `AIProvider.draftMessage()` detrás de
la llamada que la UI ya hace — tercero. Selector de modelo. Dashboard de consumo
básico. **Probar el freno a propósito:** cap a €1, run grande, cancelación sola.

### Sprint 3 — Propósito + loop diario completo (exit: la hermana corre su día entero)

Onboarding de propósito con documentos y extracción de texto; contexto en las
llamadas con prompt caching; pantalla "Hoy"; batch con N + profundidad + modelo +
proyección; límites de caracteres por canal; cola de envío asistida; import de
`Connections.csv`; follow-ups sugeridos para aceptados.

### Sprint 4 — Endurecer + lanzar (exit: checklist de prod de PRODUCTIZATION_PLAN §12)

Rate limiting en Edge Functions; gitleaks en CI bloqueando merges; redacción de
secretos en logs; revalidación server-side de todos los inputs (Zod compartido);
restauración de backup probada; política de privacidad + retención; deploy final
en Cloudflare Pages con dominio.

Estimación honesta: 3–4 fines de semana intensos con Claude Code. La hermana
empieza EL LUNES con el prototipo ya deployado (usable hoy: carga manual/CSV,
templates, Opportunities, pipeline) y migra su backup JSON al backend cuando el
Sprint 1 esté verde.

## 6. Requisitos de seguridad (resumen ejecutable — detalle en PRODUCTIZATION_PLAN §9)

1. API keys: nunca en el browser, nunca en `localStorage`, nunca en logs, cifradas
   en reposo, solo last-4 visibles, rotación en un click.
2. RLS en todas las tablas; `service_role` solo en GitHub Actions; test cross-tenant en CI.
3. Rate limiting por usuario e IP en toda Edge Function que gaste dinero.
4. Contenido web traído por research = datos, no instrucciones (delimitado,
   structured outputs JSON, la salida del modelo nunca dispara acciones).
5. Dependabot + `npm audit` en CI; `xlsx` siempre al día.
6. HTTPS en todo; sesiones con expiración; validación server-side de todo input.

## 7. Roadmap posterior (NO ahora — solo para no cerrar puertas)

- MVP-2: landing pública + registro self-serve + planes pagos (Stripe) — el
  "portal de ventas" de Santiago. El campo `plan` ya lo soporta.
- MVP-3: pipeline de research nocturno completo (discover→dedupe→research→score→
  draft) por GitHub Actions cron; email outreach como canal; fetch real de
  licitaciones para Opportunities (lo mapeado en OPPORTUNITIES_MODULE.md).
- Wrapper desktop (Tauri) si de verdad hace falta.

## 8. Fuera de alcance — permanente o hasta nueva decisión escrita

- ❌ Automatización de LinkedIn en cualquier forma: browser automation, extensión,
  scraping, lectura de estado, envío automático. PERMANENTE.
- ❌ Envío automático de cualquier mensaje por cualquier canal. PERMANENTE.
- ❌ Conexión con suscripciones de claude.ai — técnicamente no existe.
- ❌ Usar una API key del dueño de la app para usuarios. BYOK estricto.
- ❌ Stripe/facturación en MVP-1.
- ❌ Reescribir la UI validada.

---

## 9. Prompt de kickoff para pegar en Claude Code (Sprint 1)

> Lee `docs/MVP1_CLAUDE_CODE_BRIEF.md`, `docs/PRODUCTIZATION_PLAN.md` (§4, §5, §6, §9)
> y `docs/FUTURE_ARCHITECTURE.md`. Vamos a ejecutar el **Sprint 1** del brief:
> convertir el prototipo en una app multi-usuario con Supabase (región EU).
> Alcance exacto: proyecto Supabase, schema Postgres completo con RLS e índices
> según el brief §3 y el plan §5, auth por magic link reemplazando el selector de
> workspace, migración del store por write-through (plan §6, pasos 1–2),
> importador del backup JSON del prototipo, `pg_dump` semanal y ping anti-pausa
> por GitHub Actions, y Sentry con redacción de `sk-ant-*`.
> Tests obligatorios antes de dar por cerrado: (1) un usuario no puede leer datos
> de un workspace ajeno — el test lo intenta y espera fallo; (2) el estado
> persistido del cliente nunca contiene `provider_credentials`.
> No toques la UI de revisión ni el módulo Opportunities más allá del cambio de
> fuente de datos. No implementes nada de IA todavía (es Sprint 2). Respetá §8
> del brief. Trabajá con plan mode primero y mostrame el plan antes de ejecutar.
