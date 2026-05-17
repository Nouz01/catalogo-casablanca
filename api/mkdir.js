import { initCld, isAuthed } from './_cld.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const { folder } = req.body;
  if (!folder) return res.status(400).json({ error: 'folder requerido' });

  const cld = initCld();

  try {
    await cld.api.create_folder(folder);
    res.json({ ok: true, folder });
  } catch (e) {
    // En Dynamic Folder Mode, create_folder puede fallar — no es error crítico
    if (e.error?.http_code === 400 && e.error?.message?.includes('already exists')) {
      return res.json({ ok: true, folder, note: 'ya existía' });
    }
    // En Dynamic mode, la carpeta se crea al subir la primera imagen
    res.json({ ok: true, folder, note: 'se creará al subir la primera foto' });
  }
}
