import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import * as Icon from './icons';
import { openProjectTool } from './ProjectTools';

/**
 * Domain cards mobilize a tool into the workspace. Rich domains can launch a
 * dedicated surface directly; lighter domains still use a pane menu.
 */

type Item = { label: string; run?: () => void; soon?: boolean };
type Card = {
  key: string;
  title: string;
  blurb: string;
  tone: string;
  icon: React.ReactNode;
  wide?: boolean;
  launch?: () => void;
  items: (s: ReturnType<typeof useStore.getState>) => Item[];
};

const docItem = (label: string, docId: string): Item => ({
  label,
  run: () => useStore.getState().openPane('editor', { bindingId: docId }),
});
const agentItem = (label: string, agentId: string): Item => ({
  label,
  run: () => useStore.getState().openPane('agent', { bindingId: agentId }),
});
const soon = (label: string): Item => ({ label, soon: true });
const canonItem = (): Item => ({ label: 'Canon & continuity', run: () => useStore.getState().openPane('canon', { title: 'Canon' }) });
const openCharacters = () => useStore.getState().openPane('characters', { title: 'Cast', region: 'main', focus: true });
const openWorld = () => useStore.getState().openPane('world', { title: 'World Atlas', region: 'main', focus: true });
const openPlot = () => useStore.getState().openPane('plot', { title: 'Plot Through-line', region: 'main', focus: true });
const openScenes = () => useStore.getState().openPane('scenes', { title: 'Scene Board', region: 'main', focus: true });
const openDialogue = () => useStore.getState().openPane('dialogue', { title: 'Dialogue Table', region: 'main', focus: true });
const openThemes = () => useStore.getState().openPane('themes', { title: 'Theme Threads', region: 'main', focus: true });
const openReferences = () => useStore.getState().openPane('references', { title: 'Reference Board', region: 'main', focus: true });
const openGoals = () => useStore.getState().openPane('goals', { title: 'Writing Goals', region: 'main', focus: true });
const openProgress = () => useStore.getState().openPane('progress', { title: 'Manuscript Progress', region: 'main', focus: true });
const openSources = () => useStore.getState().openPane('sources', { title: 'Sources', region: 'main', focus: true });

const newDoc = (title: string, kind: 'manuscript' | 'notes' | 'canon' | 'outline'): Item => ({
  label: title,
  run: async () => {
    const s = useStore.getState();
    if (!s.project) return;
    const name = window.prompt(`Name for the new ${kind}:`);
    if (!name) return;
    const { meta } = await api.createDoc(s.project.id, name, kind);
    await s.openProject(s.project.id);
    useStore.getState().openPane('editor', { bindingId: meta.id });
  },
});

const CARDS: Card[] = [
  { key: 'agent-studio', title: 'Agent Studio', blurb: 'Assign knowledge and arrange your agents.', tone: 'sage', icon: <Icon.Users />, launch: () => openProjectTool('agents'), items: () => [] },
  { key: 'project-binder', title: 'Project Binder', blurb: 'Arrange and export your whole project.', tone: 'sand', icon: <Icon.Bookmark />, launch: () => openProjectTool('binder'), items: () => [] },
  {
    key: 'idea', title: 'Story Idea', blurb: 'Capture and develop your ideas.', tone: 'deep', wide: true,
    icon: <Icon.Feather size={22} />,
    items: (s) => [
      ...(s.agents.some((a) => a.id === 'muse') ? [agentItem('Muse', 'muse')] : []),
      ...(s.project?.documents.filter((d) => d.kind === 'notes').map((d) => docItem(`Idea Capture — ${d.title}`, d.id)) ?? []),
      soon('Premise Builder'), soon('Constraint Generator'),
    ],
  },
  {
    key: 'characters', title: 'Characters', blurb: 'Bring your cast into focus.', tone: 'blue',
    icon: <Icon.Users />,
    launch: openCharacters,
    items: (s) => [
      canonItem(),
      ...s.agents.filter((a) => a.role === 'character').map((a) => agentItem(`${a.name} (character agent)`, a.id)),
      newDoc('New Character sheet', 'canon'),
      ...(s.project?.documents.filter((d) => d.kind === 'canon').map((d) => docItem(d.title, d.id)) ?? []),
      soon('Relationship Map'),
    ],
  },
  {
    key: 'world', title: 'World Building', blurb: 'Map places, powers, and hidden rules.', tone: 'mist',
    icon: <Icon.Pin />,
    launch: openWorld,
    items: () => [canonItem(), newDoc('New lore page', 'canon'), soon('Location Builder'), soon('Faction Builder'), soon('World Rules')],
  },
  {
    key: 'plot', title: 'Plot Outline', blurb: 'Braid beats, branches, and reveals.', tone: 'stone',
    icon: <Icon.Chart />,
    launch: openPlot,
    items: (s) => [
      ...(s.project?.documents.filter((d) => d.kind === 'outline').map((d) => docItem(d.title, d.id)) ?? []),
      ...(s.agents.some((a) => a.id === 'architect') ? [agentItem('Architect', 'architect')] : []),
      soon('Timeline'), soon('Setup / Payoff Tracker'),
    ],
  },
  {
    key: 'scenes', title: 'Scenes', blurb: 'Organize and draft key scenes.', tone: 'mist',
    icon: <Icon.List />,
    launch: openScenes,
    items: (s) => [
      ...(s.project?.documents.filter((d) => d.kind === 'manuscript').map((d) => docItem(d.title, d.id)) ?? []),
      newDoc('New scene', 'manuscript'),
      soon('Scene Board'), soon('Scene Diagnostics'),
    ],
  },
  {
    key: 'dialogue', title: 'Dialogue', blurb: 'Write and refine conversations.', tone: 'blue',
    icon: <Icon.Chat />,
    launch: openDialogue,
    items: (s) => [
      ...s.agents.filter((a) => a.role === 'character').map((a) => agentItem(`Speak with ${a.name}`, a.id)),
      soon('Subtext Critic'), soon('Conversation Simulator'),
    ],
  },
  {
    key: 'themes', title: 'Themes', blurb: 'Explore ideas and underlying messages.', tone: 'sand',
    icon: <Icon.Bulb />,
    launch: openThemes,
    items: () => [],
  },
  {
    key: 'notes', title: 'Notes', blurb: 'Jot down thoughts and observations.', tone: 'stone',
    icon: <Icon.Note />,
    items: (s) => [
      ...(s.project?.documents.filter((d) => d.kind === 'notes').map((d) => docItem(d.title, d.id)) ?? []),
      newDoc('New note', 'notes'),
      { label: 'Decision Log', run: () => useStore.getState().openPane('events') },
    ],
  },
  {
    key: 'sources', title: 'Sources', blurb: 'Search the story material you brought with you.', tone: 'stone',
    icon: <Icon.Note />,
    launch: openSources,
    items: () => [
      { label: 'Open Sources workspace', run: openSources },
      canonItem(),
    ],
  },
  {
    key: 'references', title: 'References', blurb: 'Save useful links, quotes, and resources.', tone: 'sand',
    icon: <Icon.Bookmark />,
    launch: openReferences,
    items: () => [],
  },
  {
    key: 'goals', title: 'Goals', blurb: 'Set writing goals and track progress.', tone: 'sage',
    icon: <Icon.Target />,
    launch: openGoals,
    items: () => [],
  },
  {
    key: 'progress', title: 'Progress', blurb: 'Monitor your writing journey.', tone: 'blue',
    icon: <Icon.Bars />,
    launch: openProgress,
    items: () => [],
  },
  {
    key: 'workspace', title: 'Workspace', blurb: 'Arrange the room around the page.', tone: 'deep', wide: true,
    icon: <Icon.Layers />,
    items: (s) => [
      ...s.workspaces.map((w) => ({ label: w.name, run: () => void useStore.getState().applyWorkspace(w.id) })),
      {
        label: 'Save current arrangement…',
        run: () => {
          const name = window.prompt('Name this workspace:');
          if (name) void useStore.getState().saveWorkspaceAs(name);
        },
      },
      { label: 'Activity log pane', run: () => useStore.getState().openPane('events') },
      { label: 'Review pane', run: () => useStore.getState().openPane('review') },
    ],
  },
];

function Launcher({ card, onClose }: { card: Card; onClose: () => void }) {
  // Subscribe so the menu re-renders when documents or agents change.
  useStore((st) => st.project);
  const items = card.items(useStore.getState());
  return (
    <div className="launcher" role="menu">
      <div className="launcher-head">{card.title}</div>
      {items.length === 0 && <div className="launcher-empty">Nothing here yet.</div>}
      {items.map((it, i) => (
        <button
          key={i}
          className="launcher-item"
          disabled={it.soon}
          onClick={() => {
            it.run?.();
            onClose();
          }}
        >
          <span>{it.label}</span>
          {it.soon && <em>soon</em>}
        </button>
      ))}
    </div>
  );
}

export function Sidebar({ collapsed, onToggleCollapsed, onOpenSettings }: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const project = useStore((s) => s.project);
  const projects = useStore((s) => s.projects);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(null);
        setMenu(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} ref={ref}>
      <div className="brand-row">
        <button className="brand-dot" onClick={() => setMenu((m) => !m)} title="Project menu">
          <Icon.Dots />
        </button>
        <div className="brand-text">
          <img className="brand-logo" src="/brand/muse-mobilize-logo.png" alt="Muse Mobilize" />
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={collapsed ? 'Expand tool menu' : 'Collapse tool menu'}
          title={collapsed ? 'Expand tool menu' : 'Collapse tool menu'}
          aria-expanded={!collapsed}
          aria-controls="tool-menu-cards"
          onClick={() => { setOpen(null); onToggleCollapsed(); }}
        >
          <span aria-hidden="true">{collapsed ? '›' : '‹'}</span>
        </button>
      </div>

      {menu && (
        <div className="launcher project-menu">
          <div className="launcher-head">Projects</div>
          <div className="project-menu-list" role="group" aria-label="Available projects">
            {projects.map((p) => (
              <button
                key={p.id}
                className={`launcher-item ${p.id === project?.id ? 'is-current' : ''}`}
                aria-current={p.id === project?.id ? 'page' : undefined}
                onClick={() => {
                  const state = useStore.getState();
                  if (state.project?.id !== p.id) void state.openProject(p.id);
                  setMenu(false);
                }}
              >
                <span>{p.name}</span>
              </button>
            ))}
          </div>
          <button
            className="launcher-item"
            onClick={() => {
              const name = window.prompt('Name your story:');
              if (name) void useStore.getState().newProject(name);
              setMenu(false);
            }}
          >
            <span>New Project</span>
          </button>
          <button className="launcher-item" onClick={() => { onOpenSettings(); setMenu(false); }}>
            <span>Settings</span>
          </button>
          <button className="launcher-item" onClick={() => { openProjectTool('agents'); setMenu(false); }}>Agent Studio</button>
          <button className="launcher-item" onClick={() => { openProjectTool('binder'); setMenu(false); }}>Project Binder</button>
        </div>
      )}

      <div className="cards" id="tool-menu-cards" hidden={collapsed}>
        {CARDS.map((c) => (
          <div key={c.key} className={`card-slot ${c.wide ? 'wide' : ''}`}>
            <button
              className={`card tone-${c.tone} ${open === c.key ? 'is-open' : ''}`}
              onClick={() => {
                if (c.launch) {
                  c.launch();
                  setOpen(null);
                } else {
                  setOpen(open === c.key ? null : c.key);
                }
              }}
            >
              <span className="card-icon">{c.icon}</span>
              <span className="card-title">{c.title}</span>
              <span className="card-blurb">{c.blurb}</span>
            </button>
            {!c.launch && open === c.key && <Launcher card={c} onClose={() => setOpen(null)} />}
          </div>
        ))}
      </div>
    </aside>
  );
}
