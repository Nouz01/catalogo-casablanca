import { v2 as cloudinary } from 'cloudinary';

export function initCld() {
  cloudinary.config({
    cloud_name: process.env.CLD_CLOUD,
    api_key:    process.env.CLD_KEY,
    api_secret: process.env.CLD_SECRET,
  });
  return cloudinary;
}

export function isAuthed(req) {
  return req.headers.authorization === `Bearer ${process.env.ADMIN_PIN_HASH}`;
}

export async function getCatalog() {
  const url = `https://res.cloudinary.com/${process.env.CLD_CLOUD}/raw/upload/catalog.json?t=${Date.now()}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('catalog.json no encontrado en Cloudinary');
  return r.json();
}

export function saveCatalog(cld, data) {
  return new Promise((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      { resource_type: 'raw', public_id: 'catalog', format: 'json', overwrite: true, invalidate: true },
      (err, res) => err ? reject(err) : resolve(res)
    );
    stream.end(Buffer.from(JSON.stringify(data)));
  });
}

export async function getCovers() {
  const url = `https://res.cloudinary.com/${process.env.CLD_CLOUD}/raw/upload/portadas_config.json?t=${Date.now()}`;
  const r = await fetch(url);
  return r.ok ? r.json() : {};
}

export function saveCovers(cld, data) {
  return new Promise((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      { resource_type: 'raw', public_id: 'portadas_config', format: 'json', overwrite: true, invalidate: true },
      (err, res) => err ? reject(err) : resolve(res)
    );
    stream.end(Buffer.from(JSON.stringify(data)));
  });
}

// Devuelve todas las resources bajo un prefix (paginado)
export async function getAllResources(cld, prefix) {
  let all = [], cursor = null;
  do {
    const res = await cld.api.resources({
      type: 'upload', resource_type: 'image',
      prefix: prefix + '/', max_results: 500,
      ...(cursor ? { next_cursor: cursor } : {}),
    });
    all.push(...(res.resources || []));
    cursor = res.next_cursor;
  } while (cursor);
  return all;
}

// Convierte public_id de Cloudinary a path de catalog.json
export function cidToCatalogPath(public_id, format) {
  return public_id.replace(/^catalogo\//, '1000X1000 Catalogo/') + '.' + (format || 'jpg');
}

// Convierte path de catalog.json a public_id de Cloudinary
export function catalogPathToCid(path) {
  return path.replace(/^1000X1000 Catalogo\//, 'catalogo/').replace(/\.[^.]+$/, '');
}
