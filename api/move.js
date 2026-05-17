import { initCld, isAuthed, getCatalog, saveCatalog, getAllResources } from './_cld.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const { items, dest_folder, type } = req.body;
  if (!items?.length || !dest_folder || !type)
    return res.status(400).json({ error: 'items, dest_folder y type son requeridos' });

  const cld = initCld();

  try {
    let moved = 0;
    const catalog = await getCatalog().catch(() => null);
    let catalogChanged = false;

    if (type === 'files') {
      for (const { public_id, format } of items) {
        const filename = public_id.split('/').pop();
        const new_id = dest_folder + '/' + filename;
        if (public_id === new_id) continue;
        try {
          await cld.uploader.rename(public_id, new_id, { overwrite: false, resource_type: 'image' });
          moved++;
          if (catalog) {
            const ext = format || 'jpg';
            const oldPath = public_id.replace(/^catalogo\//, '1000X1000 Catalogo/') + '.' + ext;
            const newPath = new_id.replace(/^catalogo\//, '1000X1000 Catalogo/') + '.' + ext;
            for (const p of catalog) {
              for (const v of p.vars || []) {
                const i = v.fotos.indexOf(oldPath);
                if (i >= 0) { v.fotos[i] = newPath; catalogChanged = true; }
              }
            }
          }
        } catch (e) {
          console.warn('No se pudo mover:', public_id, e.message);
        }
      }

    } else {
      // type === 'folder'
      const source_folder = items[0];
      const folderName = source_folder.split('/').pop();
      const new_folder = dest_folder + '/' + folderName;
      if (source_folder === new_folder)
        return res.status(400).json({ error: 'El origen y destino son iguales' });
      if (new_folder.startsWith(source_folder + '/'))
        return res.status(400).json({ error: 'No se puede mover una carpeta dentro de sí misma' });

      const resources = await getAllResources(cld, source_folder);
      const oldPrefix = source_folder.replace(/^catalogo\//, '1000X1000 Catalogo/') + '/';
      const newPrefix = new_folder.replace(/^catalogo\//, '1000X1000 Catalogo/') + '/';

      for (const r of resources) {
        const newId = r.public_id.replace(source_folder + '/', new_folder + '/');
        try {
          await cld.uploader.rename(r.public_id, newId, { overwrite: false, resource_type: 'image' });
          moved++;
          if (catalog) {
            for (const p of catalog) {
              for (const v of p.vars || []) {
                v.fotos = v.fotos.map(f => {
                  if (f.startsWith(oldPrefix)) { catalogChanged = true; return f.replace(oldPrefix, newPrefix); }
                  return f;
                });
              }
            }
          }
        } catch (e) {
          console.warn('No se pudo mover:', r.public_id, e.message);
        }
      }
      try { await cld.api.delete_folder(source_folder); } catch (_) {}
    }

    if (catalog && catalogChanged) await saveCatalog(cld, catalog);
    res.json({ ok: true, moved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
