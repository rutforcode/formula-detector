import { useCallback, useState } from 'react';

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
}

const ACCEPTED_EXTENSIONS = new Set(['.txt', '.md', '.tex', '.latex', '.csv']);

export default function Editor({ value, onChange }: EditorProps) {
  const [dragging, setDragging] = useState(false);

  const readFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') onChange(reader.result);
      };
      reader.readAsText(file);
    },
    [onChange],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (ACCEPTED_EXTENSIONS.has(ext)) {
        readFile(file);
      }
    },
    [readFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  return (
    <div
      className={`editor-wrap${dragging ? ' drag-over' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <textarea
        className="editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          dragging
            ? 'Drop file here…'
            : 'Type or paste text here… or drag & drop a .txt / .md file'
        }
        spellCheck={false}
        aria-label="Input text"
      />
      {dragging && <div className="drop-overlay">Drop .txt or .md file</div>}
    </div>
  );
}
