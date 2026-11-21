import {derive, open, seal, validateEnvelope, to64, from64} from './crypto.mjs';
const $ = id => document.getElementById(id);
let session = null, envelope = null, etag = null, restored = null, editingReceipts = [], idle;
let busy = false, generation = 0;
let editingPhoto = null, editorRevision = 0;
const photoURLs = new Map();
const fields = ['name','manufacturer','model','type','caliber','serial','purchaseDate','purchasePrice','notes'];

function revokePhotos(group) {
  for (const [url, owner] of photoURLs) if (!group || owner === group) { URL.revokeObjectURL(url); photoURLs.delete(url); }
}
function photoImage(photo, alt, group) {
  const url = URL.createObjectURL(new Blob([from64(photo.data)], {type:photo.type}));
  photoURLs.set(url,group);
  const image = document.createElement('img'); image.src = url; image.alt = alt; return image;
}
function previewPhoto() {
  revokePhotos('editor'); $('photo-preview').replaceChildren();
  if (editingPhoto) $('photo-preview').append(photoImage(editingPhoto,'Photo for this record','editor'));
  else $('photo-preview').textContent = 'No photo added';
  $('remove-photo').hidden = !editingPhoto;
}
function clearPhotoEditor() {
  editorRevision++; editingPhoto = null; revokePhotos('editor');
  $('photo-preview').replaceChildren(); $('photo-file').value = ''; $('photo-url').value = '';
}
async function preparePhoto(blob, name, source) {
  if (!['image/jpeg','image/png','image/webp'].includes(blob.type) || blob.size > 8*1024*1024) throw new Error('Choose a JPG, PNG, or WebP photo up to 8 MB.');
  let bitmap;
  try { bitmap = await createImageBitmap(blob); }
  catch { throw new Error('This image could not be decoded. Choose a valid JPG, PNG, or WebP photo.'); }
  try {
    if (bitmap.width * bitmap.height > 40000000) throw new Error('Photo dimensions are too large. Choose a smaller photo.');
    const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.round(bitmap.width*scale)); canvas.height = Math.max(1,Math.round(bitmap.height*scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const clean = await new Promise(resolve => canvas.toBlob(resolve,'image/jpeg',0.9));
    if (!clean) throw new Error('Could not process this photo. Try a different image.');
    return {name, type:'image/jpeg', data:to64(new Uint8Array(await clean.arrayBuffer())), ...(source ? {source} : {})};
  } finally { bitmap.close(); }
}

function notice(text) {
  $('notice').textContent = text;
  const dialog=document.querySelector('dialog[open]');
  if (dialog) {
    let output=dialog.querySelector('.dialog-notice');
    if (!output) { output=element('p','','dialog-notice help'); output.setAttribute('role','status'); dialog.prepend(output); }
    output.textContent=text;
  }
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('button').forEach(button => button.disabled = value && button.id !== 'lock-button');
}
async function action(work) {
  if (busy) return;
  setBusy(true); notice('');
  try { await work(); }
  catch (error) { notice(error.message || 'Something went wrong. Your saved vault was not replaced.'); }
  finally { setBusy(false); }
}
function gateMode() {
  const creating = !envelope && !restored;
  $('gate-heading').textContent = restored ? 'Unlock your backup to restore' : creating ? 'Create your encrypted vault' : 'Welcome back';
  $('unlock-button').textContent = restored ? 'Unlock & restore backup' : creating ? 'Create vault' : 'Unlock vault';
  $('confirm-group').hidden = !creating;
  $('confirm-passphrase').required = creating;
  $('passphrase').minLength = creating ? 14 : 1;
  $('passphrase').autocomplete = creating ? 'new-password' : 'current-password';
  $('pass-help').textContent = creating ? 'Use at least 14 characters. Four or more unrelated words make a stronger passphrase. There is no password reset.' : 'Your passphrase decrypts your vault on this device.';
}
async function loadStored() {
  const response = await fetch('/api/vault', {cache:'no-store'});
  if (response.status === 404) { envelope = null; etag = null; }
  else {
    if (!response.ok) throw new Error('Could not read the saved vault.');
    envelope = validateEnvelope(await response.json()); etag = response.headers.get('ETag');
  }
}
async function persist(next) {
  const payload = JSON.stringify(next);
  if (new TextEncoder().encode(payload).length > 46 * 1024 * 1024) throw new Error('Vault is full. Keep receipts smaller or remove some before saving.');
  const response = await fetch('/api/vault', {method:'PUT', headers:{'Content-Type':'application/json','X-Vault-Request':'1',
    ...(etag ? {'If-Match':etag} : {'If-None-Match':'*'})},body:payload});
  if (response.status === 409) {
    lock(); await loadStored(); gateMode();
    throw new Error('The vault changed in another tab. Unlock the latest version before editing again.');
  }
  if (!response.ok) throw new Error('Save failed. The previous vault is still on disk.');
  envelope = next; etag = response.headers.get('ETag');
}
function touch() {
  clearTimeout(idle);
  if (session) idle = setTimeout(() => lock('Locked after 5 minutes without activity.'), 5 * 60 * 1000);
}
function lock(message = 'Vault locked.') {
  generation++; session = null; editingReceipts = []; restored = null; clearTimeout(idle);
  clearPhotoEditor(); revokePhotos();
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  document.querySelectorAll('form').forEach(form => form.reset());
  $('search').value = ''; $('records').replaceChildren(); $('receipt-list').replaceChildren();
  $('record-count').textContent = '0'; $('receipt-count').textContent = '0';
  $('workspace').hidden = true; $('gate').hidden = false; gateMode(); notice(message);
}
function reveal(active) {
  session = active; $('unlock-form').reset(); $('gate').hidden = true; $('workspace').hidden = false;
  render(); touch(); notice('Vault unlocked.');
}
async function commit(data, active = session, key = active.key, salt = active.salt) {
  const next = await seal(data, key, salt);
  if (session !== active) throw new Error('Vault locked. Unlock and try again.');
  await persist(next);
  if (session === active) { active.data = data; active.key = key; active.salt = salt; render(); touch(); }
}
function element(tag, text, className) {
  const node = document.createElement(tag); node.textContent = text;
  if (className) node.className = className;
  return node;
}
function render() {
  if (!session) return;
  revokePhotos('inventory');
  const records = session.data.records;
  $('record-count').textContent = records.length;
  $('receipt-count').textContent = records.reduce((count, record) => count + record.receipts.length, 0);
  const query = $('search').value.toLocaleLowerCase();
  const found = records.filter(record => [record.name,record.manufacturer,record.model,record.serial,record.type || '',record.caliber || ''].some(value => value.toLocaleLowerCase().includes(query)));
  $('records').replaceChildren();
  if (!found.length) {
    const empty = element('div','', 'empty');
    empty.append(element('h3', records.length ? 'No matching records' : 'Your collection starts here'),
      element('p', records.length ? 'Try another name, model, or serial number.' : 'Add your first firearm to keep its details and receipts in one private place.'));
    $('records').append(empty); return;
  }
  for (const record of found) {
    const row = element('article','', 'record');
    const details = element('div',''); details.append(element('h3', record.name));
    const meta = element('div','', 'record-meta');
    meta.append(element('p', [record.manufacturer,record.model].filter(Boolean).join(' · ') || 'Details not added'),
      element('p', [record.type,record.caliber].filter(Boolean).join(' · ') || 'Type and caliber not recorded'),
      element('p', record.serial ? `SN: ${record.serial}` : 'No serial number recorded'),
      element('p', record.purchaseDate ? `Purchased ${record.purchaseDate}` : 'Purchase date not recorded'));
    details.append(meta);
    const actions = element('div','', 'record-actions');
    actions.append(element('span', `${record.receipts.length} receipt${record.receipts.length === 1 ? '' : 's'}`, 'receipt-badge'));
    const button = element('button','View / edit','secondary'); button.addEventListener('click', () => edit(record));
    const identity = element('div','', 'record-identity');
    if (record.photo) { const image = photoImage(record.photo,`Photo of ${record.name}`,'inventory'); image.className='record-photo'; identity.append(image); }
    identity.append(details); actions.append(button); row.append(identity,actions); $('records').append(row);
  }
}
function edit(record = null) {
  if (!session || busy) return;
  $('record-form').reset(); $('record-id').value = record?.id || '';
  for (const field of fields) $(field).value = record?.[field] || '';
  editingReceipts = structuredClone(record?.receipts || []);
  editorRevision++; editingPhoto = structuredClone(record?.photo || null); previewPhoto();
  $('editor-heading').textContent = record ? 'Record details' : 'Add firearm';
  $('delete-button').hidden = !record; receipts(); $('record-dialog').showModal();
  notice('');
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function receipts() {
  $('receipt-list').replaceChildren();
  editingReceipts.forEach((receipt, index) => {
    const row = element('div','', 'receipt-item'); row.append(element('span', receipt.name));
    const actions = element('div','');
    const save = element('button','Download','text-button'); save.type = 'button';
    save.addEventListener('click', () => {
      if (!session || !confirm('This downloads a decrypted receipt. Anyone with access to your Downloads folder could read it. Continue?')) return;
      download(new Blob([from64(receipt.data)], {type:receipt.type}), receipt.name);
    });
    const remove = element('button','Remove','text-button'); remove.type = 'button';
    remove.addEventListener('click', () => { editingReceipts.splice(index,1); receipts(); });
    actions.append(save,remove); row.append(actions); $('receipt-list').append(row);
  });
}
$('unlock-form').addEventListener('submit', event => {
  event.preventDefault(); action(async () => {
    const pass = $('passphrase').value, token = generation;
    let active;
    if (restored || envelope) {
      const input = restored || envelope;
      try { active = await open(input, pass); }
      catch { throw new Error('Could not unlock. Check the passphrase, or restore an undamaged backup.'); }
      if (token !== generation) return;
      if (restored) {
        if (envelope && !confirm('Replace the current encrypted vault with this backup? Export a backup of the current vault first if needed.')) return;
        await persist(input); restored = null;
      }
    } else {
      if (pass.length < 14 || pass !== $('confirm-passphrase').value) throw new Error('Use at least 14 characters and matching passphrases.');
      const salt = crypto.getRandomValues(new Uint8Array(16));
      active = {key:await derive(pass,salt), salt, data:{version:1,records:[]}};
      if (token !== generation) return;
      await persist(await seal(active.data,active.key,salt));
    }
    if (token === generation) reveal(active);
  });
});
$('record-form').addEventListener('submit', event => {
  event.preventDefault(); action(async () => {
    const active = session; if (!active) return;
    const record = {id:$('record-id').value || crypto.randomUUID(), receipts:structuredClone(editingReceipts), photo:structuredClone(editingPhoto)};
    for (const field of fields) record[field] = $(field).value.trim();
    if (!record.name) throw new Error('Enter a display name.');
    const files = [...$('receipt-files').files];
    if (files.length + record.receipts.length > 10) throw new Error('Limit receipts to 10 per record.');
    for (const file of files) {
      if (!['application/pdf','image/jpeg','image/png'].includes(file.type) || file.size > 8*1024*1024) throw new Error('Use PDF, JPG, or PNG receipts up to 8 MB each.');
      record.receipts.push({name:file.name, type:file.type, data:to64(new Uint8Array(await file.arrayBuffer()))});
    }
    if (session !== active) return;
    const records = active.data.records.filter(item => item.id !== record.id); records.push(record);
    await commit({...active.data,records}, active);
    if (session === active) { $('record-dialog').close(); $('record-form').reset(); editingReceipts = []; notice('Record encrypted and saved.'); }
  });
});
$('delete-button').addEventListener('click', () => action(async () => {
  if (!session || !confirm('Delete this record and its receipts? This cannot be undone without a backup.')) return;
  const active = session, id = $('record-id').value;
  await commit({...active.data,records:active.data.records.filter(record => record.id !== id)}, active);
  if (session === active) { $('record-dialog').close(); $('record-form').reset(); editingReceipts=[]; notice('Record deleted.'); }
}));
$('export-button').addEventListener('click', () => {
  if (!session || !envelope) return;
  download(new Blob([JSON.stringify(envelope)],{type:'application/json'}),`private-inventory-${new Date().toISOString().slice(0,10)}.encrypted.json`);
  notice('Encrypted backup exported. Keep a separate copy and remember its passphrase.');
});
$('restore-button').addEventListener('click', () => $('restore-file').click());
$('restore-file').addEventListener('change', () => action(async () => {
  const file = $('restore-file').files[0]; if (!file) return;
  if (file.size > 46*1024*1024) throw new Error('Backup exceeds the vault size limit.');
  restored = validateEnvelope(JSON.parse(await file.text()));
  $('unlock-form').reset(); gateMode(); notice('Enter this backup’s passphrase. Nothing has been replaced yet.');
  $('passphrase').focus();
}));
$('change-button').addEventListener('click', () => { $('password-form').reset(); $('password-dialog').showModal(); });
$('cancel-password').addEventListener('click', () => { $('password-dialog').close(); $('password-form').reset(); });
$('password-form').addEventListener('submit', event => {
  event.preventDefault(); action(async () => {
    const active = session; if (!active) return;
    const old = $('old-password').value, next = $('new-password').value;
    if (next.length < 14 || next !== $('repeat-password').value) throw new Error('Use at least 14 characters and matching new passphrases.');
    try { await open(envelope,old); } catch { throw new Error('The current passphrase is incorrect.'); }
    const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derive(next,salt);
    if (session !== active) return;
    await commit(active.data,active,key,salt);
    if (session === active) { $('password-dialog').close(); $('password-form').reset(); notice('Passphrase changed. Export a new encrypted backup.'); }
  });
});
$('add-button').addEventListener('click', () => edit());
$('close-editor').addEventListener('click', () => { $('record-dialog').close(); $('record-form').reset(); editingReceipts=[]; });
$('lock-button').addEventListener('click', () => lock());
$('search').addEventListener('input',render);
$('photo-file').addEventListener('change', () => action(async () => {
  const file = $('photo-file').files[0], active = session, revision = editorRevision;
  if (!file || !active) return;
  const photo = await preparePhoto(file,file.name);
  if (session === active && revision === editorRevision) { editingPhoto = photo; previewPhoto(); notice('Photo ready. Save the record to keep it encrypted.'); }
}));
$('import-photo').addEventListener('click', () => action(async () => {
  const active = session, revision = editorRevision, url = $('photo-url').value.trim();
  if (!active) return;
  if (!url.startsWith('https://')) throw new Error('Enter the manufacturer’s HTTPS product page or direct image address.');
  notice('Looking for a photo on that website…');
  const response = await fetch('/api/photo-import', {method:'POST',headers:{'Content-Type':'application/json','X-Vault-Request':'1'},body:JSON.stringify({url})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not import this image. Try uploading a photo.');
  if (session !== active || revision !== editorRevision) return;
  const photo = await preparePhoto(new Blob([from64(result.data)],{type:result.type}),result.name,result.source);
  if (session === active && revision === editorRevision) { editingPhoto=photo; previewPhoto(); notice('Photo found. Check the preview, then save the encrypted record.'); }
}));
$('remove-photo').addEventListener('click', () => { editingPhoto=null; $('photo-file').value=''; previewPhoto(); });
$('record-dialog').addEventListener('close',clearPhotoEditor);
for (const event of ['pointerdown','keydown','input']) document.addEventListener(event,touch,{passive:true});
document.addEventListener('visibilitychange', () => { if (document.hidden) lock('Locked while the page was hidden. Unsaved edits were discarded.'); });
window.addEventListener('pagehide', () => lock());
window.addEventListener('pageshow', event => { if (event.persisted) lock(); });
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('cancel', () => {
  dialog.querySelector('form').reset(); editingReceipts=[];
}));
try { await loadStored(); gateMode(); $('unlock-button').disabled = false; }
catch (error) { notice(`${error.message} The saved file has not been changed.`); }
