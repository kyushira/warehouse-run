import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

if (import.meta.env.DEV) void import('./dev/demo').then((m) => setTimeout(m.runDemo, 300));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
