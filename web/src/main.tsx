import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ContextMenu } from './components/ContextMenu';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource/antic/latin.css';
import '@fontsource/antic-didone/latin.css';
import '@fontsource/italiana/latin.css';
import '@fontsource-variable/josefin-sans';
import '@fontsource-variable/josefin-slab';
import './styles/tokens.css';
import './styles/app.css';
import './styles/story-tools.css';
import './styles/materials.css';
import './styles/floating-editors.css';
import './styles/scene-rail.css';
import './styles/writing-page.css';
import './styles/tool-drawer.css';
import './styles/workspace-layout.css';
import './styles/connections.css';
import './styles/threads.css';
import './styles/sources.css';
import './styles/mobile.css';
import './styles/drafting-controls.css';
import './styles/project-tools.css';
import './styles/character-consultation.css';
import './styles/lore-type.css';
import './styles/workspace-motion.css';
import './styles/context-menu.css';
import './styles/window-resize.css';
import './styles/agent-reply.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <ContextMenu />
  </StrictMode>,
);
