import { initCld, isAuthed, getCatalog, saveCatalog, getCovers, saveCovers, getAllResources } from './_cld.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const { old_path, new_path, type, format } = req.body;
  if (!old_path || !new_path) return res.status(400).json({ error: 'old_path y new_path requeridos' });

  const cld = initCld();

  try {
    let renamed = 0;
    let catalog_updated = true;

    if (type === 'file') {
      // Renombrar un archivo individual
      await cld.uploader.rename(old_path, new_path, { overwrite: false, resource_type: 'image' });
      renamed = 1;

      // Actualizar catalog.json
      try {
        const ext = format || 'jpg';
        const oldCatPath = old_path.replace(/^catalogo\//, '1000X1000 Catalogo/') + '.' + ext;
        const newCatPath = new_path.replace(/^catalogo\//, '1000X1000 Catalogo/') + '.' + ext;
        const catalog = await getCatalog();
        let changed = false;
        for (const p of catalog) {
          for (const v of p.vars || []) {
            const i = v.fotos.findIndex(f => f === oldCatPath || f.toLowerCase() === oldCatPath.toLowerCase());
            if (i >= 0) { v.fotos[i] = newCatPath; changed = true; }
          }
        }
        if (changed) await saveCatalog(cld, catalog);
      } catch (e) {
        console.warn('catalog.json no actualizado:', e.message);
        catalog_updated = false;
      }

      // Actualizar portadas_config.json si este archivo es una portada
      // Nota: portadas_config.json almacena rutas CON extensión (ej: catalogo/X/foto.jpg)
      //       pero old_path es el public_id SIN extensión → comparar agregando la extensión
      try {
        const ext = format || 'jpg';
        const oldFull = old_path + '.' + ext;
        const newFull = new_path + '.' + ext;
        const covers = await getCovers();
        let coversChanged = false;
        const updated = {};
        for (const [k, v] of Object.entries(covers)) {
          if (typeof v === 'string' && v.toLowerCase() === oldFull.toLowerCase()) {
            updated[k] = newFull; coversChanged = true;
          } else {
            updated[k] = v;
          }
        }
        if (coversChanged) await saveCovers(cld, updated);
      } catch (e) {
        console.warn('portadas_config.json no actualizado:', e.message);
      }
    } else {
      // Renombrar carpeta: mover todos los recursos
      const resources = await getAllResources(cld, old_path);

      for (const r of resources) {
        const newId = r.public_id.replace(old_path + '/', new_path + '/');
        try {
          await cld.uploader.rename(r.public_id, newId, { overwrite: false, resource_type: 'image' });
          renamed++;
        } catch (e) {
          console.warn('No se pudo renombrar:', r.public_id, e.message);
        }
      }

      // Actualizar catalog.json: reemplazar prefijo en todas las rutas
      try {
        const oldPrefix = old_path.replace(/^catalogo\//, '1000X1000 Catalogo/') + '/';
        const newPrefix = new_path.replace(/^catalogo\//, '1000X1000 Catalogo/') + '/';
        const catalog = await getCatalog();
        let changed = false;
        for (const p of catalog) {
          for (const v of p.vars || []) {
            v.fotos = v.fotos.map(f => {
              if (f.toLowerCase().startsWith(oldPrefix.toLowerCase())) { changed = true; return newPrefix + f.slice(oldPrefix.length); }
              return f;
            });
          }
        }
        if (changed) await saveCatalog(cld, catalog);
      } catch (e) {
        console.warn('catalog.json no actualizado:', e.message);
        catalog_updated = false;
      }

      // Actualizar portadas_config.json: reemplazar prefijo en valores
      try {
        const covers = await getCovers();
        let coversChanged = false;
        const updated = {};
        for (const [k, v] of Object.entries(covers)) {
          if (typeof v === 'string' && v.toLowerCase().startsWith((old_path + '/').toLowerCase())) {
            updated[k] = new_path + '/' + v.slice(old_path.length + 1);
            coversChanged = true;
          } else {
            updated[k] = v;
          }
        }
        if (coversChanged) await saveCovers(cld, updated);
      } catch (e) {
        console.warn('portadas_config.json no actualizado:', e.message);
      }

      // Intentar borrar carpeta vieja (solo si está vacía)
      try { await cld.api.delete_folder(old_path); } catch (_) {}
    }

    res.json({ ok: true, renamed, catalog_updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
