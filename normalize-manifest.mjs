/**
 * normalize-manifest.mjs
 * Normaliza las claves del manifest (catalog_tree.json) de MAYÚSCULAS → Title Case.
 * No toca Cloudinary. Solo ajusta las claves/valores del JSON para que el panel
 * admin muestre nombres en Title Case, aprovechando que el CDN es case-insensitive.
 */
import { v2 as cloudinary } from 'cloudinary';
import fs   from 'fs';
import os   from 'os';
import path from 'path';

cloudinary.config({
  cloud_name: 'dtelhncnm',
  api_key:    '541544243419254',
  api_secret: 'ScWKAEnpPn4XKB_8LAObTVdTFXo',
});

const MANIFEST_FILE = 'deploy/catalog_tree.json';
const DRY = process.argv.includes('--dry-run');

// ── helpers ───────────────────────────────────────────────────────────────────

function isAllCaps(str) {
  const letters = str.replace(/[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/g, '');
  return letters.length > 0
    && letters === letters.toUpperCase()
    && letters !== letters.toLowerCase();
}

function titleCase(str) {
  return str.split(' ').map(word => {
    const letters = word.replace(/[^a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/g, '');
    return (letters.length > 0
      && letters === letters.toUpperCase()
      && letters !== letters.toLowerCase())
      ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      : word;
  }).join(' ');
}

/** Normaliza TODOS los segmentos de una clave de carpeta (no es path de archivo) */
function normFolderKey(key) {
  if (!key) return key;
  return key.split('/').map(seg => isAllCaps(seg) ? titleCase(seg) : seg).join('/');
}

/** Normaliza los segmentos de un public_id excepto el último (nombre del archivo) */
function normPublicId(id) {
  const segs = id.split('/');
  return segs.map((seg, i) =>
    (i < segs.length - 1 && isAllCaps(seg)) ? titleCase(seg) : seg
  ).join('/');
}

// ── main ──────────────────────────────────────────────────────────────────────

const m = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));

// Rebuild folders object with normalized keys
const newFolders = {};
let folderKeyChanges = 0;
for (const [key, subNames] of Object.entries(m.folders)) {
  const normKey = normFolderKey(key);
  if (normKey !== key) folderKeyChanges++;
  // Also normalize the subfolder name arrays (immediate children)
  const normSubNames = subNames.map(n => isAllCaps(n) ? titleCase(n) : n);
  if (newFolders[normKey]) {
    // Merge if key collision (shouldn't happen normally)
    newFolders[normKey] = [...new Set([...newFolders[normKey], ...normSubNames])].sort((a,b)=>a.localeCompare(b,'es'));
  } else {
    newFolders[normKey] = normSubNames.sort((a,b)=>a.localeCompare(b,'es'));
  }
}

// Rebuild files object with normalized keys and normalized public_ids
const newFiles = {};
let fileKeyChanges = 0;
let fileIdChanges = 0;
for (const [key, ids] of Object.entries(m.files)) {
  const normKey = normFolderKey(key);
  if (normKey !== key) fileKeyChanges++;
  const normIds = ids.map(id => {
    const n = normPublicId(id);
    if (n !== id) fileIdChanges++;
    return n;
  });
  if (newFiles[normKey]) {
    newFiles[normKey] = [...new Set([...newFiles[normKey], ...normIds])].sort((a,b)=>a.localeCompare(b,'es'));
  } else {
    newFiles[normKey] = normIds.sort((a,b)=>a.localeCompare(b,'es'));
  }
}

console.log(`Folder key changes:  ${folderKeyChanges}`);
console.log(`File key changes:    ${fileKeyChanges}`);
console.log(`File public_id changes: ${fileIdChanges}`);
console.log(`Top-level after:`, newFolders[''].join(', '));

if (DRY) {
  console.log('\nDRY-RUN — sin cambios reales.');
  process.exit(0);
}

m.folders = newFolders;
m.files   = newFiles;
m.ts      = Math.floor(Date.now() / 1000);

const json = JSON.stringify(m);
fs.writeFileSync(MANIFEST_FILE, json, 'utf8');
console.log('\nManifest local actualizado.');

const tmp = path.join(os.tmpdir(), 'catalog_tree.json');
fs.writeFileSync(tmp, json, 'utf8');
await cloudinary.uploader.upload(tmp, {
  public_id: 'catalog_tree', resource_type: 'raw', overwrite: true
});
fs.unlinkSync(tmp);
console.log('✓ Manifest subido a Cloudinary.');
