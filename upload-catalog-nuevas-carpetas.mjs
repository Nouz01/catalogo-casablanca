import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

cloudinary.config({
  cloud_name: 'dtelhncnm',
  api_key:    '541544243419254',
  api_secret: 'ScWKAEnpPn4XKB_8LAObTVdTFXo',
});

// Carpetas locales a subir (las renombradas)
const CARPETAS = [
  '1000X1000 Catalogo/ACOLCHADOS/Lexus',
  '1000X1000 Catalogo/CORTINAS/Cortinas De Ambiente',
  '1000X1000 Catalogo/CORTINAS/Cortinas De Baño',
];

let done = 0, skipped = 0, errors = 0, total = 0;

function localToCloudId(localPath) {
  // "1000X1000 Catalogo/ACOLCHADOS/Lexus/foto.jpg" → "catalogo/ACOLCHADOS/Lexus/foto"
  return localPath
    .replace(/^1000X1000 Catalogo\//, 'catalogo/')
    .replace(/\.[^.]+$/, ''); // quita extensión
}

async function uploadFile(localPath) {
  const cloudId = localToCloudId(localPath.replace(/\\/g, '/'));
  try {
    await cloudinary.uploader.upload(localPath, {
      public_id:     cloudId,
      resource_type: 'image',
      overwrite:     false,
      use_filename:  false,
    });
    done++;
    process.stdout.write(`\r✓ ${done + skipped}/${total} — subidas: ${done}, ya existían: ${skipped}, errores: ${errors}`);
  } catch (e) {
    if (e.http_code === 400 && e.message?.includes('already exists')) {
      skipped++;
      process.stdout.write(`\r✓ ${done + skipped}/${total} — subidas: ${done}, ya existían: ${skipped}, errores: ${errors}`);
    } else {
      errors++;
      console.error(`\n✗ ${localPath}: ${e.message}`);
    }
  }
}

function collectFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(full));
    else if (/\.(jpg|jpeg|png|webp)$/i.test(entry.name)) files.push(full);
  }
  return files;
}

// Recopila todos los archivos primero para mostrar progreso real
const allFiles = CARPETAS.flatMap(c => (fs.existsSync(c) ? collectFiles(c) : []));
total = allFiles.length;

console.log(`\nSubiendo ${total} imágenes a Cloudinary...`);
console.log('Carpetas:', CARPETAS.join(', '), '\n');

for (const file of allFiles) {
  await uploadFile(file);
}

console.log(`\n\nListo: ${done} subidas, ${skipped} ya existían, ${errors} errores`);
if (errors > 0) console.log('Revisá los errores arriba y volvé a correr el script si hace falta.');
