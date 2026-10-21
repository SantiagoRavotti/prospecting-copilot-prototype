// Browser executor (Claude) — what is configured, stated honestly.
// The model is the user's choice. There is NO automatic fallback: if the
// chosen model is not available on the authorized account, execution must
// stop and say so (electron/executorConfig.cjs enforces the same rule).

export const EXECUTOR = {
  modelName: 'Claude Sonnet 5.5',
  modelId: 'claude-sonnet-5-5',
  account: 'Pendiente de autorización. La cuenta Team no está autorizada y no se usa.',
  availability:
    'No verificada: comprobarla exige iniciar sesión con la cuenta autorizada, que todavía no existe.',
  fallback: 'Ninguno. Si Sonnet 5.5 no está disponible, la ejecución se detiene y lo informa.',
} as const;
