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
  'checkAmbush', 'triggerAmbush', 'startBattle', 'battleStep', 'battleEnd', 'heroStats', 'rollChoreLoot', 'resolveCombat', 'showLevelClear',
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
  'battle-speed', 'battle-text', 'loot-popup', 'level-continue', 'level-menu', 'menu-btn', 'chore-log-btn', 'toggle-edit', 'toast'];
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
(script.includes('7: "#f97316"') && /trash_mimic:[^\n]*sheet: "rpg_sheet"/.test(script)) ? pass('Trash Mimic color/sprite present') : fail('Trash Mimic color/sprite missing');
{ const EMO = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}]/u;
  const bad = html.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => EMO.test(l));
  bad.length ? fail('Emoji left in index.html at lines ' + bad.map(b => b[0]).join(',')) : pass('No emoji anywhere in index.html (pixel sprite icons only)'); }


// 6. Palette: hand-picked house pieces, category tabs, search, all sheets exist
const houseRows = [...script.matchAll(/^\s*\["(\w+)",\s*(\d+),\s*[TEO],\s*"(\w+)",\s*"[^"]+",\s*(?:"([IRUCDF])"|null)/gm)];
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

// 7. Builder: Skylines-style rectangle drag (Pointer Events for mouse, touch, pen)
const rectBits = ['mapCanvas.addEventListener("pointerdown"', 'mapCanvas.addEventListener("pointermove"', 'mapCanvas.addEventListener("pointerup"',
  'mapCanvas.addEventListener("pointercancel"', 'setPointerCapture', 'function rectBounds', 'function drawRectPreview', 'function finishRectDrag', 'function cancelRectDrag'];
const missingRect = rectBits.filter(b => !script.includes(b));
missingRect.length ? fail('Rectangle drag missing: ' + missingRect.join(', ')) : pass('Builder rectangle drag: pointer down/move/up/cancel, capture, preview, commit, cancel');
/e\.key === "Escape" && rectDrag/.test(script) ? pass('Escape cancels the rectangle') : fail('Escape does not cancel the rectangle');
ids.has('rect-size-label') ? pass('Rectangle size label element present') : fail('Rectangle size label missing');
/strokePaintLine|paintStroke/.test(script) ? fail('Freehand stroke painting still present') : pass('Freehand brush painting removed');
/mapCanvas\.addEventListener\("click"/.test(script) ? fail('Old click painter still attached (would double-paint)') : pass('No duplicate click painter on the builder canvas');
/#map\s*\{[^}]*touch-action:\s*none/.test(html) ? pass('#map has touch-action: none') : fail('#map missing touch-action: none');

// 8. Rotation + quick eraser
const rotBits = ['let selectedRotation', 'terrainRot', 'entityRot', 'function rotateBrush', 'function rotateCell', 'function validRotGrid', 'function toggleEraser', 'function isTypingTarget'];
const missingRot = rotBits.filter(b => !script.includes(b));
missingRot.length ? fail('Rotation/eraser pieces missing: ' + missingRot.join(', ')) : pass('Rotation state per layer, rotate/validate helpers, quick eraser, typing guard defined');
['builder-rotate-btn', 'builder-eraser-btn', 'builder-swatch'].every(id => ids.has(id)) ? pass('Toolbar has rotate button, eraser button and swatch') : fail('Toolbar rotate/eraser/swatch missing');
/terrainRot = validRotGrid\(data\.terrainRot\)/.test(script) && /entityRot = validRotGrid\(data\.entityRot\)/.test(script) && /payload = \{[\s\S]*?terrainRot,[\s\S]*?entityRot,/.test(script)
  ? pass('Rotation saved and loaded (old saves default to 0)') : fail('Rotation not persisted');
/drawTiles\(roomCtx, room\.terrain, room\.entity, room\.terrainRot, room\.entityRot, room\.overlay, room\.overlayRot\)/.test(script) && /drawTiles\(mapCtx, terrainMap, entityMap, terrainRot, entityRot, overlayMap, overlayRot\)/.test(script)
  ? pass('Builder map and play room both draw rotations') : fail('Rotation not drawn in builder and play');
/function isWalkable[^}]*Rot/.test(script) || /function triggerAt[^}]*Rot/.test(script) ? fail('Rotation leaks into gameplay rules') : pass('Blocking/triggers ignore rotation');

// 9. Layering: doors/windows/trees are pieces on top of the tile, not replacements
const layerRows = Object.fromEntries(houseRows.map(m => [m[1], m[0]]));
['window_wood', 'window_white', 'window_round', 'door_wood', 'door_glass', 'door_teal', 'door_double'].every(id => layerRows[id] && /,\s*E,/.test(layerRows[id]))
  ? pass('Doors and windows are on the entity layer') : fail('Doors/windows still on the terrain layer');
/tree:\s*\{\s*value: 8,\s*layer: "entity"/.test(script) && /rock:\s*\{\s*value: 9,\s*layer: "entity"/.test(script) ? pass('Tree/rock keep values 8/9 on the entity layer') : fail('Tree/rock still replace the ground');
/base: "#b45309"/.test(script) ? fail('Orange base color still drawn under pieces') : pass('No orange base color under doors');
/DEFAULT_FLOOR/.test(script) ? fail('Pieces still get an automatic floor under them') : pass('Pure layers: no automatic floor under pieces');
(() => { const m = script.match(/function paintTile[\s\S]*?\n\}/); const body = m ? m[0] : '';
  const terr = body.match(/def\.layer === "terrain"\) \{[\s\S]*?return true;\s*\}/), ent = body.slice(body.lastIndexOf('return true;\n  }') + 1);
  return m && terr && !/entityMap/.test(terr[0]) && !/terrainMap/.test(ent); })()
  ? pass('Placing a piece only changes its own layer (terrain keeps the entity, entity keeps the terrain)') : fail('paintTile writes to the other layer');
/ctx\.fillStyle = def\.base|"#8b6b4a"/.test(script) ? fail('Solid fallback color still drawn behind sprites') : pass('No solid fallback color behind sprites');
/if \(!t\) return !!\(e && piece && piece\.walk\)/.test(script) ? pass('A lone piece on empty ground walks by its own rule') : fail('Walkability for pieces without ground missing');
['curtains_orange', 'curtains_teal', 'landscape_art', 'sunset_art', 'photo_frames', 'cuckoo_clock', 'wall_mirror', 'round_mirror', 'chandelier', 'candle_stand', 'candelabra', 'potted_plant', 'small_plant', 'teapot', 'toilet_paper'].every(id => layerRows[id] && /,\s*O,/.test(layerRows[id]))
  ? pass('Hang-on + tabletop decor (curtains, paintings, mirrors, clock, chandelier, candles, plants, teapot, toilet paper) is on the top overlay layer') : fail('Hang-on decor not on the overlay layer');
/payload = \{[\s\S]*?overlayMap,[\s\S]*?overlayRot,/.test(script) && /overlayMap = validTileGrid\(data\.overlayMap\)/.test(script) && /migrateOverlay\(\);/.test(script)
  ? pass('Overlay layer saved + loaded (old saves: empty overlay, decor lifted off the entity layer)') : fail('Overlay layer not persisted');
/if \(overlayMap\[col\]\[row\]\) \{ overlayMap\[col\]\[row\] = 0[\s\S]*?if \(entityMap\[col\]\[row\]\) \{ entityMap[\s\S]*?if \(terrainMap\[col\]\[row\]\)/.test(script)
  ? pass('Eraser peels top-down: overlay, entity, terrain') : fail('Eraser order wrong');
/function isWalkable[^}]*overlay/.test(script) ? fail('Overlay affects walking') : pass('Overlay never blocks walking');
/piece && piece\.door\) return true/.test(script) ? pass('Doors are walkable through walls') : fail('Doors not walkable');
/function migrateLayers/.test(script) && /migrateLayers\(\);/.test(script) ? pass('Old saves migrate terrain doors/windows/trees to the entity layer') : fail('No legacy layer migration');

// 10. Design rules: no Tile Tokens, no blocking alerts
/token/i.test(html) ? fail('Tile Token references remain') : pass('No Tile Token references');
/\balert\s*\(/.test(script) ? fail('alert() still used') : pass('No blocking alert() calls');

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(failed ? 1 : 0);
