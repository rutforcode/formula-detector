import { useEffect, type RefObject } from 'react';
import type { DetectedFormula } from '../lib/types';
import { renderLatex } from '../lib/mathjax';

interface PreviewProps {
  text: string;
  formulas: DetectedFormula[];
  /** The app uses this ref to read the rendered DOM for "Copy HTML". */
  rootRef: RefObject<HTMLDivElement>;
}

/**
 * Renders the input text with each detected formula replaced by its MathJax
 * output.
 *
 * The DOM is rebuilt from scratch on every change: plain text goes in as safe
 * text nodes (never innerHTML — no XSS), and each formula becomes an
 * `mjx-container` element produced by MathJax itself.
 */
export default function Preview({ text, formulas, rootRef }: PreviewProps) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    root.textContent = '';
    let cursor = 0;

    for (const f of formulas) {
      if (f.start < cursor) continue;
      if (f.start > cursor) {
        root.appendChild(document.createTextNode(text.slice(cursor, f.start)));
      }
      try {
        const node = renderLatex(f.latex, f.display);
        if (f.display) {
          const wrap = document.createElement('div');
          wrap.className = 'formula-block';
          wrap.appendChild(node);
          root.appendChild(wrap);
        } else {
          const wrap = document.createElement('span');
          wrap.className = 'formula-inline';
          wrap.appendChild(node);
          root.appendChild(wrap);
        }
      } catch {
        // MathJax rejected the LaTeX — fall back to the original text.
        root.appendChild(document.createTextNode(text.slice(f.start, f.end)));
      }
      cursor = f.end;
    }

    if (cursor < text.length) {
      root.appendChild(document.createTextNode(text.slice(cursor)));
    }
  }, [text, formulas, rootRef]);

  return <div ref={rootRef} className="preview-content" />;
}
