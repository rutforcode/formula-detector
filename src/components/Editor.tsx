interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function Editor({ value, onChange }: EditorProps) {
  return (
    <textarea
      className="editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Type or paste text here… e.g.  The area of a circle is A = pi r^2."
      spellCheck={false}
      aria-label="Input text"
    />
  );
}
