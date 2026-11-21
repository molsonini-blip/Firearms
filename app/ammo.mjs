// Local, static caliber catalog. Nothing here is fetched or sent anywhere.
// Suggestions are common factory-load categories, not handloading data. The
// firearm's barrel marking and owner's manual always take precedence.

// Patterns never start inside a larger number ("1380" is not .380).
const C = (key, label, kind, match, loads, cautions = []) =>
  ({key, label, kind, match: new RegExp(`(?<![\\d])(?:${match.source})`), loads, cautions});
const L = (load, use) => ({load, use});

// Order matters: more specific patterns must come before broader ones
// (e.g. 9mm Makarov before 9mm Luger, .22 WMR before .22 LR).
export const CALIBERS = [
  C('9mak', '9mm Makarov (9x18)', 'handgun', /9\s*mm\s*mak|9\s*x\s*18/, [
    L('95 gr FMJ', 'Range / practice'), L('95 gr JHP', 'Self-defense')],
    ['Not interchangeable with 9mm Luger or .380 ACP.']),
  C('9mm', '9mm Luger (9x19)', 'handgun', /9\s*mm(?!\s*mak)|9\s*x\s*19|9mm\s*luger|9\s*mm\s*para/, [
    L('115 gr FMJ', 'Range / practice (most common, lowest cost)'),
    L('124 gr FMJ', 'Practice with recoil closer to duty loads'),
    L('147 gr FMJ', 'Softer-feeling practice; subsonic for suppressors'),
    L('124 gr or 147 gr JHP', 'Self-defense — confirm reliability in your pistol')],
    ['Use +P or +P+ only if the manufacturer rates the pistol for it.']),
  C('380', '.380 ACP', 'handgun', /\.?380\s*(acp|auto)?|9\s*mm\s*(kurz|short)/, [
    L('95 gr FMJ', 'Range / practice'), L('90–99 gr JHP', 'Self-defense — verify feeding in small pistols')]),
  C('38super', '.38 Super', 'handgun', /\.?38\s*super/, [L('130 gr FMJ', 'Range / practice'), L('115–125 gr JHP', 'Self-defense')],
    ['.38 Super +P is the standard modern loading; do not use in older .38 Auto pistols.']),
  C('38spl', '.38 Special', 'handgun', /\.?38\s*(spl|special|s&w\s*spl)/, [
    L('130 gr FMJ or 158 gr LRN', 'Range / practice'), L('110–135 gr JHP', 'Self-defense'),
    L('148 gr wadcutter', 'Target; mild recoil')],
    ['+P only in revolvers marked or rated for +P.', 'Can be fired in .357 Magnum revolvers; the reverse is unsafe.']),
  C('357mag', '.357 Magnum', 'handgun', /\.?357\s*(mag|magnum|rem)/, [
    L('158 gr JSP / JHP', 'General purpose / self-defense'), L('125 gr JHP', 'Self-defense (more recoil and flash)'),
    L('.38 Special loads', 'Lower-cost, lower-recoil practice')],
    ['.357 Magnum must never be fired in a revolver chambered only for .38 Special.']),
  C('357sig', '.357 SIG', 'handgun', /\.?357\s*sig/, [L('125 gr FMJ', 'Range / practice'), L('125 gr JHP', 'Self-defense')]),
  C('40sw', '.40 S&W', 'handgun', /\.?40\s*(s\s*&\s*w|sw|smith)/, [
    L('165 gr or 180 gr FMJ', 'Range / practice'), L('165 gr or 180 gr JHP', 'Self-defense')]),
  C('10mm', '10mm Auto', 'handgun', /10\s*mm/, [
    L('180 gr FMJ', 'Range / practice'), L('180 gr JHP', 'Self-defense'),
    L('200–220 gr hard cast / FMJ flat nose', 'Woods / large-animal defense')],
    ['Factory loads vary from "lite" (.40-like) to full power; check the box velocity.']),
  C('45colt', '.45 Colt (Long Colt)', 'handgun', /\.?45\s*(colt|lc|long\s*colt)/, [
    L('250–255 gr lead flat nose', 'Standard-pressure general use')],
    ['Use standard-pressure loads only unless the revolver is rated for heavier loads; older and replica guns need standard loads.',
     'Revolvers marked .45 Colt/.410 accept both — use only shells of the marked length.']),
  C('45acp', '.45 ACP', 'handgun', /\.?45\s*(acp|auto)/, [
    L('230 gr FMJ', 'Range / practice'), L('185 gr or 230 gr JHP', 'Self-defense')],
    ['+P only if the pistol is rated for it.']),
  C('44spl', '.44 Special', 'handgun', /\.?44\s*(spl|special)/, [L('240 gr lead SWC', 'Practice'), L('200 gr JHP', 'Self-defense')],
    ['Can be fired in .44 Magnum revolvers; the reverse is unsafe.']),
  C('44mag', '.44 Magnum', 'handgun', /\.?44\s*(mag|magnum|rem)/, [
    L('240 gr JSP / JHP', 'Hunting / general purpose'), L('.44 Special loads', 'Lower-recoil practice')]),
  C('57x28', '5.7x28mm', 'handgun', /5\.7\s*x\s*28/, [L('40 gr FMJ / polymer tip', 'Range / practice')]),
  C('17hmr', '.17 HMR', 'rimfire', /\.?17\s*hmr/, [L('17 gr V-Max / polymer tip', 'Varmint / target'), L('20 gr', 'Small game')]),
  C('22wmr', '.22 WMR (.22 Magnum)', 'rimfire', /\.?22\s*(wmr|win(chester)?\s*mag|magnum|mag\b)/, [
    L('40 gr JHP', 'General purpose / small game'), L('30 gr polymer tip', 'Varmint')],
    ['Not interchangeable with .22 LR unless the firearm has a dedicated cylinder or barrel.']),
  C('22lr', '.22 LR', 'rimfire', /\.?22\s*(lr|long\s*rifle)/, [
    L('36–40 gr high-velocity round nose', 'Plinking; most reliable in semi-autos'),
    L('40 gr standard velocity', 'Accuracy / suppressed / quieter'), L('36 gr hollow point', 'Small game')],
    ['Use .22 Short or .22 Long only if the firearm is marked for them.']),
  C('300blk', '.300 Blackout', 'rifle', /\.?300\s*(aac\s*)?(blk|blackout)/, [
    L('110–125 gr supersonic', 'Range / general purpose'), L('190–220 gr subsonic', 'Suppressed shooting')],
    ['DANGER: .300 BLK can chamber in .223/5.56 rifles and cause a catastrophic failure. Keep magazines and ammo clearly separated and marked.']),
  C('556', '5.56 NATO / .223 Remington', 'rifle', /5\.56|\.?223\s*(rem|remington|wylde)?(?!\s*wssm)/, [
    L('55 gr FMJ', 'Range / practice'), L('62 gr FMJ (M855-type)', 'General purpose'),
    L('69–77 gr OTM / BTHP', 'Match / precision — check twist rate (1:7–1:8 recommended)'),
    L('55–64 gr soft point', 'Varmint / predator hunting')],
    ['A 5.56 NATO or .223 Wylde chamber accepts both. A chamber marked .223 Remington only should not be fed 5.56 NATO.']),
  C('762x39', '7.62x39mm', 'rifle', /7\.62\s*x\s*39/, [L('122–124 gr FMJ', 'Range / practice'), L('123–125 gr soft point', 'Hunting (deer-size)')]),
  C('3030', '.30-30 Winchester', 'rifle', /\.?30\s*-\s*30/, [L('150 gr or 170 gr flat-nose soft point', 'Hunting')],
    ['Tube-magazine rifles need flat-nose or soft-polymer-tip bullets.']),
  C('308', '.308 Winchester / 7.62x51 NATO', 'rifle', /\.?308\s*(win)?|7\.62\s*x\s*51/, [
    L('147–150 gr FMJ', 'Range / practice'), L('168 gr or 175 gr BTHP', 'Match / precision'),
    L('150–180 gr soft point', 'Hunting')],
    ['Follow the manufacturer manual on commercial .308 vs military 7.62x51 compatibility.']),
  C('65cm', '6.5 Creedmoor', 'rifle', /6\.5\s*(mm\s*)?(creed|cm)/, [L('140–147 gr match', 'Precision / target'), L('120–143 gr hunting', 'Hunting')]),
  C('3006', '.30-06 Springfield', 'rifle', /\.?30\s*-\s*06/, [L('150 gr FMJ', 'Range / practice'), L('150–180 gr soft point', 'Hunting')],
    ['M1 Garand: use Garand-safe loads (150 gr class, moderate pressure) or an adjustable gas plug.']),
  C('270', '.270 Winchester', 'rifle', /\.?270\s*win/, [L('130 gr soft point', 'Hunting (deer)'), L('150 gr soft point', 'Hunting (larger game)')]),
  C('243', '.243 Winchester', 'rifle', /\.?243\s*win/, [L('55–58 gr', 'Varmint'), L('95–100 gr soft point', 'Deer')]),
  C('4570', '.45-70 Government', 'rifle', /\.?45\s*-\s*70/, [L('300–405 gr lead / soft point', 'Hunting')],
    ['Factory loads come in three pressure tiers. Antique and Trapdoor rifles require standard (Trapdoor-safe) loads only.']),
  C('350leg', '.350 Legend', 'rifle', /\.?350\s*legend/, [L('145–150 gr FMJ', 'Range / practice'), L('150–180 gr soft point', 'Hunting')]),
  C('12ga', '12 gauge', 'shotgun', /12\s*(ga|gauge|g\b)/, [
    L('2¾" 1–1⅛ oz #7½ or #8', 'Clays / target'), L('2¾" 00 buckshot', 'Home defense'),
    L('2¾" 1 oz rifled or sabot slug', 'Deer / slug — match slug type to barrel'),
    L('#4–#6 lead or steel', 'Upland / small game / waterfowl (steel where required)')],
    ['Never use shells longer than the chamber (2¾", 3", or 3½" — marked on the barrel).',
     'Use steel shot only in barrels and chokes rated for it.']),
  C('20ga', '20 gauge', 'shotgun', /20\s*(ga|gauge|g\b)/, [
    L('2¾" ⅞ oz #7½ or #8', 'Clays / target'), L('#4–#6 shot', 'Upland / small game'),
    L('#3 buckshot', 'Home defense'), L('¾ oz slug', 'Deer')],
    ['Never load 20 ga shells into a 12 ga gun — they can lodge in the barrel.', 'Match shell length to the chamber.']),
  C('410', '.410 bore', 'shotgun', /\.?410/, [L('2½" #7½–#9', 'Target / small game'), L('3" 000 buck or defense load', 'Defense')],
    ['Match shell length (2½" or 3") to the chamber.']),
];

const BY_KEY = new Map(CALIBERS.map(item => [item.key, item]));
export const caliberByKey = key => BY_KEY.get(key) || null;

/** Map free text ("9mm", "5.56x45", ".38 SPL +P") to a catalog entry, or null. */
export function detectCaliber(text) {
  const value = ` ${String(text || '').toLowerCase().replace(/[“”″]/g, '"')} `;
  return CALIBERS.find(item => item.match.test(value)) || null;
}

/** Find a round/shell count in a product title, e.g. "1000 Rounds", "50rd box", "Case of 500". */
export function parseRounds(text) {
  const value = String(text || '').toLowerCase().replace(/,(?=\d{3})/g, '');
  const patterns = [
    /(\d{1,5})\s*(?:-|\s)?(?:rounds?|rds?|rd\b|cartridges?|shells?|ct\b|count|pk\b|pack)/,
    /(?:box|case|pack|bulk|carton)\s+of\s+(\d{1,5})/,
    /(\d{1,5})\s*\/\s*(?:box|bx)/,
  ];
  for (const pattern of patterns) {
    const found = value.match(pattern);
    if (found) { const count = Number(found[1]); if (count >= 1 && count <= 20000) return count; }
  }
  return null;
}
