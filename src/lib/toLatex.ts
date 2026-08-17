/**
 * Convert a detected math expression (plain text) into LaTeX for MathJax.
 *
 * The converter is a small recursive token walker, not a full TeX parser:
 *
 *  1. Tokens are grouped with balanced parentheses / brackets / braces.
 *  2. `^` / `_` become `^{...}` / `_{...}` superscripts & subscripts.
 *  3. A single top-level `/` between two "simple" sides becomes `\frac{...}{...}`.
 *  4. Known words (`pi`, `sin`, `lim`, …) and Unicode symbols (`∫`, `→`, …)
 *     are mapped to their LaTeX commands.
 *  5. Special notations are recognised: `sqrt(x)`, `lim(x→0)`, `Σ(i=1 to n)`.
 *
 * All user-controlled characters are either mapped through a fixed vocabulary
 * or escaped, so the generated LaTeX can never smuggle in a TeX command.
 */

import { tokenize, buildParenMatch, type Token } from './tokenizer';
import {
  WORD_TO_LATEX,
  SYMBOL_TO_LATEX,
  FUNCTION_TRIGGER_WORDS,
} from './mathVocab';

/** Operators that split an expression into segments (and get space padding). */
const SEPARATORS = new Set(['+', '-', '=', '<', '>', '≤', '≥', '≠', '≈', '→', '↦']);

/** The same relational symbols, but tokenized as Unicode symbols (type 'sym'). */
const SEPARATOR_SYMS = new Set(['→', '↦', '≤', '≥', '≠', '≈', '±']);

/** True for an arrow token, regardless of how it was tokenised. */
function isArrow(t: Token): boolean {
  return t.value === '→' || t.value === '↦';
}

/** Escape a single character that would otherwise be dangerous in LaTeX. */
function escapeChar(ch: string): string {
  switch (ch) {
    case '&': return '\\&';
    case '%': return '\\%';
    case '#': return '\\#';
    case '$': return '\\$';
    case '_': return '\\_';
    case '^': return '\\^{}';
    case '{': return '\\{';
    case '}': return '\\}';
    case '~': return '\\sim ';
    case '\\': return '\\backslash ';
    case '"': return "''";
    default: return ch;
  }
}

function nextNonSpace(tokens: Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) if (tokens[i].type !== 'space') return i;
  return -1;
}

function findToken(tokens: Token[], from: number, to: number, pred: (t: Token) => boolean): number {
  for (let i = from; i < to; i++) if (pred(tokens[i])) return i;
  return -1;
}

/** True when the token can be a `^`/`_` operand (number, word, symbol, group). */
function isAtom(t: Token): boolean {
  return t.type === 'num' || t.type === 'sym' || (t.type === 'word' && t.value.length <= 1) || t.type === 'paren';
}

export function toLatex(raw: string): string {
  const tokens = tokenize(raw);
  const match = buildParenMatch(tokens);
  return convertRange(tokens, match, 0, tokens.length);
}

function convertRange(tokens: Token[], match: Int32Array, start: number, end: number): string {
  const seg: string[] = [];
  const out: string[] = [];
  let i = start;

  const flush = () => {
    if (seg.length > 0) {
      const s = fractionate(seg).trimEnd();
      if (s !== '') out.push(s);
    }
    seg.length = 0;
  };

  while (i < end) {
    const tok = tokens[i];
    switch (tok.type) {
      case 'space':
        // Keep interior spaces for readability; drop leading/trailing ones.
        if (seg.length > 0) seg.push(' ');
        i++;
        break;
      case 'punct':
        seg.push(escapeChar(tok.value));
        i++;
        break;
      case 'num':
        seg.push(tok.value);
        i++;
        break;

      case 'sym': {
        // Relational symbols tokenised as 'sym' (→, ≤, …) still split segments.
        if (SEPARATOR_SYMS.has(tok.value)) {
          flush();
          out.push(` ${latexOperator(tok.value)} `);
          i++;
          break;
        }
        // Sum/product with "(i = 1 to n)" shorthand: Σ(i=1 to n) → \sum_{i=1}^{n}
        const isSumSym = tok.value === 'Σ' || tok.value === '∑' || tok.value === '∏';
        if (isSumSym && i + 1 < end) {
          const g = nextNonSpace(tokens, i + 1);
          if (g !== -1 && tokens[g].type === 'paren' && tokens[g].value === '(' && match[g] !== -1 && match[g] < end) {
            const toIdx = findToken(tokens, g + 1, match[g], (t) => t.type === 'word' && t.value.toLowerCase() === 'to');
            if (toIdx !== -1) {
              const before = convertRange(tokens, match, g + 1, toIdx);
              const after = convertRange(tokens, match, toIdx + 1, match[g]);
              const op = tok.value === '∏' ? '\\prod' : '\\sum';
              seg.push(`${op}_{${before}}^{${after}}`);
              i = match[g] + 1;
              break;
            }
          }
        }
        // √x → \sqrt{x}
        if (tok.value === '√' && i + 1 < end && isAtom(tokens[i + 1])) {
          const a = convertAtom(tokens, match, i + 1, end, false);
          seg.push(`\\sqrt{${a.text}}`);
          i = a.next;
          break;
        }
        seg.push(SYMBOL_TO_LATEX[tok.value] ?? escapeChar(tok.value));
        i++;
        break;
      }

      case 'op': {
        if (tok.value === '^' || tok.value === '_') {
          const a = convertAtom(tokens, match, i + 1, end, true);
          if (a.text === null) {
            seg.push(escapeChar(tok.value));
            i++;
          } else {
            seg.push(tok.value === '^' ? `^{${a.text}}` : `_{${a.text}}`);
            i = a.next;
          }
        } else if (SEPARATORS.has(tok.value)) {
          // Leading '+' / '-' on a fresh segment is a sign, not a separator.
          if ((tok.value === '+' || tok.value === '-') && seg.length === 0) {
            seg.push(tok.value);
          } else {
            flush();
            out.push(` ${latexOperator(tok.value)} `);
          }
          i++;
        } else {
          // '/', '*', '|', … — kept literally, `/` handled at segment flush.
          seg.push(latexOperator(tok.value));
          i++;
        }
        break;
      }

      case 'paren': {
        if (tok.value === '(' || tok.value === '[' || tok.value === '{') {
          const m = match[i];
          if (m !== -1 && m < end) {
            const inner = convertRange(tokens, match, i + 1, m);
            seg.push(pair(tok.value).open + inner + pair(tok.value).close);
            i = m + 1;
          } else {
            seg.push(escapeChar(tok.value));
            i++;
          }
        } else {
          seg.push(escapeChar(tok.value));
          i++;
        }
        break;
      }

      case 'word': {
        const w = convertWord(tokens, match, i, end);
        seg.push(w.text);
        i = w.next;
        break;
      }
    }
  }

  flush();
  return out.join('');
}

function pair(ch: string): { open: string; close: string } {
  switch (ch) {
    case '(': return { open: '(', close: ')' };
    case '[': return { open: '[', close: ']' };
    case '{': return { open: '{', close: '}' };
    default: return { open: ch, close: ch };
  }
}

/** Convert a single atom (operand of `^`/`_`/`√`). */
function convertAtom(
  tokens: Token[],
  match: Int32Array,
  idx: number,
  end: number,
  stripParens: boolean,
): { text: string | null; next: number } {
  if (idx >= end) return { text: null, next: idx };
  const tok = tokens[idx];
  if (tok.type === 'num') return { text: tok.value, next: idx + 1 };
  if (tok.type === 'sym') {
    if (tok.value === '√') return { text: '\\sqrt{}', next: idx + 1 };
    return { text: SYMBOL_TO_LATEX[tok.value] ?? escapeChar(tok.value), next: idx + 1 };
  }
  if (tok.type === 'word') {
    const w = convertWord(tokens, match, idx, end);
    return { text: w.text, next: w.next };
  }
  if (tok.type === 'paren' && (tok.value === '(' || tok.value === '[' || tok.value === '{')) {
    const m = match[idx];
    if (m !== -1 && m < end) {
      const inner = convertRange(tokens, match, idx + 1, m);
      if (stripParens) return { text: inner, next: m + 1 };
      return { text: pair(tok.value).open + inner + pair(tok.value).close, next: m + 1 };
    }
  }
  return { text: null, next: idx };
}

/** Convert a word token, handling function calls and special notations. */
function convertWord(
  tokens: Token[],
  match: Int32Array,
  idx: number,
  end: number,
): { text: string; next: number } {
  const word = tokens[idx].value;
  const lower = word.toLowerCase();

  // Is this a known function name directly followed by "(...)"?
  const g = nextNonSpace(tokens, idx + 1);
  if (g !== -1 && g < end && tokens[g].type === 'paren' && tokens[g].value === '(' && match[g] !== -1 && match[g] < end) {
    const innerStart = g + 1;
    const innerEnd = match[g];
    const inner = convertRange(tokens, match, innerStart, innerEnd);

    if (lower === 'sqrt') return { text: `\\sqrt{${inner}}`, next: innerEnd + 1 };
    if (lower === 'abs') return { text: `\\left|${inner}\\right|`, next: innerEnd + 1 };

    if (lower === 'lim') {
      const arrow = findToken(tokens, innerStart, innerEnd, isArrow);
      if (arrow !== -1) {
        const before = convertRange(tokens, match, innerStart, arrow);
        const after = convertRange(tokens, match, arrow + 1, innerEnd);
        return { text: `\\lim_{${before} \\to ${after}}`, next: innerEnd + 1 };
      }
      return { text: `\\lim(${inner})`, next: innerEnd + 1 };
    }

    if (lower === 'sum') {
      const toIdx = findToken(tokens, innerStart, innerEnd, (t) => t.type === 'word' && t.value.toLowerCase() === 'to');
      if (toIdx !== -1) {
        const before = convertRange(tokens, match, innerStart, toIdx);
        const after = convertRange(tokens, match, toIdx + 1, innerEnd);
        return { text: `\\sum_{${before}}^{${after}}`, next: innerEnd + 1 };
      }
      return { text: `\\sum(${inner})`, next: innerEnd + 1 };
    }

    if (FUNCTION_TRIGGER_WORDS.has(lower)) {
      return { text: `\\${lower}(${inner})`, next: innerEnd + 1 };
    }
  }

  // Plain word: known math word → command; single letter → variable; else escaped.
  const mapped = WORD_TO_LATEX[lower];
  if (mapped !== undefined) return { text: mapped, next: idx + 1 };
  if (lower.length === 1) return { text: word, next: idx + 1 };
  return { text: escapeWord(word), next: idx + 1 };
}

function escapeWord(word: string): string {
  let out = '';
  for (const ch of word) out += escapeChar(ch);
  return out;
}

function latexOperator(op: string): string {
  switch (op) {
    case '≤': return '\\le';
    case '≥': return '\\ge';
    case '≠': return '\\ne';
    case '≈': return '\\approx';
    case '→': return '\\to';
    case '↦': return '\\mapsto';
    case '±': return '\\pm';
    case '·': return '\\cdot';
    case '×': return '\\times';
    case '÷': return '\\div';
    default: return op;
  }
}

/**
 * Turn a segment (no top-level + - = etc.) into LaTeX, converting a single
 * `/` into a `\frac{...}{...}`. When the segment starts with an operator that
 * carries limits (`\lim`, `\sum`), the fraction applies to the body after it,
 * so `lim(x→0) sin(x)/x` becomes `\lim_{x→0} \frac{\sin(x)}{x}`.
 */
function fractionate(seg: string[]): string {
  const slash: number[] = [];
  seg.forEach((p, idx) => {
    if (p === '/') slash.push(idx);
  });

  if (slash.length === 1) {
    const k = slash[0];
    if (k > 0 && k < seg.length - 1) {
      let left = seg.slice(0, k).join('').trim();
      let right = seg.slice(k + 1).join('').trim();
      if (left !== '' && right !== '') {
        // A single wrapping group around the numerator/denominator is
        // redundant inside \frac{...}, so (a+b)/c → \frac{a + b}{c}.
        const numPieces = seg.slice(0, k);
        const denPieces = seg.slice(k + 1);
        if (numPieces.length === 1 && isGroupWrap(numPieces[0])) left = numPieces[0].slice(1, -1);
        if (denPieces.length === 1 && isGroupWrap(denPieces[0])) right = denPieces[0].slice(1, -1);
        // Does the left side start with an operator-with-limits (lim/sum)?
        const m = /^\\(lim|sum|prod)(?:_\{[^{}]*\})?(?:\^\{[^{}]*\})?\s/.exec(left);
        if (m) {
          const op = left.slice(0, m[0].length).trimEnd();
          const body = left.slice(m[0].length);
          return `${op} \\frac{${body}}{${right}}`;
        }
        return `\\frac{${left}}{${right}}`;
      }
    }
  }
  return seg.join('').trimEnd();
}

/** True when a piece is a self-contained parenthesised group like "(a + b)". */
function isGroupWrap(piece: string): boolean {
  return (
    (piece.startsWith('(') && piece.endsWith(')')) ||
    (piece.startsWith('[') && piece.endsWith(']'))
  );
}
