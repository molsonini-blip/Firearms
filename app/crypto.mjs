const ITERATIONS = 600000;
const AAD = new TextEncoder().encode('private-inventory:v1:AES-256-GCM:PBKDF2-SHA256:600000');
const encode = value => new TextEncoder().encode(value);
export function to64(bytes) {
  let result = '';
  for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(result);
}
export function from64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid vault encoding.');
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
export function validateEnvelope(value) {
  if (!value || value.version !== 1 || value.kdf !== 'PBKDF2-SHA256' || value.iterations !== ITERATIONS ||
      value.cipher !== 'AES-256-GCM' || from64(value.salt).length !== 16 || from64(value.iv).length !== 12 ||
      from64(value.ciphertext).length < 16) throw new Error('Unsupported or damaged encrypted vault.');
  return value;
}
export async function derive(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:ITERATIONS, hash:'SHA-256'},
    material, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
}
export function validateData(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.records) || data.records.length > 5000) throw new Error('Invalid vault records.');
  const ids = new Set();
  for (const record of data.records) {
    if (!record || typeof record.id !== 'string' || ids.has(record.id) ||
      !['name','manufacturer','model','serial','purchaseDate','purchasePrice','notes'].every(k => typeof record[k] === 'string') ||
      !Array.isArray(record.receipts) || record.receipts.length > 10) throw new Error('Invalid inventory record.');
    ids.add(record.id);
    if (record.type !== undefined && !['','Pistol','Revolver','Rifle','Shotgun'].includes(record.type)) throw new Error('Invalid firearm type.');
    if (record.caliber !== undefined && (typeof record.caliber !== 'string' || record.caliber.length > 80)) throw new Error('Invalid caliber / gauge.');
    if (record.calibers !== undefined && !validKeys(record.calibers)) throw new Error('Invalid caliber selection.');
    if (record.ammo !== undefined && (typeof record.ammo !== 'string' || record.ammo.length > 2000)) throw new Error('Invalid preferred ammunition.');
    if (record.photo != null && (typeof record.photo.name !== 'string' ||
        !['image/jpeg','image/png','image/webp'].includes(record.photo.type) ||
        (record.photo.source !== undefined && typeof record.photo.source !== 'string') ||
        from64(record.photo.data).length > 8 * 1024 * 1024)) throw new Error('Invalid record photo.');
    for (const receipt of record.receipts) {
      if (!receipt || typeof receipt.name !== 'string' || !['application/pdf','image/jpeg','image/png'].includes(receipt.type) ||
          from64(receipt.data).length > 8 * 1024 * 1024) throw new Error('Invalid receipt.');
    }
  }
  validateExtras(data);
  return data;
}
const validKeys = keys => Array.isArray(keys) && keys.length <= 20 && keys.every(key => typeof key === 'string' && key.length <= 20);
const text = (value, max) => typeof value === 'string' && value.length <= max;
const https = value => text(value, 2048) && value.startsWith('https://');
function uniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (!item || !text(item.id, 80) || ids.has(item.id)) throw new Error(`Invalid ${label}.`);
    ids.add(item.id);
  }
}
// Optional sections added after v1; vaults without them stay valid.
function validateExtras(data) {
  if (data.wishlist !== undefined) {
    if (!Array.isArray(data.wishlist) || data.wishlist.length > 500) throw new Error('Invalid wishlist.');
    uniqueIds(data.wishlist, 'wishlist item');
    for (const item of data.wishlist) {
      if (!['name','manufacturer','model','caliber','targetPrice'].every(k => text(item[k], 160)) || !text(item.notes, 10000) ||
          !['','Pistol','Revolver','Rifle','Shotgun'].includes(item.type) ||
          !Array.isArray(item.urls) || item.urls.length > 10 || !item.urls.every(https) ||
          (item.calibers !== undefined && !validKeys(item.calibers))) throw new Error('Invalid wishlist item.');
    }
  }
  if (data.sources !== undefined) {
    if (!Array.isArray(data.sources) || data.sources.length > 100) throw new Error('Invalid website list.');
    uniqueIds(data.sources, 'website');
    for (const source of data.sources) {
      if (!text(source.name, 160) || !https(source.url) || !text(source.location, 120) ||
          !['ammo','firearm','both'].includes(source.kind)) throw new Error('Invalid website.');
    }
  }
  if (data.ammoTargets !== undefined) {
    if (!data.ammoTargets || typeof data.ammoTargets !== 'object' || Array.isArray(data.ammoTargets) ||
        Object.entries(data.ammoTargets).some(([key, value]) => key.length > 20 || typeof value !== 'number' || !(value > 0 && value < 100)))
      throw new Error('Invalid ammunition price targets.');
  }
  if (data.searchArea !== undefined && !text(data.searchArea, 120)) throw new Error('Invalid search area.');
  if (data.lastCheck !== undefined && data.lastCheck !== null) {
    const check = data.lastCheck;
    if (!text(check.at, 40) || !Array.isArray(check.offers) || check.offers.length > 2000 || !Array.isArray(check.pages) || check.pages.length > 100 ||
        !check.offers.every(o => o && text(o.title, 300) && typeof o.price === 'number' && https(o.url)) ||
        !check.pages.every(p => p && text(p.url, 2048) && typeof p.ok === 'boolean' && text(p.note || '', 300) && typeof (p.count ?? 0) === 'number'))
      throw new Error('Invalid saved price check.');
  }
}
export async function seal(data, key, salt) {
  validateData(data);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:AAD}, key, encode(JSON.stringify(data)));
  return {version:1, kdf:'PBKDF2-SHA256', iterations:ITERATIONS, cipher:'AES-256-GCM', salt:to64(salt), iv:to64(iv), ciphertext:to64(new Uint8Array(ciphertext))};
}
export async function open(envelope, passphrase) {
  validateEnvelope(envelope);
  const salt = from64(envelope.salt);
  const key = await derive(passphrase, salt);
  const clear = await crypto.subtle.decrypt({name:'AES-GCM', iv:from64(envelope.iv), additionalData:AAD}, key, from64(envelope.ciphertext));
  return {key, salt, data:validateData(JSON.parse(new TextDecoder().decode(clear)))};
}
