        // ======================= V13 : LA FICHE D'UNE INFORMATION EN TROIS QUESTIONS =======================
        // ① C'est quoi ? ② D'où ça vient ? ③ Qui s'en sert ? — le reste sous « En dire plus ». Jauge de
        // complétude avec la prochaine question, définition suggérée, exemples affichés d'office, feux tricolores.
        function v13AttrScore(bo, r) {
            const e2 = r.el; const checks = [
                { ok: !!(e2.definition || '').trim(), q: 'C\'est quoi ?', hint: 'écrire la définition', sec: 1 },
                { ok: typeof boAttrHasMap === 'function' ? boAttrHasMap(r) : ((e2.mappings || []).length > 0), q: 'D\'où ça vient ?', hint: 'indiquer la colonne du fichier ou l\'objet d\'origine', sec: 2 },
                { ok: (e2.usedBy || []).length > 0, q: 'Qui s\'en sert ?', hint: 'cocher au moins une application, un processus ou une restitution', sec: 3 },
                { ok: !!(e2.examples || '').trim(), q: 'Des exemples ?', hint: 'échantillonner des valeurs réelles', sec: 1 },
            ];
            const done = checks.filter(c => c.ok).length; return { score: Math.round(100 * done / checks.length), next: checks.find(c => !c.ok), checks };
        }
        function v13GaugeHtml(sc, label) {
            const cls = sc.score >= 100 ? 'ok' : (sc.score >= 50 ? '' : 'warn');
            return `<div class="v13-gauge ${cls}" data-ro="keep"><span>${label} <b>complète à ${sc.score} %</b></span><span class="bar"><i style="width:${sc.score}%"></i></span>${sc.next ? `<span class="next" onclick="v13GoSec(${sc.next.sec})" title="${escapeHTML(sc.next.hint)}">Prochaine question : ${escapeHTML(sc.next.q)} →</span>` : '<span style="color:#16a34a;font-weight:700">✓ tout y est</span>'}</div>`;
        }
        function v13GoSec(n) { const s = document.querySelector(`.v13-sec[data-n="${n}"]`); if (s) { s.scrollIntoView({ behavior: 'smooth', block: 'start' }); s.classList.add('v13-flash'); setTimeout(() => s.classList.remove('v13-flash'), 1200); const f = s.querySelector('textarea, input[type=text], select'); if (f) setTimeout(() => { try { f.focus(); } catch (e) {} }, 300); } }
        function v13UseDef(boId, stId, elId, txt) { boAttrWrite(boId, stId || '', elId, 'definition', txt); renderGovernance(); v11Toast('Définition reprise. Vous pouvez la retoucher.', 'ok'); }
        Studio.extend('boAttrFormHtml', (_v13fForm) => function (bo, r, names) {
            const h = _v13fForm.apply(this, arguments);
            try {
                const box = document.createElement('div'); box.innerHTML = h;
                const head = box.querySelector('.bo-dhead'); const sects = Array.from(box.querySelectorAll(':scope > .bo-sect'));
                if (!head || sects.length < 3) return h;
                const byTitle = re => sects.filter(s => re.test((s.querySelector('h4') || {}).textContent || ''));
                const what = [...byTitle(/Identité/), ...byTitle(/Sens métier|C'est quoi/)], from = [...byTitle(/Provenance|D'où ça vient/), ...byTitle(/Provient d'un autre objet/)], who = byTitle(/Usages|Qui s'en sert/);
                const used = new Set([...what, ...from, ...who]); const rest = sects.filter(s => !used.has(s));
                // champs avancés de « c'est quoi » → En dire plus
                const adv = [];
                what.forEach(s => s.querySelectorAll('.bo-fld').forEach(f => { const l = (f.querySelector('label') || {}).textContent || ''; if (/Nombre de valeurs|Sensibilité|Confidentialité|Termes du glossaire/.test(l)) adv.push(f); }));
                const sec = (n, title, sub, nodes) => { const d = document.createElement('div'); d.className = 'v13-sec'; d.dataset.n = n; d.innerHTML = `<div class="h"><span class="n">${n}</span><div><b>${title}</b><div class="sub">${sub}</div></div></div><div class="b"></div>`; const b = d.querySelector('.b'); nodes.forEach(x => b.appendChild(x)); return d; };
                const sc = v13AttrScore(bo, r);
                const out = document.createElement('div');
                out.appendChild(head);
                out.insertAdjacentHTML('beforeend', v13GaugeHtml(sc, 'Fiche de « ' + escapeHTML(r.el.name) + ' »'));
                // définition suggérée
                if (!(r.el.definition || '').trim()) { const same = (typeof v13SameDefs === 'function' ? v13SameDefs(r.el.name, bo.id) : [])[0]; const guess = same ? null : (typeof v13GuessDef === 'function' ? v13GuessDef(r.el.name, bo.name) : ''); const txt = same ? same.el.definition : guess; if (txt) { const src = same ? 'déjà écrite pour « ' + escapeHTML(same.bo.name) + ' › ' + escapeHTML(same.el.name) + ' »' : 'devinée d\'après le nom'; const s = document.createElement('div'); s.className = 'v13-sugg'; s.setAttribute('data-ro', 'keep'); s.innerHTML = `<b>Définition proposée</b> (${src}) : « ${escapeHTML(txt)} » <button onclick="v13UseDef('${bo.id}','${r.stId || ''}','${r.el.id}', ${JSON.stringify(txt).replace(/"/g, '&quot;')})">Utiliser</button>`; out.appendChild(s); } }
                out.appendChild(sec(1, 'C\'est quoi ?', 'le nom, la définition en langage courant, des exemples', what));
                out.appendChild(sec(2, 'D\'où ça vient ?', 'la colonne du fichier, l\'application, ou un autre objet', from));
                out.appendChild(sec(3, 'Qui s\'en sert ?', 'applications, processus, restitutions', who));
                if (adv.length || rest.length) { const d = document.createElement('details'); d.className = 'v13-more'; d.innerHTML = '<summary>En dire plus — confidentialité, nombre de valeurs, termes du glossaire, autres réglages</summary>'; if (adv.length) { const g = document.createElement('div'); g.className = 'bo-grid'; adv.forEach(f => g.appendChild(f)); d.appendChild(g); } rest.forEach(s => d.appendChild(s)); out.appendChild(d); }
                return out.innerHTML;
            } catch (e) { console.warn('v13 fiche', e); return h; }
        });
        // ---- exemples affichés d'office dans la fiche en lecture de l'objet ----
        Studio.extend('v11BoRead', (_v13fRead) => function (bo) {
            let h = _v13fRead.apply(this, arguments);
            try { (boAllAttrRows(bo) || []).forEach(r => { const ex = (r.el.examples || '').trim(); if (!ex) return; const key = `<td><b>${escapeHTML(r.el.name)}</b></td>`; const i = h.indexOf(key); if (i < 0) return; h = h.slice(0, i) + `<td><b>${escapeHTML(r.el.name)}</b><div class="v13-ex">ex. ${escapeHTML(ex.length > 60 ? ex.slice(0, 57) + '…' : ex)}</div></td>` + h.slice(i + key.length); }); } catch (e) {}
            return h;
        });
        // ---- feux tricolores sur les objets (liste des objets, accueil) ----
        function v13Light(bo) { const c = boCompleteness(bo); const owner = !!(bo.globalOwner || '').trim(); const cls = !owner ? 'r' : (c.score >= 80 ? 'g' : 'o'); const t = !owner ? 'Sans responsable' : (c.score >= 80 ? 'Documenté (' + c.score + ' %)' : 'Incomplet (' + c.score + ' %)'); return `<span class="v13-light ${cls}" title="${t}"></span>`; }
        Studio.extend('renderGovernance', (_v13fRg) => function () {
            const r = _v13fRg.apply(this, arguments);
            try {
                const c = el('govContent'); if (!c) return r;
                (state.governance.businessObjects || []).forEach(bo => {
                    c.querySelectorAll(`button[onclick^="govState.selectedBoId='${bo.id}'"]`).forEach(b => { const nm = b.querySelector('.font-bold'); if (nm && !nm.querySelector('.v13-light')) nm.insertAdjacentHTML('afterbegin', v13Light(bo)); });
                    c.querySelectorAll(`.v11-row[onclick="v11GoBo('${bo.id}')"] > span:first-child`).forEach(s => { if (!s.querySelector('.v13-light')) s.insertAdjacentHTML('afterbegin', v13Light(bo)); });
                });
            } catch (e) {}
            return r;
        });
