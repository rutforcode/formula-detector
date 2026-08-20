import { useMemo, useRef, useState } from 'react';
import { createDetector } from './lib/detection';
import Editor from './components/Editor';
import Preview from './components/Preview';
import DetectedList from './components/DetectedList';

// Using array join to avoid template-literal escape confusion with LaTeX backslashes.
// Each '\\\\' in the source file becomes '\' at runtime (single backslash = valid LaTeX).
const SAMPLE = [
  'The area of a circle is A = pi r^2. If r = 5, then A = 25pi.',
  '',
  "Einstein's famous equation is E = mc^2, and by Pythagoras, x^2 + y^2 = z^2.",
  '',
  '\u222B_0^\u221E e(-x) dx = 1',
  '',
  'lim(x\u21920) sin(x)/x = 1',
  '',
  '\u03A3(i=1 to n) i = n(n+1)/2',
  '',
  '--- From an offline GPT model ---',
  '',
  'The quadratic formula is $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$',
  '',
  'Display math:',
  '$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$',
  '',
  'Inline: \\(\\alpha + \\beta = \\gamma\\)',
  '',
  'Bare commands: \\frac{1}{2} and \\sqrt{x^2 + y^2}',
].join('\n');

/** Best-effort clipboard write with a legacy fallback. */
async function copyToClipboard(textToCopy: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(textToCopy);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = textToCopy;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function App() {
  const [text, setText] = useState(SAMPLE);
  const [feedback, setFeedback] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const detector = useMemo(() => createDetector(), []);
  const formulas = useMemo(() => detector.detect(text), [detector, text]);

  /** Converted text: original text with LaTeX delimiters around formulas. */
  const convertedText = useMemo(() => {
    let out = '';
    let cursor = 0;
    for (const f of formulas) {
      if (f.start < cursor) continue;
      out += text.slice(cursor, f.start);
      out += f.display ? `\\[${f.latex}\\]` : `\\(${f.latex}\\)`;
      cursor = f.end;
    }
    out += text.slice(cursor);
    return out;
  }, [text, formulas]);

  const flash = (msg: string) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback((cur) => (cur === msg ? null : cur)), 1600);
  };

  const handleCopy = async () => {
    const ok = await copyToClipboard(convertedText);
    flash(ok ? 'Copied converted text (LaTeX)' : 'Copy failed — select the text manually');
  };

  const handleCopyHtml = async () => {
    const root = previewRef.current;
    if (!root) return;
    const html = new XMLSerializer().serializeToString(root);
    const ok = await copyToClipboard(html);
    flash(ok ? 'Copied rendered HTML' : 'Copy failed — select the HTML manually');
  };

  const handleClear = () => setText('');

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Formula Detector</h1>
          <p className="tagline">
            Paste plain text or LaTeX from an LLM — math is detected and rendered with MathJax 3.
          </p>
        </div>
        <div className="toolbar">
          <span className="badge">{formulas.length} formula{formulas.length === 1 ? '' : 's'} found</span>
          <button className="btn" onClick={handleCopy} title="Copy the text with formulas as \( ... \) LaTeX">
            Copy
          </button>
          <button className="btn" onClick={handleCopyHtml} title="Copy the rendered preview as HTML">
            Copy HTML
          </button>
          <button className="btn btn-ghost" onClick={handleClear} title="Clear the input">
            Clear
          </button>
        </div>
      </header>

      {feedback && <div className="toast">{feedback}</div>}

      <main className="workspace">
        <section className="pane">
          <div className="pane-head">
            <span>Input</span>
            <span className="pane-hint">{text.length} chars</span>
          </div>
          <Editor value={text} onChange={setText} />
        </section>

        <section className="pane">
          <div className="pane-head">
            <span>Preview</span>
            <span className="pane-hint">live</span>
          </div>
          <Preview text={text} formulas={formulas} rootRef={previewRef} />
        </section>
      </main>

      <section className="pane detected">
        <div className="pane-head">
          <span>Detected formulas</span>
          <span className="pane-hint">engine: {detector.name}</span>
        </div>
        <DetectedList formulas={formulas} />
      </section>
    </div>
  );
}
