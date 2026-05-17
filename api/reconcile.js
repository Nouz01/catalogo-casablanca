import { initCld, isAuthed, getCatalog, saveCatalog, getAllResources } from './_cld.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const cld = initCld();

  try {
    const resources = await getAllResources(cld, 'catalogo');

    // Lookup 1: full path case-insensitive
    const byFullPath = new Map();
    // Lookup 2: path with trailing _ stripped from each segment, case-insensitive
    const byStripped = new Map();

    for (const r of resources) {
      byFullPath.set(r.public_id.toLowerCase(), r.public_id);
      const stripped = r.public_id.split('/').map(s => s.replace(/_+$/, '')).join('/');
      if (!byStripped.has(stripped.toLowerCase())) {
        byStripped.set(stripped.toLowerCase(), r.public_id);
      }
    }

    const catalog = await getCatalog();
    let fixed = 0, removed = 0;

    for (const p of catalog) {
      for (const v of p.vars || []) {
        const newFotos = [];
        for (const f of v.fotos) {
          const ext = f.match(/\.([^./]+)$/)?.[1] || 'jpg';
          const expectedId = f.replace(/^1000X1000 Catalogo\//, 'catalogo/').replace(/\.[^.]+$/, '');

          // Intento 1: full path case-insensitive
          let actualId = byFullPath.get(expectedId.toLowerCase());

          // Intento 2: stripped underscores case-insensitive
          if (!actualId) {
            const strippedId = expectedId.split('/').map(s => s.replace(/_+$/, '')).join('/');
            actualId = byStripped.get(strippedId.toLowerCase());
          }

          if (!actualId) {
            // Archivo no existe en Cloudinary → eliminarlo del catálogo
            removed++;
          } else {
            const correctPath = actualId.replace(/^catalogo\//, '1000X1000 Catalogo/') + '.' + ext;
            if (correctPath !== f) fixed++;
            newFotos.push(correctPath);
          }
        }
        v.fotos = newFotos;
      }
      // Limpiar variantes sin fotos
      p.vars = (p.vars || []).filter(v => v.fotos.length > 0);
    }

    // Limpiar productos sin variantes
    const before = catalog.length;
    const cleaned = catalog.filter(p => (p.vars || []).length > 0);
    const removedProds = before - cleaned.length;

    if (fixed > 0 || removed > 0) await saveCatalog(cld, cleaned);

    res.json({ ok: true, fixed, removed, removedProds, total: resources.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
