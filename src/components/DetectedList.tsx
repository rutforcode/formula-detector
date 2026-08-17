import { useEffect, useRef } from 'react';
import type { DetectedFormula } from '../lib/types';
import { renderLatex } from '../lib/mathjax';

/** Tiny inline renderer used for one formula inside the table. */
function LatexPreview({ latex }: { latex: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = '';
    try {
      el.appendChild(renderLatex(latex, false));
    } catch {
      /* leave empty */
    }
  }, [latex]);
  return <span ref={ref} className="row-render" />;
}

export default function DetectedList({ formulas }: { formulas: DetectedFormula[] }) {
  if (formulas.length === 0) {
    return (
      <p className="empty-state">
        No formulas detected yet. Type something with an <code>=</code>, a
        caret (<code>^</code>), a fraction, an integral, or a Greek letter.
      </p>
    );
  }

  return (
    <div className="table-wrap">
      <table className="detected-table">
        <thead>
          <tr>
            <th>Original text</th>
            <th>Generated LaTeX</th>
            <th>Mode</th>
            <th>Rendered</th>
          </tr>
        </thead>
        <tbody>
          {formulas.map((f, i) => (
            <tr key={i}>
              <td className="row-raw">{f.raw}</td>
              <td className="row-latex">
                <code>{f.latex}</code>
              </td>
              <td className="row-mode">{f.display ? 'block' : 'inline'}</td>
              <td className="row-render-cell">
                <LatexPreview latex={f.latex} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
