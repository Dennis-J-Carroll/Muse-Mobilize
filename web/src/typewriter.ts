/** Typewriter mode: the line being written stays at a fixed height in the
 *  page while the manuscript scrolls beneath it. */

/** Where the writing line rests, as a fraction of the visible page height. */
export const TYPEWRITER_ANCHOR = 0.45;

/**
 * Scroll target that puts the caret line on the anchor. Returns null when the
 * caret is already within half a line of it, so ordinary typing on the same
 * line never nudges the page.
 */
export function typewriterScrollTop(caretTop: number, lineHeight: number, clientHeight: number, scrollTop: number, anchor = TYPEWRITER_ANCHOR): number | null {
  const target = Math.max(0, Math.round(caretTop + lineHeight / 2 - clientHeight * anchor));
  return Math.abs(target - scrollTop) < lineHeight / 2 ? null : target;
}

const MIRRORED = [
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
  'textTransform', 'wordSpacing', 'textIndent', 'tabSize',
] as const;

let mirror: HTMLDivElement | null = null;

/** Caret's top edge in the textarea's scroll coordinates (padding included),
 *  measured with an off-screen mirror that wraps text exactly as the textarea does. */
export function caretTop(el: HTMLTextAreaElement): number {
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    Object.assign(mirror.style, { position: 'absolute', top: '0', left: '-9999px', visibility: 'hidden', boxSizing: 'border-box', borderStyle: 'solid', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', overflow: 'hidden' });
    document.body.appendChild(mirror);
  }
  const style = getComputedStyle(el);
  for (const key of MIRRORED) mirror.style[key] = style[key];
  // The textarea's scrollbar narrows its text column; match the real content width.
  mirror.style.width = `${el.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
  mirror.textContent = el.value.slice(0, el.selectionEnd);
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  return marker.offsetTop;
}
