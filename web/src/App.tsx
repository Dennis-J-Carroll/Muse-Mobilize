import { useEditHistory } from './editHistory';
import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { useStore } from './store';
import { Sidebar } from './components/Sidebar';
import { WorkspaceCanvas } from './components/WorkspaceCanvas';
import { StatusBar } from './components/StatusBar';
import { SettingsModal } from './components/SettingsModal';
import { FloatingEditorHost } from './components/floatingEditors';
import { FocusStoryCards } from './components/FocusStoryCards';
import { ConnectionsPanel } from './components/ConnectionsPanel';
import { RecoveryPanel } from './useRecoverableDraft';
import { ProjectBackups } from './components/ProjectBackups';
import { ProjectTools, type ProjectTool } from './components/ProjectTools';
import { dismissFocusLayer } from './focusLayers';
import { useWritingView } from './writingView';
import { useMobileWritingViewport } from './useMobileWritingViewport';
import * as Icon from './components/icons';

export default function App() {
  const restoring = useEditHistory((s) => s.restoring);
  useEffect(() => {
    const app = document.querySelector<HTMLElement>('.app');
    if (app) app.inert = restoring;
    return () => { if (app) app.inert = false; };
  }, [restoring]);
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
  const appRef = useRef<HTMLDivElement>(null);
  const [mobileControlsCollapsed, setMobileControlsCollapsed] = useState(false);
  useMobileWritingViewport(appRef, writingFocused || mobileControlsCollapsed);
  const collapseForWriting = (event: SyntheticEvent) => {
    if (!writingFocused && window.matchMedia('(max-width: 700px)').matches && event.target instanceof HTMLTextAreaElement && event.target.matches('.draft')) {
      setMobileControlsCollapsed(true);
    }
  };
  const [showSettings, setShowSettings] = useState(false);
  const [projectTool, setProjectTool] = useState<{ tool: ProjectTool; agentId?: string } | null>(null);
  useEffect(() => { setProjectTool(null); }, [project?.id]);
  useEffect(() => {
    const open = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail?.tool === 'agents' || detail?.tool === 'binder') setProjectTool(detail); };
    window.addEventListener('muse:project-tool', open);
    return () => window.removeEventListener('muse:project-tool', open);
  }, []);
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
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && event.code === 'KeyK' && !event.isComposing && !event.defaultPrevented) {
        // Do not replace an editor that currently owns the focus layer.
        if (!useWritingView.getState().focusLayer) {
          event.preventDefault();
          useWritingView.getState().setFocusLayer({ kind: 'cards' });
        }
        return;
      }
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return;
      if (useWritingView.getState().focusLayer) { event.preventDefault(); dismissFocusLayer(); return; }
      // Native fullscreen owns its escape hatch; restoring browser chrome
      // must not also dismantle the writing workspace.
      if (document.fullscreenElement) return;
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
        <img className="boot-splash" src="/brand/muse-mobilize-splash.jpg" alt="" />
        <p>Opening the workspace…</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="boot">
        <img className="boot-mark" src="/brand/muse-mobilize-mark.jpg" alt="" />
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
        <ProjectBackups />
      </div>
    );
  }

  return (
    <div ref={appRef} className={`app ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''} ${writingFocused ? 'is-writing-focus' : ''} ${workbench ? 'is-workbench' : ''} ${mobileControlsCollapsed ? 'is-mobile-controls-collapsed' : ''}`}
      onFocusCapture={collapseForWriting} onInputCapture={collapseForWriting}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => useWritingView.getState().setSidebarCollapsed(!sidebarCollapsed)}
        onOpenSettings={() => setShowSettings(true)}
      />

      <main className="workspace">
        <button type="button" className="mobile-workspace-toggle"
          aria-label={mobileControlsCollapsed ? 'Show workspace controls' : 'Hide workspace controls'}
          aria-expanded={!mobileControlsCollapsed}
          aria-controls="workspace-navigation workspace-heading workspace-arrangement"
          onPointerDown={(event) => {
            // Keep the keyboard and caret when recalling tools from the draft.
            if (document.activeElement instanceof HTMLTextAreaElement && document.activeElement.matches('.draft')) event.preventDefault();
          }}
          onClick={() => setMobileControlsCollapsed((collapsed) => !collapsed)}>
          <Icon.Layers size={16} />
          <span>Workspace</span>
          <span className="mobile-workspace-project">{project.name}</span>
          <span aria-hidden="true">{mobileControlsCollapsed ? '▾' : '▴'}</span>
        </button>
        <header id="workspace-heading" className="workspace-head">
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
      <FocusStoryCards />
      <ConnectionsPanel />
      <RecoveryPanel />
      {projectTool && <ProjectTools key={`${project.id}-${projectTool.tool}`} {...projectTool} projectId={project.id} projectName={project.name} onClose={() => setProjectTool(null)} />}
    </div>
  );
}
