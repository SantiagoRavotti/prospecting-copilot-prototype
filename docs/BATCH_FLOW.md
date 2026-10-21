# Flujo por lotes con tu ChatGPT Plus (v0.3.0)

Sin APIs de modelos, sin claves, sin servicios de pago. ChatGPT trabaja en tu conversación habitual, en tu navegador, con tu suscripción.

```
App: Preparar investigación → (vos) ChatGPT en tu navegador → App: Importar resultado → revisar, editar, aprobar
```

## Por qué es semiautomático

- El inicio de sesión con Google dentro de un panel embebido muestra "This browser or app may not be secure". No se intenta evadir.
- Tu plan no permite añadir un servidor MCP personalizado, así que ChatGPT no puede escribir en el CRM por sí mismo.
- El panel de ChatGPT integrado sigue en el código como experimento (Settings → "Probar el panel…"). **No está resuelto ni forma parte de este flujo.**
- El conector MCP alojado en Supabase queda desplegado para un uso futuro. Este flujo no lo necesita.

## Paso a paso (botones reales)

1. **Campañas → Nueva campaña.** Nombre, objetivo, audiencia, criterios de búsqueda, exclusiones (una por línea), idioma, estilo, candidatos solicitados, instrucciones de redacción y ejemplos de tu estilo. **Editar** y **Duplicar** reutilizan una configuración anterior.
2. **Tu conversación de ChatGPT.** Pegá la URL `https://chatgpt.com/c/…` de la conversación que usás y tocá **Guardar para esta campaña** (o **Guardar como respaldo del espacio**). **Abrir en el navegador** la abre en tu navegador predeterminado. La app nunca abre una conversación nueva por su cuenta.
3. **Preparar investigación.** Opcionalmente escribí una indicación para este lote. La app crea la tarea y arma el contexto con tus datos. **Todavía no se investigó nada.**
4. **Descargar paquete de contexto** (archivo `contexto-….json`) y **Copiar directiva**. En ChatGPT, adjuntá el archivo, pegá la directiva y enviala. El envío es manual.
5. ChatGPT responde con un bloque JSON. Copiá la respuesta o guardala como archivo `.json`.
6. **Importar resultado de ChatGPT.** Elegí el archivo o pegá el texto y tocá **Revisar**. Ves candidatos nuevos, actualizados, duplicados, advertencias y errores concretos. **Importar N fichas** guarda. Antes de eso no se guarda nada.
7. **Fichas → Revisar.** Editá el mensaje, **Aprobar**, **Descartar** o completá una URL que falte. Si ChatGPT trae otra versión del mensaje, aparece como **propuesta**: la aplicás vos o la descartás.

Aprobar fija una copia exacta del texto. Cualquier edición posterior invalida la aprobación. Aprobar no envía nada a LinkedIn.

## Qué contiene el paquete

Versión del formato, ids de campaña y tarea, espacio, remitente, objetivo, audiencia, criterios, exclusiones, cantidad, idioma y estilo, instrucciones y ejemplos guardados, ejemplos de mensajes aprobados, **todos los contactos existentes de tu cuenta** (para no repetir, sin importar la campaña), campañas anteriores del espacio con sus resultados, reglas de honestidad, el esquema JSON exacto y un ejemplo.

## Formato del resultado (`prospecting-copilot/research-result`, versión 1)

Cada candidato exige `full_name`, `fit_reason` y `draft_message`. Lo demás puede quedar vacío: `ref` (id estable dentro del resultado), `linkedin_url`, `title`, `company`, `location`, `facts[{text, source_url}]`, `posts[{url, date, summary}]`, `inferences[]`, `photo_url` con `photo_source`. A nivel raíz: `linkedin_posts_accessible` y `limitations[]`. El ejemplo del paquete se genera con el mismo código del importador, y el importador **rechaza el ejemplo** si alguien lo pega de vuelta.

## Reglas que aplica la app

- **No reasigna** resultados entre campañas: si el `campaign_id` no es el de la campaña seleccionada, lo bloquea y dice cuál es.
- **Reimportar** el mismo resultado no duplica nada (identidad por `ref`, luego URL, luego nombre + empresa dentro de la misma tarea).
- **Misma URL de LinkedIn** que alguien existente (en cualquier campaña): se omite. **Nombre + empresa**: solo advierte, nunca fusiona ni excluye.
- **Mensaje nuevo** de una ficha ya importada: entra como propuesta. Tu texto editado y tu aprobación no se tocan. Aplicarla invalida la aprobación y guarda el texto anterior en **Versiones anteriores** (con **Restaurar**).
- **Ficha incompleta** (sin URL de LinkedIn, por ejemplo): se puede revisar, **no aprobar**.
- **Fuentes**: se guardan tal como las dio ChatGPT. La app no las verificó, y las fichas lo dicen.
- **Foto**: solo se conserva si viene con la fuente de donde se obtuvo.
- **Límite de caracteres**: configurable en la cabecera de Fichas. 300 − margen 20 es un objetivo provisional, no un límite oficial de LinkedIn. En la futura ejecución habrá que comprobar el límite observado en el formulario.
- El texto pegado que no se importó se conserva por campaña, incluso si cerrás la app.

## Qué está probado

| Prueba | Qué cubre | Datos |
| --- | --- | --- |
| `npm test` (126) | Paquete y directiva, ejemplo consistente con el importador, importación válida, errores de formato, campaña equivocada, reimportación sin duplicados, URL y nombre + empresa, propuestas, aprobaciones, fichas incompletas, límite configurable, persistencia, fusión segura de cambios externos | Simulados |
| `npm run test:flow` (33) | La **app real de Electron**, con cierre y reapertura reales: crear campaña → preparar → paquete en disco → importar → errores → editar → aprobar → reimportar por archivo → propuesta → reiniciar → recuperar → aplicar propuesta | Simulados, directorio temporal |
| `npx playwright test` (19) | Regresión del prototipo web | Simulados |

**No hay ninguna prueba con una investigación real de ChatGPT.** Falta que hagas una con tu conversación (ver el mensaje de entrega).

## Datos y sesión

- Tus datos viven en `%APPDATA%\prospecting-copilot-prototype\data` con copias diarias. Las pruebas automáticas corren en un directorio temporal y no tocan esa carpeta.
- Sesión de Supabase: es la cuenta con la que la app guarda datos en la nube. No es el login de ChatGPT. El enlace del email abre la web en GitHub Pages, no la app: para la app usá el código del email, o copiá la dirección del enlace y pegala en Settings sin abrirlo. El endpoint MCP es una tercera cosa y no se necesita para este flujo.
