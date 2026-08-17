/**
 * PatternDetector — local, dependency-free formula detection.
 *
 * Strategy (heuristic, no LLM / network):
 *
 *  1. TOKENISE the text into words, numbers, operators, symbols, parens and
 *     punctuation (see tokenizer.ts).
 *  2. FIND TRIGGERS — small tokens that strongly indicate math:
 *       - operators:  ^ _ = < > ≤ ≥ ≠ ≈ → ↦ ± · × ÷
 *       - symbols:    ∫ Σ ∏ √ ∞ π ∂ ∇ ∈ … (they render as themselves, so
 *                     converting them is always harmless)
 *       - function words directly followed by a parenthesised argument:
 *                     sqrt(x), sin(x), lim(x→0), …
 *       - a `/` sitting between two atoms:  a/b, (a+b)/c, n(n+1)/2
 *     Ordinary prose (letters with no math context) produces no triggers.
 *  3. EXPAND each trigger left/right, swallowing only "math-ish" neighbours:
 *       - numbers, symbols, operators, balanced parentheses
 *       - single letters (variables) and known math words (pi, sin, dx, …)
 *     Everything else — words longer than one letter, punctuation, sentence
 *     starts — acts as a wall and stops the span. This is the main guard
 *     against converting natural language.
 *  4. MERGE overlapping spans, DROP spans with no math content and spans that
 *     contain unknown words of 3+ letters (e.g. "(the answer is x = 5)").
 *  5. Mark a formula as DISPLAY (block) when it occupies its own line.
 *  6. Convert each kept span to LaTeX via toLatex().
 *
 * The detector is pure (no DOM), so it is fully unit-testable and could be
 * swapped for an LLM-based implementation later (see FormulaDetector in
 * types.ts and the llmDetector.ts stub).
 */

import { tokenize, buildParenMatch, type Token } from './tokenizer';
import { normalizeMathWord, FUNCTION_TRIGGER_WORDS, MATH_SYMBOLS } from './mathVocab';
import { toLatex } from './toLatex';
import type { DetectedFormula, FormulaDetector } from './types';

/** Operator characters that are strong math triggers. */
const TRIGGER_OPS = new Set(['^', '_', '=', '<', '>', '≤', '≥', '≠', '≈', '→', '↦', '±', '×', '÷', '·']);

/** Relations a formula should never *start* with (e.g. the `=` in "src=x"). */
const RELATION_START = new Set(['=', '<', '>', '≤', '≥', '≠', '≈', '→', '↦']);

function nextNonSpace(tokens: Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) if (tokens[i].type !== 'space') return i;
  return -1;
}

function prevNonSpace(tokens: Token[], from: number): number {
  for (let i = from; i >= 0; i--) if (tokens[i].type !== 'space') return i;
  return -1;
}

/** A token counts as an "atom" for the `a/b` fraction rule. */
function isAtom(t: Token): boolean {
  return (
    t.type === 'num' ||
    t.type === 'sym' ||
    (t.type === 'word' && t.value.length <= 1) ||
    t.type === 'paren'
  );
}

/** Decide whether a token can act as a formula trigger. */
function isTrigger(tokens: Token[], i: number, match: Int32Array): boolean {
  const t = tokens[i];

  if (t.type === 'op') {
    // A slash is a trigger only between two atoms: a/b, (a+b)/c, 24/7.
    // "input/output" or "and/or" never trigger because the neighbours are
    // ordinary words.
    if (t.value === '/') {
      const prev = prevNonSpace(tokens, i - 1);
      const next = nextNonSpace(tokens, i + 1);
      return prev !== -1 && next !== -1 && isAtom(tokens[prev]) && isAtom(tokens[next]);
    }
    // Underscore only when it looks like a subscript (x_1, a_i) — never in
    // identifiers such as foo_bar.
    if (t.value === '_') {
      const next = nextNonSpace(tokens, i + 1);
      if (next === -1) return false;
      const nt = tokens[next];
      return (
        nt.type === 'num' ||
        nt.type === 'sym' ||
        (nt.type === 'word' && nt.value.length === 1) ||
        (nt.type === 'paren' && nt.value === '{')
      );
    }
    return TRIGGER_OPS.has(t.value);
  }

  if (t.type === 'sym') {
    // Every Unicode math symbol is a trigger; they render identically when
    // converted, so this is always safe (π → \pi, ∞ → \infty, …).
    return MATH_SYMBOLS.has(t.value);
  }

  if (t.type === 'word') {
    const lower = normalizeMathWord(t.value);
    if (lower !== null && FUNCTION_TRIGGER_WORDS.has(lower)) {
      const next = nextNonSpace(tokens, i + 1);
      // Only trigger when directly followed by a *balanced* argument group:
      // sqrt(x) yes, "the sum of" no.
      return next !== -1 && tokens[next].type === 'paren' && tokens[next].value === '(' && match[next] !== -1;
    }
  }

  return false;
}

/**
 * Is the token at `idx` allowed inside a formula span, given the span is
 * currently [lo..hi]? `dir` is the direction we would expand towards.
 */
function includable(
  tokens: Token[],
  idx: number,
  dir: 'left' | 'right',
  lo: number,
  hi: number,
  match: Int32Array,
): boolean {
  const t = tokens[idx];
  switch (t.type) {
    case 'num':
    case 'sym':
    case 'op':
      return true;

    case 'word':
      // Single letters are variables; known words (pi, sin, dx, …) are math;
      // anything else is prose and stops the span.
      if (t.value.length === 1) return true;
      if (normalizeMathWord(t.value) !== null) return true;
      // Two-letter unknown words ("mc" in mc^2, "ab" in (ab)/c) are usually
      // variable products — allow them when glued to a math token. Longer
      // words and spaced-out words stay prose ("is", "and/or", "key=value").
      if (t.value.length === 2) {
        const left = idx > 0 ? tokens[idx - 1] : null;
        const right = idx + 1 < tokens.length ? tokens[idx + 1] : null;
        return (
          (left !== null && isMathToken(left)) ||
          (right !== null && isMathToken(right))
        );
      }
      return false;

    case 'punct':
    case 'space': // never called with spaces, but keep the union exhaustive
      return false;

    case 'paren':
      if (dir === 'right') {
        // Only an opening bracket can extend the span to the right, and only
        // when it has a matching closer (whole group jumps in).
        return t.value === '(' && match[hi + 1] !== -1;
      }
      // Expanding left: a closing bracket jumps to its opener. An opening
      // bracket is only taken when its match lies beyond the span's right
      // edge, so the whole group (e.g. "(x = 5)") comes in together.
      if (t.value === ')') return match[lo - 1] !== -1;
      return match[lo - 1] !== -1 && match[lo - 1] > hi;
  }
}

/** Numbers, operators, symbols and brackets all count as math context. */
function isMathToken(t: Token): boolean {
  return t.type === 'num' || t.type === 'op' || t.type === 'sym' || t.type === 'paren';
}

function hasLineBreak(ws: string): boolean {
  return ws.includes('\n') || ws.includes('\r');
}

/** Greedily expand a span around a trigger index. */
function expand(tokens: Token[], idx: number, match: Int32Array): [number, number] {
  let lo = idx;
  let hi = idx;

  for (;;) {
    let grew = false;

    // ---- extend right ----
    if (hi + 1 < tokens.length) {
      const next = tokens[hi + 1];
      if (next.type === 'space') {
        // Spaces bridge the span; line breaks never do — formulas on separate
        // lines must not merge into a single (broken) formula.
        if (!hasLineBreak(next.value)) {
          const j = nextNonSpace(tokens, hi + 2);
          if (j !== -1 && includable(tokens, j, 'right', lo, hi, match)) {
            hi++;
            grew = true;
          }
        }
      } else if (includable(tokens, hi + 1, 'right', lo, hi, match)) {
        if (next.type === 'paren' && next.value === '(') hi = match[hi + 1];
        else hi++;
        grew = true;
      }
    }

    // ---- extend left ----
    if (lo - 1 >= 0) {
      const prev = tokens[lo - 1];
      if (prev.type === 'space') {
        if (!hasLineBreak(prev.value)) {
          const j = prevNonSpace(tokens, lo - 2);
          if (j !== -1 && includable(tokens, j, 'left', lo, hi, match)) {
            lo--;
            grew = true;
          }
        }
      } else if (includable(tokens, lo - 1, 'left', lo, hi, match)) {
        if (prev.type === 'paren') {
          const m = match[lo - 1];
          if (prev.value === ')') lo = m;
          else {
            lo = lo - 1;
            hi = Math.max(hi, m);
          }
        } else {
          lo--;
        }
        grew = true;
      }
    }

    if (!grew) break;
  }

  return [lo, hi];
}

/** Does the span contain at least one piece of real math content? */
function hasContent(tokens: Token[], lo: number, hi: number): boolean {
  for (let i = lo; i <= hi; i++) {
    const t = tokens[i];
    if (t.type === 'num' || t.type === 'sym' || t.type === 'paren') return true;
    if (t.type === 'word' && (t.value.length === 1 || normalizeMathWord(t.value) !== null)) return true;
  }
  return false;
}

/**
 * Reject spans that smuggled in ordinary English words via a parenthesised
 * group — e.g. "(the answer is x = 5)" — while allowing short connectors like
 * "to" inside "Σ(i=1 to n)".
 */
function hasOnlyMathWords(tokens: Token[], lo: number, hi: number): boolean {
  for (let i = lo; i <= hi; i++) {
    const t = tokens[i];
    if (t.type === 'word' && t.value.length >= 3 && normalizeMathWord(t.value) === null) {
      return false;
    }
  }
  return true;
}

/** True when the span sits alone on its own line (block math). */
function isOwnLine(text: string, start: number, end: number, raw: string): boolean {
  if (raw.includes('\n') || raw.includes('\r')) return false;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nl = text.indexOf('\n', end);
  const lineEnd = nl === -1 ? text.length : nl;
  const line = text.slice(lineStart, lineEnd);
  return line.trim() !== '' && line.trim() === raw.trim();
}

export class PatternDetector implements FormulaDetector {
  readonly name = 'pattern';

  detect(text: string): DetectedFormula[] {
    const tokens = tokenize(text);
    const match = buildParenMatch(tokens);

    // 1. Find triggers.
    const spans: Array<[number, number]> = [];
    for (let i = 0; i < tokens.length; i++) {
      if (isTrigger(tokens, i, match)) {
        spans.push(expand(tokens, i, match));
      }
    }

    // 2. Merge overlapping / adjacent spans, in document order.
    spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const merged: Array<[number, number]> = [];
    for (const [s, e] of spans) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) {
        last[1] = Math.max(last[1], e);
      } else {
        merged.push([s, e]);
      }
    }

    // 3. Validate and build the result.
    const out: DetectedFormula[] = [];
    for (const [s, e] of merged) {
      if (!hasContent(tokens, s, e)) continue;
      if (!hasOnlyMathWords(tokens, s, e)) continue;
      // A span that starts with a relation is a fragment, not a formula:
      // "src=x" or "key = value"-style leftovers get dropped. (A formula
      // like "x = 5" starts with its left-hand side, so it is unaffected.)
      let first = s;
      while (tokens[first].type === 'space') first++;
      if (tokens[first].type === 'op' && RELATION_START.has(tokens[first].value)) continue;
      const raw = text.slice(tokens[s].start, tokens[e].end);
      const latex = toLatex(raw);
      if (latex.trim() === '') continue;
      out.push({
        raw,
        latex,
        display: isOwnLine(text, tokens[s].start, tokens[e].end, raw),
        start: tokens[s].start,
        end: tokens[e].end,
      });
    }
    return out;
  }
}
