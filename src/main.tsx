import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { App } from './app/App';
import { AuthProvider } from './auth/AuthProvider';
import { adoptHashLink } from './lib/hashLinks';
import { queryClient } from './lib/queryClient';
import './lib/theme';
import './styles/ds/colors_and_type.css';
import './styles/ds/styles-shell.css';
import './styles/ds/styles-content.css';
import './styles/app.css';

adoptHashLink();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
