import { useEffect, useMemo } from 'react';
import { useStore } from '../store';
import type { ProgressPoint, SceneStatus } from '../types';

const STATUS_ORDER: SceneStatus[] = ['planned', 'drafting', 'revised', 'locked'];

const shortDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));

function WordFlow({ points, currentWords }: { points: ProgressPoint[]; currentWords: number }) {
  const series = points.slice(-28);
  const values = series.map((point) => point.totalWords);
  const min = Math.min(...values, currentWords, 0);
  const max = Math.max(...values, currentWords, 1);
  const width = 760;
  const height = 190;
  const pad = { x: 38, y: 24 };
  const scaleX = (index: number) => pad.x + (series.length <= 1 ? 0 : (index / (series.length - 1)) * (width - pad.x * 2));
  const scaleY = (value: number) => height - pad.y - ((value - min) / Math.max(1, max - min)) * (height - pad.y * 2);
  const path = series.map((point, index) => `${index ? 'L' : 'M'} ${scaleX(index)} ${scaleY(point.totalWords)}`).join(' ');

  if (!series.length) return <div className="progress-no-flow"><span>{currentWords.toLocaleString()}</span><p>Current manuscript words. Save draft changes to begin word-flow history.</p></div>;

  return <div className="word-flow-wrap">
    <svg className="word-flow" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Word-flow from ${series[0].totalWords} to ${series.at(-1)?.totalWords ?? currentWords} words across ${series.length} saves`}>
      <line x1={pad.x} x2={width - pad.x} y1={scaleY(min)} y2={scaleY(min)} />
      <line x1={pad.x} x2={width - pad.x} y1={scaleY(max)} y2={scaleY(max)} />
      <text x="4" y={scaleY(max) + 4}>{max.toLocaleString()}</text><text x="4" y={scaleY(min) + 4}>{min.toLocaleString()}</text>
      <path d={`${path} L ${scaleX(series.length - 1)} ${height - pad.y} L ${scaleX(0)} ${height - pad.y} Z`} className="word-flow-area" />
      <path d={path} className="word-flow-line" />
      {series.map((point, index) => <circle key={`${point.ts}:${point.documentId}`} cx={scaleX(index)} cy={scaleY(point.totalWords)} r={index === series.length - 1 ? 5 : 3} tabIndex={0}><title>{shortDate(point.ts)}: {point.totalWords.toLocaleString()} total words ({point.delta >= 0 ? '+' : ''}{point.delta})</title></circle>)}
    </svg>
    <div className="word-flow-axis"><span>{shortDate(series[0].ts)}</span><span>{shortDate(series.at(-1)!.ts)}</span></div>
  </div>;
}

export function ProgressPane() {
  const progress = useStore((s) => s.progress);
  const board = useStore((s) => s.sceneBoard);
  const goals = useStore((s) => s.goals);
  const project = useStore((s) => s.project);

  useEffect(() => { void Promise.all([useStore.getState().loadProgress(), useStore.getState().loadScenes(), useStore.getState().loadGoals()]); }, []);

  const documentNames = useMemo(() => new Map((project?.documents ?? []).map((document) => [document.id, document.title])), [project]);
  const completed = (board?.scenes ?? []).filter((scene) => scene.status === 'revised' || scene.status === 'locked');
  const openScenes = (board?.scenes ?? []).filter((scene) => scene.status === 'planned' || scene.status === 'drafting');
  const recordedDelta = progress?.wordFlow.length ? progress.wordFlow.slice(-12).reduce((sum, point) => sum + point.delta, 0) : 0;
  const sessionTarget = goals?.sessionTarget.wordTarget ?? 0;
  const activeMilestone = goals?.milestones.find((milestone) => milestone.status === 'in_progress') ?? goals?.milestones.find((milestone) => milestone.status !== 'completed');

  if (!progress || !board || !goals) return <div className="pane-body pane-loading">Reading manuscript ledger…</div>;

  return <div className="progress-workspace">
    <header className="story-toolbar progress-toolbar"><div><span>Manuscript ledger</span><h2>{project?.name ?? 'Progress'}</h2></div><p>Derived from saved pages, scene folios, and revision history</p><button className="btn" onClick={() => void Promise.all([useStore.getState().loadProgress(), useStore.getState().loadScenes()])}>Refresh</button></header>
    <main className="progress-scroll">
      <section className="progress-score" aria-label="Current writing progress">
        <div><span>Manuscript</span><strong>{progress.currentWords.toLocaleString()}</strong><small>words</small></div>
        <div><span>Recent flow</span><strong>{recordedDelta >= 0 ? '+' : ''}{recordedDelta.toLocaleString()}</strong><small>net across last {Math.min(12, progress.wordFlow.length)} saves</small></div>
        <div><span>Scenes complete</span><strong>{progress.scenes.completed}<i>/{progress.scenes.total}</i></strong><small>revised or locked</small></div>
        <div className={progress.unresolvedRevisions.length ? 'needs-attention' : ''}><span>Revision queue</span><strong>{progress.unresolvedRevisions.length}</strong><small>awaiting decisions</small></div>
      </section>

      <section className="progress-ledger-grid">
        <article className="progress-flow-panel"><header><div><span>Word-flow</span><h3>Draft movement</h3></div>{sessionTarget > 0 && <p>Session target <b>{sessionTarget.toLocaleString()}</b></p>}</header><WordFlow points={progress.wordFlow} currentWords={progress.currentWords} /></article>
        <aside className="progress-now"><span>Now</span><h3>{activeMilestone?.title ?? 'No active milestone'}</h3><p>{activeMilestone?.description || goals.sessionTarget.focus || 'Set next writing intention in Goals.'}</p><button className="linkish" onClick={() => useStore.getState().openPane('goals', { title: 'Writing Goals', region: 'main', focus: true })}>Open goals</button></aside>
      </section>

      <section className="scene-progress-panel"><header><div><span>Scene state</span><h3>{progress.scenes.completed === progress.scenes.total && progress.scenes.total ? 'Story board complete' : `${openScenes.length} scenes still moving`}</h3></div><button className="linkish" onClick={() => useStore.getState().openPane('scenes', { title: 'Scene Board', region: 'main', focus: true })}>Open Scene Board</button></header>
        <div className="scene-status-strip" role="img" aria-label={`${progress.scenes.total} scenes: ${STATUS_ORDER.map((status) => `${progress.scenes.byStatus[status]} ${status}`).join(', ')}`}>
          {(board.scenes ?? []).map((scene) => <button key={scene.id} className={`status-${scene.status}`} title={`${scene.title}: ${scene.status}`} onClick={() => { useStore.setState({ sceneFocusId: scene.id }); useStore.getState().openPane('scenes', { title: 'Scene Board', region: 'main', focus: true }); }}><span>{scene.order + 1}</span><small>{scene.title}</small></button>)}
          {!board.scenes.length && <p>No scenes yet. Build Scene Board to track completion.</p>}
        </div>
        <div className="scene-status-legend">{STATUS_ORDER.map((status) => <span key={status} className={`status-${status}`}><i />{status} <b>{progress.scenes.byStatus[status]}</b></span>)}</div>
        {!!completed.length && <div className="completed-scene-list"><span>Completed scenes</span>{completed.map((scene) => <button key={scene.id} onClick={() => { useStore.setState({ sceneFocusId: scene.id }); useStore.getState().openPane('scenes', { title: 'Scene Board', region: 'main', focus: true }); }}>✓ {scene.title}<small>{scene.status}</small></button>)}</div>}
      </section>

      <section className="progress-bottom-grid">
        <article className="manuscript-timeline"><header><span>Manuscript timeline</span><h3>Recent saved movement</h3></header><ol>{progress.wordFlow.slice(-10).reverse().map((point) => <li key={`${point.ts}:${point.documentId}`}><time dateTime={point.ts}>{shortDate(point.ts)}</time><div><strong>{documentNames.get(point.documentId) ?? point.documentId}</strong><small>{point.words.toLocaleString()} words on page</small></div><b className={point.delta < 0 ? 'is-negative' : ''}>{point.delta >= 0 ? '+' : ''}{point.delta}</b></li>)}{!progress.wordFlow.length && <li className="empty-row">No saved word events yet.</li>}</ol></article>
        <article className="revision-queue"><header><span>Unresolved revisions</span><h3>{progress.unresolvedRevisions.length ? 'Decisions waiting' : 'Queue clear'}</h3></header><ol>{progress.unresolvedRevisions.map((revision) => <li key={revision.patchId}><i>{revision.actor?.slice(0, 1).toUpperCase() || 'M'}</i><div><strong>{documentNames.get(revision.documentId ?? '') ?? 'Manuscript revision'}</strong><p>{revision.reason || 'Agent revision awaits accept or reject.'}</p><time dateTime={revision.proposedAt}>{shortDate(revision.proposedAt)}</time></div></li>)}{!progress.unresolvedRevisions.length && <li className="revision-clear">✓ No agent revisions waiting.</li>}</ol>{progress.unresolvedRevisions.length > 0 && <button className="btn" onClick={() => useStore.getState().openPane('review', { region: 'right' })}>Open current review queue</button>}</article>
      </section>
    </main>
  </div>;
}
