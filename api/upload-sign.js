import { initCld, isAuthed } from './_cld.js';

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!isAuthed(req)) return res.status(401).json({ error: 'No autorizado' });

  const { folder } = req.body;
  if (!folder) return res.status(400).json({ error: 'folder requerido' });

  const cld = initCld();
  const timestamp = Math.round(Date.now() / 1000);
  const params = { timestamp, folder };
  const signature = cld.utils.api_sign_request(params, process.env.CLD_SECRET);

  res.json({
    signature,
    timestamp,
    api_key: process.env.CLD_KEY,
    cloud_name: process.env.CLD_CLOUD,
    folder,
  });
}
