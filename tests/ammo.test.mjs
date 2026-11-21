import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CALIBERS, detectCaliber, parseRounds} from '../app/ammo.mjs';
test('every catalog label maps back to its own caliber', () => {
  for (const item of CALIBERS) assert.equal(detectCaliber(item.label)?.key, item.key, item.label);
});
test('retail titles map to calibers and round counts', () => {
  const cases = [['Federal 9mm Luger 115gr FMJ 50 Rounds','9mm',50],['Tula 9x18 Makarov 95gr','9mak',null],
    ['PMC .223 Rem 1000 Rounds','556',1000],['Barnes 300 AAC Blackout 110gr','300blk',null],['CCI .22 LR 40gr 100ct','22lr',100],
    ['Hornady .22 WMR 30gr','22wmr',null],['12 Gauge 2-3/4" 00 Buck 5 shells','12ga',5],['Case of 500 .45 ACP 230gr','45acp',500],
    ['7.62x51 M80 1,000 rds','308',1000],['S&W 1380 accessory',undefined,null]];
  for (const [title,key,rounds] of cases) { assert.equal(detectCaliber(title)?.key, key, title); assert.equal(parseRounds(title), rounds, title); }
});
