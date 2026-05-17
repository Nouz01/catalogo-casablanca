import { initCld, isAuthed, getCatalog, saveCatalog, getCovers, saveCovers, catalogPathToCid } from './_cld.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const { public_ids } = req.body; // [{ public_id, format }]
  if (!public_ids?.length) return res.status(400).json({ error: 'public_ids requerido' });

  const cld = initCld();
  const ids = public_ids.map(x => (typeof x === 'string' ? x : x.public_id));
  let catalog_updated = true;

  try {
    // Borrar de Cloudinary
    const result = await cld.api.delete_resources(ids, { resource_type: 'image' });

    const pidSet = new Set(ids);
    const pidSetLower = new Set(ids.map(id => id.toLowerCase()));

    // Actualizar catalog.json
    try {
      const catalog = await getCatalog();
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
      catalog_updated = false;
    }

    // Actualizar portadas_config.json: si se eliminó una imagen que era portada, quitarla
    // portadas_config.json almacena rutas CON extensión (ej: catalogo/X/foto.jpg)
    // Los public_ids están SIN extensión → comparar quitando la extensión del valor
    try {
      const covers = await getCovers();
      let coversChanged = false;
      const updated = {};
      for (const [k, v] of Object.entries(covers)) {
        if (typeof v === 'string') {
          const cid = v.replace(/\.[^.]+$/, ''); // strip extension
          if (pidSet.has(cid) || pidSetLower.has(cid.toLowerCase())) {
            coversChanged = true; // imagen eliminada — no incluir en updated
            continue;
          }
        }
        updated[k] = v;
      }
      if (coversChanged) await saveCovers(cld, updated);
    } catch (e) {
      console.warn('portadas_config.json no actualizado:', e.message);
    }

    res.json({ ok: true, deleted: ids.length, catalog_updated, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
