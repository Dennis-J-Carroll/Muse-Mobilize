import type { ModelProvider, ModelRequest, ModelResult } from '../types.js';

/**
 * Deterministic offline provider. This is not a stub that returns a canned
 * string — it walks the entire golden path (§30) so the whole product can be
 * exercised with no API key: it comments on the actual selection it received,
 * raises a real consultation, and proposes a patch anchored to real text
 * drawn from that selection.
 */

function section(text: string, name: string): string {
  // Tags may carry attributes, e.g. <consultation-response from="continuity">.
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i').exec(text);
  return m ? m[1].trim() : '';
}

function firstSentence(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(cleaned);
  return (m ? m[1] : cleaned).trim();
}

/** Rebuild the sentence exactly as it appears in the source, whitespace included. */
function verbatimSentence(source: string, sentence: string): string {
  const words = sentence.split(' ').filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return sentence;
  const re = new RegExp(words.join('\\s+'), 'm');
  const m = re.exec(source);
  return m ? m[0] : sentence;
}

function tighten(sentence: string): string {
  const swaps: [RegExp, string][] = [
    [/\bwalked across\b/i, 'crossed'],
    [/\bwalked into\b/i, 'entered'],
    [/\bstarted to\b/i, ''],
    [/\bbegan to\b/i, ''],
    [/\bvery\s+/gi, ''],
    [/\bsuddenly\s+/gi, ''],
    [/\bin order to\b/gi, 'to'],
    [/\bwas able to\b/gi, 'could'],
  ];
  let out = sentence;
  let changed = false;
  for (const [re, to] of swaps) {
    if (re.test(out)) {
      out = out.replace(re, to);
      changed = true;
    }
  }
  out = out.replace(/\s{2,}/g, ' ').trim();
  if (!changed) {
    // Always produce a reviewable change so Accept/Reject is demonstrable.
    out = out.replace(/\.$/, '') + ', and did not look back.';
  }
  return out;
}

export const mockProvider: ModelProvider = {
  id: 'mock',
  label: 'Mock (offline)',
  async available() {
    return true;
  },
  async models() {
    return ['mock-writer-1'];
  },
  async complete(req: ModelRequest): Promise<ModelResult> {
    const user = req.messages.map((m) => m.content).join('\n\n');
    const agentName = section(req.system, 'agent-name') || 'Agent';
    const isConsulted = /<consultation-request\b/i.test(user);
    const isFollowUp = /<consultation-response\b/i.test(user);
    const selection = section(user, 'selection');
    const question = section(user, 'question');
    const scene = section(user, 'current-scene') || section(user, 'current-document');
    const material = selection || scene;

    if (isConsulted) {
      const asked = section(user, 'consultation-request');
      return {
        model: 'mock-writer-1',
        text:
          `Checked against the text I can see. Nothing in the supplied passage settles ` +
          `"${firstSentence(asked)}" — the seal is recognised here, but the text does not say ` +
          `when Senna first learned it. Treat it as unestablished rather than contradicted.\n\n` +
          `(Offline mock reply — add a real provider in Settings for a genuine check.)`,
      };
    }

    if (isFollowUp) {
      const heard = section(user, 'consultation-response');
      const target0 = verbatimSentence(material, firstSentence(material));
      return {
        model: 'mock-writer-1',
        text: [
          `Continuity came back, and could not settle it from the text on the page:`,
          ``,
          `> ${firstSentence(heard)}`,
          ``,
          `That is useful either way. If the recognition is new, the beat needs a half-line of`,
          `reaction before the Warden speaks. If it is not new, the opening should carry more`,
          `wariness than it currently does. Either way the first sentence is the one to change:`,
          ``,
          `<patch>`,
          `<before>${target0}</before>`,
          `<after>${tighten(target0)}</after>`,
          `<reason>Tightens the opening beat so the movement carries an attitude rather than only a position.</reason>`,
          `</patch>`,
          ``,
          `— ${agentName} (offline mock; add a provider in Settings for real responses)`,
        ].join('\n'),
      };
    }

    if (!material) {
      return {
        model: 'mock-writer-1',
        text:
          `I do not have any manuscript text in scope yet. Highlight a passage in the draft ` +
          `and ask again, and I will work from what you selected.\n\n` +
          `(Offline mock reply.)`,
      };
    }

    const target = verbatimSentence(material, firstSentence(material));
    const words = material.split(/\s+/).filter(Boolean).length;
    const rewritten = tighten(target);

    const text = [
      `Working from ${selection ? 'your selection' : 'the current scene'} — ${words} words.`,
      ``,
      question ? `On your question: ${firstSentence(question)}` : `Reading it cold:`,
      ``,
      `The passage moves, but the opening beat states an action where it could imply an ` +
      `attitude. The strongest line here is the last one; the weakest is the first, because ` +
      `it tells us where she is rather than what she has decided.`,
      ``,
      `One thing I cannot answer myself, so I am asking Continuity:`,
      ``,
      `<consult agent="continuity">Does Senna already recognise the imperial seal at this point in the story, or is this the first time she sees it?</consult>`,
      ``,
      `Here is the change I would make:`,
      ``,
      `<patch>`,
      `<before>${target}</before>`,
      `<after>${rewritten}</after>`,
      `<reason>Tightens the opening beat so the movement carries an attitude rather than only a position.</reason>`,
      `</patch>`,
      ``,
      `— ${agentName} (offline mock; add a provider in Settings for real responses)`,
    ].join('\n');

    return { model: 'mock-writer-1', text };
  },
};
