/**
 * Stub for an LLM-based formula detector.
 *
 * This file exists to show how the architecture stays open: an LLM detector
 * only needs to implement the same `FormulaDetector` interface as
 * `PatternDetector`. Everything downstream (LaTeX conversion, MathJax
 * rendering, the UI) is detector-agnostic.
 *
 * To use it, implement `detect()` by calling your LLM of choice (in the
 * browser: a hosted API; locally: a Web Worker running an on-device model),
 * then switch `createDetector()` in detection.ts to return it. The pattern
 * detector remains the default because it runs locally with zero network
 * calls and zero cost.
 */

import type { DetectedFormula, FormulaDetector } from './types';

export class LLMDetector implements FormulaDetector {
  readonly name = 'llm';

  constructor(private readonly endpoint?: string) {
    // In a real implementation you would keep an API key / endpoint here,
    // e.g. `new LLMDetector({ endpoint: import.meta.env.VITE_LLM_ENDPOINT })`.
  }

  async detectAsync(_text: string): Promise<DetectedFormula[]> {
    throw new Error(
      `LLMDetector is not implemented (endpoint: ${this.endpoint ?? 'none'}). ` +
        'See src/lib/llmDetector.ts for how to wire it up.',
    );
  }

  // The synchronous part of the interface is intentionally unsupported:
  // an LLM call is inherently async. The app's pipeline only uses the
  // synchronous API today, so switching detectors means adapting the call
  // site in App.tsx (useEffect instead of useMemo).
  detect(_text: string): DetectedFormula[] {
    throw new Error(
      'LLMDetector is async-only. Use detectAsync() or switch createDetector() to an async pipeline.',
    );
  }
}
