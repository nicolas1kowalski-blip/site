        // ==========================================
        //  UI SELECTORS
        // ==========================================
        function populateBrowserTableSelect() { el('browserTableSelect').innerHTML = tableOptionsHtml({ placeholder: 'Table...' }); }
        function populateCompareTables() { const opts = tableOptionsHtml({ placeholder: 'Sélectionner une table...' }); el('compTableA').innerHTML = opts; el('compTableB').innerHTML = opts; }
        function populateExpTableSelect() { const opts = tableOptionsHtml({ placeholder: 'Sélectionnez...' }); el('expBaseTable').innerHTML = opts; el('expConfigTable').innerHTML = opts; }

        // ==========================================
        //  STEP 5: EXPLORATEUR 360
        // ==========================================
        function populateExpColumns() { const t=el('expBaseTable').value; el('expCol').innerHTML='<option value="">Colonne...</option>'+(state.tables[t]?.headers.map(h=>`<option value="${escapeHTML(h)}">${escapeHTML(h)}</option>`).join('')||''); }
        function renderExpConfigCols() {
            const tId = el('expConfigTable').value; const cont = el('expConfigCols');
            if(!tId) { cont.innerHTML = ''; return; }
            if(!state.graphConfig) state.graphConfig = {}; if(!state.graphConfig[tId]) state.graphConfig[tId] = [];
            cont.innerHTML = state.tables[tId].headers.map(h => {
                const checked = state.graphConfig[tId].includes(h) ? 'checked' : '';
                return `<label class="text-xs bg-white border border-slate-200 p-1.5 rounded cursor-pointer hover:bg-indigo-50"><input type="checkbox" onchange="toggleGraphConfigCol('${tId}','${escapeHTML(h.replace(/'/g,"\\'"))}',this.checked)" class="mr-1 text-indigo-600" ${checked}>${escapeHTML(h)}</label>`;
            }).join('');
        }
        function toggleGraphConfigCol(tId, col, isChecked) {
            if(isChecked) state.graphConfig[tId].push(col); else state.graphConfig[tId] = state.graphConfig[tId].filter(c => c !== col);
            persistAppState();
            if (expNetInstance) {
                expNetInstance.getNodes().forEach(node => {
                    const info = expDataStore[node.getModel().id];
                    if (info && info.tableId === tId) {
                        const { title, content } = buildNodeLabel(tId, info.data);
                        expNetInstance.updateItem(node, { title, content });
                    }
                });
            }
        }
        // Renvoie {title, content} : le nœud du moteur SVG dessine le titre en gras et le contenu en
        // dessous (voir studio-rich-node), au lieu du sous-ensemble HTML approximatif utilisé par vis-network.
        function buildNodeLabel(tId, row) {
            const table = state.tables[tId]; const title = table.name.length > 20 ? table.name.substring(0, 17) + '...' : table.name; let content = '';
            const conf = state.graphConfig && state.graphConfig[tId];
            if (conf && conf.length > 0) { content = conf.map(c => `${c}: ${row[c] || ''}`).join(' | '); }
            else { for (const h of table.headers) { if (row[h] && String(row[h]).trim() !== '') { content = String(row[h]).substring(0, 25); break; } } }
            return { title, content };
        }
        function applyGraphFilter() {
            if (!expNetInstance) return;
            const term = el('expGraphFilter').value.toLowerCase();
            expNetInstance.getNodes().forEach(node => {
                const info = expDataStore[node.getModel().id]; if (!info) return; let match = false;
                if (term === '') { match = true; } else { for (const key in info.data) { if (String(info.data[key] || '').toLowerCase().includes(term)) { match = true; break; } } }
                if (match) node.show(); else node.hide();
            });
            expNetInstance.getEdges().forEach(edge => {
                const model = edge.getModel();
                const src = expNetInstance.findById(model.source), tgt = expNetInstance.findById(model.target);
                if (src && tgt && src.isVisible() && tgt.isVisible()) edge.show(); else edge.hide();
            });
        }
        async function fetchRowsByCondition(tableId, colName, targetValue) {
            const table = state.tables[tableId]; const results = []; const targetUpper = String(targetValue).trim().toUpperCase();
            if(!table) return results;
            await processDataStream(table, 0, (row) => {
                const val = row[colName]; 
                if (val !== undefined && val !== null && String(val).trim().toUpperCase() === targetUpper) { results.push(row); }
            });
            return results;
        }
        function addGraphNode(tId, row) {
            const h = tId+'_'+hashCode(JSON.stringify(row));
            if (expNetInstance && !expNetInstance.findById(h)) {
                const { title, content } = buildNodeLabel(tId, row);
                expNetInstance.addItem('node', { id: h, type: 'studio-rich-node', title, content, fill: '#e0e7ff', stroke: '#4f46e5' });
                expDataStore[h]={tableId:tId, data:row};
            } return h;
        }
        function addGraphEdge(fromNodeId, toNodeId, label) {
            const edgeId = `${fromNodeId}-${toNodeId}`; const reverseEdgeId = `${toNodeId}-${fromNodeId}`;
            if (expNetInstance.findById(edgeId) || expNetInstance.findById(reverseEdgeId)) return;
            expNetInstance.addItem('edge', { id: edgeId, source: fromNodeId, target: toNodeId, label });
        }
        async function expandNodeRelationships(nodeId) {
            const nodeInfo = expDataStore[nodeId]; if (!nodeInfo) return;
            const tId = nodeInfo.tableId; const rowData = nodeInfo.data;
            const relevantRelations = state.relations.filter(r => r.sourceCol && r.targetCol && (r.sourceTable === tId || r.targetTable === tId));

            for (const rel of relevantRelations) {
                if (rel.sourceTable === tId) {
                    const targetTableId = rel.targetTable, targetCol = rel.targetCol, joinVal = rowData[rel.sourceCol], edgeLabel = `${rel.sourceCol} = ${rel.targetCol}`;
                    if (joinVal !== undefined && joinVal !== null && String(joinVal).trim() !== '') {
                        const connectedRows = await fetchRowsByCondition(targetTableId, targetCol, joinVal);
                        for (const cRow of connectedRows) { const targetNodeId = addGraphNode(targetTableId, cRow); addGraphEdge(nodeId, targetNodeId, edgeLabel); }
                    }
                }
                if (rel.targetTable === tId) {
                    const targetTableId = rel.sourceTable, targetCol = rel.sourceCol, joinVal = rowData[rel.targetCol], edgeLabel = `${rel.targetCol} = ${rel.sourceCol}`;
                    if (joinVal !== undefined && joinVal !== null && String(joinVal).trim() !== '') {
                        const connectedRows = await fetchRowsByCondition(targetTableId, targetCol, joinVal);
                        for (const cRow of connectedRows) { const targetNodeId = addGraphNode(targetTableId, cRow); addGraphEdge(targetNodeId, nodeId, edgeLabel); }
                    }
                }
            }
        }
        async function startExploration() {
            hideError();
            const tId=el('expBaseTable').value, col=el('expCol').value, val=el('expVal').value;
            if(!tId||!col||!val) return showError("Remplissez tous les champs.");
            el('expLoading').classList.remove('hidden'); el('expWorkspace').classList.remove('hidden');
            if(!expNetInstance) {
                const cont = el('expGraphContainer');
                expNetInstance = createSvgGraph(cont, {
                    type: 'gForce', preventOverlap: true, nodeSize: 180, linkDistance: 150, nodeStrength: 800, edgeStrength: 200,
                    maxIteration: 400, damping: 0.9, workerEnabled: true, animate: false,
                }, {
                    width: cont.clientWidth || 800, height: cont.clientHeight || 600,
                    defaultEdge: {
                        style: { stroke: '#94a3b8', endArrow: { path: '', fill: '#94a3b8' } },
                        labelCfg: { autoRotate: true, style: { fill: '#475569', fontSize: 10, background: { fill: '#fff', padding: [1, 3, 1, 3], radius: 2 } } },
                    },
                });
                pinNodeOnDrag(expNetInstance);
                expNetInstance.data({ nodes: [], edges: [] });
                expNetInstance.render();
                expNetInstance.on('node:click', (e) => {
                    const info = expDataStore[e.item.getModel().id]; if (!info) return;
                    const d = info.data;
                    el('expNodeDetails').innerHTML = Object.keys(d).map(k=>`<div class="p-2.5 border-b border-slate-100 bg-white mb-2 rounded shadow-sm"><span class="text-[10px] text-slate-500 uppercase block">${escapeHTML(k)}</span><span class="text-sm font-medium break-all text-slate-800">${escapeHTML(d[k]) || '(Vide)'}</span></div>`).join('');
                });
                expNetInstance.on('node:dblclick', async (e) => {
                    el('expLoading').classList.remove('hidden');
                    await expandNodeRelationships(e.item.getModel().id);
                    expNetInstance.layout();
                    el('expLoading').classList.add('hidden');
                });
            }
            expNetInstance.changeData({ nodes: [], edges: [] }); expDataStore = {}; el('expGraphFilter').value = '';
            try {
                const rows = await fetchRowsByCondition(tId, col, val);
                if(rows.length) { for(const r of rows) { const rId = addGraphNode(tId, r); await expandNodeRelationships(rId); } } else { showError("Aucun résultat."); }
            } catch(e) { showError("Erreur d'exploration"); }
            finally { el('expLoading').classList.add('hidden'); if (expNetInstance) { expNetInstance.layout(); expNetInstance.fitView(20); } }
        }

