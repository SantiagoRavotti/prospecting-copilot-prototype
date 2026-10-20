import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import OAuthConsent from './pages/OAuthConsent';
import AuthGate from './components/AuthGate';
import { ToastProvider } from './components/toast';
import { initSentry } from './lib/sentry';
import { startCrmRefreshListener } from './lib/store';
import './index.css';

initSentry();
startCrmRefreshListener();

// The OAuth consent screen (ChatGPT connector authorization) renders on its
// own: no CRM hydration, no onboarding.
const isConsent = window.location.hash.startsWith('#/oauth/consent');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isConsent ? (
      <OAuthConsent />
    ) : (
      <HashRouter>
        <ToastProvider>
          <AuthGate>
            <App />
          </AuthGate>
        </ToastProvider>
      </HashRouter>
    )}
  </StrictMode>,
);
