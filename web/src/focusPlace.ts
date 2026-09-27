/** Remember where the writer was before focus changes the textarea's width and height. */
interface Place { start: number; end: number; fraction: number }
const places = new Map<string, Place>();

export function rememberPlaces() {
  document.querySelectorAll<HTMLTextAreaElement>('textarea.draft').forEach((el) => {
    const pane = el.closest('[id^="workspace-"]');
    if (!pane) return;
    places.set(pane.id.slice('workspace-'.length), { start: el.selectionStart, end: el.selectionEnd, fraction: el.scrollHeight ? el.scrollTop / el.scrollHeight : 0 });
  });
}

/** Document fraction survives rewrapping better than pixel offsets when the column width changes. */
export function restorePlace(paneId: string, el: HTMLTextAreaElement) {
  const place = places.get(paneId);
  if (!place) return;
  places.delete(paneId);
  if (el.selectionStart !== place.start || el.selectionEnd !== place.end) el.setSelectionRange(place.start, place.end);
  el.scrollTop = place.fraction * el.scrollHeight;
}
