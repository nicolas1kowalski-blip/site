        // ======================= V13 : « POSEZ VOTRE QUESTION » ET LE PARCOURS EN UNE PHRASE =======================
        function v13Norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
        function v13Names(gr, centerId, dir) { const seen = new Map(); gr.edges.forEach(e => { const other = dir === 'in' ? (e.target === centerId ? e.source : null) : (e.source === centerId ? e.target : null); if (!other || other === 'nosrc' || other === 'nouse') return; const n = gr.nodes.find(x => x.id === other); if (n) seen.set(other, { n, label: e.label || '' }); }); return [...seen.values()]; }
        function v13Clean(t) { return String(t || '').replace(/^[^\wÀ-ÿ]+\s*/, '').replace(/^⊞ /, ''); }
        function v13Sentence(bo, r) {
            if (!bo) return '';
            const gr = r ? buildAttrLineageGraph(bo, r.stId ? getBoFacets(bo).find(x => x.id === r.stId) : null, r.el) : buildBoLineageGraph(bo);
            const cid = r ? 'attr:' + r.el.id : 'bo:' + bo.id; const subj = r ? '« ' + escapeHTML(r.el.name) + ' »' : '« ' + escapeHTML(bo.name) + ' »';
            const ins = v13Names(gr, cid, 'in'), outs = v13Names(gr, cid, 'out');
            const kind = n => /^(?:o\d+_)*(?:as|use):/.test(n.id) ? 'app' : (/attr:|dep:/.test(n.id) ? 'attr' : (/^(?:o\d+_)*bo:/.test(n.id) ? 'bo' : (/tbl:|col:/.test(n.id) ? 'tbl' : 'x')));
            const list = arr => arr.map(x => '<b>' + v13Clean(x.n.title) + '</b>').join(', ');
            const apps = ins.filter(x => kind(x.n) === 'app' && !/génère/.test(x.label)), objs = ins.filter(x => kind(x.n) === 'bo' || kind(x.n) === 'attr'), tbls = ins.filter(x => kind(x.n) === 'tbl');
            let s = subj;
            if (apps.length || tbls.length || objs.length) { const parts = []; if (apps.length) parts.push('de ' + list(apps)); if (tbls.length) parts.push((apps.length ? 'via ' : 'du fichier ') + list(tbls)); s += ' vient ' + parts.join(' ') + (objs.length ? (parts.length ? ' et ' : ' ') + 'reprend ' + list(objs) : ''); } else s += ' n\'a pas encore de source déclarée';
            const rep = outs.filter(x => { const m = /^(?:as|use):(.+)$/.exec(x.n.id); const a = m && assetById(m[1]); return a && a.kind === 'report'; }), users = outs.filter(x => kind(x.n) === 'app' && !rep.includes(x)), down = outs.filter(x => kind(x.n) === 'bo' || kind(x.n) === 'attr');
            if (rep.length || users.length || down.length) { const parts = []; if (rep.length) parts.push('sert à ' + list(rep)); if (users.length) parts.push((rep.length ? 'et à ' : 'sert à ') + list(users)); if (down.length) parts.push('alimente ' + list(down)); s += ' ; ' + (r ? 'elle' : 'il') + ' ' + parts.join(', '); } else s += ' ; personne n\'a encore déclaré s\'en servir';
            const dest = gr.nodes.filter(n => /^rcp:/.test(n.id)).map(n => v13Clean(n.title)); if (dest.length) s += ', diffusé à <b>' + dest.map(escapeHTML).join(', ') + '</b>';
            return s + '.';
        }
        function v13SentenceInject(html) { const box = el('attrLineageBox'); if (!box) return; const old = box.querySelector('.v13-sentence'); if (old) old.remove(); const head = box.firstElementChild; if (head) head.insertAdjacentHTML('afterend', `<div class="v13-sentence" data-ro="keep">${html}</div>`); }
        Studio.extend('openBoLineage', (_v13qBo) => function (boId) { const r = _v13qBo.apply(this, arguments); try { const bo = (state.governance.businessObjects || []).find(x => x.id === boId); if (bo) v13SentenceInject(v13Sentence(bo)); } catch (e) {} return r; });
        Studio.extend('openAttrLineage', (_v13qAttr) => function (boId, stId, elId) { const r = _v13qAttr.apply(this, arguments); try { const bo = (state.governance.businessObjects || []).find(x => x.id === boId); const rr = bo && (boAllAttrRows(bo) || []).find(x => x.el.id === elId); if (rr) v13SentenceInject(v13Sentence(bo, rr)); } catch (e) {} return r; });
        // ---- la question ----
        function v13Entities() {
            const out = []; const g = state.governance;
            (g.businessObjects || []).forEach(bo => { out.push({ kind: 'bo', key: v13Norm(bo.name), name: bo.name, bo }); (boAllAttrRows(bo) || []).forEach(r => out.push({ kind: 'attr', key: v13Norm(r.el.name), key2: v13Norm(r.el.name + ' ' + bo.name), name: bo.name + ' › ' + r.el.name, bo, r })); });
            (g.glossary || []).forEach(t => out.push({ kind: 'term', key: v13Norm(t.term), name: t.term, term: t }));
            (g.assets || []).forEach(a => out.push({ kind: 'asset', key: v13Norm(a.name), name: a.name, asset: a }));
            return out;
        }
        function v13Intent(q) { const n = v13Norm(q); if (/responsable|proprietaire|qui gere|qui valide|owner|a qui/.test(n)) return 'owner'; if (/ou va|qui utilise|qui s en sert|sert a|quel rapport|quelle restitution|consomm|usage/.test(n)) return 'down'; if (/d ou vient|origine|source|provient|qui produit|alimente|vient de/.test(n)) return 'up'; if (/qu est ce|c est quoi|definition|signifie|veut dire|que veut/.test(n)) return 'def'; return 'all'; }
        function v13Find(q) {
            const n = ' ' + v13Norm(q) + ' '; const ents = v13Entities();
            const hits = ents.map(e => { const k = e.key ? ' ' + e.key + ' ' : ''; const k2 = e.key2 ? ' ' + e.key2 + ' ' : ''; let score = 0; if (k && n.includes(k)) score = k.length + (e.kind === 'attr' ? 1 : 0); else { const words = (e.key || '').split(' ').filter(w => w.length > 3); const found = words.filter(w => n.includes(' ' + w + ' ')).length; if (found && found === words.length) score = found * 3; else if (found) score = found; } if (k2 && n.includes(k2.trim())) score += 2; return { e, score }; }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
            return hits;
        }
        function v13Ask(q) {
            const box = el('v13Answer'); if (!box) return; q = (q || (el('v13Q') || {}).value || '').trim(); if (!q) { box.innerHTML = ''; return; }
            const intent = v13Intent(q); const hits = v13Find(q);
            if (!hits.length) { box.innerHTML = `<div class="v13-answer"><h4>Je n'ai rien trouvé qui corresponde à « ${escapeHTML(q)} »</h4><div class="alt">Essayez avec le nom d'un objet, d'une information, d'un mot du glossaire ou d'une application — ou <span onclick="v11PaletteOpen()">cherchez partout (Ctrl K)</span>.</div></div>`; return; }
            const best = hits[0].e; const alts = hits.slice(1, 5).filter(h => h.e.name !== best.name);
            let h = '';
            const owner = best.kind === 'attr' ? ((best.r.el.owner || '').trim() || (best.bo.globalOwner || '').trim()) : (best.kind === 'bo' ? (best.bo.globalOwner || '').trim() : (best.kind === 'asset' ? (best.asset.owner || '').trim() : ''));
            const dom = best.kind === 'term' ? best.term.domain : (best.bo ? best.bo.domain : (best.asset ? best.asset.domain : ''));
            const def = best.kind === 'term' ? best.term.definition : (best.kind === 'attr' ? best.r.el.definition : (best.kind === 'bo' ? best.bo.definition : (best.asset ? best.asset.description : '')));
            const icon = { bo: '🏛️', attr: '🔹', term: '📖', asset: best.asset ? (ASSET_KINDS[best.asset.kind] || ['•'])[0] : '•' }[best.kind];
            h += `<h4>${icon} ${escapeHTML(best.name)}</h4>`;
            if (intent === 'def' || intent === 'all') h += `<div class="def">${def ? escapeHTML(def) : '<i>Pas encore de définition.</i>'}</div>`;
            if (intent === 'owner' || intent === 'all') h += `<div class="kv">Responsable : <b>${owner ? escapeHTML(owner) : 'personne n\'est désigné'}</b>${dom ? ' · domaine <b>' + escapeHTML(dom) + '</b>' : ''}</div>`;
            if ((intent === 'up' || intent === 'down' || intent === 'all') && (best.kind === 'bo' || best.kind === 'attr')) h += `<div class="kv">${v13Sentence(best.bo, best.r)}</div>`;
            if (best.kind === 'term' && intent !== 'def') { const links = (best.term.attrLinks || []).map(l => { const bo = (state.governance.businessObjects || []).find(b => b.id === l.boId); const r = bo && (boAllAttrRows(bo) || []).find(x => x.el.id === l.elId); return r ? escapeHTML(bo.name + ' › ' + r.el.name) : ''; }).filter(Boolean); h += `<div class="kv">Données concernées : ${links.length ? '<b>' + links.join('</b>, <b>') + '</b>' : '<i>aucune information rattachée</i>'}</div>`; }
            const acts = [];
            if (best.kind === 'bo') acts.push(`<button class="v11-btn sm" onclick="v11GoBo('${best.bo.id}')">Ouvrir la fiche</button>`, `<button class="v11-btn sm" onclick="v11GoBo('${best.bo.id}'); setTimeout(()=>{ try { setBoTab('usage'); openBoLineage('${best.bo.id}'); } catch(e){} }, 150)">Voir le parcours</button>`);
            if (best.kind === 'attr') acts.push(`<button class="v11-btn sm" onclick="v11EditAttr('${best.bo.id}','${best.r.stId || ''}','${best.r.el.id}')">Ouvrir la fiche</button>`, `<button class="v11-btn sm" onclick="v11EditAttr('${best.bo.id}','${best.r.stId || ''}','${best.r.el.id}'); setTimeout(()=>{ try { openAttrLineage('${best.bo.id}','${best.r.stId || ''}','${best.r.el.id}'); } catch(e){} }, 200)">Voir le parcours</button>`);
            if (best.kind === 'term') acts.push(`<button class="v11-btn sm" onclick="termTagOpen('${best.term.id}')">Ouvrir le mot</button>`);
            if (best.kind === 'asset') acts.push(`<button class="v11-btn sm" onclick="v11GoAsset('${best.asset.id}')">Ouvrir la fiche</button>`);
            h += `<div class="acts">${acts.join('')}</div>`;
            if (alts.length) h += `<div class="alt" style="margin-top:8px">Vous vouliez peut-être : ${alts.map(a => `<span onclick="el('v13Q').value=${JSON.stringify(a.e.name).replace(/"/g, '&quot;')}; v13Ask()">${escapeHTML(a.e.name)}</span>`).join('')}</div>`;
            box.innerHTML = `<div class="v13-answer">${h}</div>`;
        }
        function v13QuestionHtml() {
            const ex = ['qui est responsable du client ?', 'où va la prime ?', 'd\'où vient l\'adresse ?', 'qu\'est-ce qu\'un sinistre ?'];
            return `<div class="v13-q" data-ro="keep"><div class="row"><span style="font-size:18px">💬</span><input id="v13Q" type="text" placeholder="Posez votre question : qui est responsable de… ? où va… ? d'où vient… ? qu'est-ce que… ?" onkeydown="if(event.key==='Enter') v13Ask()"><button class="v11-btn pri" onclick="v13Ask()">Répondre</button></div><div class="ex">Exemples : ${ex.map(e => `<span onclick="el('v13Q').value=${JSON.stringify(e).replace(/"/g, '&quot;')}; v13Ask()">${escapeHTML(e)}</span>`).join('')}</div><div id="v13Answer"></div></div>`;
        }
        Object.assign(V11_LEXIQUE, { 'posez votre question': 'Une question en français courant sur une donnée : la réponse donne la définition, le responsable et le parcours de la donnée en une phrase.' });
        // V13.2 — la phrase cite aussi les points de départ de la chaîne (V12.10 : remonter jusqu'au début)
        if (typeof v12UpOn === 'function') { Studio.extend('v13Sentence', (_v13qSent) => function (bo, r) { let s = _v13qSent.apply(this, arguments); try { if (!v12UpOn() || !bo) return s; const gr = r ? buildAttrLineageGraph(bo, r.stId ? getBoFacets(bo).find(x => x.id === r.stId) : null, r.el) : buildBoLineageGraph(bo); const firsts = gr.nodes.filter(n => n.first && n.deep).map(n => v13Clean(n.title)); if (firsts.length) s = s.replace(/\.$/, '') + ' — tout au début : <b>' + firsts.slice(0, 4).map(escapeHTML).join(', ') + (firsts.length > 4 ? '…' : '') + '</b>.'; } catch (e) {} return s; }); }
