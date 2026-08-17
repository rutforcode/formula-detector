import { describe, it, expect } from 'vitest';
import { toLatex } from './toLatex';

describe('toLatex', () => {
  it('converts simple exponents', () => {
    expect(toLatex('x^2')).toBe('x^{2}');
    expect(toLatex('E = mc^2')).toBe('E = mc^{2}');
    expect(toLatex('x^2 + y^2 = z^2')).toBe('x^{2} + y^{2} = z^{2}');
  });

  it('converts fractions', () => {
    expect(toLatex('a/b')).toBe('\\frac{a}{b}');
    expect(toLatex('(a+b)/c')).toBe('\\frac{a + b}{c}');
    expect(toLatex('n(n+1)/2')).toBe('\\frac{n(n + 1)}{2}');
    expect(toLatex('24/7')).toBe('\\frac{24}{7}');
    expect(toLatex('a/b = c/d')).toBe('\\frac{a}{b} = \\frac{c}{d}');
    expect(toLatex('sin(x)/x')).toBe('\\frac{\\sin(x)}{x}');
  });

  it('converts roots and functions', () => {
    expect(toLatex('sqrt(x)')).toBe('\\sqrt{x}');
    expect(toLatex('sqrt(2)')).toBe('\\sqrt{2}');
    expect(toLatex('sin(x)')).toBe('\\sin(x)');
    expect(toLatex('ln(e)')).toBe('\\ln(e)');
    expect(toLatex('2 + 3')).toBe('2 + 3');
  });

  it('converts constants and Greek letters', () => {
    expect(toLatex('A = pi r^2')).toBe('A = \\pi r^{2}');
    expect(toLatex('A = 25pi')).toBe('A = 25\\pi');
    expect(toLatex('theta = 30°')).toBe('\\theta = 30^{\\circ}');
  });

  it('converts integrals with limits', () => {
    expect(toLatex('∫_0^∞ e^(-x) dx = 1')).toBe(
      '\\int_{0}^{\\infty} e^{-x} \\,dx = 1',
    );
  });

  it('converts limits of functions', () => {
    expect(toLatex('lim(x→0) sin(x)/x = 1')).toBe(
      '\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1',
    );
  });

  it('converts sum notation', () => {
    expect(toLatex('Σ(i=1 to n) i = n(n+1)/2')).toBe(
      '\\sum_{i = 1}^{n} i = \\frac{n(n + 1)}{2}',
    );
  });

  it('converts subscripts', () => {
    expect(toLatex('v_0')).toBe('v_{0}');
    expect(toLatex('a_i = 1')).toBe('a_{i} = 1');
  });

  it('converts arrows and relations', () => {
    expect(toLatex('x → ∞')).toBe('x \\to \\infty');
    expect(toLatex('x ≤ 5')).toBe('x \\le 5');
    expect(toLatex('a ≠ b')).toBe('a \\ne b');
  });

  it('escapes dangerous characters instead of passing them through', () => {
    expect(toLatex('x & y')).toBe('x \\& y');
    expect(toLatex('50% = 0.5')).toBe('50\\% = 0.5');
  });

  it('keeps decimals intact', () => {
    expect(toLatex('A = 3.14')).toBe('A = 3.14');
  });

  it('handles empty and trivial input', () => {
    expect(toLatex('')).toBe('');
    expect(toLatex('x = 5')).toBe('x = 5');
  });
});
