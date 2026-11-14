import { useId, useRef, useState } from 'react';
import { IDEA_MAX, titleFromIdea } from '../startIdea';
import { useStore } from '../store';

const UNTITLED = 'Untitled Story';
/** An idea with no letter or digit has nothing to keep as a premise. */
const HAS_WORDS = /[\p{L}\p{N}]/u;

/** Starts a story from the writer's idea; the name is optional and derived from the idea. */
export function NewStoryForm({ onDone }: { onDone?: () => void }) {
  const error = useStore((s) => s.error);
  const [idea, setIdea] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  // A story created on the server but not yet opened: a retry opens it instead of creating another.
  const created = useRef<{ id: string; idea: string } | null>(null);
  const id = useId();
  const headingId = `${id}-heading`;
  const countId = `${id}-count`;
  const tooLong = idea.length > IDEA_MAX;

  const start = async (storyName: string, storyIdea: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try {
      const store = useStore.getState();
      if (created.current) {
        await store.startNewProject(created.current.id, created.current.idea || undefined);
      } else {
        const storyId = await store.newProject(storyName, storyIdea || undefined);
        if (!storyId) return;
        created.current = { id: storyId, idea: storyIdea };
      }
      // Once the story exists the form's work is done: in the dialog an opening failure
      // moves to the app's error toast; on the start screen a retry opens the same story.
      if (onDone) onDone();
      else if (useStore.getState().project?.id === created.current?.id) created.current = null;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (tooLong) return;
    const trimmed = idea.trim();
    const keptIdea = HAS_WORDS.test(trimmed) ? trimmed : '';
    void start(name.trim() || titleFromIdea(keptIdea), keptIdea);
  };

  return (
    <form className="new-story" onSubmit={submit}>
      <h2 id={headingId}>What's the idea?</h2>
      <p className="hint">A sentence is enough. You can change everything later.</p>
      <textarea
        className="new-story-idea"
        aria-labelledby={headingId}
        aria-describedby={countId}
        aria-invalid={tooLong || undefined}
        rows={4}
        autoFocus
        value={idea}
        onChange={(event) => setIdea(event.target.value)}
      />
      <span id={countId} className={`new-story-count ${tooLong ? 'is-over' : ''}`}>{idea.length} / {IDEA_MAX}</span>
      <label className="field">
        Story name (optional)
        <input value={name} placeholder={titleFromIdea(idea)} onChange={(event) => setName(event.target.value)} />
      </label>
      {error && <p className="new-story-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" disabled={pending} onClick={() => void start(UNTITLED, '')}>
          Skip, just give me a page
        </button>
        <button type="submit" className="btn btn-primary" disabled={pending || tooLong}>Start writing</button>
      </div>
    </form>
  );
}
