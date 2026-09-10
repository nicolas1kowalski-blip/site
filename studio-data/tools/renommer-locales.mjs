#!/usr/bin/env node
// Renommage SÛR des variables locales à nom court (t, r, d, s, g, e2…) vers un nom explicite, d'après ce qui les
// initialise. S'appuie sur l'analyse de portée d'ESLint (espree + eslint-scope) : une variable n'est renommée que
// dans sa portée exacte, jamais si le nouveau nom est déjà employé dans cette portée ou dans une portée imbriquée,
// jamais si une variable d'une portée englobante prend le même nom et reste référencée à l'intérieur.
// Les paramètres des petites fonctions fléchées (x => x.id === id) sont laissés tels quels : c'est idiomatique.
//   node studio-data/tools/renommer-locales.mjs             -> applique
//   node studio-data/tools/renommer-locales.mjs --dry-run   -> compte seulement, avec le détail par règle
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const eslintModules = process.env.ESLINT_MODULES || '/opt/node22/lib/node_modules/eslint/node_modules';
const espree = require(path.join(eslintModules, 'espree/dist/espree.cjs'));
const eslintScope = require(path.join(eslintModules, 'eslint-scope/dist/eslint-scope.cjs'));
const here = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(here, '..', 'src');
const dryRun = process.argv.includes('--dry-run');

// ---- 1. dictionnaire : initialiseur → nom explicite (l'ordre compte, la première règle qui correspond gagne) ----
const RULES = [
    [/^curUser\(/, 'user'],
    [/boAllAttrRows\([^)]*\)(?: \|\| \[\])?\)?\.find\(/, 'attributeRow'],
    [/\.structure(?: \|\| \[\])?\)?\.find\(/, 'facet'],
    [/^\(?state\.governance\.dictionary(?: \|\| \{\})?\)?\[/, 'dictionaryEntry'],
    [/^(?:svgG|S)\.pos\[/, 'position'],
    [/^new FileReader\(/, 'reader'],
    [/^advCurrentSql\(/, 'query'],
    [/^qualCondSql\(/, 'conditionSql'],
    [/^boAttrMapOf\(/, 'mapping'],
    [/files\[0\]$/, 'file'],
    [/^swFreshness\(/, 'freshness'],
    [/^nameOf\(/, 'name'],
    [/^(?:giNorm|catNorm|srcNorm|cbNorm|v13Norm|advGNorm)\(/, 'normalized'],
    [/^parseFloat\(|^parseInt\(/, 'number'],
    [/^box\(/, 'box'],
    [/^design\.attrs\[/, 'attribute'],
    [/^tsById\(/, 'series'],
    [/^termById\(/, 'term'],
    [/^p\.target \|\| \{\}$/, 'target'],
    [/^state\.zipMappings\[/, 'zipMapping'],
    [/^(?:q|queue)\.shift\(\)$/, 'current'],
    [/^(?:await )?conn\.query\(/, 'queryResult'],
    [/^`\s*(?:SELECT|WITH|CREATE|INSERT|COPY)\b/i, 'sql'],
    [/^\/.*\/[gimsuy]*$/, 'pattern'],
    [/^(?:row|r|rw)\[[A-Za-z_$][A-Za-z0-9_$]*\]$/, 'value'],
    [/^govState\.glossView/, 'view'],
    [/^v12State\.listDraft/, 'draft'],
    [/^govState\.designer/, 'designer'],
    [/^currentProfilingStats$/, 'stats'],
    [/^design && design\.sources\[/, 'source'],
    [/^byId\[e\.source\]/, 'sourceNode'],
    [/^byId\[e\.target\]/, 'targetNode'],
    [/^entry\.status/, 'status'],
    [/^NAV_PHASES\.find\(/, 'phase'],
    [/^c\._anchor$/, 'anchor'],
    [/^\(?bo && \(bo\.structure/, 'facet'],
    [/^(?:tableByName|boMasterTable)\(/, 'table'],
    [/^state\.tables\[/, 'table'],
    [/^assetById\(/, 'asset'],
    [/^state\.governance$/, 'governance'],
    [/^state\.advExtract$/, 'extractSpec'],
    [/^(?:el|document\.getElementById|document\.querySelector)\(/, 'element'],
    [/^document\.createElement\(/, 'element'],
    [/^arrowResultToObjects\(/, 'rows'],
    [/^lfModel\(\)/, 'flowModel'],
    [/^lfNode\(/, 'flowNode'],
    [/^(?:_[A-Za-z0-9_]+|base|orig|o)\.apply\(this, arguments\)/, 'result'],
    [/^(?:await )?(?:_[A-Za-z0-9_]+|base|orig|o)\.apply\(this, arguments\)/, 'result'],
    [/^tdState\.editing/, 'design'],
    [/^dbById\(/, 'dashboard'],
    [/^ensureDictEntry\(/, 'dictionaryEntry'],
    [/^stats\.columns\[/, 'columnStats'],
    [/^String\(/, 'text'],
    [/^Number\(/, 'number'],
    [/^JSON\.parse\(/, 'parsed'],
    [/^(?:await )?idbGet\(/, 'stored'],
    [/glossary(?: \|\| \[\])?\)?\.find\(/, 'term'],
    [/^govPeople\(/, 'people'],
    [/^govProposals\(/, 'proposals'],
    [/^epList\(/, 'presets'],
    [/^qrRules\(/, 'rules'],
    [/^_catFicheCtx$/, 'ficheContext'],
    [/^(?:r|row)\.el$/, 'attribute'],
    [/^v12OrgEl\(/, 'originAttribute'],
    [/^v12OrgFindAttr\(/, 'origin'],
    [/^rcById\(/, 'recipe'],
    [/^advLinkAnchor\(/, 'anchor'],
    [/^boCompleteness\(/, 'completeness'],
    [/^svg\.getBoundingClientRect\(\)/, 'rect'],
    [/^getBoFacets\(/, 'facets'],
    [/^(?:.*\?\s*)?getBoFacets\([^)]*\)\.find\(/, 'facet'],
    [/^Math\.max\(/, 'maximum'],
    [/^Math\.min\(/, 'minimum'],
    [/^new Date\(/, 'date'],
    [/^''$/, 'text'],
    [/^0$/, 'count'],
];

// Singulier explicite d'un nom de collection (tables → table, businessObjects → businessObject…) ; null si inconnu.
const SINGULAR = { tables: 'table', nodes: 'node', edges: 'edge', rows: 'row', assets: 'asset', columns: 'column', cols: 'column', headers: 'header', businessObjects: 'businessObject', bos: 'businessObject', elements: 'attribute', proposals: 'proposal', terms: 'term', entries: 'entry', keys: 'key', values: 'value', parts: 'part', files: 'file', lines: 'line', items: 'item', cells: 'cell', paths: 'path', routes: 'route', relations: 'relation', rels: 'relation', sources: 'source', facets: 'facet', hierarchies: 'hierarchy', rules: 'rule', groups: 'group', ids: 'id', people: 'person', perimeters: 'perimeter', glossary: 'term', snapshots: 'snapshot', dashboards: 'dashboard', recipes: 'recipe', joins: 'join', filters: 'filter', conds: 'condition', aggs: 'aggregate', mappings: 'mapping', origins: 'origin', references: 'reference', anomalies: 'anomaly', alerts: 'alert', tabs: 'tab', steps: 'step', widgets: 'widget', charts: 'chart', matches: 'match', hits: 'hit', candidates: 'candidate', results: 'result', segments: 'segment', tokens: 'token', words: 'word', pairs: 'pair', links: 'link', fields: 'field', options: 'option', opts: 'option', attrs: 'attribute', reach: 'reachableTable', modules: 'module', extensions: 'extension', presets: 'preset', markers: 'marker', points: 'point', boxes: 'box', labels: 'label', names: 'name', tags: 'tag', themes: 'theme', domains: 'domain', apps: 'app', procs: 'process', reports: 'report', usages: 'usage', deltas: 'delta', changes: 'change' };
function singularOf(expression) { const last = (String(expression).match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\|\|\s*\[\]\s*\)?)?\s*$/) || [])[1]; if (!last) return null; if (SINGULAR[last]) return SINGULAR[last]; const m = /^([a-z]+)([A-Z][A-Za-z]*)$/.exec(last); if (m && SINGULAR[m[2].charAt(0).toLowerCase() + m[2].slice(1)]) return m[1] + SINGULAR[m[2].charAt(0).toLowerCase() + m[2].slice(1)].replace(/^./, c => c.toUpperCase()); return null; }
// Noms courts candidats au renommage (jamais les abréviations admises : bo, id, el, sql, csv, i/j/k d'index de boucle).
const SHORT_NAME = /^(?:[a-df-hl-z]|[a-z]{2}|[a-z]\d|[a-z]{2}\d)$/;
const KEEP = new Set(['bo', 'id', 'el', 'fn', 'cb', 'ok', 'db', 'io', 'ms', 'px', 'js', 'ui', 'i', 'j', 'k', 'x', 'y', 'w', 'h', 'e', 'ev']);
// Noms que l'on ne doit jamais produire (globales de l'application ou mots réservés potentiels).
const globalsFile = path.join(here, '..', 'eslint.globals.json');
const APP_GLOBALS = new Set(Object.keys(JSON.parse(fs.readFileSync(globalsFile, 'utf8'))));

// ---- 2. parcours de l'AST avec parents ----
function walk(node, parent, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, parent);
    for (const key of Object.keys(node)) {
        if (key === 'parent' || key === 'loc' || key === 'range') continue;
        const child = node[key];
        if (Array.isArray(child)) child.forEach(c => { if (c && typeof c.type === 'string') walk(c, node, visit); });
        else if (child && typeof child.type === 'string') walk(child, node, visit);
    }
}
function isBindingUse(identifier, parent) {
    // un Identifier qui n'est ni un nom de propriété (a.b), ni une clé d'objet non raccourcie, ni une étiquette
    if (!parent) return true;
    if (parent.type === 'MemberExpression' && parent.property === identifier && !parent.computed) return false;
    if (parent.type === 'Property' && parent.key === identifier && !parent.computed && !parent.shorthand) return false;
    if (parent.type === 'MethodDefinition' && parent.key === identifier) return false;
    if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return false;
    return true;
}
function chooseName(variable, text) {
    const def = variable.defs[0]; if (!def) return null;
    if (def.type === 'Parameter') {
        // paramètre d'une fonction fléchée passée à Studio.extend : c'est la fonction de base
        const fnNode = def.node;
        if (fnNode.type === 'ArrowFunctionExpression' && fnNode.parent && fnNode.parent.type === 'CallExpression' && text.slice(fnNode.parent.callee.range[0], fnNode.parent.callee.range[1]) === 'Studio.extend' && /^_/.test(variable.name)) return 'base';
        return null;
    }
    if (def.type !== 'Variable') return null;
    if (!SHORT_NAME.test(variable.name) || KEEP.has(variable.name)) return null;
    if (variable.name === 'gr') return 'graph'; // convention du lineage : gr = graphe { nodes, edges }
    // for (const t of tables) → table ; for (const [k, v] of …) laissé
    if (!def.node.init) {
        const decl = def.parent; const forOf = decl && decl.parent;
        if (forOf && forOf.type === 'ForOfStatement' && def.node.id && def.node.id.type === 'Identifier') { const iterated = text.slice(forOf.right.range[0], forOf.right.range[1]); return singularOf(iterated); }
        return null;
    }
    const init = text.slice(def.node.init.range[0], def.node.init.range[1]).replace(/\s+/g, ' ');
    // un élément d'une collection nommée : tables.find(…) → table, rows[i] → row, nodes.filter(…)[0] → node
    const fromCollection = /^(?:\(?[A-Za-z0-9_$.()|\[\] ]*?\b([A-Za-z_$][A-Za-z0-9_$]*)(?: \|\| \[\])?\)?)\.find\(/.exec(init) || /^([A-Za-z_$][A-Za-z0-9_$]*)\[[A-Za-z0-9_$+\- ]+\]$/.exec(init);
    if (fromCollection) { const singular = singularOf(fromCollection[1]); if (singular) return singular; }
    // el('adv-col-tbl') → advColTblElement : le nom porte l'identifiant de l'élément
    const byId = /^(?:el|document\.getElementById)\('([A-Za-z0-9_-]{2,40})'\)$/.exec(init);
    if (byId) return camel(byId[1]) + 'Element';
    const created = /^document\.createElement\('([a-z]{1,10})'\)$/.exec(init);
    if (created) return ({ a: 'anchor', div: 'div', span: 'span', tr: 'row', td: 'cell', th: 'headerCell', li: 'item', ul: 'list', p: 'paragraph', img: 'image', input: 'input', button: 'button', label: 'label', select: 'select', option: 'option', canvas: 'canvas', style: 'style', script: 'script', table: 'table', pre: 'pre', textarea: 'textarea', iframe: 'frame', svg: 'svg', g: 'group', path: 'path', text: 'text', rect: 'rect', line: 'line' }[created[1]] || created[1]) + 'Element';
    for (const [pattern, name] of RULES) if (pattern.test(init)) return name;
    return nameFromUsage(variable);
}
// ---- inférence par usage : les propriétés lues sur la variable disent ce qu'elle est ----
const SIGNATURES = [
    [['headers', 'columnsMeta'], 'table'], [['headers', 'sampleData'], 'table'], [['headers', 'status'], 'table'], [['headers', 'type'], 'table'],
    [['el', 'stId'], 'attributeRow'],
    [['sourceTable', 'targetTable'], 'relation'], [['sourceCol', 'targetCol'], 'relation'],
    [['elements', 'structure'], 'businessObject'], [['elements', 'globalOwner'], 'businessObject'], [['elements', 'producedBy'], 'businessObject'], [['globalOwner', 'sources'], 'businessObject'],
    [['kind', 'producedBy'], 'asset'], [['kind', 'deliveredTo'], 'asset'], [['kind', 'tables'], 'asset'], [['kind', 'criticality'], 'asset'], [['kind', 'sources'], 'asset'],
    [['mappings', 'usedBy'], 'attribute'], [['mappings', 'definition'], 'attribute'], [['usedBy', 'definition'], 'attribute'], [['origins', 'name'], 'attribute'],
    [['term', 'definition'], 'term'],
    [['nodes', 'edges'], 'graph'],
    [['source', 'target', 'label'], 'edge'], [['source', 'target', 'rel'], 'edge'], [['source', 'target', 'style'], 'edge'],
    [['title', 'content', 'fill'], 'node'], [['title', 'content'], 'node'],
    [['innerHTML'], 'element'], [['classList'], 'element'], [['textContent'], 'element'], [['querySelector'], 'element'], [['querySelectorAll'], 'element'], [['appendChild'], 'element'], [['insertAdjacentHTML'], 'element'], [['style', 'value'], 'element'], [['checked', 'value'], 'element'], [['scrollIntoView'], 'element'], [['getBoundingClientRect'], 'element'], [['setAttribute'], 'element'],
    [['cx', 'cy'], 'box'], [['clientX', 'clientY'], 'event'], [['preventDefault'], 'event'], [['stopPropagation'], 'event'], [['dataTransfer'], 'event'],
    [['schema', 'numRows'], 'queryResult'], [['getRows'], 'queryResult'], [['toArray', 'schema'], 'queryResult'],
    [['message', 'stack'], 'error'],
    [['alias', 'tableId'], 'column'], [['alias', 'col'], 'column'], [['alias', 'kind'], 'column'],
    [['op', 'col'], 'condition'], [['op', 'val'], 'condition'],
    [['tableId', 'via'], 'need'],
    [['boId', 'elId'], 'origin'],
    [['sql', 'outCols'], 'query'],
    [['status', 'author'], 'proposal'], [['before', 'after', 'kind'], 'proposal'],
    [['id', 'name', 'definition'], 'entity']
];
function nameFromUsage(variable) {
    const props = new Set();
    variable.references.forEach(ref => { const id = ref.identifier; const parent = id.parent; if (parent && parent.type === 'MemberExpression' && parent.object === id && !parent.computed) props.add(parent.property.name); });
    if (!props.size) return null;
    for (const [required, name] of SIGNATURES) if (required.every(p => props.has(p))) return name;
    return null;
}
function camel(id) { const parts = id.split(/[-_]+/).filter(Boolean); return parts.map((p, i) => (i ? p.charAt(0).toUpperCase() + p.slice(1) : p.charAt(0).toLowerCase() + p.slice(1))).join(''); }
function scopeSubtreeHasName(scope, name, text) {
    let found = false;
    walk(scope.block, null, (node, parent) => { if (found) return; if (node.type === 'Identifier' && node.name === name && isBindingUse(node, parent || node.parent)) found = true; });
    return found;
}
function isAncestorScope(candidateAncestor, scope) { for (let s = scope.upper; s; s = s.upper) if (s === candidateAncestor) return true; return false; }

// ---- 3. traitement des fichiers ----
const manifests = fs.readdirSync(sourceDir).filter(f => /^manifest.*\.json$/.test(f));
const files = new Set();
manifests.forEach(mf => JSON.parse(fs.readFileSync(path.join(sourceDir, mf), 'utf8')).parts.forEach(p => { if (p.file.endsWith('.js')) files.add(p.file); }));
const byRule = {}; let totalRenamed = 0, totalSkipped = 0;
for (const file of [...files].sort()) {
    const fullPath = path.join(sourceDir, file); const text = fs.readFileSync(fullPath, 'utf8');
    let ast;
    try { ast = espree.parse(text, { ecmaVersion: 2023, sourceType: 'script', range: true, loc: true }); }
    catch (error) { console.error('✗ ' + file + ' : ' + error.message); continue; }
    walk(ast, null, (node, parent) => { node.parent = parent; });
    const scopeManager = eslintScope.analyze(ast, { ecmaVersion: 2023, sourceType: 'script' });
    const candidates = [];
    for (const scope of scopeManager.scopes) {
        if (scope.type === 'global' || scope.type === 'module') continue;
        for (const variable of scope.variables) {
            if (variable.name === 'arguments' || !variable.defs.length) continue;
            const newName = chooseName(variable, text); if (!newName || newName === variable.name) continue;
            if (APP_GLOBALS.has(newName) && scopeSubtreeHasName(scope, newName, text)) { totalSkipped++; continue; }
            if (scopeSubtreeHasName(scope, newName, text)) { totalSkipped++; continue; }
            // les références doivent toutes être dans la portée (pas de shorthand ambigu ni de référence hors AST)
            const identifiers = [...variable.identifiers, ...variable.references.map(r => r.identifier)];
            if (identifiers.some(idNode => idNode.parent && idNode.parent.type === 'Property' && idNode.parent.shorthand && idNode.parent.value === idNode && idNode.parent.parent && idNode.parent.parent.type !== 'ObjectPattern' && idNode.parent.parent.type !== 'ObjectExpression')) { totalSkipped++; continue; }
            candidates.push({ variable, scope, newName, identifiers });
        }
    }
    // un seul candidat par nom et par portée (deux variables d'une même portée ne peuvent pas prendre le même nom)
    const takenInScope = new Set();
    const unique = candidates.filter(c => { const key = c.scope.block.range[0] + '¦' + c.newName; if (takenInScope.has(key)) { totalSkipped++; return false; } takenInScope.add(key); return true; });
    // conflit entre candidats : un nom pris par une portée englobante et par une portée imbriquée
    const accepted = unique.filter(c => !unique.some(other => other !== c && other.newName === c.newName && other.variable.name !== c.variable.name && isAncestorScope(other.scope, c.scope) && other.variable.references.some(r => r.identifier.range[0] >= c.scope.block.range[0] && r.identifier.range[1] <= c.scope.block.range[1])));
    totalSkipped += unique.length - accepted.length;
    // édition de la fin vers le début
    const edits = [];
    accepted.forEach(c => {
        const seen = new Set();
        c.identifiers.forEach(idNode => {
            if (seen.has(idNode.range[0])) return; seen.add(idNode.range[0]);
            const parent = idNode.parent;
            const shorthand = parent && parent.type === 'Property' && parent.shorthand && parent.value === idNode;
            edits.push({ start: idNode.range[0], end: idNode.range[1], replacement: shorthand ? c.variable.name + ': ' + c.newName : c.newName });
        });
        const rule = c.variable.name + ' → ' + c.newName; byRule[rule] = (byRule[rule] || 0) + 1;
    });
    if (!edits.length) continue;
    edits.sort((a, b) => b.start - a.start);
    let output = text; edits.forEach(e => { output = output.slice(0, e.start) + e.replacement + output.slice(e.end); });
    try { espree.parse(output, { ecmaVersion: 2023, sourceType: 'script' }); }
    catch (error) { console.error('✗ ' + file + ' : résultat non analysable, fichier laissé intact — ' + error.message); totalSkipped += accepted.length; continue; }
    totalRenamed += accepted.length;
    if (dryRun) console.log('[à renommer] ' + file + ' : ' + accepted.length); else { fs.writeFileSync(fullPath, output); console.log('[renommé] ' + file + ' : ' + accepted.length); }
}
console.log(`\n${totalRenamed} variable(s) ${dryRun ? 'renommables' : 'renommée(s)'}, ${totalSkipped} laissée(s) par prudence`);
Object.entries(byRule).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([rule, n]) => console.log('  ' + String(n).padStart(4) + '  ' + rule));
