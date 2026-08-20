import { describe, it, expect } from 'vitest';
import { LatexDetector } from './latexDetector';

const det = new LatexDetector();

function detect(text: string) {
  return det.detect(text);
}

function latexes(text: string): string[] {
  return detect(text).map((f) => f.latex);
}

function displays(text: string): boolean[] {
  return detect(text).map((f) => f.display);
}

// ──────────────────────────────────────────────────────────────────────
//  Delimited LaTeX — double dollar
// ──────────────────────────────────────────────────────────────────────

describe('LatexDetector: $$…$$ display math', () => {
  it('detects simple display math', () => {
    expect(latexes('$$x^2 + y^2 = z^2$$')).toEqual(['x^2 + y^2 = z^2']);
  });

  it('marks as display', () => {
    expect(displays('$$E = mc^2$$')).toEqual([true]);
  });

  it('detects display math in context', () => {
    const text = 'Here is the integral:\n$$\\int_0^1 x^2 dx = \\frac{1}{3}$$\nDone.';
    const f = detect(text);
    expect(f.length).toBe(1);
    expect(f[0].latex).toBe('\\int_0^1 x^2 dx = \\frac{1}{3}');
    expect(f[0].display).toBe(true);
    expect(text.slice(f[0].start, f[0].end)).toBe('$$\\int_0^1 x^2 dx = \\frac{1}{3}$$');
  });

  it('handles multiline content inside $$', () => {
    const f = detect('$$\\begin{aligned}\na &= b \\\\\\\\\nc &= d\n\\end{aligned}$$');
    expect(f.length).toBe(1);
    expect(f[0].latex).toContain('\\begin{aligned}');
    expect(f[0].display).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────
//  Delimited LaTeX — single dollar
// ──────────────────────────────────────────────────────────────────────

describe('LatexDetector: $…$ inline math', () => {
  it('detects inline math', () => {
    expect(latexes('The value is $x = 5$ now.')).toEqual(['x = 5']);
  });

  it('marks as inline (not display)', () => {
    expect(displays('$E = mc^2$')).toEqual([false]);
  });

  it('does not cross line boundaries', () => {
    const f = detect('bad $x = 5\n+ y = z$ end');
    expect(f.length).toBe(0);
  });

  it('handles complex inline content', () => {
    expect(latexes('$\\frac{a}{b} + \\sqrt{c}$')).toEqual(['\\frac{a}{b} + \\sqrt{c}']);
  });

  it('skips empty dollar pairs', () => {
    expect(latexes('double $$ end')).toEqual([]);
  });

  it('detects multiple inline formulas', () => {
    expect(latexes('If $a > 0$ and $b < 1$, then…')).toEqual(['a > 0', 'b < 1']);
  });
});

// ──────────────────────────────────────────────────────────────────────
//  Delimited LaTeX — \(…\) and \[…\]
// ──────────────────────────────────────────────────────────────────────

describe('LatexDetector: \\(…\\) and \\[…\\]', () => {
  it('detects inline with escaped parens', () => {
    const f = detect('Use \\(x^2\\) here.');
    expect(f.length).toBe(1);
    expect(f[0].latex).toBe('x^2');
    expect(f[0].display).toBe(false);
  });

  it('detects display with escaped brackets', () => {
    const f = detect('$$\\int_0^1 f(x) dx$$ and \\[\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\\] done.');
    expect(f.length).toBe(2);
    expect(f[0].display).toBe(true);  // $$…$$
    expect(f[1].display).toBe(true);  // \[…\]
    expect(f[1].latex).toBe('\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}');
  });
});

// ──────────────────────────────────────────────────────────────────────
//  Bare LaTeX commands (no delimiters)
// ──────────────────────────────────────────────────────────────────────

describe('LatexDetector: bare \\command', () => {
  it('detects \\frac with two groups', () => {
    const f = detect('The answer is \\frac{a}{b} here.');
    expect(f.length).toBe(1);
    expect(f[0].latex).toBe('\\frac{a}{b}');
    expect(f[0].display).toBe(false);
  });

  it('detects \\sqrt with one group', () => {
    const f = detect('Compute \\sqrt{x^2 + 1}.');
    expect(f.length).toBe(1);
    expect(f[0].latex).toBe('\\sqrt{x^2 + 1}');
  });

  it('detects \\sin with parens', () => {
    const f = detect('Evaluate \\sin(x) at x = 0.');
    expect(f.length).toBe(1);
    expect(f[0].latex).toBe('\\sin(x)');
  });

  it('detects \\int with sub/superscripts', () => {
    const f = detect('\\int_0^1 x^2 dx');
    expect(f.length).toBe(1);
    // Bare command captures \int_0^1 (command + scripts), not trailing text
    expect(f[0].latex).toBe('\\int_0^1');
  });

  it('detects \\frac inside a sentence without delimiters', () => {
    const text = 'The derivative is \\frac{dy}{dx} = 2x.';
    const f = detect(text);
    expect(f.length).toBe(1);
    expect(f[0].latex).toBe('\\frac{dy}{dx}');
  });

  it('detects multiple bare commands', () => {
    const text = '\\frac{1}{2} + \\sqrt{3}';
    const f = detect(text);
    expect(f.length).toBe(2);
    expect(f[0].latex).toBe('\\frac{1}{2}');
    expect(f[1].latex).toBe('\\sqrt{3}');
  });

  it('detects \\lim with subscript', () => {
    const f = detect('\\lim_{x->0} \\frac{sin(x)}{x}');
    expect(f.length).toBe(2);
    expect(f[0].latex).toBe('\\lim_{x->0}');
    expect(f[1].latex).toBe('\\frac{sin(x)}{x}');
  });

  it('detects \\sum with scripts', () => {
    const f = detect('\\sum_{i=1}^{n} i');
    expect(f.length).toBe(1);
    expect(f[0].latex).toBe('\\sum_{i=1}^{n}');
  });
});

// ──────────────────────────────────────────────────────────────────────
//  Mixed: delimited + bare + natural language
// ──────────────────────────────────────────────────────────────────────

describe('LatexDetector: mixed content', () => {
  it('handles delimited and bare in the same text', () => {
    const text = 'We have $a = b$ and also \\frac{1}{2}.';
    const f = detect(text);
    expect(f.length).toBe(2);
    expect(f[0].latex).toBe('a = b');
    expect(f[1].latex).toBe('\\frac{1}{2}');
  });

  it('does not double-detect delimited LaTeX', () => {
    const text = 'Formula: $\\frac{a}{b}$';
    const f = detect(text);
    expect(f.length).toBe(1);
    expect(f[0].latex).toBe('\\frac{a}{b}');
  });

  it('returns empty for plain prose', () => {
    expect(detect('Hello world, this is just text.')).toEqual([]);
  });

  it('returns empty for code-like backslashes', () => {
    expect(detect('Use \\n for newline in C.')).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
//  Position tracking
// ──────────────────────────────────────────────────────────────────────

describe('LatexDetector: position tracking', () => {
  it('tracks correct start/end offsets for delimited', () => {
    const text = 'prefix $x = 1$ suffix';
    const f = detect(text);
    expect(f.length).toBe(1);
    expect(text.slice(f[0].start, f[0].end)).toBe('$x = 1$');
  });

  it('tracks correct start/end offsets for bare command', () => {
    const text = 'hello \\frac{a}{b} world';
    const f = detect(text);
    expect(f.length).toBe(1);
    expect(text.slice(f[0].start, f[0].end)).toBe('\\frac{a}{b}');
  });
});

// ──────────────────────────────────────────────────────────────────────
//  Edge cases
// ──────────────────────────────────────────────────────────────────────

describe('LatexDetector: edge cases', () => {
  it('handles adjacent formulas', () => {
    const text = '$a$ $b$';
    const f = detect(text);
    expect(f.length).toBe(2);
  });

  it('handles empty input', () => {
    expect(detect('')).toEqual([]);
  });

  it('handles \\alpha and other single-symbol commands', () => {
    const f = detect('\\alpha + \\beta = \\gamma');
    expect(f.length).toBe(3);
    expect(f[0].latex).toBe('\\alpha');
    expect(f[1].latex).toBe('\\beta');
    expect(f[2].latex).toBe('\\gamma');
  });
});
