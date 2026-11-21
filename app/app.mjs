import {derive, open, seal, validateEnvelope, to64, from64} from './crypto.mjs';
import {CALIBERS, detectCaliber, caliberByKey, parseRounds} from './ammo.mjs';
const $ = id => document.getElementById(id);
let session = null, envelope = null, etag = null, restored = null, editingReceipts = [], idle;
let busy = false, generation = 0;
let editingPhoto = null, editorRevision = 0;
const photoURLs = new Map();
const fields = ['name','manufacturer','model','type','caliber','ammo','serial','purchaseDate','purchasePrice','notes'];
let gatewayReady = false;

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
  for (const id of ['wishlist','calibers','sources','deals']) $(id).replaceChildren();
  $('last-check').textContent = ''; $('search-area').value = ''; $('missing-only').checked = false; showTab('collection');
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
  const missingOnly = $('missing-only').checked;
  const found = records.filter(record => (!missingOnly || !record.caliber) && [record.name,record.manufacturer,record.model,record.serial,record.type || '',record.caliber || ''].some(value => value.toLocaleLowerCase().includes(query)));
  renderWishlist(); renderDeals();
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
      element('p', [record.type,record.caliber].filter(Boolean).join(' · ') || 'Type not recorded'),
      element('p', record.serial ? `SN: ${record.serial}` : 'No serial number recorded'),
      element('p', record.purchaseDate ? `Purchased ${record.purchaseDate}` : 'Purchase date not recorded'));
    if (!record.caliber) meta.append(element('p','Caliber missing','chip warn'));
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
  $('delete-button').hidden = !record; receipts(); ammoSuggest(); $('record-dialog').showModal();
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
$('missing-only').addEventListener('change',render);
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
// ---------- Caliber picker & suggested ammunition ----------
for (const item of CALIBERS) { const option = document.createElement('option'); option.value = item.label; $('caliber-list').append(option); }
function ammoSuggest() {
  const box = $('ammo-suggest'), item = detectCaliber($('caliber').value);
  box.replaceChildren();
  if (!$('caliber').value.trim()) { box.textContent = 'Enter a caliber to see common factory loads.'; return; }
  if (!item) { box.textContent = 'Not in the built-in list. Use the owner’s manual for ammunition guidance.'; return; }
  box.append(element('p', `${item.label} — common factory loads. Barrel markings and the owner’s manual take precedence.`, 'help'));
  const list = element('ul','','load-list');
  for (const load of item.loads) {
    const row = element('li',''); row.append(element('span', load.load, 'load'), element('span', load.use, 'muted'));
    const add = element('button','Add','text-button'); add.type = 'button';
    add.addEventListener('click', () => { const line = `${load.load} — ${load.use}`; const box = $('ammo');
      if (!box.value.includes(line)) box.value = (box.value.trim() ? box.value.trim() + '\n' : '') + line; });
    row.append(add); list.append(row);
  }
  box.append(list);
  for (const caution of item.cautions) box.append(element('p', caution, 'caution'));
}
$('caliber').addEventListener('input', ammoSuggest);

// ---------- Tabs ----------
const titles = {collection:['Your collection','A clear record of what you own.'], wishlist:['Wishlist','Firearms you would like to buy, with the price you want to pay.'], deals:['Ammo & deals','Suggested ammunition for your calibers and current prices from the sites you watch.']};
function showTab(name) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === name));
  document.querySelectorAll('[data-panel]').forEach(panel => panel.hidden = panel.dataset.panel !== name);
  $('page-title').textContent = titles[name][0]; $('page-subtitle').textContent = titles[name][1];
  $('add-button').hidden = name !== 'collection'; $('add-wish-button').hidden = name !== 'wishlist';
}
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => showTab(tab.dataset.tab)));

// ---------- Wishlist ----------
const money = value => { const n = Number(String(value || '').replace(/[$,\s]/g,'')); return Number.isFinite(n) && n > 0 ? n : null; };
const usd = n => n == null ? '—' : n.toLocaleString('en-US',{style:'currency',currency:'USD'});
function renderWishlist() {
  const items = session.data.wishlist || [], offers = session.data.lastCheck?.offers || [];
  $('wish-count').textContent = items.length; $('wishlist').replaceChildren();
  if (!items.length) {
    const empty = element('div','','empty'); empty.append(element('h3','Nothing on your wishlist yet'), element('p','Add a firearm you want and the price you would pay.'));
    return $('wishlist').append(empty);
  }
  for (const item of items) {
    const row = element('article','','record'), details = element('div','');
    details.append(element('h3', item.name));
    const meta = element('div','','record-meta');
    meta.append(element('p', [item.manufacturer,item.model].filter(Boolean).join(' · ') || 'Details not added'),
      element('p', [item.type,item.caliber].filter(Boolean).join(' · ') || 'Type and caliber not recorded'),
      element('p', `Target ${usd(money(item.targetPrice))}`), element('p', `${item.urls.length} page${item.urls.length === 1 ? '' : 's'} watched`));
    const matches = offers.filter(offer => offer.wish === item.id).sort((a,b) => a.price - b.price);
    if (matches.length) {
      const best = matches[0], link = element('a', `Best seen ${usd(best.price)} · ${best.source || best.seller || new URL(best.url).hostname}`, best.good ? 'chip good' : 'chip');
      link.href = best.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; meta.append(link);
    }
    details.append(meta);
    const edit = element('button','View / edit','secondary'); edit.addEventListener('click', () => editWish(item));
    const actions = element('div','','record-actions'); actions.append(edit); row.append(details, actions); $('wishlist').append(row);
  }
}
function editWish(item = null) {
  if (!session || busy) return;
  $('wish-form').reset(); $('wish-id').value = item?.id || '';
  for (const [id,key] of [['wish-name','name'],['wish-manufacturer','manufacturer'],['wish-model','model'],['wish-type','type'],['wish-caliber','caliber'],['wish-target','targetPrice'],['wish-notes','notes']]) $(id).value = item?.[key] || '';
  $('wish-urls').value = (item?.urls || []).join('\n');
  $('wish-heading').textContent = item ? 'Wishlist item' : 'Add to wishlist'; $('delete-wish').hidden = !item;
  $('wish-dialog').showModal(); notice('');
}
$('add-wish-button').addEventListener('click', () => editWish());
$('close-wish').addEventListener('click', () => { $('wish-dialog').close(); $('wish-form').reset(); });
$('wish-form').addEventListener('submit', event => {
  event.preventDefault(); action(async () => {
    const active = session; if (!active) return;
    const urls = $('wish-urls').value.split(/\s+/).map(url => url.trim()).filter(Boolean);
    if (urls.length > 10 || urls.some(url => !url.startsWith('https://') || url.length > 2048)) throw new Error('Use up to 10 HTTPS product page addresses.');
    if ($('wish-target').value.trim() && money($('wish-target').value) == null) throw new Error('Enter the target price as a number, e.g. 549.');
    const item = {id:$('wish-id').value || crypto.randomUUID(), name:$('wish-name').value.trim(), manufacturer:$('wish-manufacturer').value.trim(),
      model:$('wish-model').value.trim(), type:$('wish-type').value, caliber:$('wish-caliber').value.trim(), targetPrice:$('wish-target').value.trim(),
      urls:[...new Set(urls)], notes:$('wish-notes').value.trim()};
    if (!item.name) throw new Error('Enter a name.');
    const wishlist = (active.data.wishlist || []).filter(other => other.id !== item.id); wishlist.push(item);
    await commit({...active.data, wishlist}, active);
    if (session === active) { $('wish-dialog').close(); notice('Wishlist saved (encrypted).'); }
  });
});
$('delete-wish').addEventListener('click', () => action(async () => {
  if (!session || !confirm('Remove this wishlist item?')) return;
  const active = session, id = $('wish-id').value;
  await commit({...active.data, wishlist:(active.data.wishlist || []).filter(item => item.id !== id)}, active);
  if (session === active) { $('wish-dialog').close(); notice('Removed from wishlist.'); }
}));

// ---------- Calibers, sources and price checks ----------
function interestCalibers() {
  const map = new Map(), other = new Set();
  const add = (text, owner, wished) => {
    const item = detectCaliber(text);
    if (!item) { if (text) other.add(text); return; }
    const entry = map.get(item.key) || {item, owned:[], wished:[]};
    (wished ? entry.wished : entry.owned).push(owner); map.set(item.key, entry);
  };
  for (const record of session.data.records) add(record.caliber, record.name, false);
  for (const item of session.data.wishlist || []) add(item.caliber, item.name, true);
  return {known:[...map.values()], other:[...other]};
}
function renderDeals() {
  const {known, other} = interestCalibers(), targets = session.data.ammoTargets || {}, check = session.data.lastCheck;
  const offers = check?.offers || [];
  const missing = session.data.records.filter(record => !record.caliber).length;
  $('missing-caliber').hidden = !missing; $('missing-caliber').replaceChildren();
  if (missing) {
    const fix = element('button','Show them','text-button'); fix.type = 'button';
    fix.addEventListener('click', () => { $('missing-only').checked = true; showTab('collection'); render(); });
    $('missing-caliber').append(`${missing} firearm${missing === 1 ? ' has' : 's have'} no caliber recorded, so ammo suggestions and deals can’t include ${missing === 1 ? 'it' : 'them'}. `, fix);
  }
  $('calibers').replaceChildren();
  if (!known.length && !other.length) $('calibers').append(element('p','Add a caliber to a firearm or wishlist item to see suggested ammunition here.','help pad'));
  for (const {item, owned, wished} of known) {
    const card = element('div','','caliber-card'), head = element('div','','caliber-head');
    const who = [owned.length ? `${owned.length} owned` : '', wished.length ? `${wished.length} on wishlist` : ''].filter(Boolean).join(' · ');
    const title = element('div',''); title.append(element('h3', item.label), element('p', `${who}: ${[...owned, ...wished].join(', ')}`, 'help'));
    const target = document.createElement('input'); target.type = 'number'; target.min = '0.01'; target.step = '0.01'; target.max = '99';
    target.placeholder = '0.00'; target.value = targets[item.key] ?? ''; target.setAttribute('aria-label', `Good price per round for ${item.label}`);
    target.addEventListener('change', () => action(async () => {
      const active = session, value = Number(target.value), next = {...(active.data.ammoTargets || {})};
      if (target.value === '') delete next[item.key]; else if (value > 0 && value < 100) next[item.key] = Math.round(value * 1000) / 1000;
      else throw new Error('Enter a price per round between $0.01 and $99.');
      await commit({...active.data, ammoTargets:next}, active); notice(`Good-price target saved for ${item.label}.`);
    }));
    const targetLabel = element('label','Good price ≤ $/round','target-label'); targetLabel.append(target);
    const best = offers.filter(o => o.caliber === item.key && o.cpr).sort((a,b) => a.cpr - b.cpr)[0];
    const bestText = element('p', best ? `Best seen: $${best.cpr.toFixed(3)}/rd` : 'No prices yet', best?.good ? 'chip good' : 'chip');
    const right = element('div','','caliber-target'); right.append(targetLabel, bestText);
    head.append(title, right);
    const loads = element('ul','','load-list compact');
    for (const load of item.loads) { const li = element('li',''); li.append(element('span',load.load,'load'), element('span',load.use,'muted')); loads.append(li); }
    card.append(head, loads);
    for (const caution of item.cautions) card.append(element('p', caution, 'caution'));
    $('calibers').append(card);
  }
  if (other.length) $('calibers').append(element('p', `Not in the built-in list (no suggestions; still sent to the gateway): ${other.join(', ')}`, 'help pad'));
  renderSources(check); renderResults(offers, targets);
  $('search-area').value = session.data.searchArea || '';
  $('last-check').textContent = check ? `Last checked ${new Date(check.at).toLocaleString()}` : 'Not checked yet';
  const good = offers.filter(o => o.good).length;
  $('deal-count').hidden = !good; $('deal-count').textContent = good;
}
function renderSources(check) {
  const sources = session.data.sources || [];
  $('sources').replaceChildren();
  const status = new Map((check?.pages || []).map(page => [page.url, page]));
  const pages = [...sources.map(source => ({...source, label:source.name})),
    ...(session.data.wishlist || []).flatMap(item => item.urls.map(url => ({url, label:`Wishlist: ${item.name}`, location:'', kind:'firearm', wish:true})))];
  if (!pages.length) return $('sources').append(element('p','No websites yet. Add the retailers and local shops you want checked.','help pad'));
  const table = element('table','','source-table');
  const head = document.createElement('tr'); for (const h of ['Website','Location','Checks','Last result','']) head.append(element('th',h)); table.append(head);
  for (const page of pages) {
    const tr = document.createElement('tr'), result = status.get(page.url);
    const name = element('td',''); name.append(element('strong', page.label), element('div', page.url, 'help url'));
    const state = element('td', result ? (result.ok ? (result.count ? `${result.count} price${result.count === 1 ? '' : 's'} found` : result.note) : result.note) : 'Not checked', result && !result.count ? 'muted' : '');
    const cell = element('td','');
    if (!page.wish) { const remove = element('button','Remove','text-button'); remove.type = 'button';
      remove.addEventListener('click', () => action(async () => { const active = session;
        await commit({...active.data, sources:(active.data.sources || []).filter(item => item.id !== page.id)}, active); }));
      cell.append(remove); }
    tr.append(name, element('td', page.location || (page.wish ? '—' : 'Online')), element('td', {ammo:'Ammo',firearm:'Firearms',both:'Both'}[page.kind]), state, cell);
    table.append(tr);
  }
  $('sources').append(table);
}
function renderResults(offers) {
  $('deals').replaceChildren();
  if (!offers.length) return $('deals').append(element('p', session.data.lastCheck ? 'No matching prices in the last check.' : 'Choose Check prices now to scan your websites.','help pad'));
  const sorted = [...offers].sort((a,b) => (b.good - a.good) || ((a.cpr ?? 1e9) - (b.cpr ?? 1e9)) || (a.price - b.price));
  const table = element('table','','source-table deals-table');
  const head = document.createElement('tr'); for (const h of ['','Item','Caliber','Price','Per round','Where']) head.append(element('th',h)); table.append(head);
  for (const offer of sorted.slice(0, 200)) {
    const tr = document.createElement('tr'); if (offer.good) tr.className = 'good-row';
    const link = element('a', offer.title); link.href = offer.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    const item = element('td',''); item.append(link); if (offer.availability) item.append(element('div', offer.availability, 'help'));
    tr.append(element('td', offer.good ? 'Good price' : '', offer.good ? 'chip good' : ''), item,
      element('td', caliberByKey(offer.caliber)?.label || (offer.wish ? 'Wishlist' : '—')),
      element('td', usd(offer.price) + (offer.rounds ? ` / ${offer.rounds}` : '')),
      element('td', offer.cpr ? `$${offer.cpr.toFixed(3)}` : '—'),
      element('td', [offer.source || offer.seller, offer.location].filter(Boolean).join(' · ') || new URL(offer.url).hostname));
    table.append(tr);
  }
  $('deals').append(table);
}
$('add-source-button').addEventListener('click', () => { $('source-form').reset(); $('source-dialog').showModal(); });
$('close-source').addEventListener('click', () => { $('source-dialog').close(); $('source-form').reset(); });
$('source-form').addEventListener('submit', event => {
  event.preventDefault(); action(async () => {
    const active = session; if (!active) return;
    const url = $('source-url').value.trim();
    if (!url.startsWith('https://')) throw new Error('Use an HTTPS address.');
    const sources = active.data.sources || [];
    if (sources.some(source => source.url === url)) throw new Error('That page is already on the list.');
    if (sources.length >= 25) throw new Error('Up to 25 websites can be checked directly. Use the Source Gateway for wider scans.');
    const next = [...sources, {id:crypto.randomUUID(), name:$('source-name').value.trim(), url, location:$('source-location').value.trim() || 'Online', kind:$('source-kind').value}];
    await commit({...active.data, sources:next}, active);
    if (session === active) { $('source-dialog').close(); notice('Website added. Choose Check prices now to scan it.'); }
  });
});
$('search-area').addEventListener('change', () => action(async () => {
  const active = session; if (!active) return;
  await commit({...active.data, searchArea:$('search-area').value.trim()}, active);
}));
$('check-prices').addEventListener('click', () => action(async () => {
  const active = session; if (!active) return;
  const {known, other} = interestCalibers(), targets = active.data.ammoTargets || {};
  const sources = active.data.sources || [], wishlist = active.data.wishlist || [];
  const sourceByUrl = new Map(sources.map(source => [source.url, source]));
  const wishByUrl = new Map(wishlist.flatMap(item => item.urls.map(url => [url, item])));
  const pages = [...new Set([...sources.map(s => s.url), ...wishByUrl.keys()])];
  const queries = gatewayReady ? [
    ...known.map(({item}) => ({kind:'ammo', id:item.key, caliber:item.label})),
    ...other.map(text => ({kind:'ammo', id:'', caliber:text})),
    ...wishlist.map(item => ({kind:'firearm', id:item.id, manufacturer:item.manufacturer, model:item.model, caliber:item.caliber}))] : [];
  if (!pages.length && !queries.length) throw new Error('Add a website or wishlist product page first.');
  notice(`Checking ${pages.length} page${pages.length === 1 ? '' : 's'}${queries.length ? ' and the Source Gateway' : ''}…`);
  const response = await fetch('/api/price-check', {method:'POST', headers:{'Content-Type':'application/json','X-Vault-Request':'1'},
    body:JSON.stringify({pages, queries, near:active.data.searchArea || ''})});
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Price check failed.');
  if (session !== active) return;
  const interest = new Set(known.map(({item}) => item.key)), found = [];
  const annotate = (offer, origin) => {
    const caliber = detectCaliber(offer.title)?.key || (origin.queryKind === 'ammo' ? origin.query : '') || '';
    const rounds = offer.rounds || parseRounds(offer.title);
    const cpr = rounds && (caliber || origin.kind !== 'firearm') ? Math.round(offer.price / rounds * 1000) / 1000 : null;
    let wish = origin.wish?.id || '';
    if (!wish && origin.kind !== 'ammo') {
      const title = offer.title.toLowerCase();
      wish = wishlist.find(item => item.model && title.includes(item.model.toLowerCase()) && (!item.manufacturer || title.includes(item.manufacturer.toLowerCase())))?.id || '';
    }
    const target = wish ? money(wishlist.find(item => item.id === wish)?.targetPrice) : targets[caliber];
    const good = Boolean(target && (wish ? offer.price <= target : cpr && cpr <= target));
    // Keep only things you own or want: wishlist matches, or ammo in your calibers.
    if (!wish && (origin.kind === 'firearm' || !(caliber && interest.has(caliber)) || (origin.kind === 'both' && !rounds))) return;
    found.push({title:offer.title, price:offer.price, currency:offer.currency || 'USD', url:offer.url, availability:offer.availability || '',
      seller:offer.seller || '', location:offer.location || origin.location || '', source:origin.name || '', rounds:rounds || null, caliber, cpr, wish, good});
  };
  const pageStatus = [];
  for (const page of result.pages) {
    const source = sourceByUrl.get(page.url), wish = wishByUrl.get(page.url);
    pageStatus.push({url:page.url, ok:page.ok, note:page.note || '', count:page.offers.length});
    for (const offer of page.offers) annotate(offer, {name:source?.name || wish?.name, location:source?.location, kind:source?.kind || 'firearm', wish: source ? null : wish});
  }
  if (result.gateway) {
    pageStatus.push({url:'Source Gateway', ok:result.gateway.ok, note:result.gateway.note || '', count:result.gateway.offers.length});
    for (const offer of result.gateway.offers) {
      const query = queries.find(q => q.id && q.id === offer.query);
      annotate(offer, {name:offer.seller, kind:query?.kind || 'both', queryKind:query?.kind, query:query?.id, wish: query?.kind === 'firearm' ? wishlist.find(item => item.id === query.id) : null});
    }
  }
  const lastCheck = {at:new Date().toISOString(), pages:pageStatus, offers:found.slice(0, 2000)};
  await commit({...active.data, lastCheck}, active);
  const good = found.filter(offer => offer.good).length;
  notice(good ? `${good} good price${good === 1 ? '' : 's'} found.` : `Check complete: ${found.length} matching price${found.length === 1 ? '' : 's'}, none at your targets.`);
}));
fetch('/api/price-config', {cache:'no-store'}).then(r => r.json()).then(config => {
  gatewayReady = Boolean(config.gateway);
  $('gateway-status').textContent = gatewayReady ? '· Connected' : '· Not connected yet — direct website checks only. See docs/SOURCE_GATEWAY.md.';
}).catch(() => { $('gateway-status').textContent = '· Unavailable'; });

try { await loadStored(); gateMode(); $('unlock-button').disabled = false; }
catch (error) { notice(`${error.message} The saved file has not been changed.`); }
