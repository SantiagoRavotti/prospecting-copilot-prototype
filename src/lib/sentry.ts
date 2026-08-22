// Sentry (free tier) — enabled only when VITE_SENTRY_DSN is provided at build
// time. Every event and breadcrumb passes through redactDeep(), so nothing
// matching sk-ant-* (or a Supabase access token) can ever reach Sentry.

import * as Sentry from '@sentry/react';
import { redactDeep } from './secretsGuard';

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    beforeSend(event) {
      return redactDeep(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return redactDeep(breadcrumb);
    },
  });
}
