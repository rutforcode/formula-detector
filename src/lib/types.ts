/**
 * Shared types for the formula detection pipeline.
 *
 * The pipeline is deliberately split into pluggable stages so an LLM-based
 * detector can be swapped in later without touching the rest of the app:
 *
 *   text ──▶ FormulaDetector ──▶ DetectedFormula[] ──▶ toLatex() ──▶ MathJax
 *
 * `PatternDetector` (patternDetector.ts) is the local, dependency-free
 * implementation. A hypothetical `LLMDetector` would only need to implement
 * the same `FormulaDetector` interface (see llmDetector.ts for a stub).
 */

/** One formula found inside the input text. */
export interface DetectedFormula {
  /** The exact slice of the original text that was detected. */
  raw: string;
  /** Generated LaTeX for the formula (fed to MathJax). */
  latex: string;
  /** True when the formula clearly sits on its own line (block math). */
  display: boolean;
  /** Character offset (inclusive) of the start of `raw` in the input text. */
  start: number;
  /** Character offset (exclusive) of the end of `raw` in the input text. */
  end: number;
}

/**
 * Any object able to locate formulas inside plain text.
 *
 * Implementations must be pure (no DOM / network access) so they are easy to
 * unit-test and can run on a worker or server later.
 */
export interface FormulaDetector {
  /** Human-readable name, e.g. "pattern" or "llm". */
  readonly name: string;
  /**
   * Return every formula found in `text`, in document order, non-overlapping.
   * `latex` may be left empty by the detector; the app fills it in via
   * `toLatex()` if it is.
   */
  detect(text: string): DetectedFormula[];
}
