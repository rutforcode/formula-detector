/**
 * LatexDetector — finds raw LaTeX strings that LLMs embed in their output.
 *
 * Offline GPT models commonly produce math as:
 *
 *   Delimited:
 *     $$\frac{x^2}{y}$$          display math (double dollar)
 *     $E = mc^2$                  inline math (single dollar)
 *     \(E = mc^2\)                inline math (escaped parens)
 *     \[\int_0^1 f(x)\,dx\]      display math (escaped brackets)
 *
 *   Bare commands (no delimiters):
 *     \frac{a}{b}                 fraction
 *     \sqrt{x + 1}                square root
 *     \int_0^\infty e^{-x} dx     integral
 *     \sin(x)                     function call
 *
 * Unlike the PatternDetector which *converts* plain-text math to LaTeX,
 * this detector recognises LaTeX that is already written — it passes the
 * inner content straight through to MathJax with no conversion step.
 *
 * The detector is designed to run *before* the PatternDetector so that
 * dollar signs and backslashes inside LaTeX strings don't confuse the
 * pattern engine (the regions are marked as consumed).
 */

import type { DetectedFormula, FormulaDetector } from './types';

// ──────────────────────────────────────────────────────────────────────
//  Known LaTeX commands (used for bare-command detection).
// ──────────────────────────────────────────────────────────────────────

const KNOWN_COMMANDS = new Set([
  // Fractions, roots
  'frac', 'dfrac', 'tfrac', 'cfrac', 'sqrt', 'surd',
  // Big operators
  'int', 'iint', 'iiint', 'oint', 'sum', 'prod', 'coprod',
  'bigcup', 'bigcap', 'bigsqcup',
  // Sums/products with limits
  'lim', 'limsup', 'liminf', 'max', 'min', 'sup', 'inf',
  'argmax', 'argmin',
  // Trig / log
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'exp',
  // Greek letters (lowercase)
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon',
  'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa',
  'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho',
  'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi',
  'chi', 'psi', 'omega',
  // Greek letters (uppercase)
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
  'Upsilon', 'Phi', 'Psi', 'Omega',
  // Relations
  'le', 'ge', 'ne', 'approx', 'equiv', 'sim', 'simeq', 'cong',
  'propto', 'll', 'gg', 'prec', 'succ', 'preceq', 'succeq',
  'subset', 'supset', 'subseteq', 'supseteq', 'in', 'ni',
  'vdash', 'dashv', 'models',
  // Arrows
  'leftarrow', 'rightarrow', 'leftrightarrow', 'Leftarrow', 'Rightarrow',
  'Leftrightarrow', 'mapsto', 'to', 'gets', 'hookrightarrow', 'hookleftarrow',
  'uparrow', 'downarrow', 'updownarrow',
  // Misc symbols
  'infty', 'partial', 'nabla', 'forall', 'exists', 'nexists',
  'emptyset', 'varnothing', 'vartriangle', 'triangle',
  'angle', 'measuredangle', 'circ', 'star', 'dagger',
  'ldots', 'cdots', 'vdots', 'ddots',
  // Accents
  'hat', 'bar', 'vec', 'dot', 'ddot', 'tilde', 'widehat', 'widetilde',
  'overline', 'underline', 'overbrace', 'underbrace',
  // Delimiters
  'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
  'langle', 'rangle', 'lfloor', 'rfloor', 'lceil', 'rceil',
  'lbrace', 'rbrace',
  // Fonts / styling
  'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'mathcal',
  'mathbb', 'mathfrak', 'mathscr',
  'text', 'textrm', 'textbf', 'textit',
  'boldsymbol', 'bm',
  // Spacing
  'quad', 'qquad', 'enspace', 'thinspace',
  // Matrices / arrays
  'begin', 'end', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix',
  'cases', 'aligned', 'align', 'gather',
  // Boxed / colored
  'boxed', 'color', 'textcolor', 'colorbox', 'fcolorbox',
  // Misc
  'label', 'tag', 'notag', 'nonumber',
  'overset', 'underset',
  'xrightarrow', 'xleftarrow',
]);

// ──────────────────────────────────────────────────────────────────────
//  Command categories for argument consumption
// ──────────────────────────────────────────────────────────────────────

/** Commands that take two {…} groups: \frac{a}{b}, \binom{n}{k} */
const TWO_GROUP = new Set([
  'frac', 'dfrac', 'tfrac', 'cfrac', 'binom', 'dbinom', 'tbinom',
  'overset', 'underset',
]);

/** Commands that take one {…} group: \sqrt{x} */
const ONE_GROUP = new Set(['sqrt', 'surd']);

/** Commands that take a (…) function argument: \sin(x), \log(x) */
const FUNC_CALL = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'coth',
  'log', 'ln', 'exp',
  'lim', 'limsup', 'liminf',
  'max', 'min', 'sup', 'inf',
  'argmax', 'argmin',
]);

/** Commands with no mandatory args that may have _ and ^ scripts. */
const SCRIPTABLE = new Set([
  'int', 'iint', 'iiint', 'oint', 'sum', 'prod', 'coprod',
  'bigcup', 'bigcap', 'bigsqcup',
]);

// ──────────────────────────────────────────────────────────────────────
//  Delimited LaTeX patterns ($…$, $$…$$, \(…\), \[…\])
// ──────────────────────────────────────────────────────────────────────

interface DelimitedMatch {
  start: number;
  end: number;
  latex: string;
  display: boolean;
}

function findDelimited(text: string): DelimitedMatch[] {
  const results: DelimitedMatch[] = [];
  let m: RegExpExecArray | null;

  // $$…$$ (display, may span lines)
  const reDD = /\$\$([\s\S]*?)\$\$/g;
  while ((m = reDD.exec(text)) !== null) {
    results.push({
      start: m.index,
      end: m.index + m[0].length,
      latex: m[1].trim(),
      display: true,
    });
  }

  // \(…\) (inline, may span lines)
  const reInlineParen = /\\\(([\s\S]*?)\\\)/g;
  while ((m = reInlineParen.exec(text)) !== null) {
    results.push({
      start: m.index,
      end: m.index + m[0].length,
      latex: m[1].trim(),
      display: false,
    });
  }

  // \[…\] (display, may span lines)
  const reDisplayBracket = /\\\[([\s\S]*?)\\\]/g;
  while ((m = reDisplayBracket.exec(text)) !== null) {
    results.push({
      start: m.index,
      end: m.index + m[0].length,
      latex: m[1].trim(),
      display: true,
    });
  }

  // $…$ (inline, NO newlines inside) — after $$ is consumed.
  const consumed = new Set<number>();
  for (const r of results) {
    for (let i = r.start; i < r.end; i++) consumed.add(i);
  }

  const reSingleDollar = /(?<!\$)\$(?!\$)((?:[^$\\\n]|\\.)+?)\$(?!\$)/g;
  while ((m = reSingleDollar.exec(text)) !== null) {
    let overlap = false;
    for (let i = m.index; i < m.index + m[0].length; i++) {
      if (consumed.has(i)) { overlap = true; break; }
    }
    if (overlap) continue;

    const inner = m[1].trim();
    if (inner === '') continue;
    results.push({
      start: m.index,
      end: m.index + m[0].length,
      latex: inner,
      display: false,
    });
  }

  results.sort((a, b) => a.start - b.start);
  return results;
}

// ──────────────────────────────────────────────────────────────────────
//  Bare LaTeX command detection
// ──────────────────────────────────────────────────────────────────────

interface BareMatch {
  start: number;
  end: number;
  latex: string;
  display: boolean;
}

/**
 * Find a bare LaTeX command at position `pos` in `text`.
 * Returns the span and whether it looks like display math, or null.
 */
function matchBareCommand(text: string, pos: number): BareMatch | null {
  if (text[pos] !== '\\') return null;

  const next = pos + 1;
  if (next >= text.length) return null;
  const ch = text[next];
  // Skip delimiters: \( \) \[ \]
  if (ch === '(' || ch === ')' || ch === '[' || ch === ']') return null;

  // Read the command name.
  let nameEnd = next;
  while (nameEnd < text.length && /[a-zA-Z]/.test(text[nameEnd])) nameEnd++;
  const name = text.slice(next, nameEnd);
  if (name === '') return null;

  if (name === 'newcommand' || name === 'renewcommand' || name === 'def') return null;
  if (!KNOWN_COMMANDS.has(name)) return null;

  let pos2 = nameEnd;
  pos2 = skipOptionalArgs(text, pos2);

  // Consume arguments based on command category.
  if (TWO_GROUP.has(name)) {
    pos2 = skipBraceGroup(text, pos2);
    pos2 = skipBraceGroup(text, pos2);
  } else if (ONE_GROUP.has(name)) {
    pos2 = skipBraceGroup(text, pos2);
  } else if (FUNC_CALL.has(name)) {
    pos2 = skipParenArg(text, pos2);
  }
  // SCRIPTABLE and no-arg commands: no mandatory args.

  // Consume subscript/superscript (e.g. \int_0^1, \lim_{x->0}).
  while (pos2 < text.length && (text[pos2] === '_' || text[pos2] === '^')) {
    pos2++;
    pos2 = skipGroupSmart(text, pos2);
  }

  const fullText = text.slice(pos, pos2);
  const isDisplay = isDisplayBare(text, pos, pos2, name);

  return { start: pos, end: pos2, latex: fullText, display: isDisplay };
}

// ──────────────────────────────────────────────────────────────────────
//  Argument consumption helpers
// ──────────────────────────────────────────────────────────────────────

/** Skip optional arguments [...], handling nesting. */
function skipOptionalArgs(text: string, pos: number): number {
  let p = pos;
  while (p < text.length && text[p] === ' ') p++;
  if (p >= text.length || text[p] !== '[') return pos;

  let depth = 0;
  while (p < text.length) {
    if (text[p] === '\\') { p += 2; continue; }
    if (text[p] === '[') depth++;
    else if (text[p] === ']') { depth--; if (depth === 0) return p + 1; }
    p++;
  }
  return p;
}

/** Skip a mandatory {…} group. If not a brace, skip nothing. */
function skipBraceGroup(text: string, pos: number): number {
  while (pos < text.length && text[pos] === ' ') pos++;
  if (pos >= text.length || text[pos] !== '{') return pos;

  let depth = 0;
  let p = pos;
  while (p < text.length) {
    if (text[p] === '\\') { p += 2; continue; }
    if (text[p] === '{') depth++;
    else if (text[p] === '}') { depth--; if (depth === 0) return p + 1; }
    p++;
  }
  return p;
}

/** Skip a (…) argument (for function calls like \sin(x)). If not a paren, skip nothing. */
function skipParenArg(text: string, pos: number): number {
  while (pos < text.length && text[pos] === ' ') pos++;
  if (pos >= text.length || text[pos] !== '(') return pos;

  let depth = 0;
  let p = pos;
  while (p < text.length) {
    if (text[p] === '\\') { p += 2; continue; }
    if (text[p] === '(') depth++;
    else if (text[p] === ')') { depth--; if (depth === 0) return p + 1; }
    p++;
  }
  return p;
}

/**
 * Skip a {…} group or a single token (for _0, ^2, _{i=1}, ^{n}).
 * Used for subscript/superscript operands.
 */
function skipGroupSmart(text: string, pos: number): number {
  while (pos < text.length && text[pos] === ' ') pos++;
  if (pos >= text.length) return pos;

  if (text[pos] === '{') return skipBraceGroup(text, pos);
  if (text[pos] === '\\') {
    let p = pos + 1;
    while (p < text.length && /[a-zA-Z]/.test(text[p])) p++;
    return p;
  }
  return pos + 1;
}

/** Decide if a bare command is display math (own line, large operator). */
function isDisplayBare(text: string, start: number, end: number, name: string): boolean {
  if (!SCRIPTABLE.has(name)) return false;

  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nlAfter = text.indexOf('\n', end);
  const lineEnd = nlAfter === -1 ? text.length : nlAfter;
  const line = text.slice(lineStart, lineEnd).trim();
  const bare = text.slice(start, end).trim();
  return line === bare;
}

// ──────────────────────────────────────────────────────────────────────
//  Detector class
// ──────────────────────────────────────────────────────────────────────

export class LatexDetector implements FormulaDetector {
  readonly name = 'latex';

  detect(text: string): DetectedFormula[] {
    // 1. Find all delimited LaTeX strings.
    const delimited = findDelimited(text);

    const consumed = new Set<number>();
    for (const d of delimited) {
      for (let i = d.start; i < d.end; i++) consumed.add(i);
    }

    // 2. Find bare LaTeX commands in non-consumed regions.
    const bare: BareMatch[] = [];
    for (let i = 0; i < text.length; i++) {
      if (consumed.has(i)) continue;
      if (text[i] === '\\') {
        const m = matchBareCommand(text, i);
        if (m) {
          bare.push(m);
          for (let j = m.start; j < m.end; j++) consumed.add(j);
        }
      }
    }

    // 3. Merge into DetectedFormula[].
    const out: DetectedFormula[] = [];

    for (const d of delimited) {
      out.push({
        raw: text.slice(d.start, d.end),
        latex: d.latex,
        display: d.display,
        start: d.start,
        end: d.end,
      });
    }

    for (const b of bare) {
      out.push({
        raw: b.latex,
        latex: b.latex,
        display: b.display,
        start: b.start,
        end: b.end,
      });
    }

    out.sort((a, b) => a.start - b.start);
    return out;
  }
}
