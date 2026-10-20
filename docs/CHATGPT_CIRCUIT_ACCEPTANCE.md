# Circuito ChatGPT ↔ CRM — estado y prueba de aceptación

Actualizado 2026-10-20.

## Estado actual, sin adornos

| Parte | Estado |
| --- | --- |
| Herramientas del CRM y creación de fichas | Funcionan con un **cliente simulado** (harness y tests). |
| Endpoint MCP alojado + OAuth | Código escrito y probado con base de datos simulada. **No desplegado**: Supabase está pausado. |
| Investigación desde ChatGPT real | **No verificada.** Ninguna llamada de ChatGPT llegó todavía al CRM. |
| Botón "Investigar" | Crea la tarea, abre ChatGPT en la app con la directiva precargada y la copia al portapapeles. **Eso no completa la investigación por sí solo**: hoy el envío del mensaje y la activación del conector son manuales. |

En esta primera prueba el envío manual de la directiva es una concesión para verificar el puente. El objetivo
final sigue siendo operar principalmente desde la app.

## Por qué no hay túnel

ChatGPT solo acepta conectores en una URL https pública. La primera versión levantaba el servidor MCP dentro
de la app y necesitaba un túnel efímero para exponerlo. La política de la sesión de Claude Code bloqueó crear ese
túnel ("external ingress tunnel"): abrir un puerto de la PC a internet. Pedirte que lo ejecutaras a mano sería
eludir ese bloqueo, así que esa vía quedó descartada y retirada de la app y de Settings.

## Vía elegida: endpoint alojado en Supabase (UE)

```
ChatGPT ──OAuth 2.1──► Supabase Auth (servidor OAuth, issuer /auth/v1)
   │                         │ consentimiento: página /oauth/consent de la web (login con código por email)
   └──MCP (HTTPS)──► Edge Function crm-mcp ──RLS como el usuario──► crm_snapshots (lectura)
                                                                  └► crm_inbox (escrituras de ChatGPT)
App de escritorio (sesión del mismo usuario) ── publica snapshot / aplica inbox ──► state.json ──► fichas en pantalla
```

- **Sin puertos entrantes en tu PC.** La app solo hace llamadas salientes a Supabase.
- **Sin claves administrativas** en la app, el instalador ni la función. La función usa el token OAuth del usuario
  y la clave pública; RLS aísla cada fila por usuario.
- **La app sigue siendo la fuente de verdad local.** Supabase solo transporta el snapshot de lectura y la cola de
  escrituras, que además queda como registro de lo que escribió ChatGPT.
- **App cerrada**: la escritura queda en cola y ChatGPT recibe "queued"; se aplica una sola vez al abrir la app.
- Archivos: `supabase/functions/crm-mcp/`, `supabase/migrations/0003_mcp_relay.sql`, `electron/relay.cjs`,
  `electron/relaySnapshot.cjs`, `src/pages/OAuthConsent.tsx`, `public/oauth/consent/index.html`,
  `supabase/templates/magic_link.html`.

**Riesgo abierto:** la documentación de OpenAI no aclara cómo descubre ChatGPT un servidor de autorización con
ruta. El servidor OAuth de Supabase publica su metadata en la raíz del dominio, y la función además responde las
variantes de descubrimiento bajo su propia ruta. Se confirma solo con la prueba real.

## Verificado automáticamente

| Prueba | Qué cubre |
| --- | --- |
| `src/lib/crmMcpCore.test.ts` (5) | 401 con desafío OAuth descubrible; initialize; 8 herramientas; criterios → contactos → 3 candidatos guardados como fichas reales pendientes; dedupe; app cerrada = en cola y aplicada una sola vez; escrituras inválidas nunca entran a la cola. |
| `PC_SMOKE=1` | Settings muestra el conector alojado y ningún paso de túnel. |
| `PC_MCP_SELFTEST=1` | El servidor local de la versión anterior sigue pasando (solo harness). |

## Pasos

### Tuyos, antes de que yo despliegue

1. supabase.com → proyecto "Prospecting Copilot" → **Restore project**.
2. En una terminal del repo, `npx supabase login`. Abre el navegador; no hay que pegar nada en el chat.

### Míos, en cuanto estén hechos

1. Vincular el proyecto, revisar el historial de migraciones y aplicar `0003_mcp_relay.sql`.
2. Auth: activar el servidor OAuth 2.1 con registro dinámico, ruta de autorización hacia la página de
   consentimiento y plantilla de email con código de 6 dígitos.
3. Secreto público `PC_PUBLISHABLE_KEY` y despliegue de `crm-mcp` sin verificación JWT del gateway.
4. Comprobar el 401, la metadata del recurso, el descubrimiento del servidor OAuth y la redirección al consentimiento.
5. Publicar la web en Pages (página de consentimiento) y generar el instalador.

### Tuyos, la prueba con tres candidatos

1. Instalar la versión nueva. Settings → "ChatGPT ↔ CRM (conector alojado)" → email → código → Verificar.
2. Campañas → crear "E-commerce España" con objetivo 3 → escribir la directiva → Investigar.
3. En la ventana ChatGPT de la app: Settings → Apps & Connectors → Advanced → Developer mode → Create.
   URL: la que muestra Settings. Autenticación: OAuth. Se abre el consentimiento: email → código → Permitir.
4. En la conversación, activar el conector y enviar la directiva (manual en esta prueba).
5. Esperado: ChatGPT llama `get_research_task` y `list_contacted_people`, investiga y llama `save_proposals`.
   Las 3 fichas aparecen en Campañas sin recargar, pendientes de aprobación.
6. Revisar, editar y aprobar o descartar. Cerrar y reabrir la app: todo persiste.

El SMTP incluido en Supabase envía pocos emails por hora. La prueba usa dos códigos: uno para la app y otro para
el consentimiento.

Si falla, anotá el paso: (3) descubrimiento OAuth o consentimiento, (4) ChatGPT no llama herramientas,
(5) las fichas no aparecen. Cada uno tiene un remedio distinto y ninguno requiere API de pago ni otro chatbot.

## Fuera de este hito

- LinkedIn en solo lectura y dry-run con Claude y Chrome visible: la cuenta de Claude está pendiente y la Team no está autorizada.
- Programación con la computadora apagada: requisito abierto.
