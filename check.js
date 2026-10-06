const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Check for balanced braces in script section
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (scriptMatch) {
  const rawScript = scriptMatch[1];
  let script = rawScript;
  // Strip single-line comments
  script = script.replace(/\/\/.*$/gm, '');
  // Strip multi-line comments
  script = script.replace(/\/\*[\s\S]*?\*\//g, '');
  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;
  let inString = false;
  let stringChar = '';
  let escapeNext = false;
  
  for (let i = 0; i < script.length; i++) {
    const c = script[i];
    if (escapeNext) { escapeNext = false; continue; }
    if (c === '\\') { escapeNext = true; continue; }
    if (!inString && (c === '"' || c === "'" || c === '`')) { inString = true; stringChar = c; continue; }
    if (inString && c === stringChar) { inString = false; continue; }
    if (!inString) {
      if (c === '{') braceCount++;
      else if (c === '}') braceCount--;
      else if (c === '(') parenCount++;
      else if (c === ')') parenCount--;
      else if (c === '[') bracketCount++;
      else if (c === ']') bracketCount--;
    }
  }
  console.log('Brace balance:', braceCount);
  console.log('Paren balance:', parenCount);
  console.log('Bracket balance:', bracketCount);
  
  if (braceCount !== 0 || parenCount !== 0 || bracketCount !== 0) {
    console.log('SYNTAX ERROR: Unbalanced brackets');
    process.exit(1);
  } else {
    console.log('Syntax check: PASSED');
  }
  
  // Check key functions exist (use rawScript to avoid comment-stripping false negatives)
  const required = ['getActiveModifiers', 'equipment_modifiers', 'monsterStats', 'resolveCombat', 'tryMove', 'addChaos', 'loadGameData', 'renderVault', 'updateChaosHUD', 'canPurchase'];
  for (const fn of required) {
    if (!rawScript.includes(fn)) {
      console.log('MISSING:', fn);
      process.exit(1);
    }
  }
  console.log('All required functions/structures present: PASSED');

  // Check entity 7 references (HTML elements checked against full html, JS against rawScript)
  if (!html.includes('Trash Mimic') || !html.includes('tool-trash-mimic')) {
    console.log('MISSING: Trash Mimic references');
    process.exit(1);
  }
  console.log('Trash Mimic integration: PASSED');

  // Check lore fields
  const loreCount = (rawScript.match(/lore:/g) || []).length;
  if (loreCount < 3) {
    console.log('MISSING: lore fields (need 3: slime, hydra, trash mimic), found:', loreCount);
    process.exit(1);
  }
  console.log('Lore fields: PASSED (count:', loreCount + ')');

  // Check ENTITY_COLORS and ENTITY_SYMBOLS have 7
  if (!rawScript.includes('7: "#f97316"') && !rawScript.includes("7: '#f97316'")) {
    console.log('MISSING: ENTITY_COLORS[7]');
    process.exit(1);
  }
  if (!rawScript.includes('7:') || !rawScript.includes('🗑️')) {
    console.log('MISSING: ENTITY_SYMBOLS[7]');
    process.exit(1);
  }
  console.log('ENTITY_COLORS/SYMBOLS for 7: PASSED');
  
  console.log('\nALL CHECKS PASSED');
} else {
  console.log('No script tag found');
  process.exit(1);
}