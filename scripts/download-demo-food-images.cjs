// Download the curated demo photos unchanged so app and admin do not depend on
// Wikimedia thumbnail rate limits at runtime. See food-images.json for credits.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../demo-data');
const folder = path.join(root, 'food-images');
const manifestPath = path.join(root, 'food-images.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
fs.mkdirSync(folder, { recursive: true });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  for (const [key, photo] of Object.entries(manifest.photos)) {
    if (photo.image.startsWith('/demo-food/') && fs.existsSync(path.join(folder, path.basename(photo.image)))) continue;
    const sourceImage = photo.sourceImage || photo.image;
    let response;
    for (let attempt = 0; attempt < 6; attempt++) {
      response = await fetch(sourceImage, { headers: { 'User-Agent': 'CampusDropDemo/1.0 (licensed food image download)' } });
      if (response.ok) break;
      if (response.status !== 429 && response.status < 500) throw Error(`${key}: HTTP ${response.status}`);
      await wait(10000 * (attempt + 1));
    }
    if (!response?.ok) throw Error(`${key}: image download failed`);
    const mime = response.headers.get('content-type')?.split(';')[0];
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
    if (!extension) throw Error(`${key}: unexpected content type ${mime}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 8_000_000) throw Error(`${key}: image exceeds 8 MB`);
    fs.writeFileSync(path.join(folder, `${key}.${extension}`), bytes);
    photo.sourceImage = sourceImage;
    photo.image = `/demo-food/${key}.${extension}`;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`${key}: ${Math.round(bytes.length / 1024)} KB`);
    await wait(900);
  }
  const photoByRemote = new Map(Object.values(manifest.photos).map(p => [p.sourceImage, p.image]));
  for (const [name, oldImage] of Object.entries(manifest.products))
    manifest.products[name] = photoByRemote.get(oldImage) || oldImage;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  const updatePath = path.join(root, 'food-image-update.sql');
  let sql = fs.readFileSync(updatePath, 'utf8');
  for (const [remote, local] of photoByRemote) sql = sql.replaceAll(remote, local);
  fs.writeFileSync(updatePath, sql);
  console.log(`Saved ${Object.keys(manifest.photos).length} locally hosted demo photos.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
