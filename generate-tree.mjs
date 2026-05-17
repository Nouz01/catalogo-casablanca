/**
 * Genera catalog_tree.json a partir de los recursos de Cloudinary.
 * Infiere la estructura de carpetas directamente de los public_ids.
 *
 * Uso: node generate-tree.mjs
 */
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import os from 'os';
import path from 'path';

cloudinary.config({
  cloud_name: 'dtelhncnm',
  api_key:    '541544243419254',
  api_secret: 'ScWKAEnpPn4XKB_8LAObTVdTFXo',
});

const ROOT = 'catalogo';

// Obtiene TODOS los recursos bajo el prefix dado
async function getAllResources(prefix) {
  let all = [], cursor = null;
  process.stdout.write('  Cargando recursos');
  do {
    const res = await cloudinary.api.resources({
      type: 'upload', prefix: prefix + '/', max_results: 500,
      ...(cursor ? { next_cursor: cursor } : {})
    });
    all.push(...(res.resources || []));
    cursor = res.next_cursor;
    process.stdout.write('.');
  } while (cursor);
  console.log(` ${all.length} archivos`);
  return all;
}

// Construye el árbol folders + files a partir de la lista plana de recursos
function buildTree(resources, rootPrefix) {
  const folders = { '': new Set() };
  const files   = { '': [] };

  for (const res of resources) {
    const relFull = res.public_id.slice(rootPrefix.length + 1); // e.g. "ACOLCHADOS/Lexus_/file.jpg"
    const parts   = relFull.split('/');
    const fileName = parts[parts.length - 1];
    const dirParts = parts.slice(0, -1);

    // Ensure all ancestor folders exist
    for (let i = 0; i <= dirParts.length; i++) {
      const key = dirParts.slice(0, i).join('/');
      if (!folders[key]) folders[key] = new Set();
      if (!files[key])   files[key]   = [];
      if (i < dirParts.length) {
        folders[key].add(dirParts[i]);
      }
    }

    const dirKey = dirParts.join('/');
    if (!files[dirKey]) files[dirKey] = [];
    files[dirKey].push(res.public_id);
  }

  // Convert Sets to sorted arrays
  const foldersOut = {};
  for (const [k, v] of Object.entries(folders)) {
    foldersOut[k] = [...v].sort((a,b) => a.localeCompare(b,'es'));
  }
  const filesOut = {};
  for (const [k, v] of Object.entries(files)) {
    filesOut[k] = v.sort((a,b) => a.localeCompare(b,'es'));
  }

  return { folders: foldersOut, files: filesOut };
}

console.log('Generando árbol del catálogo…');
const resources = await getAllResources(ROOT);
const { folders, files } = buildTree(resources, ROOT);
const manifest = { ts: Math.floor(Date.now() / 1000), folders, files };
const json = JSON.stringify(manifest);

// Guardar localmente
const localOut = path.join('deploy', 'catalog_tree.json');
fs.writeFileSync(localOut, json, 'utf8');
console.log(`Guardado localmente: ${localOut} (${(json.length/1024).toFixed(1)}KB)`);

// Subir a Cloudinary como raw resource público
const tmpPath = path.join(os.tmpdir(), 'catalog_tree.json');
fs.writeFileSync(tmpPath, json, 'utf8');
const result = await cloudinary.uploader.upload(tmpPath, {
  public_id: 'catalog_tree', resource_type: 'raw', overwrite: true
});
fs.unlinkSync(tmpPath);

const folderCount = Object.keys(folders).length;
const fileCount   = Object.values(files).reduce((s,arr) => s + arr.length, 0);
console.log(`\n✓ Subido a Cloudinary: ${result.secure_url}`);
console.log(`  Carpetas: ${folderCount}  |  Archivos: ${fileCount}`);
console.log('\n¡Listo! El catálogo está disponible en el CDN.');
