/**
 * Vocabulary tables shared by the detector and the LaTeX converter.
 *
 * Keeping the vocabulary in one place makes the detection rules easy to tune:
 * add a word to MATH_WORDS and it becomes *includable* in formula spans;
 * add a (lowercase) entry to WORD_TO_LATEX and it gets converted properly.
 */

/**
 * Words that are allowed inside a detected formula span. Everything else with
 * more than one letter acts as a "natural language wall" and stops expansion,
 * which is the main guard against converting ordinary prose into math.
 */
export const MATH_WORDS = new Set<string>([
  // Constants
  'pi',
  // Functions (trig, logs, limits, …)
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf',
  'sum', 'prod', 'sqrt', 'abs', 'gcd', 'lcm', 'mod', 'deg',
  // Differential forms ("dx" in integrals)
  'dx', 'dy', 'dz', 'dt', 'du', 'dv', 'dw', 'ds', 'dr',
  // Greek letter names
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta',
  'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
  'omicron', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
]);

/**
 * Words that alone can *trigger* a formula, but only when directly followed by
 * a parenthesised argument, e.g. `sqrt(x)` or `lim(x→0)`. A bare "sin" or
 * "sum" in prose never triggers anything.
 */
export const FUNCTION_TRIGGER_WORDS = new Set<string>([
  'sqrt', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min',
  'sum', 'prod', 'abs',
]);

/**
 * Case-insensitive lookup for the trigger check, so "Lim", "SIN", "PI" etc.
 * behave the same as their lowercase forms.
 */
const lowerWords = new Set<string>([...MATH_WORDS, ...FUNCTION_TRIGGER_WORDS].map((w) => w.toLowerCase()));
export function normalizeMathWord(word: string): string | null {
  const key = word.toLowerCase();
  return lowerWords.has(key) ? key : null;
}

/** Maps a word (lowercase) to the LaTeX it should render as. */
export const WORD_TO_LATEX: Record<string, string> = {
  // Constants
  pi: '\\pi',
  // Functions
  sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot',
  arcsin: '\\arcsin', arccos: '\\arccos', arctan: '\\arctan',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  log: '\\log', ln: '\\ln', lg: '\\lg', exp: '\\exp', lim: '\\lim',
  max: '\\max', min: '\\min', sup: '\\sup', inf: '\\inf',
  sum: '\\sum', prod: '\\prod', gcd: '\\gcd', lcm: '\\mathrm{lcm}', mod: '\\bmod',
  deg: '^\\circ', to: '\\to',
  // Differential forms
  dx: '\\,dx', dy: '\\,dy', dz: '\\,dz', dt: '\\,dt',
  du: '\\,du', dv: '\\,dv', dw: '\\,dw', ds: '\\,ds', dr: '\\,dr',
  // Greek letter names
  alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta',
  epsilon: '\\epsilon', zeta: '\\zeta', eta: '\\eta', theta: '\\theta',
  iota: '\\iota', kappa: '\\kappa', lambda: '\\lambda', mu: '\\mu',
  nu: '\\nu', xi: '\\xi', omicron: '\\omicron', rho: '\\rho',
  sigma: '\\sigma', tau: '\\tau', upsilon: '\\upsilon', phi: '\\phi',
  chi: '\\chi', psi: '\\psi', omega: '\\omega',
};

/** Maps a single Unicode symbol to its LaTeX. */
export const SYMBOL_TO_LATEX: Record<string, string> = {
  '∫': '\\int',
  '∑': '\\sum', // U+2211 N-ARY SUMMATION
  'Σ': '\\sum', // U+03A3 GREEK CAPITAL SIGMA (what people usually type)
  '∏': '\\prod', '∞': '\\infty',
  'π': '\\pi', '∂': '\\partial', '∇': '\\nabla',
  '∈': '\\in', '∉': '\\notin', '⊂': '\\subset', '⊆': '\\subseteq',
  '∪': '\\cup', '∩': '\\cap', '∅': '\\emptyset',
  '→': '\\to', '↦': '\\mapsto', '≤': '\\le', '≥': '\\ge',
  '≠': '\\ne', '≈': '\\approx', '±': '\\pm', '·': '\\cdot',
  '×': '\\times', '÷': '\\div', '√': '\\sqrt', '°': '^{\\circ}',
  '∝': '\\propto', '∥': '\\parallel', '∠': '\\angle', '△': '\\triangle',
  '□': '\\square', '∴': '\\therefore', '∵': '\\because',
  '∼': '\\sim', '≅': '\\cong', '≡': '\\equiv', '≪': '\\ll', '≫': '\\gg',
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta',
  'ε': '\\epsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta',
  'ι': '\\iota', 'κ': '\\kappa', 'λ': '\\lambda', 'μ': '\\mu',
  'ν': '\\nu', 'ξ': '\\xi', 'ο': '\\omicron', 'ρ': '\\rho',
  'σ': '\\sigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
  'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  // Unicode superscript / subscript digits
  '⁰': '^{0}', '¹': '^{1}', '²': '^{2}', '³': '^{3}', '⁴': '^{4}',
  '⁵': '^{5}', '⁶': '^{6}', '⁷': '^{7}', '⁸': '^{8}', '⁹': '^{9}',
  '₀': '_{0}', '₁': '_{1}', '₂': '_{2}', '₃': '_{3}', '₄': '_{4}',
  '₅': '_{5}', '₆': '_{6}', '₇': '_{7}', '₈': '_{8}', '₉': '_{9}',
};

/** Set of single characters that are clearly mathematical symbols. */
export const MATH_SYMBOLS = new Set(Object.keys(SYMBOL_TO_LATEX));

/** Set of characters treated as inline math operators. */
export const MATH_OPERATORS = new Set<string>([
  '+', '-', '*', '/', '^', '_', '=', '<', '>', '|',
  '≤', '≥', '≠', '≈', '±', '·', '×', '÷', '→', '↦',
]);
