// DOM overlay for the 3D view per plan §2.2–3.2. Exposes renderOverlay(root, {W,H,proj,G,G0,METRICS,band,focus,pinned,compact})
export function mark(ink, acc, s = 26) {
  return `<svg width="${s}" height="${s}" viewBox="0 0 46 46"><path d="M6 12 L40 8 L20 40 Z" fill="none" stroke="${ink}" stroke-width="1.6"/><circle cx="6" cy="12" r="4.8" fill="${ink}"/><circle cx="40" cy="8" r="4.8" fill="${ink}"/><circle cx="20" cy="40" r="4.8" fill="${acc}"/></svg>`;
}
const fmt = (m, id) => { const v = m[id]; return id === 'kops' ? (v >= 0 ? '+' : '−') + Math.abs(Math.round(v)) : Math.round(v); };
export function renderOverlay(el, o) {
  const { W, H, proj, G, G0, METRICS, band, focus = 'knee_ext_bdc', pinned = ['saddle_height', 'trunk'] } = o;
  const M = G.M, M0 = G0.M, def = Object.fromEntries(METRICS.map(m => [m[0], m]));
  const d = id => Math.round(M[id] - M0[id]);
  const dTxt = id => { const x = d(id); return x === 0 ? '' : (x > 0 ? '▲ ' : '▼ ') + Math.abs(x) + def[id][3].replace('mm', ' mm'); };
  const h = [];
  // header
  h.push(`<div class="hdr">${mark('var(--ink)', 'var(--accent)')}<b>FLOWFIT</b><span>FIT 03 · ENDURANCE · 30.09.26</span><em class="cmp">COMPARE <i>FIT 02</i> ▾</em></div>`);
  // callouts: focused + pinned
  const callouts = [
    ['knee_ext_bdc', proj.knee, -230, 170, true],
    ['trunk', proj.spine, -60, -190, false],
    ['saddle_height', proj.saddle, 170, -60, false],
  ];
  let svg = '';
  for (const [id, p, dx, dy, hot] of callouts) {
    const x = p[0] + dx, y = p[1] + dy, dir = dx > 0 ? 1 : -1;
    svg += `<polyline class="${hot ? 'hot' : ''}" points="${p[0]},${p[1]} ${x},${y} ${x + dir * 150},${y}"/><circle class="${hot ? 'hot' : ''}" cx="${p[0]}" cy="${p[1]}" r="3.5"/>`;
    const m = def[id];
    h.push(`<div class="call ${hot ? 'hot' : ''}" style="left:${dir > 0 ? x + 4 : x - 150}px;top:${y - 22}px"><i>${m[1]}</i>${m[2]} <b>${fmt(M, id)}</b>${m[3]}</div>`);
  }
  // ruler labels
  h.push(`<div class="rul" style="left:${proj.rulerL[0] - 20}px;top:${proj.rulerL[1]}px">R.AXLE</div><div class="rul" style="left:${proj.rulerB[0] - 12}px;top:${proj.rulerB[1]}px">BB 0</div><div class="rul" style="left:${proj.rulerR[0] - 60}px;top:${proj.rulerR[1]}px">F.AXLE · WB ${Math.round(G.P.front.x - G.P.rear.x)}</div>`);
  // readout
  const f = def[focus], b = f[4], val = M[focus], old = M0[focus];
  const lo = b[0] - (b[1] - b[0]) * 1.5, hi = b[1] + (b[1] - b[0]) * 1.5, pc = x => ((x - lo) / (hi - lo) * 100).toFixed(1) + '%';
  h.push(`<div class="readout"><div class="lbl">${f[1]} · KNEE EXTENSION · BDC</div><div class="big">${Math.round(val)}<sup>°</sup></div>
    <div class="delta">${dTxt(focus)} <span>vs FIT 02 (${Math.round(old)}°)</span></div>
    <div class="gauge"><div class="rng" style="left:${pc(b[0])};width:calc(${pc(b[1])} - ${pc(b[0])})"></div><div class="old" style="left:${pc(old)}"></div><div class="now" style="left:${pc(val)}"></div></div>
    <div class="scale"><span>${Math.round(lo)}</span><span style="left:${pc(b[0])}">${b[0]}</span><span style="left:${pc(b[1])}">${b[1]}</span><span>${Math.round(hi)}</span></div>
    <div class="pins">${pinned.map(id => { const m = def[id]; return `<div class="pin"><div class="lbl">${m[1]} · ${m[2]}</div><div class="med">${fmt(M, id)}<small>${m[3]}</small></div><div class="pd">${dTxt(id) || '—'}</div></div>`; }).join('')}</div></div>`);
  // spec panel
  const row = (k, v, u, dlt = '') => `<div class="row"><span>${k}</span><b>${v}</b><em>${u}</em><i>${dlt}</i></div>`;
  h.push(`<div class="spec"><div class="ph">COMPONENTS</div>
    ${row('Saddle height', Math.round(M.saddle_height), 'mm', '+' + d('saddle_height'))}
    ${row('Setback', Math.round(M.setback), 'mm')}
    ${row('Stem', `${G.C.stem} × ${G.C.stemAng}`, 'mm·°')}
    ${row('Spacers', G.C.spacers, 'mm')}
    ${row('Crank', G.C.crank, 'mm')}
    <div class="ph">FRAME</div>
    ${row('Stack / Reach', `${G.F.stack} / ${G.F.reach}`, 'mm')}
    ${row('Seat / Head', `${G.F.sa} / ${G.F.ha.toFixed(1)}`, '°')}
    <div class="bar"><span>SADDLE → HOOD DROP</span><b>${Math.round(M.drop)} mm</b></div></div>`);
  // metric rail
  h.push(`<div class="rail">${METRICS.map((m, i) => { const st = band(M[m[0]], m[4]); const cls = m[0] === focus ? 'on' : pinned.includes(m[0]) ? 'pin' : '';
    const dd = d(m[0]); return `<div class="chip ${cls}"><i>${m[1]}</i><span>${m[2]}</span><b>${fmt(M, m[0])}${m[3] === '°' ? '°' : ''}</b>${dd ? `<u>${dd > 0 ? '+' : '−'}${Math.abs(dd)}</u>` : ''}${st ? `<s class="${st}"></s>` : ''}<kbd>${i < 9 ? i + 1 : ''}</kbd></div>`; }).join('')}</div>`);
  h.push(`<div class="foot"><span class="in">● IN BAND</span><span class="near">● NEAR</span><span class="out">● OUT</span><span class="k">CLICK = FOCUS · ⇧ CLICK = PIN (3) · 1–9 · ESC</span><span class="cam">VIEW ¾ · FOV 30 · UNITS MM</span></div>`);
  el.innerHTML = `<svg class="ld" width="${W}" height="${H}">${svg}</svg>` + h.join('');
}
