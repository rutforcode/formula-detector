/**
 * Tokenizer for the pattern detector.
 *
 * Splits raw text into small tokens so the detector can reason about
 * "math-ish" vs "prose-ish" neighbourhoods without doing string surgery.
 */

import { MATH_SYMBOLS, MATH_OPERATORS } from './mathVocab';

export type TokenType =
  | 'word' // letter runs ("pi", "area", "dx")
  | 'num' // numbers, incl. decimals ("5", "3.14")
  | 'op' // math operators ("^", "=", "+", "/", "→", …)
  | 'sym' // single math symbols ("∫", "π", "∞", …)
  | 'paren' // "( ) [ ] { }"
  | 'punct' // sentence punctuation (".", ",", ";", ":", "!", "?", …)
  | 'space'; // whitespace (kept verbatim, includes newlines)

export interface Token {
  type: TokenType;
  value: string;
  /** Offset of the first character of the token in the source text. */
  start: number;
  /** Offset one past the last character of the token. */
  end: number;
}

const LETTER_RE = /[\p{L}]/u;

/**
 * Tokenise `text`. Every character of `text` ends up in exactly one token, so
 * spans can be sliced back out of the original text by index afterwards.
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (/\s/.test(ch)) {
      let j = i;
      while (j < text.length && /\s/.test(text[j])) j++;
      tokens.push({ type: 'space', value: text.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    if (MATH_SYMBOLS.has(ch)) {
      // Single Unicode math symbol (π, ∫, ∞, ², …) — check before letters,
      // because some of these (π, α, …) are Unicode letters.
      tokens.push({ type: 'sym', value: ch, start: i, end: i + 1 });
      i++;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      // Include one decimal point if it sits between digits (3.14).
      if (text[j] === '.' && j + 1 < text.length && /[0-9]/.test(text[j + 1])) {
        j++;
        while (j < text.length && /[0-9]/.test(text[j])) j++;
      }
      tokens.push({ type: 'num', value: text.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    if (LETTER_RE.test(ch)) {
      let j = i;
      while (j < text.length && LETTER_RE.test(text[j]) && !MATH_SYMBOLS.has(text[j])) j++;
      tokens.push({ type: 'word', value: text.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }

    if ('()[]{}'.includes(ch)) {
      tokens.push({ type: 'paren', value: ch, start: i, end: i + 1 });
      i++;
      continue;
    }

    if (MATH_OPERATORS.has(ch)) {
      tokens.push({ type: 'op', value: ch, start: i, end: i + 1 });
      i++;
      continue;
    }

    // Anything left over is punctuation.
    tokens.push({ type: 'punct', value: ch, start: i, end: i + 1 });
    i++;
  }

  return tokens;
}

/**
 * Map each paren token to the index of its matching paren, or -1 when it has
 * no match within the token list.
 */
export function buildParenMatch(tokens: Token[]): Int32Array {
  const match = new Int32Array(tokens.length).fill(-1);
  const stack: number[] = [];
  const open = { '(': ')', '[': ']', '{': '}' };
  const close = { ')': '(', ']': '[', '}': '{' };
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'paren') continue;
    const ch = tokens[i].value;
    if (ch in open) {
      stack.push(i);
    } else if (stack.length > 0) {
      const openIdx = stack.pop()!;
      if (tokens[openIdx].value === close[ch as keyof typeof close]) {
        match[openIdx] = i;
        match[i] = openIdx;
      }
    }
  }
  return match;
}
