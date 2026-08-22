# Prospecting Copilot — Plan de Productización

**De prototipo a producto real**
Fecha: 2026-08-14
Basado en: código del prototipo + los 8 documentos de `docs/`
Owner: Santiago Ravotti — proyecto personal

---

## 0. Resumen en una página

**Qué tenés:** un prototipo frontend maduro y honesto. React 18 + Vite + TS strict,
10 páginas, data model completo (`src/lib/types.ts` + `opportunityTypes.ts`),
store con versionado y migración, tests (Vitest + Playwright), CI, y 8 documentos
de planificación que ya incluyen arquitectura futura y modelo de costos verificado.
Eso te pone por delante del 90% de los MVPs que llegan a producción.

**Qué te falta:** todo lo que vive del lado del servidor. No es poco, pero es
menos de lo que parece, porque `FUTURE_ARCHITECTURE.md` ya definió las interfaces
correctas y la UI no tiene que cambiar.

**La decisión más importante, y no es técnica:** cómo cobrás el consumo.
El objetivo es "se lo doy gratis y solo les cobro el consumo". La forma de hacer
eso sin montar facturación, IVA, Stripe ni una sociedad es **BYOK — cada usuario
pone su propia API key de Anthropic**. Con eso el dinero nunca pasa por tus manos,
el usuario tiene control directo del gasto en su propia consola, y vos seguís
siendo el dueño del producto. Es la diferencia entre lanzar en 4 meses y lanzar
en 10.

**Cuánto vas a invertir en dinero:** entre **€10 y €12 al año** (el dominio) si
usás free tiers y templates legales. Hasta **~€800 una vez** si pagás un abogado
para revisar la política de privacidad y el DPA antes de dárselo a Impact
Hydrogen — lo cual se recomienda. El consumo de IA lo paga cada usuario con su
key: **€12–47/mes** según volumen.

**Cuánto vas a invertir en tiempo:** **170–235 horas**. A 10 h/semana son
**~5 meses**. Eso es el costo real del proyecto. Todo lo demás es ruido.

**El orden correcto de las fases no es el que el instinto dice.** El instinto dice
base de datos → backend → dominio → deploy → pricing. Ese orden hace construir
tres meses antes de saber si la tesis del producto es cierta. El orden correcto
está en la sección 3.

---

## 1. Diagnóstico honesto del prototipo

### Lo que está sólido y sobrevive sin cambios

| Activo                                         | Por qué importa para producción                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/lib/types.ts` + `opportunityTypes.ts`     | Es el schema de base de datos, ya diseñado. La traducción a Postgres es casi mecánica. |
| `src/lib/providers/index.ts`                   | Las interfaces correctas ya existen. Implementarlas no requiere tocar la UI.           |
| `store.ts` con `version` + `migrateState()`    | Ya hay hábito de migraciones. Ese hábito es el que salva en prod.                      |
| Modelo `Activity`                              | Es un audit log. Se va a necesitar por GDPR y para analytics reales. Ya está.          |
| `CostEstimator` + `pricing.json`               | Es el esqueleto del producto de pricing. Se convierte en dashboard de consumo real.    |
| Regla "el humano revisa y envía todo"          | No es solo ética. Es también la defensa contra prompt injection (ver §9).              |
| Regla "nunca tocar LinkedIn programáticamente" | Saca al proyecto del riesgo legal más grande del sector. No negociarla nunca.          |
| Tests + CI + TS strict                         | Vienen refactors grandes. Sin esto se vuelven terroríficos.                            |

### Los huecos reales, ordenados por dificultad

1. **Persistencia server-side.** Hoy todo vive en `localStorage` de un navegador.
   Un solo usuario, un solo dispositivo, y si limpia datos del sitio pierde todo.
2. **Auth.** No existe. Hasta que exista no hay multi-usuario ni nada compartido.
3. **Multi-tenancy real.** `workspaceId` ya está en el data model — excelente — pero
   hoy es un filtro en el cliente. En prod tiene que ser aislamiento a nivel base
   de datos, o se filtran datos entre usuarios.
4. **El pipeline de research.** Es el corazón del valor y es lo único que no está
   ni empezado. Discover → dedupe → research → score → draft.
5. **Metering y caps de gasto.** No es una feature de contabilidad: **es el modelo
   de negocio**. Sin esto no se puede cobrar consumo ni prometer control de gasto.
6. **Custodia de credenciales.** Con BYOK, guardar API keys de otras personas es
   la mayor responsabilidad de seguridad. Se hace bien o no se hace.
7. **Producto, no app.** Landing, onboarding, branding, docs, soporte.

### Dos correcciones concretas a los docs actuales

**`README.md` / `IMPLEMENTATION_PLAN.md` — hosting.** Dicen que GitHub Pages
gratis exige repo público, y por eso el deploy queda bloqueado. Correcto, pero
la solución existe y es gratis: **Cloudflare Pages** sirve repos **privados** en
el plan free, con 500 builds/mes, 100 dominios custom por proyecto y ancho de
banda sin límite publicado. Cambiar el target de deploy y el problema desaparece.

**`COST_MODEL.md` — pricing de Anthropic.** El modelo usa Sonnet 5 a $3/$15
asumiendo que la promo terminaba el 2026-08-31. **Ese aumento fue cancelado: $2/$10
es ahora el precio permanente.** Recalculado con los mismos supuestos
(2.000 candidatos/mes, 90% Haiku 4.5 / 10% Sonnet 5, Batch API):

| Componente              | Modelo actual | Recalculado      |
| ----------------------- | ------------- | ---------------- |
| Haiku 4.5 (1.800 cand.) | $21,60        | $21,60           |
| Sonnet 5 (200 cand.)    | $7,20         | **$4,80**        |
| Total estándar          | $28,80        | **$26,40**       |
| Total con Batch (−50%)  | $14,40        | **$13,20 ≈ €12** |

Sigue confirmando la conclusión: el MVP corre bajo €50/mes. Solo con más holgura.

---

## 2. Decisión #1: cómo cobrás el consumo (BYOK)

Esta es la decisión que define el 60% del resto del plan. Tratarla primero.

### El objetivo

> "Dárselo a Impact gratis como usuario y solo cobrarles el consumo. Lo mismo para
> mí. Que consuma tokens eventualmente y haga el pricing correctamente."

Hay dos formas de implementar eso y son radicalmente distintas en costo y riesgo.

### Opción A — BYOK: cada workspace pone su propia API key ✅ recomendada

Impact Hydrogen crea su cuenta en Anthropic, pone su tarjeta, genera una API key
y la pega en la app. La app la usa para hacer las llamadas. **Anthropic les factura
a ellos, directamente.** No hay que cobrar nada porque no hace falta.

**Por qué es claramente superior en este caso:**

- **Cero infraestructura de cobro.** No hay Stripe, no hay facturas, no hay
  conciliación mensual, no hay disputas por "este mes gasté más".
- **Cero estructura legal para facturar.** No hace falta PFA/SRL, ni gestionar IVA,
  ni reverse charge intracomunitario, ni recibos. Esto solo ahorra meses.
- **Cero riesgo de crédito y cero float.** Nunca se adelanta plata de otro. Si un
  usuario dispara el gasto, es su tarjeta, su problema, su límite.
- **Control de gasto en el origen.** El usuario pone caps en su propia consola de
  Anthropic. Es el límite más fuerte que existe: no depende del código propio.
- **No convierte al proyecto en revendedor de Anthropic**, que es un rol con
  obligaciones contractuales que no conviene asumir por accidente.
- **Encaja exactamente con "que cada uno invierta lo que quiera"**: el presupuesto
  es literalmente el de cada usuario.
- **Una sola key cubre IA y búsqueda.** El web search tool de Anthropic
  ($10/1.000 búsquedas) y el web fetch (gratis, solo tokens) van por la misma key.
  Cero vendors adicionales, cero keys que custodiar.

**Los costos reales de BYOK, sin edulcorar:**

- **Fricción de onboarding.** El usuario necesita cuenta de Anthropic con tarjeta.
  Para Impact Hydrogen, una empresa con equipo de BD, es un trámite de 10 minutos.
  Para un usuario no técnico sería un muro — pero ese no es el usuario de hoy.
- **Custodia de la key es el problema de seguridad #1.** Ver §9. Se resuelve, pero
  no es opcional.
- **No escala a self-serve masivo.** Correcto. Y no importa: cuando eso sea el
  problema, ya habrá con qué pagarlo.

### Opción B — Pass-through gestionado

Una key propia, medir el consumo por workspace y facturar a fin de mes a costo.

Requiere: vehículo legal para facturar, gestión de IVA, Stripe o similar,
adelantar el dinero, asumir el riesgo si no pagan, y revisar los términos
comerciales de Anthropic sobre reventa. **Todo eso para cobrar €30/mes.**

No hacerlo ahora. Dejar la puerta abierta: si la capa de metering está bien
construida (§7), migrar de BYOK a facturación gestionada después es agregar un
cobrador encima de datos que ya existen — no un rediseño.

### La consecuencia de diseño que no es obvia

Aunque con BYOK **no se cobra nada**, la capa de metering sigue siendo
**obligatoria y central**. Porque la propuesta de valor no es "es barato": es
**"vos controlás exactamente cuánto gastás"**. Eso hay que verlo en pantalla, en
euros, antes y después de cada run. `CostEstimator` deja de ser una calculadora
hipotética y pasa a ser el panel de control del producto.

### Y esto es el feature diferencial, no un detalle

De la conversación original:

> "depende de la persona, lo que quieran invertir, cuánto tiempo personal quieren
> usar vs cuánto agente"

Eso es un **control de profundidad por run**, y es exactamente el producto:

| Modo        | Búsquedas/cand.           | Modelo             | Tokens/cand.      | €/100 cand. | Cuándo                               |
| ----------- | ------------------------- | ------------------ | ----------------- | ----------- | ------------------------------------ |
| **Shallow** | 0 (solo cache de empresa) | Haiku, batch       | ~3k in / 800 out  | ~€0,30      | Volumen, targets ya conocidos        |
| **Normal**  | ~0,5 (empresa cacheada)   | Haiku + 10% Sonnet | ~6k in / 1,2k out | ~€1,50      | El default                           |
| **Deep**    | 3–5 por persona           | Sonnet, sin batch  | ~20k in / 3k out  | ~€12        | Los 5 nombres que importan de verdad |

Un slider con proyección en euros **en vivo antes de confirmar el run**, y el
costo real al terminar. Eso convierte el gasto en IA de una angustia opaca en una
decisión informada. Es la razón por la que alguien elegiría esta herramienta.

---

## 3. El orden correcto de las fases

El principio: **no gastar una hora en infraestructura hasta haber probado la
hipótesis que `PRODUCT_PLAN.md` §2 ya escribió.** El trabajo difícil de definirla
está hecho. Ahora hay que responderla.

### Fase 0 — Validar la tesis · 10–15 h · 2 semanas · €0

**No se escribe código nuevo.** Se corre el prototipo como está y se usa en serio.

- Deploy a Cloudflare Pages (repo privado, free) para poder usarlo desde
  cualquier máquina. El clipboard API necesita HTTPS: `localhost` o Pages sirven.
- Santiago y Agustín cargan prospects reales a mano o por CSV.
- **≥20 connection requests reales enviadas** por el flujo asistido, cada uno.
- Se mide lo que `PRODUCT_PLAN.md` §13 ya listó: tasa de edición de mensajes,
  segundos por tarjeta, si confían en los labels de prioridad, si 30 s de contexto
  alcanzan, si el loop manual de LinkedIn es tolerable.

**Criterio de salida — ser estricto con esto:**

- La revisión por tarjeta se siente más rápida que el proceso actual, y se puede
  decir con números aunque sean toscos.
- **La tasa de edición de mensajes cae entre 20% y 80%.** Este número decide
  hacia dónde va la inversión:
  - <20% (casi nunca editan) → los templates ya alcanzan. **Invertir en descubrimiento
    y research, no en generación con IA.** Esto ahorraría meses.
  - > 80% (reescriben todo) → la capa de generación no sirve. Arreglar eso primero;
    > ponerle IA a un prompt mal definido solo produce texto malo más caro.

Si el criterio no se cumple, **parar**. No es fracaso: es haberse ahorrado 200 horas.

### Fase 1 — Backend real, sin IA todavía · 60–80 h · 6–8 semanas · €0

El objetivo es mover los datos del navegador al servidor **sin tocar la UI y sin
gastar un euro en APIs**. Fase aburrida, y es la que hace que exista un producto.

1. Proyecto Supabase, **región EU (Frankfurt)** — decidirlo ahora, mover después
   duele y para GDPR importa.
2. Schema Postgres traducido de `types.ts` (§5), con **RLS en cada tabla desde el
   minuto uno**. No "después". Después nunca llega y el día que llega ya se filtró.
3. Supabase Auth con magic link. Cero passwords que custodiar.
4. `SupabaseStorageProvider` implementando la interfaz ya diseñada. `localStorage`
   queda como cache offline (§6).
5. Backup: Supabase free **no tiene backups automáticos**. `pg_dump` semanal por
   GitHub Actions a un artifact cifrado o a R2. 20 líneas de YAML.
6. Sentry free (5k errores/mes).

**Criterio de salida:** entrar desde dos navegadores distintos con la misma cuenta
y ver los mismos datos. Agustín entra con su cuenta y **no ve ni un byte ajeno** —
verificado a mano intentando leer un `workspace_id` que no es suyo.

### Fase 2 — La primera llamada paga · 50–70 h · 5–7 semanas · consumo del usuario

Acá aparece la IA. Y acá aparece el riesgo de gasto, así que el orden dentro de la
fase importa mucho.

1. **Vault de credenciales BYOK primero** (§9.1). Antes de la primera llamada.
2. **Metering + caps segundo** (§7). Antes de la primera llamada. No después.
   La regla es simple: **ninguna llamada paga se escribe antes de que exista el
   contador y el freno.**
3. **`AIProvider.draftMessage()` tercero.** Reemplaza el template engine detrás de
   la misma llamada que la UI ya hace. Un solo endpoint, un solo modelo, superficie
   mínima. Es la prueba de fuego del circuito completo: key → llamada → medición →
   costo en pantalla.
4. **Recién después, el pipeline de research completo**: discover → dedupe →
   research (con **cache a nivel empresa**, que es el ahorro grande) → score →
   draft. Corre como job nocturno en GitHub Actions cron.
5. Web search de Anthropic con cap duro por run.

**Criterio de salida:** un run nocturno de 50 candidatos produce el batch de la
mañana, y el costo real quedó dentro del ±20% de lo proyectado. Y el freno se
probó **a propósito**: bajar el cap a €1, disparar un run grande, y que se cancele
solo.

### Fase 3 — Que sea un producto, no una app · 30–40 h · 3–4 semanas · ~€12/año

Esto es la "página web cool, flyers y banners", y es real: sin esto hay una
herramienta interna, no un producto.

- Dominio (§10). Cloudflare Registrar vende a costo, ~€10–12/año el `.com`.
- Landing de una página: el problema, el flujo en 3 pasos, capturas reales, la
  postura de privacidad, cómo empezar. Cloudflare Pages, gratis.
- Onboarding: crear workspace, pegar la API key, configurar targeting, primer run.
  **El paso de la API key es donde se pierden usuarios** — merece una pantalla
  bien hecha, con instrucciones paso a paso y un link directo a la consola.
- Branding mínimo: nombre, logo simple, paleta, favicon, OG image. Flyers y banners
  salen de ahí. Es la parte más fácil de todo el plan; no convertirla en excusa
  para no hacer la fase 2.
- Docs de usuario: qué hace, qué no hace, cuánto cuesta, qué datos guarda.

### Fase 4 — Seguridad, legal y lanzamiento · 20–30 h · 2–3 semanas · €0–800

La fase que existe porque un tercero va a usar el sistema con datos de personas
reales. Ver §9 y §8.

- Checklist de seguridad completo.
- Política de privacidad, aviso de retención, proceso de borrado.
- **DPA con Impact Hydrogen.** Aunque sea gratis: ellos son el controlador de los
  datos de sus prospects, el proyecto es el procesador. Sin DPA firmado, ambos
  están expuestos.
- Evaluación de interés legítimo (LIA) documentada para el outreach B2B.
- Lista de sub-procesadores: Anthropic, Supabase, Cloudflare.

**Total: 170–235 horas. A 10 h/semana, ~5 meses.**

---

## 4. Arquitectura de producción

```
┌───────────────────────────────────────────────────────────────┐
│  Cloudflare Pages (free, repo privado, HTTPS, dominio custom) │
│  La misma app React. Sin cambios de UI.                       │
│  StorageProvider: localStorage → Supabase client              │
└──────────────────────────┬────────────────────────────────────┘
                           │ HTTPS + JWT de Supabase Auth
        ┌──────────────────┴──────────────────┐
        ▼                                     ▼
┌──────────────────────────┐   ┌──────────────────────────────────┐
│ Supabase (free, EU)      │   │ Supabase Edge Functions          │
│ • Postgres + RLS         │   │ Todo lo que toca la API key.     │
│ • Auth (magic link)      │   │ • draft-message                  │
│ • PostgREST = tu CRUD    │   │ • analyze-opportunity            │
│   sin escribir backend   │   │ La key NUNCA llega al browser.   │
│ • Vault (keys cifradas)  │   └───────────────┬──────────────────┘
└──────────────────────────┘                   │
        ▲                                      ▼
        │                          ┌──────────────────────┐
┌───────┴──────────────────────┐   │  API de Anthropic    │
│ GitHub Actions (cron, free)  │──▶│  • Haiku 4.5 / Sonnet│
│ El orquestador nocturno.     │   │  • Batch API (−50%)  │
│ Sin límite de CPU ni timeout.│   │  • Web search $10/1k │
│ discover→dedupe→research→    │   │  • Web fetch (gratis)│
│ score→draft→publish batch    │   │  Facturado al usuario│
│ + pg_dump semanal            │   └──────────────────────┘
└──────────────────────────────┘
```

### Por qué este stack y no otro

**Supabase en vez de "Postgres + backend propio".** Da Postgres, Auth, RLS,
Vault, storage y Edge Functions en un vendor, con free tier suficiente y región EU.
Lo decisivo: **PostgREST + RLS significa que casi no se escribe backend de CRUD.**
Para un dev solo con Claude Code, eso son 40 horas que no se gastan.
`IMPLEMENTATION_PLAN.md` excluyó Supabase explícitamente — pero eso fue una regla
para el _prototipo_, con buen criterio. Para el MVP la decisión se invierte.

Las dos trampas del free tier, ambas manejables:

- **Pausa el proyecto tras 1 semana de inactividad.** La app corre runs en días
  hábiles, así que en la práctica nunca se pausa. Aun así, un ping semanal por
  GitHub Actions lo garantiza.
- **Sin backups automáticos.** De ahí el `pg_dump` semanal. Es obligatorio, no
  opcional. 500 MB de DB alcanzan de sobra: 2.000 filas/mes son nada.

**GitHub Actions para los jobs, no Cloudflare Workers.** Workers free tiene
**10 ms de CPU por invocación**. Para un orquestador que procesa 100 candidatos con
parseo de JSON y varias llamadas, es un techo peligroso. Actions da 2.000
minutos/mes gratis en repos privados, sin límite de CPU, con logs y reintentos.
`FUTURE_ARCHITECTURE.md` ya lo había elegido — mantenerlo.

**Edge Functions solo para lo que toca la key.** El CRUD va directo por PostgREST
con RLS. Menos código propio = menos superficie de bug y de ataque.

---

## 5. Base de datos

Traducción directa de `types.ts`. Postgres, `snake_case`, RLS en todo.

### Tablas que salen del modelo actual

```
auth.users                  (Supabase, gratis)

workspaces                  id, owner_id → auth.users, name, sender_name,
                            sender_title, sender_company, sender_bio,
                            services[], value_proposition, default_language,
                            default_tone, preferred_message_length,
                            daily_target, targeting_rules jsonb, created_at

workspace_members           workspace_id, user_id, role
                            ← esto es lo que permite que el equipo de IH comparta
                              un workspace. Hacerlo ahora aunque hoy sobre.

companies                   id, workspace_id, name, website, domain, industry,
                            city, country, size, type, description,
                            relevant_initiatives[], commercial_trigger, score,
                            notes, created_at

people                      id, workspace_id, full_name, first_name, last_name,
                            title, company_id, city, country, linkedin_url,
                            seniority, functional_area, professional_summary,
                            career_summary, research_confidence,
                            source_references[], created_at

prospects                   id, workspace_id, person_id, company_id, status,
                            priority, score, score_breakdown jsonb, fit_reason,
                            timing_reason, outreach_angle, recommended_service,
                            pattern_id, original_draft, edited_message,
                            final_message, notes, created_at, reviewed_at,
                            edited_at, sent_at, last_activity_at, outcome

activities                  id, workspace_id, prospect_id, type,
                            previous_status, new_status, notes, created_at
                            ← APPEND-ONLY. Sin UPDATE ni DELETE por política.
                              Es el audit log de GDPR.

follow_ups                  id, workspace_id, prospect_id, due_at, status,
                            message, completed_at

opportunities               id, workspace_id, + todo Opportunity.
                            eligibility, match_factors, delivery_estimate,
                            history, documents → jsonb
opportunity_sources         id, workspace_id, name, organization_type, url, active
opportunity_alerts          id, workspace_id, name, criteria jsonb, created_at
```

### Tablas nuevas que producción exige

```
provider_credentials        workspace_id, provider, ciphertext, key_last4,
                            created_at, rotated_at, last_used_at
                            ← el vault BYOK. Ver §9.1.

spend_limits                workspace_id, monthly_cap_eur, per_run_cap_eur,
                            per_run_max_candidates, per_run_max_searches,
                            max_tokens_per_candidate,
                            auto_cancel_threshold_pct DEFAULT 80

runs                        id, workspace_id, depth, requested_candidates,
                            started_at, finished_at, status, params jsonb,
                            projected_cost_eur, actual_cost_eur,
                            cancelled_reason
                            ← el "run manifest" de FUTURE_ARCHITECTURE.

usage_events                id, workspace_id, run_id, provider, operation,
                            model, input_tokens, output_tokens,
                            cache_read_tokens, search_count,
                            unit_price_snapshot jsonb, cost_usd, cost_eur,
                            fx_rate, created_at
                            ← la espina dorsal del pricing. Ver §7.

do_not_contact              id, workspace_id NULL, linkedin_url, email,
                            reason, created_at
                            ← workspace_id NULL = global, permanente.
                              Respetado por generación y dedupe.

company_research_cache      domain (UNIQUE), summary, sources jsonb,
                            fetched_at, expires_at
                            ← SIN workspace_id, a propósito. Ver abajo.
```

### Tres decisiones de schema que importan

**1. `company_research_cache` es global y compartida entre tenants.** Es el ahorro
de costo más grande disponible: 600 empresas únicas en vez de 2.000 personas
investigadas. Es información pública de empresas, así que compartirla entre
usuarios es legítimo. Pero **es una decisión consciente de cruzar el límite de
tenant** — documentarla, no guardar nada derivado de la configuración de un
workspace ahí, y refrescar mensualmente.

**2. RLS en cada tabla con `workspace_id`.** El patrón, sin excepciones:

```sql
alter table prospects enable row level security;

create policy tenant_isolation on prospects
  using (workspace_id in (
    select workspace_id from workspace_members where user_id = auth.uid()
  ));
```

Y la regla de oro: **la `service_role` key de Supabase nunca sale del job de
GitHub Actions.** Si alguna vez aparece en el frontend, RLS deja de existir por
completo y todo este trabajo se anula.

**3. Índices desde el principio, son cuatro.**

```sql
create index on prospects (workspace_id, status, score desc);
create unique index on people (workspace_id, linkedin_url)
  where linkedin_url <> '';                    -- dedupe, la regla actual
create index on usage_events (workspace_id, created_at desc);
create index on activities (workspace_id, prospect_id, created_at desc);
```

---

## 6. Migración desde el store actual, sin rewrite

`store.ts` mantiene un único objeto `AppState` en `localStorage` con
`getState()` / `setState()`. La tentación es reescribirlo entero. No hacerlo: es
el camino a un refactor de tres semanas que rompe las 10 páginas a la vez.

**El camino incremental, en cuatro pasos, cada uno desplegable:**

**Paso 1 — Sync en el borde, sin tocar componentes.**
`AppState` sigue siendo la fuente de verdad _en el cliente_. Se agrega:

- Al login: hidratar `AppState` desde Supabase de una vez.
- En cada `setState`: escribir a Supabase en write-through, con la mutación
  optimista que ya existe.
- `localStorage` pasa a ser cache offline y buffer de reintentos.

Ni un componente cambia. Multi-dispositivo funcionando en un fin de semana.
Es feo a escala, y a esta escala (miles de filas) es perfectamente correcto.

**Paso 2 — Auth + workspaces.** El `activeWorkspaceId` que ya existe se vuelve
real. `workspace_members` decide qué se hidrata.

**Paso 3 — Consultas por página, donde duela.** Cuando una página se ponga lenta
—probablemente `People` con miles de filas— esa página pasa a consultar Supabase
con paginación en vez de leer del `AppState`. Una página a la vez, medida, no por
las dudas.

**Paso 4 — `AIProvider` reemplaza el template engine.** Detrás de la misma llamada
`draftMessage()`. `MessageEditor.tsx` no se enteró de nada. Este es el pago del
diseño que ya está hecho.

**Lo que no cambia nunca:** `ProspectCard`, `MessageEditor`, los shortcuts de
teclado, el kanban. Eso es lo que la fase 0 valida y lo que hace bueno al producto.
Si un cambio de infraestructura obliga a rediseñar la tarjeta, algo salió mal.

---

## 7. Pricing y metering: el corazón del producto

Con BYOK no se factura. Pero se mide todo, y se muestra. La regla de oro:

> **Ninguna llamada paga se escribe en el código antes de que existan el contador
> y el freno.**

### Lo que se registra en cada llamada

Un row en `usage_events` por cada llamada a un proveedor, con:
proveedor, operación, modelo, tokens de input/output/cache-read, cantidad de
búsquedas, **el precio unitario congelado en ese momento** (`unit_price_snapshot`),
el costo calculado en USD y EUR, el FX usado, y el `run_id`.

Guardar el precio del momento es clave: los vendors cambian tarifas, y sin el
snapshot el histórico de costos se vuelve mentira retroactivamente.

### Los frenos, todos server-side

| Freno                     | Default                           | Dónde                                  |
| ------------------------- | --------------------------------- | -------------------------------------- |
| Cap mensual en €          | configurable                      | app + consola de Anthropic del usuario |
| Cap por run en €          | configurable                      | orquestador, antes de empezar          |
| Máx. candidatos por run   | 100                               | orquestador                            |
| Máx. búsquedas por run    | 250                               | orquestador                            |
| Máx. tokens por candidato | 10k in / 2k out                   | por llamada                            |
| Auto-cancelación          | al 80% del cap mensual proyectado | orquestador, entre candidatos          |

Los caps del cliente no cuentan: cualquiera con la consola del navegador los
saltea. Todo esto se valida donde corre el job.

**El doble cinturón que hace a BYOK tan bueno:** además de los caps propios, el
usuario tiene un límite de gasto en su propia consola de Anthropic. Ese es el freno
que no depende de que el código esté bien. Explicarlo en el onboarding y hacer que
lo configuren — es a la vez el mejor feature de confianza y el mejor seguro.

### Lo que ve el usuario

`CostEstimator` se convierte en el dashboard de consumo. Tres momentos:

1. **Antes del run:** slider de profundidad (shallow/normal/deep) + cantidad de
   candidatos → **proyección en € en vivo**, y el desglose de qué la mueve.
2. **Durante:** costo acumulado, candidatos procesados, cuánto queda del cap.
3. **Después:** costo real vs. proyectado, costo por candidato, costo por prospect
   contactado y —cuando haya datos— **costo por conversación conseguida**, que es
   la única métrica que de verdad importa.

Esa última métrica es el mejor argumento comercial y nadie en el sector la muestra.

---

## 8. Legal y GDPR

Esto no es asesoramiento legal. Es el mapa de lo que hay que resolver, con un
criterio de cuándo pagar por ayuda.

### El cambio de naturaleza del proyecto

Hoy: datos ficticios en un navegador. Exposición ≈ 0.
En producción: **datos personales de europeos reales** (nombre, cargo, empresa,
URL de LinkedIn, intereses inferidos), en una base de datos, procesados por un
tercero (Anthropic), usados para contacto comercial. Eso es tratamiento de datos
personales bajo GDPR, con todo lo que implica.

Y hay un salto extra que `RISKS_AND_LIMITATIONS.md` ya intuye: **el día que
Impact Hydrogen carga sus prospects, el proyecto deja de ser solo controlador de
datos propios y pasa a ser procesador de los de ellos.** Eso cambia las
obligaciones, aunque el producto sea gratis. Gratis no exime de nada.

### Lo obligatorio antes de que un tercero cargue una persona real

| Ítem                                           | Qué es                                                                                                                           | Costo                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Base legal documentada**                     | Interés legítimo para outreach B2B + una LIA escrita (balancing test). Es el punto que más se saltea y el que primero preguntan. | €0 si se escribe uno mismo      |
| **Política de privacidad**                     | Qué datos, para qué, cuánto tiempo, sub-procesadores, derechos. Pública en el sitio.                                             | €0 template / €200–400 revisada |
| **DPA con Impact Hydrogen**                    | Ellos controlador, el proyecto procesador. Define qué se puede hacer con sus datos.                                              | €0 template / €200–400 revisada |
| **Lista de sub-procesadores**                  | Anthropic, Supabase, Cloudflare. Con sus regiones.                                                                               | €0                              |
| **Política de retención + borrado automático** | Ej.: prospects no contactados se borran a los 12 meses. Implementado como job, no como buena intención.                          | €0, unas horas                  |
| **Proceso de DSAR**                            | Que alguien pueda pedir acceso o borrado y se pueda ejecutar. Con `activities` como audit log, es viable.                        | €0, unas horas                  |
| **Hosting en EU**                              | Región Frankfurt en Supabase, elegida desde el principio.                                                                        | €0                              |
| **DPA de Anthropic**                           | Ya está incorporado en los Términos Comerciales, con SCCs. Se acepta al aceptar los términos. No hay firma aparte.               | €0                              |

**Dato bueno y verificado:** los datos que se mandan por la API de Anthropic
**no se usan para entrenar modelos por defecto** en productos comerciales. Eso
simplifica bastante la conversación con Impact Hydrogen — pero verificar la política
de retención vigente en el Trust Center antes de ponerlo por escrito en el DPA.

### El punto incómodo, dicho claro

El GDPR tiene una obligación de información cuando se recolectan datos personales
**sin obtenerlos de la persona** (Art. 14) — que es exactamente lo que hace una
herramienta de prospecting. En la práctica la industria se apoya en interés
legítimo más una política de privacidad pública, y el propio primer contacto
funciona como aviso. Es la zona más gris del producto. No ignorarla, no resolverla
con un párrafo copiado de otra web.

**Recomendación concreta:** antes de que Impact Hydrogen cargue el primer
prospect real, pagar **€300–800** por una revisión de política de privacidad + DPA

- LIA con alguien especializado en protección de datos en la jurisdicción
  correspondiente. Es el único gasto de este plan que conviene hacer sin discutir. Es
  barato comparado con el problema que evita, y le da a Impact Hydrogen algo que
  mostrar si les preguntan.

### Lo que ya está bien y no se negocia

- **Cero LinkedIn programático.** Saca al proyecto del riesgo más grande del sector.
  Nunca cambiarlo, ni "solo para leer", ni "solo una extensión".
- **Cero envío automático.** El humano manda todo. Es ético, es la defensa técnica
  (§9.5) y es lo que hace el producto defendible.
- **Do-not-contact permanente**, respetado por generación y dedupe.

---

## 9. Seguridad, por riesgo real

Ordenado por lo que más probablemente lastime, no por lo que suena más grave.

### 9.1 Custodia de las API keys — riesgo #1

Se están guardando credenciales de facturación de otra empresa. Si se filtra la key
de Impact Hydrogen, alguien puede gastar su dinero. Es el peor escenario del
proyecto y el más plausible.

Las reglas, todas obligatorias:

- **La key nunca llega al browser.** Ni una vez, ni "solo al guardarla". Se envía
  una vez por HTTPS a una Edge Function y no vuelve nunca más.
- **Nunca en `localStorage`.** El store persiste `AppState` completo a
  `localStorage` — si una key entra ahí, queda en texto plano en el disco del
  usuario. Es el error más fácil de cometer dado el diseño actual. Poner un test
  que falle si `provider_credentials` aparece en el estado persistido.
- **Cifrada en reposo** con Supabase Vault (pgsodium) o AES-GCM con la clave
  maestra en secrets. La DB comprometida no debe entregar keys usables.
- **Nunca en logs.** Ni en errores, ni en Sentry, ni en los logs de Actions.
  Filtro explícito de `sk-ant-*` en el pipeline de logging.
- **Solo se muestran los últimos 4 caracteres.** Nunca la key completa, jamás.
- **Rotación y revocación en un click**, y el usuario tiene que saber que puede
  revocarla desde su consola de Anthropic en cualquier momento.
- **`.gitignore` + escaneo de secretos en CI** (gitleaks o trufflehog).
  `IMPLEMENTATION_PLAN.md` ya tiene un "secret check" manual en la fase 7 —
  convertirlo en un step automático que bloquee el merge.

### 9.2 Aislamiento entre tenants — donde fallan los devs solos

RLS en todas las tablas, `service_role` solo en el job del servidor, y **un test
automatizado que intente leer datos de otro workspace y espere que falle**. Ese
test es el más valioso de la suite. Escribirlo en la fase 1, no después.

### 9.3 Denegación de servicio por costo

Un endpoint que gasta dinero es un endpoint atacable. Rate limiting por
usuario y por IP en las Edge Functions, más los caps de §7. Sin esto, un bucle
accidental en el propio frontend puede quemar el presupuesto de un usuario en
minutos — y esa es la forma más común de que pase, mucho más que un atacante.

### 9.4 Autenticación y transporte

Magic link de Supabase Auth: cero passwords que custodiar, cero hashing propio,
cero reset flows. HTTPS obligatorio en todo (gratis por Cloudflare). Sesiones con
expiración razonable.

### 9.5 Prompt injection — el riesgo que casi nadie ve

El pipeline de research va a buscar páginas web arbitrarias y meterlas en el
contexto de un modelo. Una página puede contener instrucciones diseñadas para que
el modelo escriba lo que el atacante quiera en el mensaje de outreach — y se manda
firmado con el nombre del usuario.

Mitigaciones:

- Todo contenido traído de la web se trata como **datos, no instrucciones**:
  delimitado, etiquetado, con instrucción explícita de ignorar directivas dentro.
- **Structured outputs (JSON)** para clasificación y score. Un modelo que solo
  puede devolver un schema no puede ser desviado tan fácil.
- La salida del modelo **nunca dispara acciones**, solo llena campos.
- **Y la mejor defensa ya está construida:** el humano lee y edita cada mensaje
  antes de enviarlo. La regla ética resultó ser también el control de seguridad.
  Escribirlo así en los docs, porque es un argumento fuerte.

### 9.6 Cadena de dependencias

Dependabot activado, `npm audit` en CI, versiones pinneadas. `xlsx` (SheetJS) ha
tenido CVEs históricos — mantenerlo al día porque procesa archivos que sube el
usuario.

### 9.7 Validación de inputs

Ya se usa Zod en el cliente. **Revalidar todo en el servidor.** La validación del
cliente es UX, no seguridad. El import de CSV es la superficie más obvia:
archivos que sube el usuario, parseados y guardados.

### 9.8 Backups y recuperación

Supabase free no hace backups. `pg_dump` semanal cifrado por GitHub Actions,
y **probar una restauración al menos una vez**. Un backup que nunca se restauró no
es un backup, es un archivo.

---

## 10. Dominio, marca y marketing

- **Registrar:** Cloudflare Registrar vende dominios al costo mayorista, sin markup
  ni renovación inflada. `.com` ~€10–12/año. Es el único costo recurrente inevitable
  de todo el plan.
- **Nombre:** "Prospecting Copilot" es descriptivo y funciona internamente, pero
  "copilot" está saturado y es marca de otros en el espacio de software. Si algún
  día se abre a terceros, buscar algo propio. Para uso con Impact Hydrogen, no
  bloquea nada. No gastar tiempo acá ahora.
- **Landing (Cloudflare Pages, gratis):** el problema, el flujo en 3 pasos con
  capturas reales, la postura de privacidad y de LinkedIn como diferencial
  ("nunca automatizamos LinkedIn" es un argumento de venta, no una limitación),
  el modelo BYOK explicado sin vueltas, y cómo empezar.
- **Flyers y banners:** salen del mismo sistema visual. Es media jornada de trabajo
  una vez que hay logo y paleta. **Ojo: es la parte más divertida y la menos
  importante.** Diseñar banners en la semana 3 es señal de estar evitando la fase 2.

---

## 11. La inversión, con números

### Dinero — año 1

| Ítem                        | Costo                                             | Nota                                |
| --------------------------- | ------------------------------------------------- | ----------------------------------- |
| Dominio `.com`              | **€10–12/año**                                    | Cloudflare Registrar, a costo       |
| Supabase                    | **€0**                                            | Free tier, EU, 500 MB, 50k MAU      |
| Cloudflare Pages            | **€0**                                            | Repos privados incluidos            |
| GitHub Actions              | **€0**                                            | 2.000 min/mes en repo privado       |
| Sentry                      | **€0**                                            | 5k errores/mes                      |
| Consumo Anthropic           | **€12–47/mes**                                    | **lo paga cada usuario con su key** |
| Legal (privacy + DPA + LIA) | **€0–800**                                        | una vez. Recomendado hacerlo        |
| Marca (logo/plantilla)      | **€0–150**                                        | una vez, opcional                   |
| **Cash propio, año 1**      | **€10 mínimo · ~€800–950 haciendo el legal bien** |                                     |

Vale repetirlo: **el desarrollo es gratis, como se pidió.** El único gasto obligado
es el dominio. El legal es opcional en lo estrictamente técnico y muy recomendable
en cuanto Impact Hydrogen carga una persona real.

### Tiempo — el costo verdadero

| Fase                                      | Horas         | A 10 h/semana |
| ----------------------------------------- | ------------- | ------------- |
| 0 · Validar la tesis                      | 10–15         | 2 semanas     |
| 1 · Backend real (auth, DB, sync)         | 60–80         | 6–8 semanas   |
| 2 · IA real + metering + caps             | 50–70         | 5–7 semanas   |
| 3 · Producto (landing, onboarding, marca) | 30–40         | 3–4 semanas   |
| 4 · Seguridad + legal + launch            | 20–30         | 2–3 semanas   |
| **Total**                                 | **170–235 h** | **~5 meses**  |

### Consumo por escenario (recalculado con Sonnet 5 a $2/$10, Batch, +20% contingencia)

| Volumen       | Candidatos/mes | IA   | Búsqueda | Total/mes  |
| ------------- | -------------- | ---- | -------- | ---------- |
| 20 runs × 20  | 400            | ~€3  | ~€5      | **€10–15** |
| 20 runs × 50  | 1.000          | ~€6  | ~€11     | **€20–26** |
| 20 runs × 100 | 2.000          | ~€12 | ~€20     | **€38–45** |

Cada usuario elige su punto en esa tabla con el slider de profundidad. Eso es
literalmente lo que se pidió: que cada uno decida cuánto invertir.

---

## 12. Qué significa "estar en prod"

No se está en producción cuando funciona. Se está en producción cuando esto está
todo tildado:

**Funcional**

- [ ] Login desde cualquier dispositivo, mismos datos
- [ ] Dos usuarios, aislamiento verificado a mano y por test
- [ ] Un run nocturno produce el batch de la mañana sin intervención
- [ ] Costo real dentro del ±20% de la proyección
- [ ] El flujo del prototipo (tarjeta, editor, shortcuts) intacto

**Seguridad**

- [ ] RLS activo en cada tabla con `workspace_id`
- [ ] Test que intenta cruzar tenants y falla como se espera
- [ ] API keys cifradas, nunca en el browser, nunca en logs, nunca en `localStorage`
- [ ] Escaneo de secretos bloqueando merges en CI
- [ ] Rate limiting en todo endpoint que gaste dinero
- [ ] `service_role` key solo en el job del servidor
- [ ] Dependabot activo, `npm audit` limpio

**Operación**

- [ ] `pg_dump` semanal corriendo **y una restauración ya probada**
- [ ] Sentry recibiendo errores, con alerta por mail
- [ ] Caps de gasto probados a propósito, con cancelación verificada
- [ ] Ping semanal que evita la pausa del proyecto en Supabase
- [ ] Runbook de una página: qué hacer si un run falla, si se filtra una key, si
      alguien pide borrado de datos

**Legal**

- [ ] Política de privacidad publicada
- [ ] LIA escrita
- [ ] DPA firmado con Impact Hydrogen
- [ ] Job de retención borrando datos vencidos
- [ ] Proceso de DSAR probado con un caso real (borrarse a uno mismo)

**Producto**

- [ ] Landing con capturas reales
- [ ] Onboarding que un empleado de IH completa **solo, sin llamar**
- [ ] Docs de qué hace, qué no hace, y cuánto cuesta

---

## 13. Los seis errores que van a matar el proyecto

1. **Construir la fase 1 antes de hacer las 20 outreaches reales de la fase 0.**
   Es el error más probable, porque programar es más divertido que prospectar.
   La app ya existe: usarla en serio dos semanas antes de escribir una línea de SQL.

2. **Que una API key toque el frontend o `localStorage`.** Dado que el store
   persiste todo `AppState` al disco, este error es _fácil_ de cometer en la
   arquitectura actual. Poner el test que lo impide antes de escribir la feature.

3. **Dejar RLS "para después".** Después es el día que Impact Hydrogen ve los
   prospects personales, o al revés. En un producto de prospecting, esa filtración
   es fatal para la confianza. Fase 1, minuto uno.

4. **Escribir la primera llamada paga antes del contador y el freno.** Un bucle
   accidental sin cap puede quemar el presupuesto de otra empresa en minutos.
   El orden dentro de la fase 2 no es sugerencia.

5. **Datos de personas reales de la UE, con un tercero usando el sistema, sin base
   legal ni política de retención.** El único riesgo del plan que no se arregla
   con código después.

6. **Diseñar banners en la semana 3.** Es la señal clásica de estar evitando la
   parte difícil. La marca va en la fase 3 por una razón.

---

## 14. Esta semana

Cuatro cosas, ninguna es código:

1. **Deploy del prototipo tal cual a Cloudflare Pages** (repo privado, gratis).
   Destraba el problema de GitHub Pages que está documentado, y da HTTPS —que el
   clipboard API necesita— para poder usarlo desde cualquier máquina. ~1 hora.
2. **Actualizar `COST_MODEL.md`** con Sonnet 5 a $2/$10 permanente. ~15 minutos.
3. **Empezar la fase 0 hoy.** Cargar 20 prospects reales, mandar 20 requests, anotar
   la tasa de edición de mensajes y los segundos por tarjeta. Ese número decide
   dónde va la inversión de los próximos 4 meses.
4. **Mandarle este plan a Agustín** y preguntarle una sola cosa: si mañana existiera
   la versión completa, ¿la usaría todos los días? Un usuario tibio es la
   respuesta más cara que se puede recibir tarde.

Nada de lo anterior requiere una base de datos. Y todo puede cambiar el plan
entero.

---

## Fuentes de los precios y límites (verificados 2026-08-14)

- Precios de modelos, web search y web fetch: platform.claude.com/docs/en/about-claude/pricing
- Sonnet 5 a $2/$10 permanente (aumento del 2026-09-01 cancelado): misma fuente
- Uso de datos comerciales / API sin entrenamiento por defecto: privacy.claude.com
- DPA de Anthropic incorporado en Términos Comerciales con SCCs: privacy.claude.com
- Supabase free: 500 MB, 5 GB egress, 50k MAU, 2 proyectos, pausa a 1 semana de
  inactividad; Pro desde $25/mes: supabase.com/pricing
- Cloudflare Pages free: 500 builds/mes, 100 dominios custom, repos privados
  soportados: developers.cloudflare.com/pages/platform/limits
- Cloudflare Workers free: 100k req/día, 10 ms CPU por invocación:
  developers.cloudflare.com/workers/platform/pricing
- Neon free (alternativa a Supabase): 0,5 GB, 100 CU-h, suspende a los 5 min:
  neon.com/pricing

Los precios de vendors cambian seguido. Re-verificar antes de cada fase, como ya
está escrito en el ritual de `COST_MODEL.md`.
