// Curate distinct demo food photos from Wikimedia Commons and prepare an additive SQL update.
const fs = require('node:fs');
const path = require('node:path');
const { groups, id } = require('./build-team-demo.cjs');

const directory = path.join(__dirname, '../demo-data');
const generic = 'https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=800&q=80';
const searches = {
  pizza: 'margherita pizza food', burger: 'veggie burger sandwich', momos: 'momo dumplings food',
  chickenPizza: 'chicken pizza food', chickenBurger: 'chicken burger food',
  chickenMomos: 'chicken momos dumplings', chickenThali: 'chicken thali indian meal',
  pasta: 'penne pasta tomato sauce', sandwich: 'grilled cheese sandwich food', noodles: 'hakka noodles food',
  friedRice: 'fried rice food', manchurian: 'gobi manchurian food', samosa: 'samosa food',
  pakora: 'pakora food', paratha: 'paratha indian food', dosa: 'masala dosa food',
  idli: 'idli sambar food', poha: 'poha indian food', biryani: 'vegetable biryani food',
  thali: 'indian thali food', paneer: 'paneer curry food', chicken: 'indian chicken curry dish',
  fish: 'indian fish curry dish', egg: 'indian egg curry dish', chaat: 'chaat indian food',
  litti: 'litti chokha food', jalebi: 'jalebi food', sweet: 'gulab jamun indian dessert',
  iceCream: 'ice cream food', brownie: 'chocolate brownie food', shake: 'milkshake drink',
  tea: 'chai tea drink', coffee: 'coffee cup beverage', juice: 'orange juice glass',
  soda: 'soft drink soda glass', maggi: 'cooked instant noodles', roll: 'kathi roll food',
  chips: 'potato chips food', bread: 'garlic bread food', curry: 'indian curry food',
  breakfast: 'indian breakfast food', rice: 'rice meal food', water: 'mineral water bottle on table',
};

function photoKey(name, category) {
  const n = name.toLowerCase();
  const patterns = [
    [/chicken pizza/, 'chickenPizza'], [/chicken burger/, 'chickenBurger'],
    [/chicken momos/, 'chickenMomos'], [/chicken thali/, 'chickenThali'],
    [/litti/, 'litti'], [/jalebi|imarti/, 'jalebi'], [/momo/, 'momos'],
    [/pizza/, 'pizza'], [/burger|vada pav/, 'burger'], [/pasta/, 'pasta'],
    [/sandwich|toast/, 'sandwich'], [/noodle|maggi/, 'noodles'],
    [/fried rice/, 'friedRice'], [/manchurian|chilli potato/, 'manchurian'],
    [/samosa|kachori/, 'samosa'], [/pakora|pakoda/, 'pakora'],
    [/paratha|thepla|kulcha|naan|roti/, 'paratha'], [/dosa|uttapam|pesarattu/, 'dosa'],
    [/idli|sambar/, 'idli'], [/poha|upma|khichdi/, 'poha'],
    [/biryani|pulao/, 'biryani'], [/thali/, 'thali'],
    [/paneer/, 'paneer'], [/chicken|kebab/, 'chicken'], [/fish/, 'fish'],
    [/egg|omelette|bhurji/, 'egg'], [/chaat|puri|bhel|tikki|bhalla/, 'chaat'],
    [/ice cream/, 'iceCream'], [/brownie|muffin|croissant/, 'brownie'],
    [/shake|lassi|milk/, 'shake'], [/coffee/, 'coffee'], [/chai|tea|chocolate/, 'tea'],
    [/juice/, 'juice'], [/soda|cola|jaljeera|buttermilk|lime water/, 'soda'],
    [/roll|wrap/, 'roll'], [/chips|biscuit/, 'chips'], [/bread|puff/, 'bread'],
    [/water/, 'water'], [/jamun|rasgulla|rabri|halwa|ladoo|rasmalai|kheer|cham cham|mysore pak|soan papdi/, 'sweet'],
    [/rice/, 'rice'], [/curry|dal|chole|rajma|gobi|bhindi|kofta|bharta|veg/, 'curry'],
  ];
  for (const [pattern, key] of patterns) if (pattern.test(n)) return key;
  const fallback = {
    'Hot beverages': 'tea', 'Cold beverages': 'juice', Breakfast: 'breakfast',
    'North Indian meals': 'curry', Biryani: 'biryani', Snacks: 'chaat',
    'Burgers and sandwiches': 'burger', 'Pizza and pasta': 'pizza', Chinese: 'noodles',
    'Rolls and Maggi': 'roll', 'Non-veg meals': 'chicken',
    'Desserts and shakes': 'sweet', 'Packaged essentials': 'chips',
    'Breakfast specials': 'breakfast', 'Lunch specials': 'thali',
    'Dinner specials': 'curry', 'Street food and chaat': 'chaat',
    'Indian sweets': 'sweet', 'Bakery and quick bites': 'bread',
    'Cold drinks and coolers': 'soda',
  };
  return fallback[category];
}

const clean = value => String(value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
async function searchPhoto(key, term) {
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.search = new URLSearchParams({ action: 'query', generator: 'search',
    gsrsearch: 'filetype:bitmap ' + term, gsrnamespace: '6', gsrlimit: '15',
    prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '640', format: 'json' }).toString();
  let response;
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch(api, { headers: { 'User-Agent': 'CampusDropDemo/1.0 (demo image catalog)' } });
    if (response.status !== 429) break;
    await new Promise(resolve => setTimeout(resolve, 10000 * (attempt + 1)));
  }
  if (!response.ok) throw Error(`${key}: Wikimedia returned ${response.status}`);
  const data = await response.json();
  const words = term.toLowerCase().split(/\W+/).filter(word => word.length > 3 && word !== 'food' && word !== 'drink');
  const candidates = Object.values(data.query?.pages || {}).map(page => {
    const info = page.imageinfo?.[0]; const meta = info?.extmetadata || {};
    const url = info?.thumburl?.split('?')[0];
    const license = clean(meta.LicenseShortName?.value);
    const title = page.title.replace(/^File:/, '');
    if (!url || url.length > 255 || !/\.(jpe?g|png|webp)$/i.test(title) || !/CC BY|CC0|Public domain/i.test(license)) return null;
    const lower = title.toLowerCase();
    const required = { chickenBurger: 'burger', chickenPizza: 'pizza', chickenMomos: 'momo', chickenThali: 'thali' }[key];
    if (required && !lower.includes(required)) return null;
    if (key === 'chickenBurger' && /tenders|nuggets|restaurant|logo/i.test(lower)) return null;
    if (/logo|restaurant|sign|cartoon|drawing|food waste|advertisement|menu|packaging/i.test(title)) return null;
    return { key, title, image: url, source: info.descriptionurl,
      artist: clean(meta.Artist?.value), license,
      licenseUrl: clean(meta.LicenseUrl?.value),
      score: words.reduce((score, word) => score + (lower.includes(word) ? 2 : 0), 0)
        + (/CC0|Public domain/i.test(license) ? 1 : 0) };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  if (!candidates.length) throw Error(`${key}: no licensed photo found`);
  return candidates[0];
}

async function main() {
  const cachePath = path.join(directory, 'food-image-progress.json');
  const photos = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
  for (const [key, term] of Object.entries(searches)) {
    if (photos[key]) continue;
    photos[key] = await searchPhoto(key, term);
    fs.writeFileSync(cachePath, JSON.stringify(photos, null, 2));
    console.log(`${key}: ${photos[key].title}`);
    await new Promise(resolve => setTimeout(resolve, 1600));
  }
  const existingPath = path.join(directory, 'food-images.json');
  const existing = fs.existsSync(existingPath) ? JSON.parse(fs.readFileSync(existingPath, 'utf8')) : {};
  for (const [key, photo] of Object.entries(photos)) {
    const prior = existing.photos?.[key];
    if (prior?.sourceImage === photo.image && prior.image.startsWith('/demo-food/'))
      photos[key] = { ...photo, sourceImage: photo.image, image: prior.image };
  }
  const products = {};
  for (const [category, dishes] of Object.entries(groups))
    for (const name of dishes) {
      const key = photoKey(name, category);
      if (!photos[key]) throw Error(`No photo mapping for ${name}`);
      products[name] = photos[key].image;
    }
  const universities = JSON.parse(fs.readFileSync(path.join(directory, 'universities.json'), 'utf8'));
  const universityIds = universities.map(u => quote(id('university:' + u.name.toLowerCase()))).join(',');
  const pairs = Object.entries(products).map(([name, image]) => `(${quote(name)},${quote(image)})`).join(',\n');
  const sql = `-- Update only untouched Campus Drop demo photos; keep any admin-uploaded edits.\nBEGIN;\nUPDATE products AS p SET image = pictures.image FROM (VALUES\n${pairs}\n) AS pictures(name,image) WHERE p.name=pictures.name AND p."universityId" IN (${universityIds}) AND (p.image=${quote(generic)} OR p.image IS NULL);\nUPDATE categories AS c SET image=photos.image FROM (VALUES\n${Object.entries(groups).map(([category,dishes])=>`(${quote(category)},${quote(photos[photoKey(dishes[0],category)].image)})`).join(',\n')}\n) AS photos(name,image) WHERE c.name=photos.name AND c."universityId" IN (${universityIds}) AND (c.image=${quote(generic)} OR c.image IS NULL);\nCOMMIT;\n`;
  fs.writeFileSync(path.join(directory, 'food-images.json'), JSON.stringify({ source: 'Wikimedia Commons', photos, products }, null, 2));
  fs.writeFileSync(path.join(directory, 'food-image-update.sql'), sql);
  console.log(`Prepared ${Object.keys(photos).length} distinct photos for ${Object.keys(products).length} dishes.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
