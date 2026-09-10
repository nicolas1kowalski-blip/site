#!/usr/bin/env node
// Mesure de lisibilité des sources JS, fichier par fichier et globale. Les gabarits HTML (template literals)
// sont comptés à part : une ligne de gabarit longue n'est pas une ligne de logique longue.
//   node studio-data/tools/lisibilite-mesurer.mjs             -> tableau récapitulatif + src/LISIBILITE.json
//   node studio-data/tools/lisibilite-mesurer.mjs --strict    -> code retour 1 si un seuil est dépassé
// Seuils (CONVENTIONS.md) — planchers de non-régression atteints en V14.1 : ≤ 15 lignes de logique > 160 caractères
// hors gabarit (des requêtes SQL à expressions), 0 ligne à ≥ 3 instructions, ≤ 15 % de variables locales à nom court
// (hors index de boucle et abréviations admises). Toute évolution doit rester sous ces seuils, et les abaisser si possible.
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, '..', 'src');
const strict = process.argv.includes('--strict');
export const THRESHOLDS = { longLogicLines: 15, multiStatementLines: 0, shortLocalsRatio: 0.15 };

// Marque les caractères situés dans un gabarit `…` (hors expressions ${…}) ou dans une chaîne '…' / "…" : du texte, pas de la logique.
function isRegexStart(text, at) {
    let j = at - 1; while (j >= 0 && /\s/.test(text[j])) j--; if (j < 0) return true;
    const prev = text[j];
    if (/[A-Za-z0-9_$)\]]/.test(prev)) { const word = (text.slice(Math.max(0, j - 6), j + 1).match(/[A-Za-z_$][A-Za-z0-9_$]*$/) || [''])[0]; return ['return', 'typeof', 'case', 'in', 'of', 'else', 'do'].includes(word); }
    return true;
}
function skipRegex(text, i) { i++; let inClass = false; while (i < text.length && (inClass || text[i] !== '/')) { if (text[i] === '\\') i++; else if (text[i] === '[') inClass = true; else if (text[i] === ']') inClass = false; if (text[i] === '\n') return i; i++; } return i + 1; }
function templateMask(text) {
    const mask = new Uint8Array(text.length); let i = 0; const n = text.length; const stack = [];
    while (i < n) {
        const ch = text[i], next = text[i + 1];
        if (!stack.length || stack[stack.length - 1] === 'expr' || stack[stack.length - 1] === 'brace') {
            if (ch === '/' && next === '/') { const end = text.indexOf('\n', i); i = end < 0 ? n : end; continue; }
            if (ch === '/' && next === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
            if (ch === '\'' || ch === '"') { const q = ch; i++; while (i < n && text[i] !== q && text[i] !== '\n') { if (text[i] === '\\') { mask[i] = 1; i++; } mask[i] = 1; i++; } i++; continue; }
            if (ch === '/' && isRegexStart(text, i)) { i = skipRegex(text, i); continue; }
            if (ch === '`') { stack.push('tpl'); i++; continue; }
            if (stack.length && ch === '}') { stack.pop(); i++; continue; }
            if (ch === '{' && stack.length) { stack.push('brace'); i++; continue; }
            i++; continue;
        }
        // dans un gabarit
        if (ch === '\\') { mask[i] = 1; mask[i + 1] = 1; i += 2; continue; }
        if (ch === '`') { stack.pop(); i++; continue; }
        if (ch === '$' && next === '{') { stack.push('expr'); i += 2; continue; }
        mask[i] = 1; i++;
    }
    return mask;
}
export function measureFile(text) {
    const mask = templateMask(text); const lines = text.split('\n'); let offset = 0;
    const m = { lines: 0, codeLines: 0, commentLines: 0, templateLines: 0, longLogicLines: 0, multiStatementLines: 0, locals: 0, shortLocals: 0, functions: 0, longestLogic: 0 };
    for (const line of lines) {
        const start = offset; offset += line.length + 1;
        const trimmed = line.trim(); if (!trimmed) continue;
        m.lines++;
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) { m.commentLines++; continue; }
        m.codeLines++;
        let templateChars = 0; for (let k = 0; k < line.length; k++) if (mask[start + k]) templateChars++;
        const logicChars = line.length - templateChars;
        let htmlInTemplate = false; for (let k = 0; k < line.length; k++) if (mask[start + k] && line[k] === '<') { htmlInTemplate = true; break; }
        if (templateChars > line.length * 0.3 || htmlInTemplate) { m.templateLines++; continue; } // ligne de gabarit HTML ou de texte (ses expressions ${…} en font partie)
        if (logicChars > 160) { m.longLogicLines++; (m.longLines = m.longLines || []).push(line.trim().slice(0, 110)); }
        if (logicChars > m.longestLogic) m.longestLogic = logicChars;
        let statements = 0; for (let k = 0; k < line.length; k++) if (line[k] === ';' && !mask[start + k]) statements++;
        if (statements >= 3 && !/^\s*for\s*\(/.test(line)) m.multiStatementLines++;
        if (/^\s*(?:async\s+)?function\s+[A-Za-z0-9_$]+\s*\(/.test(line)) m.functions++;
        for (const decl of line.matchAll(/\b(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) { m.locals++; const name = decl[1]; if (/^(?:[a-df-hl-z]|[a-z]{2}|[a-z]\d|[a-z]{2}\d)$/.test(name) && !['bo', 'id', 'el', 'fn', 'cb', 'ok', 'db', 'i', 'j', 'k', 'x', 'y', 'w', 'h', 'e', 'ev', 'ms'].includes(name)) m.shortLocals++; }
    }
    m.shortLocalsRatio = m.locals ? m.shortLocals / m.locals : 0;
    return m;
}
export function measureAll() {
    const manifests = fs.readdirSync(sourceDir).filter(f => /^manifest.*\.json$/.test(f));
    const files = new Set();
    manifests.forEach(mf => JSON.parse(fs.readFileSync(path.join(sourceDir, mf), 'utf8')).parts.forEach(p => { if (p.file.endsWith('.js')) files.add(p.file); }));
    const perFile = [...files].sort().map(file => ({ file, ...measureFile(fs.readFileSync(path.join(sourceDir, file), 'utf8')) }));
    perFile.forEach(f => { if (!f.longLines) return; f.longLinesSample = f.longLines.slice(0, 3); delete f.longLines; });
    const total = perFile.reduce((acc, m) => { Object.keys(m).forEach(k => { if (typeof m[k] === 'number' && k !== 'shortLocalsRatio' && k !== 'longestLogic') acc[k] = (acc[k] || 0) + m[k]; }); acc.longestLogic = Math.max(acc.longestLogic || 0, m.longestLogic); return acc; }, {});
    total.shortLocalsRatio = total.locals ? total.shortLocals / total.locals : 0;
    return { generated: new Date().toISOString(), thresholds: THRESHOLDS, total, files: perFile };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const report = measureAll(); const t = report.total;
    fs.writeFileSync(path.join(sourceDir, 'LISIBILITE.json'), JSON.stringify(report, null, 1) + '\n');
    console.log(`Lignes : ${t.lines} (code ${t.codeLines}, commentaires ${t.commentLines}, gabarits HTML et textes ${t.templateLines})`);
    console.log(`Lignes de logique > 160 caractères : ${t.longLogicLines} (la plus longue : ${t.longestLogic})`);
    console.log(`Lignes à ≥ 3 instructions : ${t.multiStatementLines}`);
    console.log(`Variables locales à nom court : ${t.shortLocals} / ${t.locals} (${(100 * t.shortLocalsRatio).toFixed(1)} %)`);
    const worst = report.files.filter(f => f.longLogicLines || f.multiStatementLines).sort((a, b) => (b.longLogicLines + b.multiStatementLines) - (a.longLogicLines + a.multiStatementLines)).slice(0, 8);
    if (process.argv.includes('--list')) report.files.forEach(f => (f.longLinesSample || []).forEach(l => console.log('  ' + f.file + ' | ' + l)));
    if (worst.length) { console.log('Fichiers à reprendre :'); worst.forEach(f => console.log(`  ${f.file} : ${f.longLogicLines} longue(s), ${f.multiStatementLines} multi-instructions`)); }
    const over = t.longLogicLines > THRESHOLDS.longLogicLines || t.multiStatementLines > THRESHOLDS.multiStatementLines || t.shortLocalsRatio > THRESHOLDS.shortLocalsRatio;
    console.log(over ? '✗ seuils dépassés' : '✓ seuils respectés');
    process.exit(strict && over ? 1 : 0);
}
