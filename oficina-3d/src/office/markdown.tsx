import type { ReactNode } from 'react';

export type Block =
  | { kind: 'h1' | 'h2' | 'h3'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'checklist'; items: { checked: boolean; text: string }[] }
  | { kind: 'code'; code: string; lang?: string }
  | { kind: 'hr' }
  | { kind: 'p'; text: string };

/**
 * Convierte texto con sintaxis markdown inline en nodos de React limpios.
 * Si highlightCharIndex está presente, resalta la palabra que contiene ese carácter.
 * - `**negrita**` o `__negrita__` -> <strong>
 * - `*cursiva*` o `_cursiva_` -> <em>
 * - `` `código` `` -> <code>
 * - `[enlace](url)` -> <a>
 * Sin innerHTML, seguro contra inyecciones XSS.
 */
export function renderInline(text: string, highlightCharIndex?: number): ReactNode[] {
  // Si tenemos un índice de palabra activa en este bloque, procesamos el resaltado de palabra
  if (highlightCharIndex !== undefined && highlightCharIndex >= 0 && highlightCharIndex < text.length) {
    let target = highlightCharIndex;
    while (target < text.length && /\s/.test(text[target])) {
      target++;
    }
    if (target < text.length) {
      let start = target;
      while (start > 0 && !/\s|[.,;:!?()[\]{}"'`*]/.test(text[start - 1])) {
        start--;
      }
      let end = target;
      while (end < text.length && !/\s|[.,;:!?()[\]{}"'`*]/.test(text[end])) {
        end++;
      }
      if (end > start) {
        const before = text.slice(0, start);
        const word = text.slice(start, end);
        const after = text.slice(end);
        return [
          ...renderInline(before),
          <mark key={`word-${start}`} className="speech-word-active">
            {word}
          </mark>,
          ...renderInline(after),
        ];
      }
    }
  }

  const elements: ReactNode[] = [];
  // Tokenizer regex matching code inline, bold, italic, images, links
  const pattern = /(!\[[^\]]*\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token.length}`;

    if (token.startsWith('![') && token.includes('](')) {
      const imgMatch = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      if (imgMatch) {
        const rawSrc = imgMatch[2];
        const webSrc = rawSrc.includes('/adjuntos/')
          ? `/adjuntos/${rawSrc.split('/adjuntos/')[1]}`
          : rawSrc;
        elements.push(
          <span key={key} className="task-inline-image-wrapper">
            <img
              src={webSrc}
              alt={imgMatch[1] || 'Imagen adjunta'}
              className="task-inline-img"
              loading="lazy"
              onClick={() => window.open(webSrc, '_blank')}
              title={`${imgMatch[1] || 'Imagen'} (clic para abrir)`}
            />
          </span>
        );
      } else {
        elements.push(token);
      }
    } else if (token.startsWith('`') && token.endsWith('`')) {
      elements.push(
        <code key={key} className="inline-code">
          {token.slice(1, -1)}
        </code>
      );
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      elements.push(
        <strong key={key}>
          {renderInline(token.slice(2, -2))}
        </strong>
      );
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      elements.push(
        <em key={key}>
          {renderInline(token.slice(1, -1))}
        </em>
      );
    } else if (token.startsWith('[') && token.includes('](')) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        elements.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="task-link"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        elements.push(token);
      }
    } else {
      elements.push(token);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements.length ? elements : [text];
}

export function toBlocks(body: string): Block[] {
  const lines = body.split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let checklist: { checked: boolean; text: string }[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = '';

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push({ kind: 'list', items: list });
      list = [];
    }
  };
  const flushChecklist = () => {
    if (checklist.length) {
      blocks.push({ kind: 'checklist', items: checklist });
      checklist = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Plumbing interno de append
    if (/^<!--\s*erbolamm:append:.*-->$/.test(line.trim())) continue;

    // Bloques de código ```
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        blocks.push({ kind: 'code', code: codeBuffer.join('\n'), lang: codeLang });
        codeBuffer = [];
        codeLang = '';
        inCodeBlock = false;
      } else {
        flushParagraph();
        flushList();
        flushChecklist();
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    const hr = /^(?:---|\*\*\*|___)\s*$/.test(line.trim());
    if (hr) {
      flushParagraph();
      flushList();
      flushChecklist();
      blocks.push({ kind: 'hr' });
      continue;
    }

    const checkMatch = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (checkMatch) {
      flushParagraph();
      flushList();
      checklist.push({ checked: checkMatch[1].toLowerCase() === 'x', text: checkMatch[2] });
      continue;
    }

    const h3 = /^###\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h1 = /^#\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    const item = /^[-*]\s+(.*)$/.exec(line);

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushChecklist();
      continue;
    }
    if (h3) {
      flushParagraph();
      flushList();
      flushChecklist();
      blocks.push({ kind: 'h3', text: h3[1] });
      continue;
    }
    if (h2) {
      flushParagraph();
      flushList();
      flushChecklist();
      blocks.push({ kind: 'h2', text: h2[1] });
      continue;
    }
    if (h1) {
      flushParagraph();
      flushList();
      flushChecklist();
      blocks.push({ kind: 'h1', text: h1[1] });
      continue;
    }
    if (quote) {
      flushParagraph();
      flushList();
      flushChecklist();
      blocks.push({ kind: 'quote', text: quote[1] });
      continue;
    }
    if (item) {
      flushParagraph();
      flushChecklist();
      list.push(item[1]);
      continue;
    }

    flushList();
    flushChecklist();
    paragraph.push(line);
  }

  if (inCodeBlock && codeBuffer.length) {
    blocks.push({ kind: 'code', code: codeBuffer.join('\n'), lang: codeLang });
  }
  flushParagraph();
  flushList();
  flushChecklist();
  return blocks;
}

/** Puntos de `## Comprobación` (o `## Comprobacion`, sin acento), como los
 * escribe cualquier tarea real de este tablero. Se detiene en el siguiente
 * `## ` o al final del cuerpo. Vacío si la sección no existe. */
export function checklistItems(body: string): string[] {
  const lines = body.split('\n');
  const start = lines.findIndex((l) => /^##\s+Comprobaci[oó]n\b/i.test(l));
  if (start === -1) return [];
  const items: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break;
    const item = /^[-*]\s+(?:\[[ xX]\]\s+)?(.*)$/.exec(line);
    if (item) items.push(item[1]);
  }
  return items;
}

export type SpeechBlockItem = {
  blockIndex: number;
  text: string;
};

export function extractSpeechBlocks(body: string): SpeechBlockItem[] {
  const blocks = toBlocks(body);
  const items: SpeechBlockItem[] = [];

  blocks.forEach((block, idx) => {
    if ('text' in block && block.text.trim()) {
      const clean = block.text
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .trim();
      if (clean) items.push({ blockIndex: idx, text: clean });
    } else if (block.kind === 'checklist') {
      block.items.forEach((it) => {
        const clean = it.text
          .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
          .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
          .trim();
        if (clean) items.push({ blockIndex: idx, text: clean });
      });
    } else if (block.kind === 'list') {
      block.items.forEach((it) => {
        const clean = it
          .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
          .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
          .trim();
        if (clean) items.push({ blockIndex: idx, text: clean });
      });
    }
  });

  return items;
}
