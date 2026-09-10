        // ======================= NOYAU : ARCHITECTURE — MODULES ET EXTENSIONS =======================
        // Tout le code est assemblé dans un seul <script> (voir build.mjs). Les fonctions sont globales
        // et les couches (V11, V12, V13…) ENRICHISSENT des fonctions existantes au lieu de les réécrire.
        // Ce module rend ce mécanisme explicite et observable :
        //   • Studio.extend(nom, base => nouvelleFonction, { motif })
        //       remplace la fonction globale « nom » par une version enrichie ; « base » est l'implémentation
        //       précédente (à appeler pour conserver le comportement d'origine). Le registre conserve la
        //       chaîne complète : Studio.extensionsOf('renderGovernance') → [couche V11, couche V12, …].
        //   • Studio.beginModule(fichier)  — posé par le build avant chaque fichier source, pour savoir
        //       quel module déclare quoi et quel module étend quoi.
        //   • Studio.registerModules(liste) — posé par le build en fin de script : fonctions déclarées par
        //       chaque fichier (l'index de l'API, aussi exporté dans API.md).
        //   • Studio.selfCheck() — extensions dont la base n'existait pas, fonctions déclarées deux fois,
        //       extensions non appliquées : ce que l'on regarde avant de livrer.
        // Règle : une couche n'assigne jamais une fonction globale directement (« fn = function … »),
        // elle passe par Studio.extend (voir CONVENTIONS.md ; ESLint interdit no-func-assign).
        const Studio = (() => {
            const globalScope = typeof window !== 'undefined' ? window : globalThis;
            const modules = []; // { file, layer, functions: [nom…], metrics } — renseigné par registerModules
            const extensions = []; // { name, module, layer, motif, applied, base, wrapped }
            let currentModule = '(inconnu)';
            const LAYER_BY_FOLDER = [
                ['90-couche-v11', 'V11'],
                ['92-couche-v12', 'V12'],
                ['94-couche-v13', 'V13'],
                ['96-couche-v14', 'V14']
            ];
            function layerOf(file) {
                const hit = LAYER_BY_FOLDER.find(([folder]) => String(file || '').startsWith(folder));
                return hit ? hit[1] : 'noyau';
            }
            function beginModule(file) {
                currentModule = String(file || '(inconnu)');
            }
            function extend(name, decorate, options) {
                const motif = options && options.motif ? String(options.motif) : '';
                const base = globalScope[name];
                const record = {
                    name: String(name),
                    module: currentModule,
                    layer: layerOf(currentModule),
                    motif,
                    applied: false,
                    base: null,
                    wrapped: null
                };
                extensions.push(record);
                if (typeof base !== 'function') return null; // la base n'existe pas dans cette cible : extension ignorée, visible dans selfCheck()
                if (typeof decorate !== 'function')
                    throw new TypeError(
                        'Studio.extend(' + name + ') : le second argument doit être une fonction base => fonction'
                    );
                const wrapped = decorate(base);
                if (typeof wrapped !== 'function')
                    throw new TypeError('Studio.extend(' + name + ') : la fonction de décoration doit renvoyer une fonction');
                wrapped.__studioBase = base;
                wrapped.__studioName = String(name);
                globalScope[name] = wrapped;
                record.applied = true;
                record.base = base;
                record.wrapped = wrapped;
                return wrapped;
            }
            // Étend plusieurs fonctions avec la même décoration (ex. « rafraîchir après ») — remplace les boucles window[nm] = …
            function extendAll(names, decorate, options) {
                return (names || []).map(name => extend(name, decorate, options));
            }
            function extensionsOf(name) {
                return extensions.filter(x => x.name === name);
            }
            function registerModules(list) {
                (list || []).forEach(m =>
                    modules.push({
                        file: m.file,
                        layer: layerOf(m.file),
                        functions: (m.functions || []).slice(),
                        metrics: m.metrics || null
                    })
                );
            }
            function declarations() {
                const byName = new Map();
                modules.forEach(m =>
                    m.functions.forEach(fn => {
                        if (!byName.has(fn)) byName.set(fn, []);
                        byName.get(fn).push(m.file);
                    })
                );
                return byName;
            }
            function selfCheck() {
                const byName = declarations();
                const duplicates = [];
                byName.forEach((files, fn) => {
                    if (files.length > 1) duplicates.push({ name: fn, files });
                });
                const notApplied = extensions.filter(x => !x.applied).map(x => ({ name: x.name, module: x.module }));
                const unknownBase = extensions
                    .filter(x => x.applied && !byName.has(x.name))
                    .map(x => ({ name: x.name, module: x.module }));
                return {
                    modules: modules.length,
                    functions: byName.size,
                    extensions: extensions.length,
                    applied: extensions.filter(x => x.applied).length,
                    duplicates,
                    notApplied,
                    unknownBase,
                    ok: !duplicates.length && !notApplied.length
                };
            }
            function apiMap() {
                return modules.map(m => ({
                    file: m.file,
                    layer: m.layer,
                    functions: m.functions.map(fn => ({ name: fn, extendedBy: extensionsOf(fn).map(x => x.module) }))
                }));
            }
            return {
                beginModule,
                extend,
                extendAll,
                extensionsOf,
                extensions: () => extensions.slice(),
                modules: () => modules.slice(),
                registerModules,
                selfCheck,
                apiMap,
                layerOf,
                currentModule: () => currentModule
            };
        })();
