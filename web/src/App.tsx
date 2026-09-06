import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { WorkspaceCanvas } from './components/WorkspaceCanvas';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
import { FloatingEditorHost } from './components/floatingEditors';
import { useWritingView } from './writingView';
import * as Icon from './components/icons';

export default function App() {
  const ready = useStore((s) => s.ready);
  const project = useStore((s) => s.project);
  const projects = useStore((s) => s.projects);
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspace = useStore((s) => s.activeWorkspace);
  const error = useStore((s) => s.error);
  const notice = useStore((s) => s.notice);
  const settings = useStore((s) => s.settings);
  const panes = useStore((s) => s.panes);
  const focusPaneId = useWritingView((s) => s.focusPaneId);
  const workbench = useWritingView((s) => s.workbench);
  const writingFocused = panes.some((pane) => pane.id === focusPaneId);
  const [showSettings, setShowSettings] = useState(false);
  const sidebarCollapsed = useWritingView((s) => s.sidebarCollapsed);

  useEffect(() => {
    void useStore.getState().bootstrap();
  }, []);

  useEffect(() => {
    if (focusPaneId && !writingFocused) useWritingView.getState().focus(null);
  }, [focusPaneId, writingFocused]);

  useEffect(() => {
    if (!writingFocused) return;
    const exit = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      event.preventDefault();
      useWritingView.getState().focus(null);
    };
    window.addEventListener('keydown', exit);
    return () => window.removeEventListener('keydown', exit);
  }, [writingFocused]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => useStore.getState().setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  if (!ready) {
    return (
      <div className="boot">
        <Icon.Feather size={40} />
        <p>Opening the workspace…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="boot">
        <Icon.Feather size={44} />
        <h1>Muse · Mobilize</h1>
        <p>A writers' room you can assemble around the page.</p>
        {error && <p className="boot-error">{error}</p>}
        <button
          className="btn btn-primary"
          onClick={() => {
            const name = window.prompt('Name your story:', 'Untitled Story');
            if (name) void useStore.getState().newProject(name);
          }}
        >
          {projects.length ? 'New Project' : 'Create your first project'}
        </button>
      </div>
    );
  }

  return (
    <div className={`app ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${writingFocused ? 'is-writing-focus' : ''} ${workbench ? 'is-workbench' : ''}`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => useWritingView.getState().setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="workspace">
        <header className="workspace-head">
          <div>
            <h1>{project.name}</h1>
            <p>
              {project.documents.length} documents
              <span className="dotsep">•</span>
              {settings?.defaultProvider ?? 'mock'} provider
            </p>
          </div>
          <div className="ws-switch">
            {workspaces.map((w) => (
              <button
                key={w.id}
                className={`ws-btn ${activeWorkspace === w.id ? 'is-on' : ''}`}
                onClick={() => void useStore.getState().applyWorkspace(w.id)}
              >
                {w.name}
              </button>
            ))}
            <button className="ws-btn ghost" aria-label="Model settings" title="Model settings" onClick={() => setShowSettings(true)}>
              <Icon.Cloud size={16} />
            </button>
          </div>
        </header>

        <WorkspaceCanvas />
        <StatusBar />
      </main>

      {error && (
        <button className="toast toast-error" role="alert" aria-label={`${error}. Dismiss error`} onClick={() => useStore.setState({ error: null })}>
          {error}
        </button>
      )}
      {notice && <div className="toast" role="status" aria-live="polite">{notice}</div>}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <FloatingEditorHost />
    </div>
  );
}
