import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';

cloudinary.config({
  cloud_name: 'dtelhncnm',
  api_key:    '541544243419254',
  api_secret: 'ScWKAEnpPn4XKB_8LAObTVdTFXo',
});

const logos = [
  { local: './Logos/casablanca_blanco_Mesa de trabajo 1.png', id: 'logos/casablanca_blanco' },
  { local: './Logos/Logo tienda de blanco.png',               id: 'logos/tienda_de_blanco' },
];

for (const { local, id } of logos) {
  try {
    await cloudinary.uploader.upload(local, { public_id: id, resource_type: 'image', overwrite: true, use_filename: false });
    console.log(`✓ ${id}`);
  } catch(e) {
    console.error(`✗ ${local}: ${e.message}`);
  }
}
console.log('Listo.');
