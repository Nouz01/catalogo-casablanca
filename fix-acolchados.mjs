/**
 * fix-acolchados.mjs
 * Mueve los 8 archivos de catalogo/ACOLCHADOSs/Artistas/... → ACOLCHADOS/Artistas/...
 * y limpia el manifest.
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

const CDN_RAW = 'https://res.cloudinary.com/dtelhncnm/raw/upload/';
const MANIFEST_FILE = 'deploy/catalog_tree.json';

const m = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));

const spuriousFiles = m.files['ACOLCHADOSs/Artistas/Ágatha Ruiz de la Prada'] || [];
console.log(`Archivos a mover: ${spuriousFiles.length}`);
spuriousFiles.forEach(f => console.log(' ', f));

if (!spuriousFiles.length) { console.log('Nada que hacer.'); process.exit(0); }

// Rename each file in Cloudinary
let ok = 0, err = 0;
for (const oldId of spuriousFiles) {
  const newId = oldId.replace('catalogo/ACOLCHADOSs/', 'catalogo/ACOLCHADOS/');
  console.log(`\n${oldId}\n  → ${newId}`);
  try {
    await cloudinary.uploader.rename(oldId, newId, { overwrite: true });
    ok++;
    console.log('  ✓');
  } catch(e) {
    // Check if already at destination
    try {
      await cloudinary.api.resource(newId);
      ok++;
      console.log('  ✓ (ya estaba en destino)');
    } catch {
      err++;
      console.error('  ✗', e.message);
    }
  }
}
console.log(`\nRenames: ${ok} ok, ${err} errores`);

// Update manifest: move files from ACOLCHADOSs to ACOLCHADOS
const destKey = 'ACOLCHADOS/Artistas/Ágatha Ruiz de la Prada';
const existing = m.files[destKey] || [];
for (const oldId of spuriousFiles) {
  const newId = oldId.replace('catalogo/ACOLCHADOSs/', 'catalogo/ACOLCHADOS/');
  if (!existing.includes(newId)) existing.push(newId);
}
existing.sort((a,b) => a.localeCompare(b,'es'));
m.files[destKey] = existing;

// Remove ACOLCHADOSs entries
for (const key of Object.keys(m.files).filter(k => k.startsWith('ACOLCHADOSs'))) {
  delete m.files[key];
}
for (const key of Object.keys(m.folders).filter(k => k.startsWith('ACOLCHADOSs'))) {
  delete m.folders[key];
}
// Remove from top-level folders list
m.folders[''] = (m.folders[''] || []).filter(f => f !== 'ACOLCHADOSs');

// Update ts
m.ts = Math.floor(Date.now() / 1000);

const json = JSON.stringify(m);
fs.writeFileSync(MANIFEST_FILE, json, 'utf8');
console.log('\nManifest local actualizado.');

// Upload to Cloudinary
const tmp = path.join(os.tmpdir(), 'catalog_tree.json');
fs.writeFileSync(tmp, json, 'utf8');
await cloudinary.uploader.upload(tmp, {
  public_id: 'catalog_tree', resource_type: 'raw', overwrite: true
});
fs.unlinkSync(tmp);

console.log('✓ Manifest subido a Cloudinary.');
console.log('\nTop-level folders:', m.folders[''].join(', '));
