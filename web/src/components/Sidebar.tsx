import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import * as Icon from './icons';

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
    key: 'plot', title: 'Plot Outline', blurb: 'Plan your story structure.', tone: 'stone',
    icon: <Icon.Chart />,
    items: (s) => [
      ...(s.project?.documents.filter((d) => d.kind === 'outline').map((d) => docItem(d.title, d.id)) ?? []),
      ...(s.agents.some((a) => a.id === 'architect') ? [agentItem('Architect', 'architect')] : []),
      soon('Timeline'), soon('Setup / Payoff Tracker'),
    ],
  },
  {
    key: 'scenes', title: 'Scenes', blurb: 'Organize and draft key scenes.', tone: 'mist',
    icon: <Icon.List />,
    items: (s) => [
      ...(s.project?.documents.filter((d) => d.kind === 'manuscript').map((d) => docItem(d.title, d.id)) ?? []),
      newDoc('New scene', 'manuscript'),
      soon('Scene Board'), soon('Scene Diagnostics'),
    ],
  },
  {
    key: 'dialogue', title: 'Dialogue', blurb: 'Write and refine conversations.', tone: 'blue',
    icon: <Icon.Chat />,
    items: (s) => [
      ...s.agents.filter((a) => a.role === 'character').map((a) => agentItem(`Speak with ${a.name}`, a.id)),
      soon('Subtext Critic'), soon('Conversation Simulator'),
    ],
  },
  {
    key: 'themes', title: 'Themes', blurb: 'Explore ideas and underlying messages.', tone: 'sand',
    icon: <Icon.Bulb />,
    items: () => [newDoc('Theme notes', 'notes'), soon('Motif Tracker'), soon('Theme Critic')],
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
    key: 'references', title: 'References', blurb: 'Save useful links, quotes, and resources.', tone: 'sand',
    icon: <Icon.Bookmark />,
    items: () => [newDoc('Research page', 'notes'), soon('Images'), soon('Web Sources')],
  },
  {
    key: 'goals', title: 'Goals', blurb: 'Set writing goals and track progress.', tone: 'sage',
    icon: <Icon.Target />,
    items: () => [newDoc('Session goal', 'notes'), soon('Chapter Goal'), soon('Draft Milestones')],
  },
  {
    key: 'progress', title: 'Progress', blurb: 'Monitor your writing journey.', tone: 'blue',
    icon: <Icon.Bars />,
    items: () => [
      { label: 'Writing Sessions (activity log)', run: () => useStore.getState().openPane('events') },
      { label: 'Pending revisions', run: () => useStore.getState().openPane('review') },
    ],
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

export function Sidebar({ onOpenSettings }: { onOpenSettings: () => void }) {
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
    <aside className="sidebar" ref={ref}>
      <div className="brand-row">
        <button className="brand-dot" onClick={() => setMenu((m) => !m)} title="Project menu">
          <Icon.Dots />
        </button>
        <div className="brand-text">
          <strong>Muse</strong>
          <span>Mobilize</span>
        </div>
      </div>

      {menu && (
        <div className="launcher project-menu">
          <div className="launcher-head">Projects</div>
          {projects.map((p) => (
            <button
              key={p.id}
              className={`launcher-item ${p.id === project?.id ? 'is-current' : ''}`}
              onClick={() => {
                void useStore.getState().openProject(p.id);
                setMenu(false);
              }}
            >
              <span>{p.name}</span>
            </button>
          ))}
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
        </div>
      )}

      <div className="cards">
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
