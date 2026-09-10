// Configuration ESLint (format plat, ESLint ≥ 9) des sources de Studio Data.
//   node studio-data/tools/globales-generer.mjs   # régénère eslint.globals.json après ajout d'une globale
//   npx eslint studio-data/src                     # ou : node <eslint>/bin/eslint.js -c studio-data/eslint.config.js studio-data/src
// Les sources sont des fragments d'un unique <script> classique : pas de modules, des fonctions globales,
// et les couches étendent les fonctions via Studio.extend (jamais par assignation directe : no-func-assign).
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const projectGlobals = JSON.parse(fs.readFileSync(path.join(here, 'eslint.globals.json'), 'utf8'));
const browserGlobals = Object.fromEntries(['window', 'document', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage', 'indexedDB', 'console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'fetch', 'Blob', 'File', 'FileReader', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'Worker', 'Image', 'XMLSerializer', 'DOMParser', 'CSS', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'NodeFilter', 'DecompressionStream', 'CompressionStream', 'ReadableStream', 'WritableStream', 'ResizeObserver', 'IntersectionObserver', 'HTMLElement', 'HTMLAnchorElement', 'HTMLInputElement', 'Element', 'Node', 'NodeList', 'SVGElement', 'getComputedStyle', 'alert', 'confirm', 'prompt', 'performance', 'crypto', 'atob', 'btoa', 'structuredClone', 'queueMicrotask', 'AbortController', 'FormData', 'Headers', 'Request', 'Response', 'WebSocket', 'BroadcastChannel', 'matchMedia', 'scrollTo', 'open', 'close', 'print', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'screen', 'globalThis', 'DataTransfer', 'ClipboardItem', 'FontFace', 'OffscreenCanvas', 'ImageData', 'Path2D', 'DOMException', 'Intl', 'Proxy', 'Reflect', 'WeakRef', 'FinalizationRegistry', 'SharedArrayBuffer', 'Atomics', 'BigInt', 'BigInt64Array', 'BigUint64Array'].map(name => [name, 'readonly']));
// Bibliothèques chargées par <script src> dans 00-entete.html et objets posés par l'amorce DuckDB.
const libraryGlobals = { lucide: 'readonly', XLSX: 'readonly', JSZip: 'readonly', Chart: 'readonly', duckdb: 'readonly', arrow: 'readonly', __duckMemLimit: 'writable', __duckTempDir: 'writable', __duckInit: 'writable', __duckReady: 'writable', __opfsOrphans: 'writable', DUCKDB_BUNDLES: 'readonly' };
export default [
    { ignores: ['**/node_modules/**', 'StudioData*.html', 'tests/**', 'tools/**'] },
    {
        files: ['src/**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'script', globals: { ...browserGlobals, ...libraryGlobals, ...projectGlobals } },
        rules: {
            'no-undef': 'error',
            'no-func-assign': 'error',
            'no-redeclare': ['error', { builtinGlobals: false }],
            'no-dupe-keys': 'error',
            'no-dupe-args': 'error',
            'no-unreachable': 'error',
            'no-const-assign': 'error',
            'no-unsafe-negation': 'error',
            'use-isnan': 'error',
            'valid-typeof': 'error',
            'no-self-assign': 'error',
            'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-var': 'warn',
            // prefer-const est volontairement absent : une variable globale « let » est souvent réassignée depuis un AUTRE fichier
            // (un seul <script>), ce que l'analyse par fichier ne voit pas — l'auto-correction casserait l'application.
        },
    },
];
