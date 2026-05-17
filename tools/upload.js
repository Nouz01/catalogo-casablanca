import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carga .env.local desde la raíz del proyecto
const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

if (!process.env.CLD_CLOUD || !process.env.CLD_KEY || !process.env.CLD_SECRET) {
  console.error('❌  Falta .env.local con CLD_CLOUD, CLD_KEY y CLD_SECRET');
  console.error('    Creá el archivo en la raíz del proyecto con esas tres variables.');
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLD_CLOUD,
  api_key:    process.env.CLD_KEY,
  api_secret: process.env.CLD_SECRET,
});

const [localDir, destFolder] = process.argv.slice(2);

if (!localDir || !destFolder) {
  console.log('Uso:    node tools/upload.js <carpeta-local> <destino-cloudinary>');
  console.log('Ej:     node tools/upload.js "C:\\fotos\\lexus" "catalogo/ACOLCHADOS/Lexus_"');
  process.exit(1);
}

if (!fs.existsSync(localDir)) {
  console.error('❌  Carpeta no encontrada:', localDir);
  process.exit(1);
}

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const files = fs.readdirSync(localDir)
  .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
  .sort();

if (!files.length) {
  console.log('No se encontraron imágenes en:', localDir);
  process.exit(0);
}

console.log(`\nSubiendo ${files.length} imagen(es) → "${destFolder}"\n`);

let ok = 0, errors = 0;

for (const file of files) {
  const fullPath = path.join(localDir, file);
  const publicId = path.basename(file, path.extname(file));
  process.stdout.write(`  ${file}... `);
  try {
    const result = await cloudinary.uploader.upload(fullPath, {
      folder: destFolder,
      public_id: publicId,
      overwrite: false,
      resource_type: 'image',
    });
    console.log(`✓  ${result.secure_url}`);
    ok++;
  } catch (err) {
    console.log(`✗  ${err.message}`);
    errors++;
  }
}

console.log(`\n${ok} subida(s) OK${errors ? `, ${errors} error(es)` : ' ✓'}`);
if (ok > 0) {
  console.log('⚠️  Recordá ejecutar "Reparar Catálogo" en el panel admin para que aparezcan en el catálogo.\n');
}
