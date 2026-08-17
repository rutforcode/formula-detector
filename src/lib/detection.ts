/**
 * Detector factory — the single place to choose which FormulaDetector runs.
 *
 *   const detector = createDetector();           // → PatternDetector
 *   const detector = createDetector('llm');      // → LLMDetector (stub)
 *
 * Keeping this indirection means the UI never imports a concrete detector,
 * so swapping the engine later is a one-line change.
 */

import { PatternDetector } from './patternDetector';
import { LLMDetector } from './llmDetector';
import type { FormulaDetector } from './types';

export type DetectorEngine = 'pattern' | 'llm';

export function createDetector(engine: DetectorEngine = 'pattern'): FormulaDetector {
  switch (engine) {
    case 'pattern':
      return new PatternDetector();
    case 'llm':
      return new LLMDetector();
  }
}
