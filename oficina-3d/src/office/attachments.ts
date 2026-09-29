export interface AttachedFile {
  name: string;
  path: string;
  url?: string;
  size?: number;
  isImage: boolean;
  compressedNote?: string;
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseAttachmentsFromContext(text: string): AttachedFile[] {
  const result: AttachedFile[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const imgMatch = /^-\s+!\[(.*?)\]\((.*?)\)/.exec(line.trim());
    if (imgMatch) {
      const p = imgMatch[2].replace(/^file:\/\//, '');
      result.push({
        name: imgMatch[1],
        path: p,
        url: p.startsWith('/adjuntos/') ? p : undefined,
        isImage: true,
      });
      continue;
    }
    const linkMatch = /^-\s+\[(.*?)\]\((.*?)\)/.exec(line.trim());
    if (linkMatch) {
      const p = linkMatch[2].replace(/^file:\/\//, '');
      result.push({
        name: linkMatch[1],
        path: p,
        url: p.startsWith('/adjuntos/') ? p : undefined,
        isImage: /\.(png|jpe?g|gif|webp|svg)$/i.test(linkMatch[1]),
      });
    }
  }
  return result;
}

export function syncAttachmentsToContext(context: string, files: AttachedFile[]): string {
  const header = '### 📎 Archivos adjuntos y referencias';
  const headerIndex = context.indexOf(header);
  const baseContext = (headerIndex !== -1 ? context.slice(0, headerIndex) : context).trim();

  if (files.length === 0) return baseContext;

  const fileLines = files.map((f) => {
    const uri = f.path.startsWith('file://') ? f.path : `file://${f.path}`;
    return f.isImage ? `- ![${f.name}](${uri})` : `- [${f.name}](${uri})`;
  });

  return `${baseContext}\n\n${header}\n${fileLines.join('\n')}`.trim();
}

export async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result as string;
      resolve(raw.split(',')[1] || '');
    };
    reader.onerror = () => reject(new Error(`Error al leer ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(
  file: File,
  options?: { maxWidthOrHeight?: number; quality?: number }
): Promise<{ file: File; compressed: boolean; originalSize: number; newSize: number }> {
  const originalSize = file.size;
  const isCompressible =
    file.type === 'image/jpeg' ||
    file.type === 'image/jpg' ||
    file.type === 'image/png' ||
    file.type === 'image/webp' ||
    /\.(jpe?g|png|webp)$/i.test(file.name);

  if (!isCompressible || originalSize < 300 * 1024) {
    return { file, compressed: false, originalSize, newSize: originalSize };
  }

  const maxDim = options?.maxWidthOrHeight ?? 1920;
  const quality = options?.quality ?? 0.85;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      const url = URL.createObjectURL(file);
      el.onload = () => {
        URL.revokeObjectURL(url);
        resolve(el);
      };
      el.onerror = (e) => {
        URL.revokeObjectURL(url);
        reject(e);
      };
      el.src = url;
    });

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { file, compressed: false, originalSize, newSize: originalSize };
    }

    ctx.drawImage(img, 0, 0, width, height);

    const outputType =
      file.type === 'image/png' && originalSize < 1024 * 1024 ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, quality)
    );

    if (!blob || blob.size >= originalSize) {
      return { file, compressed: false, originalSize, newSize: originalSize };
    }

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const ext = outputType === 'image/jpeg' ? '.jpg' : '.png';
    const cleanName =
      baseName.endsWith('.jpg') || baseName.endsWith('.png') ? baseName : `${baseName}${ext}`;
    const compressedFile = new File([blob], cleanName, {
      type: outputType,
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      compressed: true,
      originalSize,
      newSize: compressedFile.size,
    };
  } catch {
    return { file, compressed: false, originalSize, newSize: originalSize };
  }
}

export async function uploadAttachmentApi(
  file: File,
  options?: { compress?: boolean; onProgress?: (msg: string) => void }
): Promise<AttachedFile> {
  if (file.size > 28 * 1024 * 1024) {
    throw new Error(
      `El archivo «${file.name}» (${formatBytes(file.size)}) supera el límite de subida (máx. 28 MB).`
    );
  }

  let fileToUpload = file;
  let compressedNote: string | undefined;

  if (options?.compress !== false) {
    options?.onProgress?.(`Optimizando ${file.name}…`);
    const comp = await compressImage(file);
    if (comp.compressed) {
      fileToUpload = comp.file;
      compressedNote = `(optimizado ${formatBytes(comp.originalSize)} → ${formatBytes(comp.newSize)})`;
    }
  }

  options?.onProgress?.(`Subiendo ${fileToUpload.name}…`);
  let name = fileToUpload.name || '';
  if (!name || name === 'image.png' || !name.includes('.')) {
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const ext =
      fileToUpload.type.includes('jpeg') || fileToUpload.type.includes('jpg')
        ? '.jpg'
        : fileToUpload.type.includes('webp')
        ? '.webp'
        : '.png';
    name = `captura-${stamp}${ext}`;
  }

  const base64 = await fileToBase64(fileToUpload);

  const token =
    (window as any).Oficina?.office?.actionToken ||
    (window.opener as any)?.Oficina?.office?.actionToken;

  let res: any;
  if ((window as any).Oficina?.taskRequest) {
    res = await (window as any).Oficina.taskRequest('/api/tasks/attachment', {
      name,
      data: base64,
    });
  } else {
    const resp = await fetch('/api/tasks/attachment', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-ErBolamm-Action': String(token || ''),
      },
      body: JSON.stringify({ name, data: base64 }),
    });
    res = await resp.json();
    if (!resp.ok || !res.ok) {
      throw new Error(res.message || res.error || `HTTP ${resp.status}`);
    }
  }

  const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(res.name);
  return {
    name: res.name,
    path: res.path,
    url: res.url,
    size: res.size,
    isImage: isImg,
    compressedNote,
  };
}
