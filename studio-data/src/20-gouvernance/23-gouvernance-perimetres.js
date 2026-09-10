        // ---- Périmètres métier ----
        function renderGovPerimeters() {
            const names = readyTableNames();
            let html = `<div class="flex justify-between items-center mb-4"><p class="text-sm text-slate-500">Regroupez vos tables par domaine métier — les périmètres servent aussi de filtre à l'export.</p>
                <button onclick="addPerimeter()" class="bg-indigo-600 text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Nouveau périmètre</button></div>`;
            if (!state.governance.perimeters.length)
                html += '<p class="text-sm text-slate-400 italic py-8 text-center">Aucun périmètre défini.</p>';
            html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
            state.governance.perimeters.forEach(p => {
                html += `<div class="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                    <div class="flex items-center gap-2 mb-2">
                        <input type="text" value="${escapeHTML(p.name)}" onchange="updatePerimeter('${p.id}','name',this.value)" class="font-bold text-sm border border-slate-300 p-1.5 rounded flex-grow bg-white">
                        <button onclick="removePerimeter('${p.id}')" class="text-red-500 hover:text-red-700 p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                    <input type="text" value="${escapeHTML(p.description || '')}" placeholder="Description du domaine..." onchange="updatePerimeter('${p.id}','description',this.value)" class="w-full border border-slate-200 p-1.5 rounded text-xs mb-3 bg-white">
                    ${boAttachHtml('per', p)}
                    <details ${(p.tables || []).length ? 'open' : ''}><summary class="text-[10px] uppercase font-bold text-slate-400 cursor-pointer mb-1">Tables techniques (${(p.tables || []).length})</summary>
                    <div class="flex flex-wrap gap-1.5 mt-1">${names.map(n => `<label class="text-xs border rounded px-2 py-1 cursor-pointer ${(p.tables || []).includes(n) ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-bold' : 'bg-white border-slate-200 text-slate-500'}"><input type="checkbox" class="hidden" ${(p.tables || []).includes(n) ? 'checked' : ''} onchange="togglePerimeterTable('${p.id}','${escapeHTML(n.replace(/'/g, "\\'"))}',this.checked)">${escapeHTML(n)}</label>`).join('') || '<span class="text-xs text-slate-400 italic">Aucune table chargée</span>'}</div>
                        </details>
                </div>`;
            });
            return html + '</div>';
        }
