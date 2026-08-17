# Formula Detector

A small web app that detects mathematical formulas embedded inside ordinary
text and converts them into properly rendered MathJax formulas — **entirely in
the browser, with no LLM and no network calls**.

Paste or type text like:

> The area of a circle is A = pi r^2. If r = 5, then A = 25pi.

and the app converts the formulas to LaTeX and renders them live:

> The area of a circle is **A = πr²**. If **r = 5**, then **A = 25π**.

## Features

- **Live detection while you type** — the preview and the “Detected formulas”
  table update on every keystroke.
- **Inline vs. block math** — formulas sitting on their own line are rendered
  as centered display math; everything else stays inline.
- **Local, offline rendering** — MathJax 3 (SVG output) is bundled via
  `mathjax-full`; no fonts, CDNs, or external services are needed.
- **XSS-safe** — user text is inserted as plain text nodes (never `innerHTML`),
  and only the generated LaTeX reaches MathJax. The generated LaTeX contains
  only characters mapped through a fixed vocabulary or escaped, and the
  `href` / `html` / `unicode` TeX packages are disabled as a second line of
  defence.
- **Copy buttons** — “Copy” puts the converted text (with `\( ... \)` / `\[ ... \]`
  LaTeX delimiters) on the clipboard; “Copy HTML” copies the rendered preview.

## Getting started

```bash
npm install
npm run dev        # start the dev server (http://localhost:5173)
```

## Live demo

A hosted build is deployed to GitHub Pages and updates automatically on every
push to `main`:

**https://rutforcode.github.io/formula-detector/**

The deploy is handled by the `Deploy to GitHub Pages` workflow in
`.github/workflows/deploy.yml`. To deploy your own fork, enable Pages in the
repo settings (Source: *GitHub Actions*) and change the `base` in
`vite.config.ts` to match your repo name.

Other scripts:

```bash
npm test           # run the unit tests (Vitest)
npm run build      # typecheck + production build into dist/
npm run preview    # preview the production build
```

The app runs fully locally. No API keys, no backend.

## How it works

The pipeline is split into pluggable stages:

```
text ──▶ FormulaDetector ──▶ DetectedFormula[] ──▶ toLatex() ──▶ MathJax 3
         (patternDetector.ts)    (types.ts)    (toLatex.ts)   (mathjax.ts)
```

### Detection (`src/lib/patternDetector.ts`)

The detector is pure pattern matching — no LLM, no external API:

1. **Tokenise** the text into words, numbers, operators, symbols, brackets and
   punctuation.
2. **Find triggers** — small signals that strongly indicate math:
   - operators: `^ _ = < > ≤ ≥ ≠ ≈ → ↦ ± · × ÷`
   - Unicode symbols: `∫ Σ ∏ ∞ π ∂ ∇ …` (they render as themselves, so
     converting them is always safe)
   - function words directly followed by an argument: `sqrt(x)`, `sin(x)`,
     `lim(x→0)`, …
   - a `/` between two atoms: `a/b`, `(a+b)/c`, `24/7` — but *not*
     `input/output` or `and/or`
3. **Expand** each trigger left/right, swallowing only “math-ish” neighbours:
   numbers, symbols, operators, balanced parentheses, single letters
   (variables) and known math words (`pi`, `sin`, `dx`, …). Two-letter words
   like `mc` in `mc^2` are accepted only when glued to a math operator.
   Everything else — longer words, punctuation, sentence starts, line breaks —
   acts as a wall and stops the span. This is the main guard against
   converting ordinary prose.
4. **Validate** — spans with no math content, spans that smuggled in ordinary
   English words (`(the answer is x = 5)`), and fragments that start with a
   relation (`src=x`) are dropped.
5. **Classify** — a span that occupies its own line becomes *block* math.

### Conversion (`src/lib/toLatex.ts`)

A small recursive token walker (not a TeX parser) that:

- turns `^` / `_` into `^{...}` / `_{...}` (`mc^2` → `mc^{2}`)
- turns a single `/` into `\frac{...}{...}` (`(a+b)/c` → `\frac{a + b}{c}`)
- maps words and Unicode symbols through a fixed vocabulary (`pi` → `\pi`,
  `∫` → `\int`, `→` → `\to`, Greek letters, …)
- recognises special notation: `sqrt(x)`, `abs(x)`, `lim(x→0)`, `Σ(i=1 to n)`,
  `∫_0^∞`, …
- escapes anything that would be dangerous in LaTeX (`& % # $ ~ \ …`)

### Rendering (`src/lib/mathjax.ts`)

MathJax 3 (`mathjax-full`) is initialised once with the SVG output jax (no
font files needed). `renderLatex(latex, display)` returns a detached
`<mjx-container>` element that the UI appends where it likes.

### Swapping in an LLM detector

`FormulaDetector` is a one-method interface (`detect(text)`). `createDetector()`
in `src/lib/detection.ts` is the single place that picks the implementation.
A stub `LLMDetector` lives in `src/lib/llmDetector.ts` — implement `detectAsync()`
(an LLM call is inherently async, so the call site in `App.tsx` would switch
from `useMemo` to `useEffect`) and return it from the factory. Nothing else
changes.

## Detection examples

| Input | Detected | LaTeX |
| --- | --- | --- |
| `The area of a circle is A = pi r^2.` | inline | `A = \pi r^{2}` |
| `If r = 5, then A = 25pi.` | inline ×2 | `r = 5`, `A = 25\pi` |
| `E = mc^2` | inline | `E = mc^{2}` |
| `x^2 + y^2 = z^2` | block (own line) | `x^{2} + y^{2} = z^{2}` |
| `a/b` | inline | `\frac{a}{b}` |
| `(a+b)/c` | inline | `\frac{a + b}{c}` |
| `sqrt(x) = 2` | inline | `\sqrt{x} = 2` |
| `∫_0^∞ e^(-x) dx = 1` | block | `\int_{0}^{\infty} e^{-x} \,dx = 1` |
| `lim(x→0) sin(x)/x = 1` | block | `\lim_{x \to 0} \frac{\sin(x)}{x} = 1` |
| `Σ(i=1 to n) i = n(n+1)/2` | block | `\sum_{i = 1}^{n} i = \frac{n(n + 1)}{2}` |

Ordinary prose is left untouched: `The quick brown fox…`, `There are 5 apples`,
`input/output`, `key = value`, `foo_bar`, and `The number pi is irrational.`
produce no formulas.

## Testing

```bash
npm test
```

The test suite (`src/lib/patternDetector.test.ts`, `src/lib/toLatex.test.ts`)
covers every example above plus edge cases: punctuation around formulas,
multi-line formulas, decimals, HTML-ish attributes, XSS characters, and the
“no false positives on prose” guarantees.

## Project structure

```
src/
  lib/
    types.ts            # DetectedFormula + FormulaDetector interface
    tokenizer.ts        # plain-text tokenizer + bracket matching
    mathVocab.ts        # math words / symbols ↔ LaTeX dictionaries
    patternDetector.ts  # local pattern-based detector
    llmDetector.ts      # stub for a future LLM-based detector
    detection.ts        # detector factory (the one switch point)
    toLatex.ts          # expression → LaTeX converter
    mathjax.ts          # MathJax 3 init + renderLatex()
    *.test.ts           # Vitest suites
  components/
    Editor.tsx          # text input
    Preview.tsx         # live rendered preview
    DetectedList.tsx    # "Detected formulas" table
  App.tsx, main.tsx, styles.css
```

## Tech stack

React 18 · Vite 5 · TypeScript · MathJax 3 (`mathjax-full`) · Vitest — no CSS
framework, no UI library, no other runtime dependencies.
