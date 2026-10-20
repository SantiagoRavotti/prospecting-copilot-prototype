# Circuito ChatGPT ↔ CRM — estado y prueba de aceptación (2026-10-20)

## Qué está construido

| Pieza | Archivo | Estado |
| --- | --- | --- |
| Herramientas del CRM (8) | `electron/crmTools.cjs` | Real. Operan sobre `state.json`; `save_proposals` aplica dedupe (URL normalizada = duplicado duro, nombre+empresa = aviso). |
| Servidor MCP + OAuth 2.1 | `electron/mcpServer.cjs` | Real. Streamable HTTP en 127.0.0.1:puerto aleatorio; metadata RFC 8414/9728, registro dinámico, PKCE S256, refresh tokens, consentimiento nativo en la app, revocación. Tokens en `mcp-auth.json` (userData), nunca en el instalador. |
| Ventana ChatGPT en la app | `electron/main.cjs` (`chatgpt:open`) | Real. `chatgpt.com` con sesión persistente (`persist:chatgpt`). "Investigar" abre la conversación con la directiva en `?q=` **y** la copia al portapapeles. |
| Refresco en vivo | `crm:refresh` → `startCrmRefreshListener` | Real. Verificado por `PC_SMOKE`: una escritura por herramienta aparece en la UI sin recargar. |
| Página Campañas | `src/pages/Campaigns.tsx` | Real. Crear campaña, directiva → tarea, lista de tareas, fichas con hechos/inferencias/posts, editor, aprobar/descartar; aprobar congela el texto y editar invalida. |
| Settings → "ChatGPT ↔ CRM" | `src/components/DesktopSettings.tsx` | Real. Puerto, comando de túnel, URL pública, URL del conector, revocar, auditoría de llamadas. |

## Qué se verificó automáticamente (sin ChatGPT)

`PC_MCP_SELFTEST=1 npx electron .` ejecuta contra el servidor real:
registro → consentimiento → código → token PKCE → `/mcp` sin token = 401 → initialize → tools/list (8) →
`list_campaigns` → `save_proposals` (1 ficha, approval `pending`, tarea `proposals_received`) →
mismo candidato otra vez = `skipped_hard_duplicates`. Resultado: `ok: true`.

`PC_SMOKE=1 npx electron .` ejecuta `save_draft` por la capa de herramientas y comprueba que la ficha
cambia en pantalla: `LIVE {"fichas":1,"inState":true}`.

**Lo que NO está verificado todavía**: el handshake con ChatGPT real (requiere tu sesión Plus + Developer
mode + una URL https pública). Lo demás es simulado por el harness.

## Por qué hace falta un túnel

ChatGPT exige que un conector MCP esté en una URL https pública; no acepta `localhost`. El servidor vive
en la app; el túnel solo reenvía ese puerto durante la prueba. Pedí al asistente que lo lanzara desde la app
y la política de la sesión lo bloqueó ("external ingress tunnel"), así que el paso queda manual: un comando.
Alternativa durable dentro de tus requisitos: alojar el endpoint MCP en Supabase (Edge Function) cuando
restaures el proyecto; las herramientas ya están separadas del transporte.

## Prueba de aceptación — pasos manuales agrupados

Instalador: `release/Prospecting Copilot Setup 0.1.0.exe` (o `npm run desktop` desde el repo).

1. Abrí la app → **Settings** → sección "ChatGPT ↔ CRM". Copiá el comando del túnel y ejecutalo en una
   terminal (`cloudflared` está en `node_modules/cloudflared/bin/cloudflared.exe`; también sirve el binario
   oficial). Pegá el origen `https://….trycloudflare.com` en "URL pública" → Guardar. Aparece la URL del conector.
2. **Campañas** → crear campaña (ej. "E-commerce España", objetivo 3) → escribir directiva → **Investigar**.
   Se abre la ventana ChatGPT dentro de la app. Iniciá sesión (una vez; queda persistida).
3. En ChatGPT: Settings → Connectors → Advanced → Developer mode → Create → pegar la URL del conector.
   ChatGPT abre la autorización; la app muestra "Permitir / Denegar". Permitir.
4. Volvé a la conversación. Si el prefill `?q=` no cargó la directiva, pegala (ya está en el portapapeles;
   botón "Copiar última directiva"). Activá el conector en la conversación.
5. ChatGPT llama `get_research_task` → `list_contacted_people` → `save_proposals`. Las fichas aparecen en
   Campañas sin recargar; Settings muestra las llamadas en la auditoría.
6. Revisar: editar mensaje (invalida aprobación si ya estaba aprobada), **Aprobar** (congela texto),
   Descartar. Cerrá y reabrí la app: todo persiste en `state.json`.

Si falla, anotá en qué paso: (1) túnel/URL, (3) registro/consentimiento, (4) la directiva no llegó,
(5) ChatGPT no llamó herramientas. Cada uno tiene un remedio distinto y ninguno requiere API de pago.

## Fuera de este hito (pendiente, sin cambios)

- LinkedIn solo lectura + dry-run (3 perfiles) con Claude y Chrome visible: cuenta de Claude pendiente, Team no autorizada.
- Programación con la computadora apagada: requisito abierto.
- Supabase: proyecto pausado, token rotado; restaurar con `npx supabase login` cuando decidas.
