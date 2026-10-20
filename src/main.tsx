import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import AuthGate from './components/AuthGate';
import { ToastProvider } from './components/toast';
import { initSentry } from './lib/sentry';
import { startCrmRefreshListener } from './lib/store';
import './index.css';

initSentry();
startCrmRefreshListener();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <ToastProvider>
        <AuthGate>
          <App />
        </AuthGate>
      </ToastProvider>
    </HashRouter>
  </StrictMode>,
);
