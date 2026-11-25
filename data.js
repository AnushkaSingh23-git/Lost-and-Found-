// Shared campus knowledge: item categories, colour families, locations.

// Each category: synonyms (used for matching), nouns (used for seeding), brands, features.
const CATEGORIES = {
  'Water Bottle': {
    icon: '🍶',
    syn: ['water bottle', 'bottle', 'flask', 'tumbler', 'thermos', 'sipper', 'hydro flask'],
    nouns: ['water bottle', 'bottle', 'flask', 'tumbler'],
    brands: ['Milton', 'Cello', 'Hydro Flask', 'Nalgene', 'Borosil', 'Yeti'],
    features: ['dent near the bottom', 'sticker of a mountain', 'metal lid with a loop', 'scratched paint', 'wide mouth', 'sports cap']
  },
  'Hoodie': {
    icon: '🧥',
    syn: ['hoodie', 'sweatshirt', 'jumper', 'sweater', 'pullover', 'hooded'],
    nouns: ['hoodie', 'sweatshirt', 'pullover hoodie'],
    brands: ['Nike', 'Adidas', 'H&M', 'Puma', 'Zara', 'Uniqlo'],
    features: ['front kangaroo pocket', 'drawstring missing one end', 'college logo on the chest', 'size medium', 'slightly faded', 'zipper front']
  },
  'Earbuds': {
    icon: '🎧',
    syn: ['earbuds', 'airpods', 'earphones', 'earpods', 'buds', 'wireless earbuds'],
    nouns: ['earbuds', 'wireless earbuds', 'earphones', 'earbuds case'],
    brands: ['Apple', 'Samsung', 'boAt', 'OnePlus', 'Sony', 'Realme'],
    features: ['white charging case', 'small scratch on lid', 'sticker on the case', 'left bud only', 'tied with a loop strap', 'case has a keychain']
  },
  'ID Card': {
    icon: '🪪',
    syn: ['id card', 'student id', 'id', 'identity card', 'badge', 'campus card', 'library card'],
    nouns: ['student ID card', 'ID card', 'campus card'],
    brands: [],
    features: ['blue lanyard attached', 'photo slightly faded', 'plastic cover', 'corner cracked', 'barcode on the back', 'clip attached']
  },
  'Keys': {
    icon: '🔑',
    syn: ['keys', 'key', 'keychain', 'keyring', 'key ring', 'bike key'],
    nouns: ['keys', 'keychain', 'key bunch'],
    brands: [],
    features: ['three keys on a ring', 'small bell attached', 'rubber tag', 'bike key included', 'leather fob', 'tiny torch charm']
  },
  'Wallet': {
    icon: '👛',
    syn: ['wallet', 'purse', 'card holder', 'cardholder', 'card case'],
    nouns: ['wallet', 'card holder', 'purse'],
    brands: ['Fossil', 'Wildcraft', 'Tommy Hilfiger', 'Puma', 'Baggit'],
    features: ['folds in half', 'zipper pocket', 'several cards inside', 'stitched edges', 'leather feel', 'coin pocket']
  },
  'Backpack': {
    icon: '🎒',
    syn: ['backpack', 'bag', 'rucksack', 'bookbag', 'school bag', 'laptop bag', 'sling bag'],
    nouns: ['backpack', 'rucksack', 'bag'],
    brands: ['Wildcraft', 'Skybags', 'American Tourister', 'Puma', 'Nike', 'Safari'],
    features: ['two front zips', 'name tag blank', 'keychain on zipper', 'side bottle pocket', 'torn strap', 'laptop sleeve']
  },
  'Phone': {
    icon: '📱',
    syn: ['phone', 'smartphone', 'mobile', 'iphone', 'cellphone', 'android'],
    nouns: ['phone', 'smartphone', 'mobile phone'],
    brands: ['Apple', 'Samsung', 'OnePlus', 'Xiaomi', 'Realme', 'Google'],
    features: ['cracked screen protector', 'clear back cover', 'cat sticker on the case', 'locked screen', 'pop socket attached', 'dark wallpaper']
  },
  'Charger': {
    icon: '🔌',
    syn: ['charger', 'adapter', 'cable', 'charging cable', 'laptop charger', 'power adapter'],
    nouns: ['laptop charger', 'charger', 'charging cable'],
    brands: ['Dell', 'HP', 'Lenovo', 'Apple', 'Anker', 'Mi'],
    features: ['long cable', 'tape on the wire', 'type-c end', 'brick style adapter', 'velcro strap', 'label with initials']
  },
  'Umbrella': {
    icon: '☂️',
    syn: ['umbrella', 'brolly'],
    nouns: ['umbrella', 'foldable umbrella'],
    brands: ['Fendo', 'Johns', 'Totes'],
    features: ['wooden handle', 'automatic open', 'bent rib', 'wrist loop', 'printed polka dots', 'compact foldable']
  },
  'Calculator': {
    icon: '🧮',
    syn: ['calculator', 'scientific calculator', 'calc'],
    nouns: ['scientific calculator', 'calculator'],
    brands: ['Casio', 'Texas Instruments', 'Citizen'],
    features: ['cover slides on', 'name scratched on back', 'solar panel', 'worn keys', 'fx-991 model', 'slim case']
  },
  'Glasses': {
    icon: '👓',
    syn: ['glasses', 'spectacles', 'eyeglasses', 'sunglasses', 'specs'],
    nouns: ['glasses', 'spectacles', 'eyeglasses'],
    brands: ['Ray-Ban', 'Titan', 'Lenskart', 'Fastrack'],
    features: ['hard case included', 'thin metal frame', 'slightly bent arm', 'anti-glare lenses', 'round frame', 'cloth in the case']
  },
  'Notebook': {
    icon: '📓',
    syn: ['notebook', 'notepad', 'journal', 'diary', 'textbook', 'book', 'copy', 'notes'],
    nouns: ['notebook', 'lecture notebook', 'textbook'],
    brands: ['Classmate', 'Navneet', 'Oxford', 'Moleskine'],
    features: ['spiral bound', 'notes on the first pages', 'sticky tabs', 'cover doodles', 'highlighted pages', 'rubber band around it']
  },
  'Laptop': {
    icon: '💻',
    syn: ['laptop', 'macbook', 'notebook computer', 'chromebook', 'tablet', 'ipad'],
    nouns: ['laptop', 'laptop in sleeve'],
    brands: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer'],
    features: ['stickers on the lid', 'padded sleeve', 'scratch near the hinge', '14 inch screen', 'charger not included', 'dark cover']
  },
  'Jacket': {
    icon: '🧥',
    syn: ['jacket', 'coat', 'windcheater', 'blazer', 'raincoat', 'windbreaker'],
    nouns: ['jacket', 'windcheater', 'rain jacket'],
    brands: ['Columbia', 'Nike', 'Wrangler', 'Levis', 'The North Face'],
    features: ['zipper pockets', 'hood attached', 'lining slightly torn', 'size large', 'reflective strip', 'button front']
  },
  'Watch': {
    icon: '⌚',
    syn: ['watch', 'smartwatch', 'wristwatch', 'fitness band', 'band'],
    nouns: ['smartwatch', 'wristwatch', 'fitness band'],
    brands: ['Fastrack', 'Casio', 'Noise', 'Fitbit', 'Apple', 'Titan'],
    features: ['rubber strap', 'cracked glass', 'metal clasp', 'charger clip', 'dark dial', 'leather strap']
  },
  'USB Drive': {
    icon: '💾',
    syn: ['usb drive', 'pendrive', 'pen drive', 'flash drive', 'usb', 'memory stick', 'sd card'],
    nouns: ['USB drive', 'pen drive', 'flash drive'],
    brands: ['SanDisk', 'HP', 'Kingston', 'Transcend'],
    features: ['cap missing', 'tied to a keyring', '32GB label', 'metal body', 'slide connector', 'small lanyard hole']
  },
  'Headphones': {
    icon: '🎧',
    syn: ['headphones', 'headset', 'over ear headphones', 'headphone'],
    nouns: ['headphones', 'over-ear headphones', 'headset'],
    brands: ['Sony', 'boAt', 'JBL', 'Bose', 'Sennheiser'],
    features: ['padded ear cups', 'foldable band', 'aux cable included', 'small crack on band', 'pouch included', 'volume buttons on left']
  }
};

// Synonym -> category lookup, longest phrase first.
const SYN_INDEX = [];
for (const [cat, c] of Object.entries(CATEGORIES)) {
  for (const s of c.syn) SYN_INDEX.push([s, cat]);
}
SYN_INDEX.sort((a, b) => b[0].length - a[0].length);

// Colour families: every word in `words` counts as the same colour ("navy" == "blue").
const COLOURS = {
  blue:   { hex: '#2563eb', words: ['blue', 'navy', 'royal', 'cobalt', 'sky', 'azure', 'indigo', 'teal', 'cyan', 'aqua', 'denim'] },
  grey:   { hex: '#9ca3af', words: ['grey', 'gray', 'charcoal', 'ash', 'slate', 'silver', 'steel'] },
  black:  { hex: '#111827', words: ['black', 'jet', 'onyx'] },
  white:  { hex: '#e5e7eb', words: ['white', 'ivory', 'off-white', 'transparent', 'clear'] },
  red:    { hex: '#dc2626', words: ['red', 'maroon', 'burgundy', 'crimson', 'wine', 'scarlet'] },
  green:  { hex: '#16a34a', words: ['green', 'olive', 'mint', 'lime', 'emerald', 'forest'] },
  yellow: { hex: '#facc15', words: ['yellow', 'mustard', 'gold', 'golden', 'lemon'] },
  orange: { hex: '#f97316', words: ['orange', 'peach', 'coral', 'rust'] },
  pink:   { hex: '#ec4899', words: ['pink', 'rose', 'magenta', 'blush'] },
  purple: { hex: '#8b5cf6', words: ['purple', 'violet', 'lavender', 'lilac', 'plum'] },
  brown:  { hex: '#92400e', words: ['brown', 'tan', 'beige', 'khaki', 'cream', 'camel', 'coffee', 'chocolate'] }
};
// Partial credit between neighbouring colour families.
const COLOUR_NEAR = { 'black|grey': 0.45, 'grey|white': 0.35, 'brown|orange': 0.25, 'pink|red': 0.3, 'blue|purple': 0.25 };

// Campus locations. x/y/w/h are map coordinates on a 100x64 canvas.
const LOCATIONS = [
  { id: 'Central Library',   short: 'Library',       x: 50, y: 18, w: 15, h: 9, alias: ['central library', 'library', 'lib'], near: ['Computer Center', 'Student Union', 'Main Auditorium'] },
  { id: 'Computer Center',   short: 'Computer Ctr',  x: 73, y: 14, w: 13, h: 8, alias: ['computer center', 'computer centre', 'computer lab', 'cs lab', 'it center'], near: ['Central Library', 'Engineering Block'] },
  { id: 'Engineering Block', short: 'Engineering',   x: 23, y: 16, w: 16, h: 9, alias: ['engineering block', 'engineering', 'eng block', 'mechanical', 'workshop'], near: ['Science Labs', 'Computer Center'] },
  { id: 'Science Labs',      short: 'Science Labs',  x: 14, y: 35, w: 14, h: 9, alias: ['science labs', 'science lab', 'science', 'chemistry lab', 'physics lab'], near: ['Engineering Block', 'Student Union'] },
  { id: 'Student Union',     short: 'Student Union', x: 38, y: 34, w: 14, h: 8, alias: ['student union', 'student centre', 'student center', 'club room', 'union'], near: ['Main Cafeteria', 'Central Library', 'Science Labs'] },
  { id: 'Main Cafeteria',    short: 'Cafeteria',     x: 59, y: 36, w: 13, h: 8, alias: ['main cafeteria', 'cafeteria', 'canteen', 'mess', 'food court', 'cafe'], near: ['Student Union', 'Admin Building'] },
  { id: 'Admin Building',    short: 'Admin',         x: 81, y: 34, w: 12, h: 8, alias: ['admin building', 'administration', 'admin', 'office'], near: ['Main Cafeteria', 'Main Auditorium'] },
  { id: 'Main Auditorium',   short: 'Auditorium',    x: 76, y: 50, w: 15, h: 8, alias: ['main auditorium', 'auditorium', 'seminar hall'], near: ['Admin Building', 'Parking Lot', 'Central Library'] },
  { id: 'Sports Complex',    short: 'Sports',        x: 36, y: 54, w: 16, h: 8, alias: ['sports complex', 'sports', 'gym', 'stadium', 'playground', 'ground', 'court'], near: ['Hostel Quad', 'Parking Lot'] },
  { id: 'Hostel Quad',       short: 'Hostel Quad',   x: 13, y: 53, w: 14, h: 8, alias: ['hostel quad', 'hostel', 'dormitory', 'dorm', 'residence'], near: ['Sports Complex', 'Science Labs'] },
  { id: 'Parking Lot',       short: 'Parking',       x: 56, y: 54, w: 12, h: 7, alias: ['parking lot', 'parking', 'bike stand', 'garage'], near: ['Sports Complex', 'Main Auditorium', 'Bus Stop'] },
  { id: 'Bus Stop',          short: 'Bus Stop',      x: 92, y: 22, w: 8,  h: 6, alias: ['bus stop', 'bus stand', 'main gate', 'gate'], near: ['Parking Lot', 'Admin Building'] }
];

const STORAGE_POINTS = ['Security Desk', 'Library Help Desk', 'Student Union Info Desk', 'Admin Office', 'Hostel Warden Desk'];

module.exports = { CATEGORIES, SYN_INDEX, COLOURS, COLOUR_NEAR, LOCATIONS, STORAGE_POINTS };
