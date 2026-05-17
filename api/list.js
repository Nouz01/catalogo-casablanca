import { initCld, isAuthed } from './_cld.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const prefix = req.query.prefix || 'catalogo';
  const cld = initCld();

  try {
    // Buscar todos los recursos bajo el prefix (con paginación)
    let all = [], cursor = null;
    do {
      const chunk = await cld.api.resources({
        type: 'upload', resource_type: 'image',
        prefix: prefix + '/', max_results: 500,
        ...(cursor ? { next_cursor: cursor } : {}),
      });
      all.push(...(chunk.resources || []));
      cursor = chunk.next_cursor;
    } while (cursor);

    // Profundidad del prefix (ej: "catalogo" → 1, "catalogo/Acolchados" → 2)
    const depth = prefix.split('/').length;

    // Carpetas únicas en el siguiente nivel
    const folderSet = new Set();
    const images = [];

    for (const r of all) {
      const parts = r.public_id.split('/');
      if (parts.length === depth + 1) {
        // Archivo directo en este nivel
        images.push({ public_id: r.public_id, format: r.format, secure_url: r.secure_url, bytes: r.bytes });
      } else if (parts.length > depth + 1) {
        // Subfolder: siguiente segmento
        folderSet.add(parts[depth]);
      }
    }

    const folders = [...folderSet].sort((a, b) => a.localeCompare(b, 'es'));
    images.sort((a, b) => a.public_id.localeCompare(b.public_id, 'es'));

    res.json({ folders, images });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
