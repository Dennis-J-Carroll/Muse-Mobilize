import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/story-tools.css';
import './styles/materials.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
