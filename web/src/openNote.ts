import { resolvePassageAnchor } from '../../shared/connections';
import type { Thread } from '../../shared/threads';
import { sameTarget } from '../../shared/threads';
import { editorRefs, revealRange } from './panes/EditorPane';
import { loadStoryRecords, storyRecords } from './storyRecords';
import { useStore } from './store';
import { useThreadPopover } from './threads';

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Opens a note's card (and, for a passage note, selects the passage once the editor has mounted), then its thread. */
export async function openNote(thread: Thread): Promise<boolean> {
  await loadStoryRecords();
  const record = storyRecords().find((item) => sameTarget(item.target, thread.target));
  if (!record) return false;
  const documentId = thread.target.id;
  if (thread.anchor && thread.target.kind === 'document') {
    await useStore.getState().loadDoc(documentId);
    record.open();
    const doc = useStore.getState().docs[documentId];
    const resolved = doc ? resolvePassageAnchor(doc.content, thread.anchor) : null;
    if (resolved?.status === 'resolved') {
      for (let frame = 0; frame < 60 && !editorRefs.get(documentId); frame++) await nextFrame();
      if (editorRefs.get(documentId)) revealRange(documentId, resolved.start, resolved.end);
    }
  } else record.open();
  await nextFrame();
  useThreadPopover.getState().open(thread.target, thread.id);
  return true;
}
