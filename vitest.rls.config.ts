// Separate vitest config for the RLS integration suite (e2e-db/), which needs
// a live Supabase stack. The default suite (vite.config.ts) only includes
// src/**/*.test.ts, so these tests never run in the normal `npm test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e-db/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
});
