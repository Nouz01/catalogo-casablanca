import { initCld, isAuthed, getCatalog, saveCatalog, getCovers, saveCovers, getAllResources } from './_cld.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const { items, dest_folder, type } = req.body;
  if (!items?.length || !dest_folder) return res.status(400).json({ error: 'Faltan parámetros' });

  const cld = initCld();
  let moved = 0;

  try {
    if (type === 'files') {
      for (const { public_id, format } of items) {
        const filename = public_id.split('/').pop();
        const new_id = dest_folder + '/' + filename;
        try {
          await cld.uploader.rename(public_id, new_id, { overwrite: false, resource_type: 'image' });
          moved++;
        } catch (e) {
          console.warn('No se pudo mover:', public_id, e.message);
        }
      }

      // Actualizar catalog.json
      try {
        const catalog = await getCatalog();
        let changed = false;
        const map = Object.fromEntries(
          items.map(({ public_id, format: fmt }) => [
            public_id.replace(/^catalogo\//, '1000X1000 Catalogo/') + '.' + (fmt || 'jpg'),
            (dest_folder + '/' + public_id.split('/').pop()).replace(/^catalogo\//, '1000X1000 Catalogo/') + '.' + (fmt || 'jpg'),
          ])
        );
        for (const p of catalog) {
          for (const v of p.vars || []) {
            v.fotos = v.fotos.map(f => { if (map[f]) { changed = true; return map[f]; } return f; });
          }
        }
        if (changed) await saveCatalog(cld, catalog);
      } catch (e) {
        console.warn('catalog.json no actualizado:', e.message);
      }

      // Actualizar portadas_config.json
      try {
        const covers = await getCovers();
        let coversChanged = false;
        const updated = {};
        for (const [k, v] of Object.entries(covers)) {
          const found = items.find(it => it.public_id === v);
          if (found) {
            updated[k] = dest_folder + '/' + found.public_id.split('/').pop();
            coversChanged = true;
          } else {
            updated[k] = v;
          }
        }
        if (coversChanged) await saveCovers(cld, updated);
      } catch (e) {
        console.warn('portadas_config.json no actualizado:', e.message);
      }

    } else if (type === 'folder') {
      const sourcePath = items[0];
      const folderName = sourcePath.split('/').pop();
      const resources = await getAllResources(cld, sourcePath);

      for (const r of resources) {
        const rel = r.public_id.slice(sourcePath.length + 1);
        const new_id = dest_folder + '/' + folderName + '/' + rel;
        try {
          await cld.uploader.rename(r.public_id, new_id, { overwrite: false, resource_type: 'image' });
          moved++;
        } catch (e) {
          console.warn('No se pudo mover:', r.public_id, e.message);
        }
      }

      // Actualizar catalog.json
      try {
        const oldPrefix = sourcePath.replace(/^catalogo\//, '1000X1000 Catalogo/') + '/';
        const newPrefix = (dest_folder + '/' + folderName + '/').replace(/^catalogo\//, '1000X1000 Catalogo/');
        const catalog = await getCatalog();
        let changed = false;
        for (const p of catalog) {
          for (const v of p.vars || []) {
            v.fotos = v.fotos.map(f => {
              if (f.startsWith(oldPrefix)) { changed = true; return f.replace(oldPrefix, newPrefix); }
              return f;
            });
          }
        }
        if (changed) await saveCatalog(cld, catalog);
      } catch (e) {
        console.warn('catalog.json no actualizado:', e.message);
      }

      // Actualizar portadas_config.json
      try {
        const covers = await getCovers();
        let coversChanged = false;
        const updated = {};
        const newBase = dest_folder + '/' + folderName + '/';
        for (const [k, v] of Object.entries(covers)) {
          if (typeof v === 'string' && v.startsWith(sourcePath + '/')) {
            updated[k] = newBase + v.slice(sourcePath.length + 1);
            coversChanged = true;
          } else {
            updated[k] = v;
          }
        }
        if (coversChanged) await saveCovers(cld, updated);
      } catch (e) {
        console.warn('portadas_config.json no actualizado:', e.message);
      }

      try { await cld.api.delete_folder(sourcePath); } catch (_) {}
    }

    res.json({ ok: true, moved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
