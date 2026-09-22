import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import './styles/app.css';
import './styles/shell.css';
import { App } from './App';
import { I18nProvider } from './i18n/I18nProvider';
import { applyTheme, getState } from './state/store';
import './state/debugBridge';

applyTheme(getState().theme);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
);
