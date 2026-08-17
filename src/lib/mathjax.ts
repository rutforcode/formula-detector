/**
 * MathJax 3 rendering, bundled locally with `mathjax-full`.
 *
 * We use the SVG output, which embeds every glyph as a path — no font files
 * are needed, so the app runs fully offline. Rendering is done through
 * `mathjax.document(...).convert(latex, { display })`, which returns a
 * detached `<mjx-container>` element that the UI appends where it likes.
 *
 * Security: user text never reaches `innerHTML`. Plain text is inserted with
 * `textContent` (or React's JSX escaping) and only *our generated* LaTeX is
 * fed to MathJax, which builds the output DOM itself. The generated LaTeX
 * contains only characters mapped through a fixed vocabulary (mathVocab.ts)
 * or escaped (toLatex.ts), so it cannot smuggle in TeX commands such as
 * `\href`. The `href` package is excluded from the loaded TeX packages as a
 * second line of defence.
 */

import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';

type MathDocument = ReturnType<typeof mathjax.document>;

let mathDocument: MathDocument | null = null;

/** Lazily create the (singleton) MathJax document. */
function getMathDocument(): MathDocument {
  if (!mathDocument) {
    // `mathjax-full` ships CommonJS; Vite pre-bundles it for the browser.
    RegisterHTMLHandler(browserAdaptor());
    const tex = new TeX({
      // Exclude the packages that could render arbitrary HTML/URLs.
      packages: AllPackages.filter((p) => p !== 'href' && p !== 'html' && p !== 'unicode'),
    });
    const svg = new SVG({ fontCache: 'local' });
    mathDocument = mathjax.document(document, { InputJax: tex, OutputJax: svg });
  }
  return mathDocument;
}

/**
 * Render a LaTeX string to a DOM element (an `mjx-container`), ready to be
 * appended anywhere. Throws if the LaTeX is invalid.
 */
export function renderLatex(latex: string, display = false): HTMLElement {
  const doc = getMathDocument();
  return doc.convert(latex, { display }) as unknown as HTMLElement;
}

/** Render LaTeX and append it to `parent`. Returns the rendered element. */
export function appendLatex(parent: HTMLElement, latex: string, display = false): HTMLElement {
  const node = renderLatex(latex, display);
  parent.appendChild(node);
  return node;
}
