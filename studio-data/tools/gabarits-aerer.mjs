#!/usr/bin/env node
// Aère les gabarits HTML (template literals) trop longs : un retour à la ligne est inséré après la fermeture d'un
// élément de BLOC (</div>, </tr>, </td>, </table>, </section>, </p>, </li>…) lorsqu'un autre élément suit
// immédiatement. Le HTML produit est équivalent : un nœud texte fait uniquement d'espaces entre deux blocs, entre
// deux lignes ou cellules de tableau, ou dans un conteneur flex/grid, n'a aucun rendu. Les éléments en ligne
// (span, b, button, label, code…) ne sont jamais séparés, pour ne pas ajouter d'espace visible. Rien n'est
// inséré à l'intérieur d'une expression ${…} ni d'un attribut.
//   node studio-data/tools/gabarits-aerer.mjs [--dry-run]
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, '..', 'src');
const dryRun = process.argv.includes('--dry-run');
const BLOCK_CLOSE = /<\/(?:div|tr|td|th|thead|tbody|tfoot|table|section|p|h[1-6]|ul|ol|li|details|summary|form|aside|header|footer|nav|article|fieldset|legend|pre|hr|main|dl|dt|dd)>(?=<)/g;
const MAX_LINE = 160;

// Segmente le texte en zones : code, gabarit (texte brut) et expression ${…} — même automate que la mesure.
function isRegexStart(text, at) {
    let j = at - 1; while (j >= 0 && /\s/.test(text[j])) j--; if (j < 0) return true;
    const prev = text[j];
    if (/[A-Za-z0-9_$)\]]/.test(prev)) { const word = (text.slice(Math.max(0, j - 6), j + 1).match(/[A-Za-z_$][A-Za-z0-9_$]*$/) || [''])[0]; return ['return', 'typeof', 'case', 'in', 'of', 'else', 'do'].includes(word); }
    return true;
}
function skipRegex(text, i) { i++; let inClass = false; while (i < text.length && (inClass || text[i] !== '/')) { if (text[i] === '\\') i++; else if (text[i] === '[') inClass = true; else if (text[i] === ']') inClass = false; if (text[i] === '\n') return i; i++; } return i + 1; }
function templateSpans(text) {
    const spans = []; let i = 0; const n = text.length; const stack = []; let tplStart = -1;
    while (i < n) {
        const ch = text[i], next = text[i + 1]; const top = stack[stack.length - 1];
        if (!stack.length || top === 'expr' || top === 'brace') {
            if (ch === '/' && next === '/') { const end = text.indexOf('\n', i); i = end < 0 ? n : end; continue; }
            if (ch === '/' && next === '*') { const end = text.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue; }
            if (ch === '\'' || ch === '"') { const q = ch; i++; while (i < n && text[i] !== q && text[i] !== '\n') { if (text[i] === '\\') i++; i++; } i++; continue; }
            if (ch === '/' && isRegexStart(text, i)) { i = skipRegex(text, i); continue; }
            if (ch === '`') { stack.push('tpl'); tplStart = i + 1; i++; continue; }
            if (stack.length && ch === '}') { stack.pop(); if (stack[stack.length - 1] === 'tpl') tplStart = i + 1; i++; continue; }
            if (ch === '{' && stack.length) { stack.push('brace'); i++; continue; }
            i++; continue;
        }
        if (ch === '\\') { i += 2; continue; }
        if (ch === '`') { if (tplStart >= 0 && i > tplStart) spans.push([tplStart, i]); stack.pop(); tplStart = -1; i++; continue; }
        if (ch === '$' && next === '{') { if (tplStart >= 0 && i > tplStart) spans.push([tplStart, i]); stack.push('expr'); tplStart = -1; i += 2; continue; }
        i++;
    }
    return spans;
}
function lineIndent(text, at) { const lineStart = text.lastIndexOf('\n', at - 1) + 1; return (text.slice(lineStart).match(/^\s*/) || [''])[0]; }
function airOut(text) {
    const spans = templateSpans(text); const inserts = [];
    for (const [start, end] of spans) {
        const chunk = text.slice(start, end); if (!/</.test(chunk)) continue;
        const indent = lineIndent(text, start) + '    ';
        let lineStart = text.lastIndexOf('\n', start - 1) + 1;
        for (const match of chunk.matchAll(BLOCK_CLOSE)) {
            const at = start + match.index + match[0].length;
            // n'insérer que si la ligne courante est déjà longue et si l'on n'est pas dans une valeur d'attribut
            const before = text.slice(lineStart, at);
            if (before.length < MAX_LINE) continue;
            const quotes = (before.match(/"/g) || []).length; if (quotes % 2 === 1) continue;
            inserts.push({ at, indent }); lineStart = at;
        }
    }
    if (!inserts.length) return text;
    let out = text; inserts.sort((a, b) => b.at - a.at).forEach(ins => { out = out.slice(0, ins.at) + '\n' + ins.indent + out.slice(ins.at); });
    return out;
}
const manifests = fs.readdirSync(sourceDir).filter(f => /^manifest.*\.json$/.test(f));
const files = new Set();
manifests.forEach(mf => JSON.parse(fs.readFileSync(path.join(sourceDir, mf), 'utf8')).parts.forEach(p => { if (p.file.endsWith('.js')) files.add(p.file); }));
let changed = 0, breaks = 0;
for (const file of [...files].sort()) {
    const fullPath = path.join(sourceDir, file); const text = fs.readFileSync(fullPath, 'utf8');
    let out = text; for (let pass = 0; pass < 12; pass++) { const next = airOut(out); if (next === out) break; out = next; } // point fixe : une ligne coupée peut rester longue
    if (out === text) continue;
    changed++; breaks += out.split('\n').length - text.split('\n').length;
    if (!dryRun) fs.writeFileSync(fullPath, out);
}
console.log(`${changed} fichier(s) ${dryRun ? 'à aérer' : 'aéré(s)'}, ${breaks} retour(s) à la ligne insérés dans les gabarits`);
