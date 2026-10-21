# Estado real de los objetivos (2026-10-21, v0.3.0)

Esta entrega es el flujo por lotes con ChatGPT. **No incluye envíos reales a LinkedIn.** Tener Supabase, OAuth o una cola persistente no demuestra ejecución en la nube. Programar un trabajo tampoco garantiza que pueda operar un Chrome local suspendido.

## Ejecución futura con Claude y Chrome

| Requisito | Estado | Evidencia |
| --- | --- | --- |
| Lotes congelados: destinatarios y textos aprobados fijos | Implementado (lógica) | `campaigns.test.ts`; sin pantalla, sin ejecutor |
| Cola y límites compartidos por cuenta emisora entre campañas | Implementado (lógica) | `campaigns.test.ts`; nunca corrió contra LinkedIn |
| Deduplicación global de destinatarios | **En uso** | Importación y `campaigns.test.ts` |
| Ejecución secuencial, pausa y recuperación | Estructura de estados y bloqueo por cuenta; **no hay ejecutor** | `campaigns.test.ts` |
| Historial de eventos idempotente | Implementado (lógica) | Mismo `id` de evento nunca se procesa dos veces; solo eventos simulados |
| Un envío confirmado nunca se repite | Implementado (lógica) | Solo simulado |
| Verificar resultados inciertos antes de reintentar | Implementado (lógica); **no existe el verificador real** | Solo simulado |
| Dry-run separado de envíos reales | Implementado (lógica); sin pantalla | Solo simulado |
| Ejecutor Claude + Chrome | **No construido** | La cuenta Team **no** está autorizada. No hay otra cuenta decidida |
| Modelo Sonnet 5.5 | Elegido: `claude-sonnet-5-5`. Disponibilidad en la cuenta autorizada: **no verificada** | Sin cuenta autorizada. Sin modelo alternativo configurado |
| Campañas de ~30 personas, ~2 por día | Meta orientativa | No es un volumen garantizado por LinkedIn |

## Visión posterior (no se implementó nada en este sprint)

| Objetivo | Estado |
| --- | --- |
| Registrar aceptación de invitaciones, respuestas y conversaciones | Parcial: hay registro **manual** de conversaciones y seguimientos del prototipo. Nada automático |
| Detectar preguntas que requieren respuesta | No iniciado |
| Analizar resultados por campaña y variante de mensaje | No iniciado (las variantes de mensaje ya se conservan como versiones) |
| Networking inicial sin vender | Solo como regla en las instrucciones de redacción |
| Contenido y seguimientos ~30 días después de la aceptación | No iniciado |
| Preparar campañas el día anterior o la semana | No iniciado (la campaña tiene un campo de agenda sin usar) |
| Ejecutar con la computadora apagada | **Sin resolver.** Un Chrome autenticado y visible vive en esta PC. Ni Supabase ni una tarea programada lo reemplazan |

## ChatGPT dentro de la app

| Parte | Estado |
| --- | --- |
| Panel integrado con tu sesión | Experimental y apagado. El login con Google falla ahí ("This browser or app may not be secure"). **No resuelto** |
| ChatGPT escribiendo en el CRM por MCP | **Bloqueado por el plan**: no permite conectores personalizados. El endpoint queda desplegado, sin uso |
| Flujo por lotes | **Esta entrega** |
