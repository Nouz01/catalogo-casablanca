/**
 * Script de uso único: convierte catalog.js → catalog.json y lo sube a Cloudinary.
 * Lee el catalog.js original desde git HEAD para evitar leer la versión dinámica.
 * Ejecutar: node convert-catalog.mjs
 */
import { v2 as cloudinary } from 'cloudinary';
import { execSync } from 'child_process';

cloudinary.config({
  cloud_name: 'dtelhncnm',
  api_key:    '541544243419254',
  api_secret: 'ScWKAEnpPn4XKB_8LAObTVdTFXo',
});

// Leer catalog.js original desde git HEAD
let code;
try {
  code = execSync('git show HEAD:catalog.js', { encoding: 'utf8' });
} catch {
  console.error('❌ No se pudo leer catalog.js desde git. Asegurate de estar en el repositorio.');
  process.exit(1);
}

// Evaluar con Function para extraer CATALOG (vm no expone const al contexto externo)
const fn = new Function(code + '; return CATALOG;');
const CATALOG = fn();

if (!Array.isArray(CATALOG) || CATALOG.length === 0) {
  console.error('❌ No se pudo extraer CATALOG del archivo');
  process.exit(1);
}

console.log(`✓ CATALOG leído: ${CATALOG.length} productos`);
const buffer = Buffer.from(JSON.stringify(CATALOG));
console.log('⬆  Subiendo catalog.json a Cloudinary…');

const result = await new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { resource_type: 'raw', public_id: 'catalog', format: 'json', overwrite: true, invalidate: true },
    (err, res) => err ? reject(err) : resolve(res)
  );
  stream.end(buffer);
});

console.log('✅ catalog.json subido correctamente');
console.log('   URL:', result.secure_url);
console.log('\n¡Listo! El catálogo ahora vive en Cloudinary.');
