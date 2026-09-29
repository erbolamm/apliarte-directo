import { toBlocks, renderInline } from '../office/markdown';

// Presentación de solo lectura del cuerpo real de una tarea con modo de lectura asistida (dislexia):
// Resalta el bloque que se está dictando y la palabra activa en tiempo real.
export default function MarkdownView({
  body,
  activeParagraphIndex,
  activeWordCharIndex,
}: {
  body: string;
  activeParagraphIndex?: number;
  activeWordCharIndex?: number;
}) {
  const blocks = toBlocks(body);

  return (
    <div className="task-ficha-original">
      {blocks.map((block, i) => {
        const isCurrent = activeParagraphIndex !== undefined && activeParagraphIndex === i;
        const charIndexForBlock = isCurrent ? activeWordCharIndex : undefined;
        const className = isCurrent ? 'speech-block-active' : undefined;

        if (block.kind === 'h1') return <h1 key={i} className={className}>{renderInline(block.text, charIndexForBlock)}</h1>;
        if (block.kind === 'h2') return <h2 key={i} className={className}>{renderInline(block.text, charIndexForBlock)}</h2>;
        if (block.kind === 'h3') return <h3 key={i} className={className}>{renderInline(block.text, charIndexForBlock)}</h3>;
        if (block.kind === 'quote') return <blockquote key={i} className={className}>{renderInline(block.text, charIndexForBlock)}</blockquote>;
        if (block.kind === 'hr') return <hr key={i} className="task-divider" />;
        if (block.kind === 'code') {
          return (
            <pre key={i} className="task-code-block">
              <code>{block.code}</code>
            </pre>
          );
        }
        if (block.kind === 'checklist') {
          return (
            <ul key={i} className={`task-checklist ${className || ''}`}>
              {block.items.map((it, j) => (
                <li key={j} className={`task-check-item ${it.checked ? 'is-checked' : ''}`}>
                  <input type="checkbox" checked={it.checked} readOnly tabIndex={-1} aria-hidden="true" />
                  <span>{renderInline(it.text, charIndexForBlock)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={i} className={className}>
              {block.items.map((it, j) => (
                <li key={j}>{renderInline(it, charIndexForBlock)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i} className={className}>{renderInline(block.text, charIndexForBlock)}</p>;
      })}
    </div>
  );
}
