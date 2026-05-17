import { initCld, isAuthed, getCatalog, saveCatalog, catalogPathToCid } from './_cld.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const { public_ids } = req.body; // [{ public_id, format }]
  if (!public_ids?.length) return res.status(400).json({ error: 'public_ids requerido' });

  const cld = initCld();
  const ids = public_ids.map(x => (typeof x === 'string' ? x : x.public_id));

  try {
    // Borrar de Cloudinary
    const result = await cld.api.delete_resources(ids, { resource_type: 'image' });

    // Actualizar catalog.json
    try {
      const catalog = await getCatalog();
      const pidSet = new Set(ids);
      const pidSetLower = new Set(ids.map(id => id.toLowerCase()));
      let changed = false;
      for (const p of catalog) {
        for (const v of p.vars || []) {
          const before = v.fotos.length;
          v.fotos = v.fotos.filter(f => {
            const cid = catalogPathToCid(f);
            return !pidSet.has(cid) && !pidSetLower.has(cid.toLowerCase());
          });
          if (v.fotos.length !== before) changed = true;
        }
        // Eliminar variantes vacías
        p.vars = p.vars.filter(v => v.fotos.length > 0);
      }
      if (changed) await saveCatalog(cld, catalog);
    } catch (e) {
      console.warn('catalog.json no actualizado:', e.message);
    }

    res.json({ ok: true, deleted: ids.length, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
