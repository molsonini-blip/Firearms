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
