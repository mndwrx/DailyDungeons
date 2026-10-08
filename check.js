// DailyDungeons static check: real JS parse + the pieces the chore loop depends on.
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
let failed = 0;
const pass = msg => console.log('PASS', msg);
const fail = msg => { console.log('FAIL', msg); failed++; };

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.log('No script tag found'); process.exit(1); }
const script = scriptMatch[1];

// 1. Syntax: compile (not run) the game script
try { new vm.Script(script, { filename: 'index.html<script>' }); pass('Script parses'); }
catch (e) { fail('Syntax error: ' + e.message); }

// 2. Core functions are actually defined (not just mentioned)
const required = [
  'showScreen', 'loadAssetGrid', 'selectTile', 'paintTile', 'showToast',
  'completeChore', 'toggleChoreTimer', 'renderChoreLog', 'addRewards',
  'tryMove', 'findPath', 'handleRoomClick', 'isWalkable', 'triggerAt', 'spawnRandomMonsters',
  'checkAmbush', 'triggerAmbush', 'ambushFight', 'ambushRun', 'ambushHide', 'resolveCombat', 'showLevelClear',
  'drawMap', 'drawRoom', 'drawMinimap', 'drawLevelDisc', 'saveGameData', 'loadGameData', 'newMap'
];
const missingFns = required.filter(fn => !new RegExp(`function\\s+${fn}\\s*\\(`).test(script));
missingFns.length ? fail('Missing functions: ' + missingFns.join(', ')) : pass(`${required.length} core functions defined`);

// 3. Every getElementById('x') used by the script exists in the markup
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const used = new Set([...script.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]));
const missingIds = [...used].filter(id => !ids.has(id));
missingIds.length ? fail('Script references missing ids: ' + missingIds.join(', ')) : pass(`All ${used.size} referenced element ids exist`);

// 4. UI controls the loop needs
const controls = ['new-map-btn', 'edit-map-btn', 'play-map-btn', 'builder-menu-btn', 'builder-palette-btn', 'builder-chores-btn',
  'builder-play-btn', 'browser-close', 'chore-type', 'chore-custom', 'chore-complete', 'chore-timer-btn', 'chore-log-list',
  'ambush-fight', 'ambush-run', 'ambush-hide', 'level-continue', 'level-menu', 'menu-btn', 'chore-log-btn', 'toggle-edit', 'toast'];
const missingCtl = controls.filter(id => !ids.has(id));
missingCtl.length ? fail('Missing controls: ' + missingCtl.join(', ')) : pass(`${controls.length} loop controls present`);

// 5. Chore monsters: lore + trigger tiles (sink -> dishes, laundry -> laundry, trash can -> trash)
for (const key of ['dishes', 'laundry', 'trash']) {
  new RegExp(`${key}:\\s*\\{[\\s\\S]*?lore:`).test(script) ? pass(`CHORES.${key} has lore`) : fail(`CHORES.${key} missing or has no lore`);
}
/TRIGGER_ENTITIES\s*=\s*\{[^}]*4:\s*"dishes"[^}]*12:\s*"laundry"[^}]*13:\s*"trash"/.test(script)
  ? pass('Trigger tiles map sink/laundry/trash can to their monsters') : fail('TRIGGER_ENTITIES mapping missing');
['sink', 'laundry', 'trashcan', 'floor', 'wall'].every(id => new RegExp(`\\b${id}:\\s*\\{\\s*value:`).test(script))
  ? pass('Palette ids map to tile values (TILE_DEFS)') : fail('TILE_DEFS missing palette ids');
(script.includes('7: "#f97316"') && script.includes('🗑️')) ? pass('Trash Mimic color/symbol present') : fail('Trash Mimic color/symbol missing');


// 6. Palette: hand-picked house pieces, category tabs, search, all sheets exist
const houseRows = [...script.matchAll(/^\s*\["(\w+)",\s*(\d+),\s*[TE],\s*"(\w+)",\s*"[^"]+",\s*(?:"([IRU])"|null)/gm)];
const tileVals = [...script.matchAll(/\b\w+:\s*\{\s*value:\s*(\d+),/g)].map(m => +m[1]).concat(houseRows.map(m => +m[2]));
houseRows.length >= 90 ? pass(`${houseRows.length} house pieces in TILE_DEFS`) : fail(`only ${houseRows.length} house pieces`);
new Set(tileVals).size === tileVals.length ? pass(`All ${tileVals.length} tile values unique`) : fail('Duplicate tile values');
const cats = ['all', 'floors', 'kitchen', 'bath', 'bedroom', 'living', 'laundry', 'yard', 'decor', 'monsters'];
const missingTabs = cats.filter(c => !html.includes(`data-category="${c}"`));
missingTabs.length ? fail('Missing palette tabs: ' + missingTabs.join(', ')) : pass(`${cats.length} palette tabs present`);
const badCat = houseRows.filter(m => !cats.includes(m[3])).map(m => m[1]);
badCat.length ? fail('Pieces with unknown tab: ' + badCat.join(', ')) : pass('Every piece belongs to a palette tab');
ids.has('palette-search') ? pass('Palette search box present') : fail('Palette search box missing');
const sheetSrcs = [...script.matchAll(/src:\s*"(assets\/[^"]+\.png)"/g)].map(m => m[1]);
const missingSheets = sheetSrcs.filter(f => !fs.existsSync(f));
sheetSrcs.length >= 3 && !missingSheets.length ? pass(`${sheetSrcs.length} sprite sheets exist (${sheetSrcs.join(', ')})`) : fail('Missing sprite sheets: ' + missingSheets.join(', '));

// 7. Design rules: no Tile Tokens, no blocking alerts
/token/i.test(html) ? fail('Tile Token references remain') : pass('No Tile Token references');
/\balert\s*\(/.test(script) ? fail('alert() still used') : pass('No blocking alert() calls');

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
