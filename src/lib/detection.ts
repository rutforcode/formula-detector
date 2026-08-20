/**
 * Detector factory — the single place to choose which FormulaDetector runs.
 *
 * The default pipeline chains two detectors:
 *
 *   1. LatexDetector — finds raw LaTeX strings that LLMs output
 *      (delimited: $$...$$, $...$, \(\), \[\]; bare: \frac, \sqrt, ...)
 *   2. PatternDetector — finds natural-language math expressions
 *      (x^2 + y^2 = z^2, a/b, sin(x), …)
 *
 * The LatexDetector runs first so that dollar signs and backslashes inside
 * LaTeX strings don't confuse the PatternDetector.  Regions already claimed
 * by the LaTeX detector are excluded from pattern detection.
 *
 * Keeping this indirection means the UI never imports a concrete detector,
 * so swapping the engine later is a one-line change.
 */

import { PatternDetector } from './patternDetector';
import { LatexDetector } from './latexDetector';
import { LLMDetector } from './llmDetector';
import type { DetectedFormula, FormulaDetector } from './types';

export type DetectorEngine = 'pattern' | 'latex+pattern' | 'llm';

/**
 * Chain two detectors, excluding regions claimed by the first from the second.
 */
function chain(first: FormulaDetector, second: FormulaDetector): FormulaDetector {
  return {
    name: `${first.name}+${second.name}`,
    detect(text: string): DetectedFormula[] {
      const a = first.detect(text);
      const b = second.detect(text);

      // Build a set of character positions claimed by `a`.
      const consumed = new Set<number>();
      for (const f of a) {
        for (let i = f.start; i < f.end; i++) consumed.add(i);
      }

      // Keep only formulas from `b` that don't overlap with `a`.
      const filtered = b.filter((f) => {
        for (let i = f.start; i < f.end; i++) {
          if (consumed.has(i)) return false;
        }
        return true;
      });

      return [...a, ...filtered].sort((x, y) => x.start - y.start);
    },
  };
}

export function createDetector(engine: DetectorEngine = 'latex+pattern'): FormulaDetector {
  switch (engine) {
    case 'pattern':
      return new PatternDetector();
    case 'latex+pattern':
      return chain(new LatexDetector(), new PatternDetector());
    case 'llm':
      return new LLMDetector();
  }
}
