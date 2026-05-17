/**
 * normalize-names.mjs
 *
 * Normaliza carpetas ALL_CAPS → Title Case en todo el proyecto.
 * Ejemplo: ACOLCHADOS → Acolchados, ORO LISO → Oro Liso
 *
 * Qué hace:
 *   1. Cloudinary:        renombra assets con carpetas en mayúsculas
 *   2. portadas_config:   actualiza paths guardados en Cloudinary
 *   3. Manifest:          regenera catalog_tree.json desde cero
 *   4. Archivos locales:  catalog.js, deploy/index.html, index.html
 *
 * Uso:
 *   node normalize-names.mjs --dry-run   → ver qué cambiaría (sin tocar nada)
 *   node normalize-names.mjs             → aplicar todos los cambios
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

const ROOT    = 'catalogo';
const CDN_IMG = 'https://res.cloudinary.com/dtelhncnm/image/upload/';
const CDN_RAW = 'https://res.cloudinary.com/dtelhncnm/raw/upload/';
const DRY     = process.argv.includes('--dry-run');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Devuelve true si str es completamente MAYÚSCULAS (tiene letras y son todas upper) */
function isAllCaps(str) {
  const letters = str.replace(/[^a-zA-Z]/g, '');
  return letters.length > 0
    && letters === letters.toUpperCase()
    && letters !== letters.toLowerCase();
}

/** "ORO LISO" → "Oro Liso", "Infantiles" → "Infantiles" (ya está bien) */
function titleCase(str) {
  return str.split(' ').map(word => {
    const letters = word.replace(/[^a-zA-Z]/g, '');
    return (letters.length > 0
      && letters === letters.toUpperCase()
      && letters !== letters.toLowerCase())
      ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      : word;
  }).join(' ');
}

/**
 * Normaliza los segmentos de carpeta de un path (no el filename = último segmento).
 * "ACOLCHADOS/ORO LISO/AC ORO LISO TWIN BLANCO" → "Acolchados/Oro Liso/AC ORO LISO TWIN BLANCO"
 */
function normalizePath(p) {
  const segs = p.split('/');
  return segs.map((seg, i) =>
    (i < segs.length - 1 && isAllCaps(seg)) ? titleCase(seg) : seg
  ).join('/');
}

// ─── 1. Cloudinary: renombrar assets ──────────────────────────────────────────

async function fetchAll(prefix) {
  let all = [], cursor = null;
  process.stdout.write(`  Cargando '${prefix}'`);
  do {
    const r = await cloudinary.api.resources({
      type: 'upload', prefix: prefix + '/', max_results: 500,
      ...(cursor ? { next_cursor: cursor } : {})
    });
    all.push(...(r.resources || []));
    cursor = r.next_cursor;
    process.stdout.write('.');
  } while (cursor);
  console.log(` ${all.length} archivos`);
  return all;
}

async function renameCloudinaryAssets(resources) {
  const pairs = resources
    .map(r => ({
      old: r.public_id,
      // ROOT prefix se saca, se normaliza, se vuelve a poner
      new: ROOT + '/' + normalizePath(r.public_id.slice(ROOT.length + 1))
    }))
    .filter(p => p.old !== p.new);

  if (!pairs.length) { console.log('  Sin cambios en Cloudinary.'); return; }

  // Mostrar carpetas únicas que cambian
  const seen = new Set();
  for (const p of pairs) {
    const oldDir = p.old.split('/').slice(0, -1).join('/');
    const newDir = p.new.split('/').slice(0, -1).join('/');
    const k = `${oldDir} → ${newDir}`;
    if (!seen.has(k)) { seen.add(k); console.log('  ' + k); }
  }
  console.log(`  Total: ${pairs.length} archivos a renombrar`);

  if (DRY) return;

  let ok = 0, err = 0;
  for (let i = 0; i < pairs.length; i++) {
    const p = pairs[i];
    try {
      await cloudinary.uploader.rename(p.old, p.new, { overwrite: true });
      ok++;
    } catch(e) {
      // Verificar si ya estaba renombrado (retry seguro)
      try { await cloudinary.api.resource(p.new); ok++; }
      catch { err++; console.error(`\n  ✗ ${p.old}: ${e.message}`); }
    }
    if ((i + 1) % 20 === 0 || i === pairs.length - 1)
      process.stdout.write(`\r  Progreso: ${i + 1}/${pairs.length}...`);
  }
  console.log(`\n  ✓ ${ok} renombrados${err ? `, ${err} errores` : ''}`);
}

// ─── 2. portadas_config.json en Cloudinary ────────────────────────────────────

async function updatePortadasConfig() {
  const ID = 'portadas_config';
  let cfg = {};
  try {
    const r = await fetch(`${CDN_RAW}${ID}.json?t=${Date.now()}`);
    cfg = r.ok ? await r.json() : {};
  } catch {
    console.log('  (portadas_config.json no encontrado o vacío)');
    return;
  }

  let changed = false;
  for (const k of Object.keys(cfg)) {
    const oldVal = cfg[k];
    const newVal = normalizePath(oldVal);
    if (oldVal !== newVal) {
      console.log(`  [${k}] ${oldVal} → ${newVal}`);
      cfg[k] = newVal;
      changed = true;
    }
  }
  if (!changed) { console.log('  Sin cambios.'); return; }
  if (DRY) return;

  const tmp = path.join(os.tmpdir(), 'portadas_config.json');
  fs.writeFileSync(tmp, JSON.stringify(cfg), 'utf8');
  await cloudinary.uploader.upload(tmp, {
    public_id: ID, resource_type: 'raw', overwrite: true
  });
  fs.unlinkSync(tmp);
  console.log('  ✓ Guardado en Cloudinary.');
}

// ─── 3. Manifest (catalog_tree.json) ─────────────────────────────────────────

async function regenerateManifest() {
  // Re-fetch después del rename para tener paths actualizados
  const resources = await fetchAll(ROOT);

  const folders = { '': new Set() };
  const files   = { '': [] };
  for (const res of resources) {
    const rel   = res.public_id.slice(ROOT.length + 1);
    const parts = rel.split('/');
    const dir   = parts.slice(0, -1);
    for (let i = 0; i <= dir.length; i++) {
      const key = dir.slice(0, i).join('/');
      if (!folders[key]) folders[key] = new Set();
      if (!files[key])   files[key]   = [];
      if (i < dir.length) folders[key].add(dir[i]);
    }
    const dk = dir.join('/');
    if (!files[dk]) files[dk] = [];
    files[dk].push(res.public_id);
  }

  const manifest = {
    ts: Math.floor(Date.now() / 1000),
    folders: Object.fromEntries(
      Object.entries(folders).map(([k, v]) => [k, [...v].sort((a,b) => a.localeCompare(b,'es'))])
    ),
    files: Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k, v.sort((a,b) => a.localeCompare(b,'es'))])
    )
  };

  const json = JSON.stringify(manifest);
  fs.writeFileSync('deploy/catalog_tree.json', json, 'utf8');

  const tmp = path.join(os.tmpdir(), 'catalog_tree.json');
  fs.writeFileSync(tmp, json, 'utf8');
  await cloudinary.uploader.upload(tmp, {
    public_id: 'catalog_tree', resource_type: 'raw', overwrite: true
  });
  fs.unlinkSync(tmp);

  const nFolders = Object.keys(manifest.folders).length;
  const nFiles   = Object.values(manifest.files).reduce((s, a) => s + a.length, 0);
  console.log(`  ✓ Manifest regenerado: ${nFolders} carpetas, ${nFiles} archivos`);
}

// ─── 4. Archivos locales ──────────────────────────────────────────────────────

/**
 * Transforma todos los paths en el contenido de un archivo:
 *   - '1000X1000 Catalogo/FOLDER/...'  → catalog.js
 *   - 'https://res.cloudinary.com/.../catalogo/FOLDER/...'  → src attrs en HTML
 *   - 'catalogo/FOLDER/...'  → PORTADAS_DEF en portadas_config.json
 */
function transformContent(src) {
  return src
    // ① catalog.js: paths '1000X1000 Catalogo/...'
    .replace(
      /(['"`])1000X1000 Catalogo\/([^'"`\r\n]+)(['"`])/g,
      (_, q1, p, q2) => q1 + '1000X1000 Catalogo/' + normalizePath(p) + q2
    )
    // ② URLs de Cloudinary en HTML (con o sin URL-encoding)
    .replace(
      /(https:\/\/res\.cloudinary\.com\/dtelhncnm\/image\/upload\/)(catalogo\/[^"'\r\n>]+)/g,
      (_, pfx, rawPath) => {
        const decoded    = decodeURIComponent(rawPath);
        const normalized = normalizePath(decoded);
        if (decoded === normalized) return pfx + rawPath; // sin cambio
        // Preservar el estilo de encoding del original
        const wasEncoded = rawPath !== decoded;
        const out = wasEncoded
          ? normalized.split('/').map(encodeURIComponent).join('/')
          : normalized;
        return pfx + out;
      }
    )
    // ③ Paths bare 'catalogo/...' (PORTADAS_DEF, etc.)
    .replace(
      /(['"`])(catalogo\/[^'"`\r\n]+)(['"`])/g,
      (_, q1, p, q2) => q1 + normalizePath(p) + q2
    );
}

function updateLocalFiles() {
  const files = [
    'catalog.js',
    'deploy/index.html',
    'index.html',

  ];

  let anyChanged = false;
  for (const f of files) {
    if (!fs.existsSync(f)) { console.log(`  (omitiendo ${f} — no existe)`); continue; }
    const original = fs.readFileSync(f, 'utf8');
    const updated  = transformContent(original);
    if (original === updated) {
      console.log(`  — ${f} (sin cambios)`);
    } else {
      const changed = original.split('\n').reduce(
        (n, l, i) => n + (l !== (updated.split('\n')[i] ?? '') ? 1 : 0), 0
      );
      if (!DRY) fs.writeFileSync(f, updated, 'utf8');
      console.log(`  ✓ ${f}  (${changed} línea${changed !== 1 ? 's' : ''} cambiada${changed !== 1 ? 's' : ''})`);
      anyChanged = true;
    }
  }
  return anyChanged;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY
    ? '\n🔍  DRY-RUN — sin cambios reales\n'
    : '\n🚀  Normalizando carpetas MAYÚSCULAS → Title Case\n'
  );

  // 1. Cloudinary
  console.log('1. Cloudinary — renombrando assets:');
  const resources = await fetchAll(ROOT);
  await renameCloudinaryAssets(resources);

  if (!DRY) {
    // 2. portadas_config
    console.log('\n2. portadas_config.json:');
    await updatePortadasConfig();

    // 3. Manifest
    console.log('\n3. Regenerando manifest (catalog_tree.json):');
    await regenerateManifest();
  }

  // 4. Archivos locales
  console.log(DRY ? '\n2. Archivos locales (simulación):' : '\n4. Archivos locales:');
  const changed = updateLocalFiles();

  if (DRY) {
    console.log('\n✔  Dry-run completo.');
    console.log('   Ejecutá sin --dry-run para aplicar los cambios.\n');
  } else {
    console.log('\n✔  ¡Listo!');
    if (changed) {
      console.log('   Commiteá los archivos modificados:');
      console.log('   git add catalog.js deploy/index.html index.html deploy/catalog_tree.json');
      console.log('   git commit -m "refactor: normalizar nombres de carpetas a Title Case"');
    }
    console.log();
  }
}

main().catch(err => {
  console.error('\n✗ Error fatal:', err.message);
  process.exit(1);
});
