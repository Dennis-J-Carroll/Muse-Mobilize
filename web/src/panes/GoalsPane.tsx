import { useEffect, useRef, useState } from 'react';
import { milestoneProgress } from '../goalProgress';
import { useStore } from '../store';
import type { GoalMilestone, GoalMilestoneStatus, SessionTarget } from '../types';

const MILESTONE_STATUSES: Array<{ value: GoalMilestoneStatus; label: string }> = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
];

interface SessionDraft {
  focus: string;
  wordTarget: string;
  minutesTarget: string;
}

interface MilestoneDraft {
  title: string;
  description: string;
  status: GoalMilestoneStatus;
  targetWords: string;
  dueDate: string;
}

const sessionDraftFrom = (target: SessionTarget): SessionDraft => ({
  focus: target.focus,
  wordTarget: String(target.wordTarget || ''),
  minutesTarget: String(target.minutesTarget || ''),
});

const milestoneDraftFrom = (milestone?: GoalMilestone): MilestoneDraft => ({
  title: milestone?.title ?? '',
  description: milestone?.description ?? '',
  status: milestone?.status ?? 'not_started',
  targetWords: milestone?.targetWords ? String(milestone.targetWords) : '',
  dueDate: milestone?.dueDate ?? '',
});

const positiveInteger = (value: string): number | undefined => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const nonNegativeInteger = (value: string): number => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const ordered = (milestones: GoalMilestone[]): GoalMilestone[] => (
  [...milestones].sort((left, right) => left.order - right.order).map((milestone, order) => ({ ...milestone, order }))
);

const readableDate = (value: string): string => {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
};

const makeMilestoneId = (): string => globalThis.crypto?.randomUUID?.() ?? `milestone-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function MilestoneDrawer({ milestone, onClose, onSave }: {
  milestone?: GoalMilestone;
  onClose: () => void;
  onSave: (draft: MilestoneDraft) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(() => milestoneDraftFrom(milestone));
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const set = <K extends keyof MilestoneDraft>(key: K, value: MilestoneDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || saving) return;
    setSaving(true);
    try {
      if (await onSave(draft)) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="story-drawer-backdrop goal-drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <form className="story-drawer goal-drawer" role="dialog" aria-modal="true" aria-labelledby="goal-drawer-title" onSubmit={submit}>
        <header>
          <div><span>Milestone folio</span><h2 id="goal-drawer-title">{milestone ? `Revise ${milestone.title}` : 'Add milestone'}</h2></div>
          <button type="button" aria-label="Close milestone editor" disabled={saving} onClick={onClose}>×</button>
        </header>
        <div className="story-drawer-scroll">
          <section className="story-form-grid goal-form-grid">
            <label className="span-2">Milestone title<input ref={first} value={draft.title} onChange={(event) => set('title', event.target.value)} placeholder="Finish first act" /></label>
            <label>Status<select value={draft.status} onChange={(event) => set('status', event.target.value as GoalMilestoneStatus)}>{MILESTONE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
            <label>Due date<input type="date" value={draft.dueDate} onChange={(event) => set('dueDate', event.target.value)} /></label>
            <label className="span-2">Target manuscript words<input type="number" min="1" step="1" inputMode="numeric" value={draft.targetWords} onChange={(event) => set('targetWords', event.target.value)} placeholder="25000" /></label>
            <label className="span-2">Definition of done<textarea rows={5} value={draft.description} onChange={(event) => set('description', event.target.value)} placeholder="What becomes true when this milestone is complete?" /></label>
          </section>
        </div>
        <footer>
          <span>{saving ? 'Saving route…' : ''}</span>
          <button type="button" className="btn" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!draft.title.trim() || saving}>{saving ? 'Saving…' : milestone ? 'Save milestone' : 'Add to route'}</button>
        </footer>
      </form>
    </div>
  );
}

export function GoalsPane() {
  const goals = useStore((state) => state.goals);
  const progress = useStore((state) => state.progress);
  const project = useStore((state) => state.project);
  const [sessionDraft, setSessionDraft] = useState<SessionDraft | null>(null);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [routeSaving, setRouteSaving] = useState(false);
  const saveInFlight = useRef(false);
  const saving = sessionSaving || routeSaving;
  const [drawer, setDrawer] = useState<GoalMilestone | 'new' | null>(null);

  useEffect(() => { void Promise.all([useStore.getState().loadGoals(), useStore.getState().loadProgress()]); }, []);
  useEffect(() => {
    if (goals && !sessionDraft) setSessionDraft(sessionDraftFrom(goals.sessionTarget));
  }, [goals, sessionDraft]);

  if (!goals) return <div className="pane-body pane-loading">Setting writing route…</div>;

  const milestones = ordered(goals.milestones);
  const currentWords = progress?.currentWords ?? 0;
  const completed = milestones.filter((milestone) => milestone.status === 'completed').length;
  const target = sessionDraft ?? sessionDraftFrom(goals.sessionTarget);

  const saveSession = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saveInFlight.current) return;
    const sessionTarget: SessionTarget = {
      focus: target.focus.trim(),
      wordTarget: nonNegativeInteger(target.wordTarget),
      minutesTarget: nonNegativeInteger(target.minutesTarget),
    };
    saveInFlight.current = true;
    setSessionSaving(true);
    try {
      const saved = await useStore.getState().updateGoals({ sessionTarget });
      if (saved) setSessionDraft(sessionDraftFrom(saved.sessionTarget));
    } finally {
      saveInFlight.current = false;
      setSessionSaving(false);
    }
  };

  const persistMilestones = async (next: GoalMilestone[]): Promise<boolean> => {
    if (saveInFlight.current) return false;
    saveInFlight.current = true;
    setRouteSaving(true);
    try {
      const saved = await useStore.getState().updateGoals({
        milestones: ordered(next),
      });
      return Boolean(saved);
    } finally {
      saveInFlight.current = false;
      setRouteSaving(false);
    }
  };

  const saveMilestone = async (draft: MilestoneDraft, existing?: GoalMilestone): Promise<boolean> => {
    const now = new Date().toISOString();
    const fields = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      status: draft.status,
      targetWords: positiveInteger(draft.targetWords),
      dueDate: draft.dueDate || undefined,
    };
    const next = existing
      ? milestones.map((milestone) => milestone.id === existing.id ? { ...milestone, ...fields, updatedAt: now } : milestone)
      : [...milestones, { ...fields, id: makeMilestoneId(), order: milestones.length, createdAt: now, updatedAt: now }];
    return persistMilestones(next);
  };

  const changeStatus = (milestone: GoalMilestone, status: GoalMilestoneStatus) => {
    const now = new Date().toISOString();
    void persistMilestones(milestones.map((item) => item.id === milestone.id ? { ...item, status, updatedAt: now } : item));
  };

  const moveMilestone = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= milestones.length) return;
    const next = [...milestones];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    void persistMilestones(next.map((milestone, order) => ({ ...milestone, order })));
  };

  return (
    <div className="goal-workspace">
      <header className="story-toolbar goal-toolbar">
        <div><span>Writing route</span><h2>{project?.name ?? 'Goals'}</h2></div>
        <p><b>{currentWords.toLocaleString()}</b> manuscript words · <b>{completed}/{milestones.length}</b> milestones</p>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => setDrawer('new')}>+ Add milestone</button>
      </header>

      <section className="session-target-card" aria-labelledby="session-target-heading">
        <header><div><span>Next session</span><h3 id="session-target-heading">Set one finish line</h3></div><p>Keep target close enough to change today’s draft.</p></header>
        <form className="session-target-form" onSubmit={saveSession}>
          <label className="session-focus">Focus<input value={target.focus} onChange={(event) => setSessionDraft({ ...target, focus: event.target.value })} placeholder="Draft council reversal" /></label>
          <label className="session-target-metric"><span>Words</span><input type="number" min="0" step="1" inputMode="numeric" value={target.wordTarget} onChange={(event) => setSessionDraft({ ...target, wordTarget: event.target.value })} placeholder="750" /></label>
          <label className="session-target-metric"><span>Minutes</span><input type="number" min="0" step="1" inputMode="numeric" value={target.minutesTarget} onChange={(event) => setSessionDraft({ ...target, minutesTarget: event.target.value })} placeholder="45" /></label>
          <button className="btn" disabled={saving}>{sessionSaving ? 'Saving…' : 'Save session target'}</button>
        </form>
      </section>

      <main className="goal-route-section">
        <header className="goal-route-heading"><div><span>Manuscript path</span><h3>Milestone route</h3></div><p>Progress uses current manuscript word count when target exists; status stays writer-controlled.</p></header>
        {!milestones.length && <div className="story-empty goal-empty"><span>◎</span><h3>No milestone ahead</h3><p>Add destination for draft, revision, or delivery. Route stays ordered as plan changes.</p><button type="button" className="btn btn-primary" onClick={() => setDrawer('new')}>Add first milestone</button></div>}
        {milestones.length > 0 && <ol className="goal-route">{milestones.map((milestone, index) => {
          const percent = milestoneProgress(milestone, currentWords);
          const statusLabel = MILESTONE_STATUSES.find((status) => status.value === milestone.status)?.label ?? milestone.status;
          return <li className={`goal-milestone status-${milestone.status}`} key={milestone.id}>
            <div className="goal-route-marker"><span>{milestone.status === 'completed' ? '✓' : index + 1}</span></div>
            <article className="goal-card">
              <header className="goal-card-head"><div><span>{statusLabel}</span><h4>{milestone.title}</h4></div><button type="button" className="linkish" disabled={saving} onClick={() => setDrawer(milestone)}>Edit</button></header>
              {milestone.description && <p>{milestone.description}</p>}
              <div className="goal-meta">{milestone.targetWords && <span><b>{milestone.targetWords.toLocaleString()}</b> words</span>}{milestone.dueDate && <span>Due <time dateTime={milestone.dueDate}>{readableDate(milestone.dueDate)}</time></span>}{!milestone.targetWords && !milestone.dueDate && <span>Writer-tracked milestone</span>}</div>
              <div className="goal-progress"><progress max="100" value={percent} aria-label={`${milestone.title}: ${percent}% complete`} /><span>{percent}%</span></div>
              <footer>
                <label>Status<select aria-label={`Status for ${milestone.title}`} value={milestone.status} disabled={saving} onChange={(event) => changeStatus(milestone, event.target.value as GoalMilestoneStatus)}>{MILESTONE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
                <div className="goal-route-controls"><button type="button" aria-label={`Move ${milestone.title} earlier`} disabled={saving || index === 0} onClick={() => moveMilestone(index, -1)}>↑</button><button type="button" aria-label={`Move ${milestone.title} later`} disabled={saving || index === milestones.length - 1} onClick={() => moveMilestone(index, 1)}>↓</button></div>
              </footer>
            </article>
          </li>;
        })}</ol>}
      </main>

      {drawer && <MilestoneDrawer milestone={drawer === 'new' ? undefined : drawer} onClose={() => setDrawer(null)} onSave={(draft) => saveMilestone(draft, drawer === 'new' ? undefined : drawer)} />}
    </div>
  );
}
