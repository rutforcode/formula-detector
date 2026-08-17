import { describe, it, expect } from 'vitest';
import { PatternDetector } from './patternDetector';
import type { DetectedFormula } from './types';

const detector = new PatternDetector();

function detect(text: string): DetectedFormula[] {
  return detector.detect(text);
}

/** Convenience: latex of every detected formula. */
function latexes(text: string): string[] {
  return detect(text).map((f) => f.latex);
}

describe('PatternDetector — formulas inside prose', () => {
  it('detects the example: area of a circle', () => {
    const text = 'The area of a circle is A = pi r^2. If r = 5, then A = 25pi.';
    const found = detect(text);
    expect(found.map((f) => f.raw)).toEqual(['A = pi r^2', 'r = 5', 'A = 25pi']);
    expect(found.map((f) => f.latex)).toEqual(['A = \\pi r^{2}', 'r = 5', 'A = 25\\pi']);
    expect(found.every((f) => f.display === false)).toBe(true);
    // Nothing outside the formulas should be touched.
    expect(text.slice(0, found[0].start)).toBe('The area of a circle is ');
    expect(text.slice(found[0].end, found[1].start)).toBe('. If ');
  });

  it('handles E = mc^2', () => {
    expect(latexes("Einstein's equation is E = mc^2.")).toEqual(['E = mc^{2}']);
  });

  it('handles x^2 + y^2 = z^2 with surrounding prose and punctuation', () => {
    expect(latexes('By Pythagoras, x^2 + y^2 = z^2.')).toEqual(['x^{2} + y^{2} = z^{2}']);
  });

  it('handles fractions a/b and (a+b)/c', () => {
    expect(latexes('The ratio a/b is important.')).toEqual(['\\frac{a}{b}']);
    expect(latexes('Simplify (a+b)/c.')).toEqual(['\\frac{a + b}{c}']);
  });

  it('handles sqrt(x)', () => {
    expect(latexes('We know sqrt(x) = 2.')).toEqual(['\\sqrt{x} = 2']);
  });

  it('handles trig functions', () => {
    expect(latexes('Note that sin(x)/x → 1.')).toEqual([
      '\\frac{\\sin(x)}{x} \\to 1',
    ]);
  });

  it('handles subscripts and superscripts in prose', () => {
    expect(latexes('The initial velocity is v_0 = 5.')).toEqual(['v_{0} = 5']);
  });
});

describe('PatternDetector — display math on its own line', () => {
  it('marks an own-line integral as display', () => {
    const text = 'Here is the result:\n\n∫_0^∞ e^(-x) dx = 1\n\nWhich is nice.';
    const found = detect(text);
    expect(found.length).toBe(1);
    expect(found[0].raw).toBe('∫_0^∞ e^(-x) dx = 1');
    expect(found[0].display).toBe(true);
    expect(found[0].latex).toBe('\\int_{0}^{\\infty} e^{-x} \\,dx = 1');
  });

  it('renders a standalone equation as display', () => {
    const found = detect('x^2 + y^2 = z^2');
    expect(found[0].display).toBe(true);
    expect(found[0].latex).toBe('x^{2} + y^{2} = z^{2}');
  });

  it('renders lim and sum notation with limits', () => {
    expect(latexes('lim(x→0) sin(x)/x = 1')).toEqual([
      '\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1',
    ]);
    expect(latexes('Σ(i=1 to n) i = n(n+1)/2')).toEqual([
      '\\sum_{i = 1}^{n} i = \\frac{n(n + 1)}{2}',
    ]);
  });
});

describe('PatternDetector — ordinary text is left alone', () => {
  it('ignores plain sentences', () => {
    expect(detect('The quick brown fox jumps over the lazy dog.')).toEqual([]);
    expect(detect('Hello, world! This is a simple test.')).toEqual([]);
    expect(detect('There are 5 apples and 3 oranges.')).toEqual([]);
  });

  it('ignores long words that look like fractions or operators', () => {
    expect(detect('input/output')).toEqual([]);
    expect(detect('and/or')).toEqual([]);
    expect(detect('well-known')).toEqual([]);
    expect(detect('key = value')).toEqual([]);
  });

  it('does not convert a bare "pi" in prose', () => {
    expect(detect('The number pi is irrational.')).toEqual([]);
    expect(detect('pi')).toEqual([]);
  });

  it('ignores words that merely contain math characters', () => {
    expect(detect('foo_bar')).toEqual([]);
    expect(detect('Use the caret ^ to denote power.')).toEqual([]);
  });

  it('does not convert prose with a lone equals sign', () => {
    expect(detect('key = value')).toEqual([]);
  });

  it('does not treat HTML-ish attributes as formulas', () => {
    expect(detect('Use src=x inside <img> tags.')).toEqual([]);
    expect(detect('The href=5 attribute is ignored.')).toEqual([]);
  });
});

describe('PatternDetector — punctuation and boundaries', () => {
  it('excludes trailing punctuation from spans', () => {
    const found = detect('So x = 5, and then y = 6.');
    expect(found.map((f) => f.raw)).toEqual(['x = 5', 'y = 6']);
  });

  it('handles formulas at the start and end of a sentence', () => {
    const found = detect('x^2 = 4. Therefore z = 3.');
    expect(found.map((f) => f.raw)).toEqual(['x^2 = 4', 'z = 3']);
  });

  it('detects formulas inside parentheses of prose', () => {
    expect(latexes('(see x^2 for details)')).toEqual(['x^{2}']);
  });

  it('includes balanced parentheses around a formula', () => {
    expect(latexes('(x = 5)')).toEqual(['(x = 5)']);
  });

  it('rejects groups that smuggle in ordinary words', () => {
    // `the` inside the sum shorthand is not a math word, so the whole
    // candidate formula is rejected rather than rendered as garbage math.
    expect(detect('Σ(i=1 to the n) i = n(n+1)/2')).toEqual([]);
  });
});

describe('PatternDetector — line breaks', () => {
  it('does not merge formulas that sit on separate lines', () => {
    const text = '∫_0^∞ e^(-x) dx = 1\n\nlim(x→0) sin(x)/x = 1';
    const found = detect(text);
    expect(found).toHaveLength(2);
    expect(found[0].raw).toBe('∫_0^∞ e^(-x) dx = 1');
    expect(found[1].raw).toBe('lim(x→0) sin(x)/x = 1');
    expect(found.every((f) => f.display)).toBe(true);
  });
});

describe('PatternDetector — numbers', () => {
  it('detects 24/7 as a fraction', () => {
    expect(latexes('Open 24/7.')).toEqual(['\\frac{24}{7}']);
  });

  it('keeps decimal numbers intact', () => {
    expect(latexes('A = 3.14')).toEqual(['A = 3.14']);
  });
});

describe('PatternDetector — multi-formula lines', () => {
  it('detects several inline formulas on one line', () => {
    // Note: two-letter non-math words like "ad" stay prose.
    const text = 'If a/b = c/d then x = y.';
    expect(latexes(text)).toEqual(['\\frac{a}{b} = \\frac{c}{d}', 'x = y']);
  });
});
