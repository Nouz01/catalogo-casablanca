import { initCld, isAuthed, getCatalog, saveCatalog } from './_cld.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    try {
      const data = await getCatalog();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'POST') {
    const { catalog } = req.body;
    if (!Array.isArray(catalog)) return res.status(400).json({ error: 'catalog debe ser un array' });
    try {
      const cld = initCld();
      await saveCatalog(cld, catalog);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(405).end();
  }
}
