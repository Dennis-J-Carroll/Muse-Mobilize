import { useEffect, useState } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { WorkspaceCanvas } from './components/WorkspaceCanvas';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
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
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    void useStore.getState().bootstrap();
  }, []);

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
    <div className="app">
      <Sidebar onOpenSettings={() => setShowSettings(true)} />

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
            <button className="ws-btn ghost" onClick={() => setShowSettings(true)}>
              <Icon.Cloud size={16} />
            </button>
          </div>
        </header>

        <WorkspaceCanvas />
        <StatusBar />
      </main>

      {error && (
        <div className="toast toast-error" onClick={() => useStore.setState({ error: null })}>
          {error}
        </div>
      )}
      {notice && <div className="toast">{notice}</div>}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
