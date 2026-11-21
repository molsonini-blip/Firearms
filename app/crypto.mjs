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
    if (record.photo != null && (typeof record.photo.name !== 'string' ||
        !['image/jpeg','image/png','image/webp'].includes(record.photo.type) ||
        (record.photo.source !== undefined && typeof record.photo.source !== 'string') ||
        from64(record.photo.data).length > 8 * 1024 * 1024)) throw new Error('Invalid record photo.');
    for (const receipt of record.receipts) {
      if (!receipt || typeof receipt.name !== 'string' || !['application/pdf','image/jpeg','image/png'].includes(receipt.type) ||
          from64(receipt.data).length > 8 * 1024 * 1024) throw new Error('Invalid receipt.');
    }
  }
  return data;
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
