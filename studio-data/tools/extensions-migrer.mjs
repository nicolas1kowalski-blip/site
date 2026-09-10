#!/usr/bin/env node
// Migration des enveloppes ad hoc vers le registre Studio.extend (V14, une seule fois, rejouable).
//   avant :  const _v12xFoo = renderFoo;
//            renderFoo = function (a, b) { … _v12xFoo.apply(this, arguments) … };
//   après :  Studio.extend('renderFoo', (_v12xFoo) => function (a, b) { … _v12xFoo.apply(this, arguments) … });
// Les gardes « if (typeof renderFoo === 'function') { … } » sur une seule ligne sont retirées
// (Studio.extend ignore lui-même une base absente). Le corps de la fonction n'est pas modifié.
//   node studio-data/tools/extensions-migrer.mjs            -> applique
//   node studio-data/tools/extensions-migrer.mjs --dry-run  -> liste seulement
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');
const dryRun = process.argv.includes('--dry-run');

// Fin du corps « { … } » qui commence à openIndex, en ignorant chaînes, gabarits, commentaires et regex.
function findBlockEnd(text, openIndex) {
    let depth = 0, i = openIndex; const n = text.length;
    const templateStack = [];
    const isRegexStart = at => { let j = at - 1; while (j >= 0 && /\s/.test(text[j])) j--; if (j < 0) return true; const prev = text[j]; if (/[A-Za-z0-9_$)\]]/.test(prev)) { const word = (text.slice(Math.max(0, j - 6), j + 1).match(/[A-Za-z_$][A-Za-z0-9_$]*$/) || [''])[0]; return ['return', 'typeof', 'case', 'in', 'of', 'else', 'do'].includes(word); } return true; };
    while (i < n) {
        const ch = text[i], next = text[i + 1];
        if (ch === '/' && next === '/') { i = text.indexOf('\n', i); if (i < 0) return -1; continue; }
        if (ch === '/' && next === '*') { i = text.indexOf('*/', i + 2); if (i < 0) return -1; i += 2; continue; }
        if (ch === '\'' || ch === '"') { const q = ch; i++; while (i < n && text[i] !== q) { if (text[i] === '\\') i++; if (text[i] === '\n') break; i++; } i++; continue; }
        if (ch === '`') { i++; while (i < n) { if (text[i] === '\\') { i += 2; continue; } if (text[i] === '`') break; if (text[i] === '$' && text[i + 1] === '{') { const end = findBlockEnd(text, i + 1); if (end < 0) return -1; i = end + 1; continue; } i++; } i++; continue; }
        if (ch === '/' && isRegexStart(i)) { i++; let inClass = false; while (i < n && (inClass || text[i] !== '/')) { if (text[i] === '\\') i++; else if (text[i] === '[') inClass = true; else if (text[i] === ']') inClass = false; if (text[i] === '\n') return -1; i++; } i++; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        i++;
    }
    return -1;
}

const manifests = fs.readdirSync(srcDir).filter(f => /^manifest.*\.json$/.test(f));
const files = new Set();
manifests.forEach(mf => JSON.parse(fs.readFileSync(path.join(srcDir, mf), 'utf8')).parts.forEach(p => { if (p.file.endsWith('.js')) files.add(p.file); }));
const declared = new Set();
files.forEach(f => { const txt = fs.readFileSync(path.join(srcDir, f), 'utf8'); for (const m of txt.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/gm)) declared.add(m[1]); });

let total = 0; const problems = [];
for (const file of files) {
    const full = path.join(srcDir, file); let text = fs.readFileSync(full, 'utf8'); let count = 0;
    const re = /const (_[A-Za-z0-9_]+) = ([A-Za-z0-9_$]+);/g; let m; let searchFrom = 0;
    while ((m = re.exec(text))) {
        const [capture, alias, fnName] = m; const start = m.index;
        // l'assignation « fnName = [async ]function » doit suivre immédiatement (espaces / retour à la ligne)
        const after = text.slice(start + capture.length);
        const asg = after.match(new RegExp('^(\\s*)' + fnName.replace(/\$/g, '\\$') + '\\s*=\\s*((?:async\\s+)?function\\b)'));
        if (!asg) { problems.push(file + ' : ' + capture + ' — pas d\'assignation « ' + fnName + ' = function » juste après'); continue; }
        const fnKeywordIndex = start + capture.length + asg[0].length - asg[2].length;
        const bodyOpen = text.indexOf('{', text.indexOf(')', fnKeywordIndex));
        const bodyEnd = findBlockEnd(text, bodyOpen);
        if (bodyEnd < 0) { problems.push(file + ' : ' + fnName + ' — corps introuvable'); continue; }
        const afterBody = text.slice(bodyEnd + 1).match(/^\s*;/);
        if (!afterBody) { problems.push(file + ' : ' + fnName + ' — pas de « ; » après le corps'); continue; }
        if (!declared.has(fnName)) problems.push(file + ' : ' + fnName + ' — n\'est déclarée nulle part comme « function ' + fnName + ' » (extension sans base ?)');
        const head = `Studio.extend('${fnName}', (${alias}) => `;
        const body = text.slice(fnKeywordIndex, bodyEnd + 1);
        const replacement = head + body + ');';
        const endIndex = bodyEnd + 1 + afterBody[0].length;
        text = text.slice(0, start) + replacement + text.slice(endIndex);
        re.lastIndex = start + replacement.length; count++;
    }
    // gardes sur une ligne devenues inutiles
    text = text.replace(/if \(typeof ([A-Za-z0-9_$]+) === 'function'\) \{ (Studio\.extend\('\1',[^\n]*\);) \}/g, '$2');
    if (count) { total += count; console.log((dryRun ? '[à migrer] ' : '[migré] ') + file + ' : ' + count); if (!dryRun) fs.writeFileSync(full, text); }
}
console.log(total + ' enveloppe(s) ' + (dryRun ? 'détectée(s)' : 'migrée(s)'));
if (problems.length) { console.log('\nÀ traiter à la main :'); problems.forEach(p => console.log('  - ' + p)); }
