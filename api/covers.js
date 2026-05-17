import { initCld, isAuthed, getCovers, saveCovers } from './_cld.js';

export default async function handler(req, res) {
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    try {
      const data = await getCovers();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else if (req.method === 'POST') {
    const { data } = req.body;
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'data requerido' });
    try {
      const cld = initCld();
      // Merge con el config existente (no pisar claves que no se enviaron)
      const current = await getCovers().catch(() => ({}));
      const merged = { ...current, ...data };
      await saveCovers(cld, merged);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  } else {
    res.status(405).end();
  }
}
