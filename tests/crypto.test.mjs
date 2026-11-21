import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import {derive,seal,open,from64,to64,validateEnvelope} from '../app/crypto.mjs';
const pass = 'synthetic test phrase only';
const record = {id:'test-1',name:'Synthetic record',manufacturer:'Example',model:'Test',serial:'TEST-SERIAL-ONLY',purchaseDate:'2026-11-21',purchasePrice:'100 USD',notes:'Synthetic fixture, not actual inventory',receipts:[{name:'test.pdf',type:'application/pdf',data:btoa('%PDF-test-receipt')} ]};
const data = {version:1,records:[record]};
test('encrypted round trip includes receipts without storing clear fields', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derive(pass,salt);
  const vault = await seal(data,key,salt);
  assert.equal(JSON.stringify(vault).includes(record.serial),false);
  assert.equal(JSON.stringify(vault).includes('test.pdf'),false);
  assert.deepEqual((await open(vault,pass)).data,data);
  assert.equal(key.extractable,false);
  const again = await seal(data,key,salt);
  assert.notEqual(again.iv,vault.iv); assert.notEqual(again.ciphertext,vault.ciphertext);
  await assert.rejects(open(vault,'wrong passphrase'));
  const changed = structuredClone(vault), bytes = from64(changed.ciphertext); bytes[0] ^= 1; changed.ciphertext = to64(bytes);
  await assert.rejects(open(changed,pass));
  assert.throws(() => validateEnvelope({...vault,iterations:1}));
});
test('rekey makes the old passphrase unusable for the new vault', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derive('new synthetic password',salt);
  const vault = await seal(data,key,salt);
  assert.deepEqual((await open(vault,'new synthetic password')).data,data);
  await assert.rejects(open(vault,pass));
});
test('rejects invalid receipt types and duplicate records', async () => {
  const salt = crypto.getRandomValues(new Uint8Array(16)), key = await derive(pass,salt);
  await assert.rejects(seal({version:1,records:[record,record]},key,salt));
  const bad = structuredClone(data); bad.records[0].receipts[0].type = 'text/html';
  await assert.rejects(seal(bad,key,salt));
});
test('photos encrypt with records and old photo-free vaults still open', async () => {
  const salt=crypto.getRandomValues(new Uint8Array(16)), key=await derive(pass,salt);
  const withPhoto=structuredClone(data);
  withPhoto.records[0].photo={name:'private-photo.jpg',type:'image/jpeg',data:btoa('synthetic-photo-bytes'),source:'https://manufacturer.example/photo.jpg'};
  const encrypted=await seal(withPhoto,key,salt);
  assert.equal(JSON.stringify(encrypted).includes('private-photo'),false);
  assert.deepEqual((await open(encrypted,pass)).data,withPhoto);
  assert.deepEqual((await open(await seal(data,key,salt),pass)).data,data);
  withPhoto.records[0].photo.type='image/svg+xml';
  await assert.rejects(seal(withPhoto,key,salt));
});
test('type and caliber persist encrypted while older records remain compatible', async () => {
  const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(pass,salt);
  const specs=structuredClone(data); specs.records[0].type='Rifle'; specs.records[0].caliber='Synthetic caliber';
  const vault=await seal(specs,key,salt);
  assert.equal(JSON.stringify(vault).includes('Synthetic caliber'),false);
  assert.deepEqual((await open(vault,pass)).data,specs);
  assert.deepEqual((await open(await seal(data,key,salt),pass)).data,data);
  specs.records[0].type='Invalid type';
  await assert.rejects(seal(specs,key,salt));
  specs.records[0].type='Shotgun'; specs.records[0].caliber=123;
  await assert.rejects(seal(specs,key,salt));
});
test('wishlist, websites, targets and saved checks encrypt and validate', async () => {
  const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(pass,salt);
  const full=structuredClone(data); full.records[0].ammo='124 gr JHP — verified';
  full.wishlist=[{id:'w1',name:'Synthetic wish',manufacturer:'Example',model:'X1',type:'Pistol',caliber:'9mm Luger',targetPrice:'499',urls:['https://shop.example/x1'],notes:''}];
  full.sources=[{id:'s1',name:'Synthetic shop',url:'https://shop.example/9mm',location:'Online',kind:'ammo'}];
  full.ammoTargets={'9mm':0.25}; full.searchArea='Synthetic City, TX';
  full.lastCheck={at:'2026-11-21T00:00:00Z',pages:[{url:'https://shop.example/9mm',ok:true,note:'',count:1}],offers:[{title:'Synthetic 9mm 50rd',price:12,url:'https://shop.example/a',cpr:0.24,good:true}]};
  const vault=await seal(full,key,salt);
  assert.equal(JSON.stringify(vault).includes('Synthetic wish'),false);
  assert.deepEqual((await open(vault,pass)).data,full);
  for (const mutate of [d=>d.wishlist[0].urls=['http://plain.example'], d=>d.sources[0].kind='other', d=>d.ammoTargets['9mm']=-1,
                        d=>d.wishlist.push({...d.wishlist[0]}), d=>d.records[0].ammo=5]) {
    const bad=structuredClone(full); mutate(bad); await assert.rejects(seal(bad,key,salt));
  }
});
