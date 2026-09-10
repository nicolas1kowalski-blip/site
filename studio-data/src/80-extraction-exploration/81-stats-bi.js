        // ==========================================
        //  STEP 4: STATS BI
        // ==========================================
        function updateVizBaseTableSelect() { const s=el('vizBaseTable'); s.innerHTML = tableOptionsHtml({ placeholder: 'Sélectionnez la table...' }); }
        function handleVizBaseTableChange() { 
            el('vizElementsContainer').classList.remove('hidden'); 
            let opts = ''; Object.values(state.tables).forEach(t => { opts += `<optgroup label="${escapeHTML(t.name)}">${t.headers.map(h=>`<option value="${t.id}|${escapeHTML(h)}">${escapeHTML(h)}</option>`).join('')}</optgroup>`; });
            el('vizDim').innerHTML = opts; el('vizMeasure').innerHTML = opts;
        }
        function toggleVizMeasure() { el('vizMeasure').disabled = (el('vizAgg').value === 'count'); }
        
        async function generateChart() { 
            const dimRaw = el('vizDim').value; if(!dimRaw) return showError("Sélectionnez l'Axe X.");
            hideError();
            const measureRaw = el('vizMeasure').value; const agg = el('vizAgg').value;
            const [dimTId, dimCol] = dimRaw.split('|'); const [, measCol] = agg!=='count' ? measureRaw.split('|') : [null, null];
            
            el('chartDisplayArea').classList.remove('hidden'); 
            
            if(currentChart) currentChart.destroy();
            const ctx = el('myChart').getContext('2d');
            
            const table = state.tables[dimTId];
            if (!table) return showError("Table non chargée.");
            
            const dataMap = new Map();
            await processDataStream(table, 5000, (row) => {
                const xVal = String(row[dimCol] || '(Vide)').trim();
                if (agg === 'count') {
                    dataMap.set(xVal, (dataMap.get(xVal) || 0) + 1);
                } else {
                    const yVal = parseFloat(String(row[measCol] || '0').replace(',', '.'));
                    if (!isNaN(yVal)) {
                        if (!dataMap.has(xVal)) dataMap.set(xVal, []);
                        dataMap.get(xVal).push(yVal);
                    }
                }
            });
            
            const labels = Array.from(dataMap.keys()).slice(0, 15);
            const dataValues = labels.map(label => {
                if (agg === 'count') return dataMap.get(label);
                const vals = dataMap.get(label) || [];
                if (vals.length === 0) return 0;
                const sum = vals.reduce((a, b) => a + b, 0);
                return agg === 'sum' ? sum : sum / vals.length;
            });

            currentChart = new Chart(ctx, { 
                type: el('vizType').value, 
                data: { labels: labels, datasets: [{ label: `${agg} de ${measCol||'Lignes'} par ${dimCol}`, data: dataValues, backgroundColor: ['#4f46e5','#10b981','#f59e0b','#8b5cf6','#ec4899','#0ea5e9','#f43f5e','#10b981','#14b8a6','#f97316'] }] }, 
                options: { responsive: true, maintainAspectRatio: false } 
            });
        }

