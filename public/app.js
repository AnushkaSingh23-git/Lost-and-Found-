/* BLUE – Lost and Found, Reinvented · frontend (vanilla JS, talks to the REST API) */
(() => {
  const $app = document.getElementById('app');
  const state = { meta: null, prefill: null, lastResult: null, browse: { tab: 'open', q: '' } };

  // ---------- utilities ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
    return data;
  }

  const icon = cat => state.meta?.categories.find(c => c.name === cat)?.icon || '📦';
  const colourHex = word => {
    if (!word) return null;
    const w = word.toLowerCase();
    const fams = { blue: 'navy royal cobalt sky azure indigo teal cyan aqua denim', grey: 'gray charcoal ash slate silver steel', black: 'jet onyx',
      white: 'ivory transparent clear', red: 'maroon burgundy crimson wine scarlet', green: 'olive mint lime emerald forest', yellow: 'mustard gold golden lemon',
      orange: 'peach coral rust', pink: 'rose magenta blush', purple: 'violet lavender lilac plum', brown: 'tan beige khaki cream camel coffee chocolate' };
    for (const [fam, words] of Object.entries(fams)) {
      if (w.includes(fam) || words.split(' ').some(x => w.includes(x))) return state.meta?.colours.find(c => c.name === fam)?.hex;
    }
    return null;
  };

  function relTime(iso) {
    const d = new Date(iso), now = new Date();
    const mins = Math.round((now - d) / 60000);
    const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    if (sameDay(d, now)) return `today, ${time}`;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    if (sameDay(d, y)) return `yesterday, ${time}`;
    const days = Math.round((now - d) / 864e5);
    if (days < 7) return `${d.toLocaleDateString([], { weekday: 'short' })}, ${time}`;
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + `, ${time}`;
  }
  const toLocalInput = d => {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  function toast(msg, kind = '', ms = 4200) {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = msg;
    document.getElementById('toasts').appendChild(el);
    setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 300); }, ms);
  }

  function modal(html) {
    const m = document.getElementById('modal');
    m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`;
    m.hidden = false;
    const close = () => { m.hidden = true; m.innerHTML = ''; };
    m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) close(); };
    document.addEventListener('keydown', function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } });
    return close;
  }

  function confetti() {
    const colours = ['#1d4ed8', '#3b82f6', '#93c5fd', '#ffffff', '#bfdbfe'];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colours[i % colours.length];
      c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's';
      c.style.animationDelay = Math.random() * .4 + 's';
      c.style.borderRadius = Math.random() > .5 ? '50%' : '2px';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3800);
    }
  }

  function countUp(root) {
    root.querySelectorAll('[data-count]').forEach(el => {
      const target = +el.dataset.count, suffix = el.dataset.suffix || '';
      const t0 = performance.now();
      const step = t => {
        const p = Math.min(1, (t - t0) / 900);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  function itemRow(it, { actions = true } = {}) {
    const hex = colourHex(it.colour || it.name);
    const status = it.status === 'reunited'
      ? `<span class="pill reunited">✓ Reunited</span>`
      : `<span class="pill ${it.type}">${it.type === 'lost' ? 'Lost' : 'Found'}</span>`;
    return `<div class="item-row">
      <div class="item-ico">${icon(it.category)}</div>
      <div>
        <div class="row" style="gap:8px"><h3>${esc(it.name)}</h3>${status}</div>
        <div class="meta">
          ${hex ? `<span><i class="dot" style="background:${hex}"></i> ${esc(it.colour || '')}</span>` : ''}
          ${it.brand ? `<span>🏷️ ${esc(it.brand)}</span>` : ''}
          <span>📍 ${esc(it.location)}</span>
          <span>🕒 ${relTime(it.time)}</span>
          ${it.type === 'found' && it.stored_at ? `<span>📦 At ${esc(it.stored_at)}</span>` : ''}
        </div>
      </div>
      ${actions ? `<div class="item-actions">${it.status === 'open'
        ? `<a class="btn btn-light btn-sm" href="#/matches/${it.id}">View matches →</a>`
        : `<a class="btn btn-light btn-sm" href="#/matches/${it.id}">Details</a>`}</div>` : ''}
    </div>`;
  }

  // ---------- campus hotspot map ----------
  function renderMap(hotspots) {
    const max = Math.max(1, ...hotspots.map(h => h.total));
    const top3 = hotspots.slice().sort((a, b) => b.total - a.total).slice(0, 3).map(h => h.name);
    const roads = `
      <path class="road" d="M2 26 H98" /><path class="road" d="M2 45 H98" />
      <path class="road" d="M30 2 V62" /><path class="road" d="M67 2 V62" />`;
    const lawns = `<ellipse class="lawn" cx="48" cy="27" rx="10" ry="3" /><rect class="lawn" x="88" y="40" width="10" height="20" rx="3" />
      <rect class="lawn" x="2" y="2" width="9" height="20" rx="3" /><ellipse class="lawn" cx="24" cy="45" rx="4" ry="2.5" />`;
    const blds = hotspots.map(h => `
      <rect class="bld" x="${h.x - h.w / 2}" y="${h.y - h.h / 2}" width="${h.w}" height="${h.h}" rx="1.4" />
      <text class="bld-label" x="${h.x}" y="${h.y + h.h / 2 - 1}">${esc(h.short)}</text>`).join('');
    const heat = hotspots.map(h => {
      const t = h.total / max;
      const r = 1.6 + 3.6 * Math.sqrt(t);
      const rank = top3.indexOf(h.name);
      const fill = `rgba(${Math.round(147 - 118 * t)},${Math.round(197 - 119 * t)},${Math.round(253 - 37 * t)},${.55 + .4 * t})`;
      return `<g class="heat" data-loc="${esc(h.name)}" tabindex="0" role="button" aria-label="${esc(h.name)}: ${h.total} reports">
        ${rank >= 0 ? `<circle class="pulse" cx="${h.x}" cy="${h.y - 1.2}" r="${r}" fill="#2563eb" />` : ''}
        <circle cx="${h.x}" cy="${h.y - 1.2}" r="${r}" fill="${fill}" stroke="#fff" stroke-width=".4" />
        ${rank >= 0 ? `<text class="rank-tag" x="${h.x}" y="${h.y - 1.2}">#${rank + 1}</text>` : ''}
      </g>`;
    }).join('');
    return `<div class="map-wrap">
      <svg class="map" viewBox="0 0 100 64" role="img" aria-label="Campus hotspot map">${lawns}${roads}${blds}${heat}</svg>
      <div class="legend">
        <span><i class="sw" style="background:#93c5fd"></i>Fewer reports</span>
        <span><i class="sw" style="background:#1d4ed8"></i>More reports</span>
        <span>#1–#3 = top hotspots · tap a circle for details</span>
      </div>
      <div class="map-info" id="mapInfo">📍 Tap a hotspot to see what goes missing there.</div>
    </div>`;
  }

  function bindMap(root, hotspots) {
    const info = root.querySelector('#mapInfo');
    root.querySelectorAll('.heat').forEach(g => {
      const show = () => {
        const h = hotspots.find(x => x.name === g.dataset.loc);
        info.innerHTML = `<b>${esc(h.name)}</b> — ${h.total} reports (${h.lost} lost, ${h.found} found)` +
          (h.topItem ? ` · most common: ${icon(h.topItem)} <b>${esc(h.topItem)}</b>` : '');
      };
      g.addEventListener('click', show);
      g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    });
  }

  // ---------- views ----------
  async function viewHome() {
    $app.innerHTML = `<div class="skeleton" style="height:260px"></div><div class="grid g4 mt">${'<div class="skeleton" style="height:120px"></div>'.repeat(4)}</div>`;
    const [s, recent] = await Promise.all([api('/api/stats'), api('/api/items?limit=6')]);
    const maxItem = Math.max(1, ...s.topItems.map(i => i.count));
    const maxLoc = Math.max(1, ...s.topLocations.map(i => i.total));
    $app.innerHTML = `<div class="anim">
      <section class="hero">
        <h1>Lost something on campus? Let's bring it home.</h1>
        <p>Describe it in one line — BLUE fills in the report and instantly checks it against everything handed in.</p>
        <form class="quick" id="quickForm">
          <input id="quickText" placeholder="e.g. Lost: Grey hoodie, Library, yesterday at 4 PM" aria-label="Describe your item in one line" autocomplete="off">
          <button class="btn btn-primary" type="submit">Report ⚡</button>
        </form>
        <div class="examples">Try:
          <button type="button" data-ex="Lost: Grey hoodie, Library, yesterday at 4 PM">Grey hoodie, Library</button>
          <button type="button" data-ex="Lost: Navy bottle in the cafeteria this morning">Navy bottle</button>
          <button type="button" data-ex="Found: black Casio calculator at the Engineering Block today 11am">Found a calculator</button>
        </div>
        <div class="hero-ctas">
          <a class="btn btn-white" href="#/lost">🔍 I lost something</a>
          <a class="btn btn-light" href="#/found">🤲 I found something</a>
        </div>
      </section>

      <section class="grid g4 mt">
        <div class="card stat"><div class="ico">📋</div><div class="num" data-count="${s.totals.all}">0</div><div class="lbl">Total reports</div></div>
        <div class="card stat"><div class="ico">🔍</div><div class="num" data-count="${s.totals.openLost}">0</div><div class="lbl">Still searching</div></div>
        <div class="card stat"><div class="ico">📦</div><div class="num" data-count="${s.totals.openFound}">0</div><div class="lbl">Found, awaiting owner</div></div>
        <div class="card stat"><div class="ico">🤝</div><div class="num" data-count="${s.totals.reunited}">0</div><div class="lbl">Reunited · ${s.totals.reunionRate}% of reports</div></div>
      </section>

      <section class="grid g2 mt">
        <div class="card">
          <h2>🏆 Most-lost items</h2>
          <div class="sub">The top 3 things students lose on campus</div>
          <div class="rank">${s.topItems.map((it, i) => `
            <div class="rank-item">
              <div class="rank-badge">${it.icon}<i>${i + 1}</i></div>
              <div><b>${esc(it.name)}</b><div class="bar"><span style="width:${(it.count / maxItem) * 100}%"></span></div></div>
              <div class="rank-count">${it.count}<small>lost</small></div>
            </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <h2>🔥 Top 3 hotspots</h2>
          <div class="sub">Where items are most often lost or found</div>
          <div class="rank">${s.topLocations.map((l, i) => `
            <div class="rank-item">
              <div class="rank-badge">📍<i>${i + 1}</i></div>
              <div><b>${esc(l.name)}</b><div class="muted" style="font-size:12.5px">${l.lost} lost · ${l.found} found${l.topItem ? ` · mostly ${esc(l.topItem.toLowerCase())}s` : ''}</div>
                <div class="bar"><span style="width:${(l.total / maxLoc) * 100}%"></span></div></div>
              <div class="rank-count">${l.total}<small>reports</small></div>
            </div>`).join('')}
          </div>
        </div>
      </section>

      <section class="grid g2 mt">
        <div class="card">
          <h2>🗺️ Campus hotspot map</h2>
          <div class="sub">Bigger, darker circles = more lost & found reports</div>
          ${renderMap(s.hotspots)}
        </div>
        <div class="card">
          <div class="row"><h2>🕒 Latest reports</h2><span class="spacer"></span><a class="btn btn-light btn-sm" href="#/browse">See all</a></div>
          <div class="sub">Fresh lost & found activity across campus</div>
          <div class="items">${recent.map(it => itemRow(it)).join('')}</div>
        </div>
      </section>
    </div>`;
    countUp($app);
    bindMap($app, s.hotspots);

    const qf = $app.querySelector('#quickForm'), qt = $app.querySelector('#quickText');
    $app.querySelectorAll('[data-ex]').forEach(b => b.onclick = () => { qt.value = b.dataset.ex; qt.focus(); });
    qf.onsubmit = async e => {
      e.preventDefault();
      if (!qt.value.trim()) return qt.focus();
      const parsed = await api('/api/parse', { method: 'POST', body: { text: qt.value } });
      state.prefill = parsed;
      location.hash = '#/' + parsed.type;
    };
  }

  function viewReport(type) {
    const meta = state.meta;
    const isLost = type === 'lost';
    const pre = state.prefill && state.prefill.type === type ? state.prefill : null;
    state.prefill = null;
    const quickCats = ['Water Bottle', 'Hoodie', 'Earbuds', 'ID Card', 'Keys', 'Wallet', 'Phone', 'Backpack', 'Charger', 'Calculator', 'Umbrella', 'Glasses'];

    $app.innerHTML = `<div class="anim">
      <div class="page-head">
        <div class="big-ico">${isLost ? '🔍' : '🤲'}</div>
        <div>
          <h1>${isLost ? 'Report a lost item' : 'Report a found item'}</h1>
          <p>${isLost ? "Tell us what you lost — we'll check everything that's been handed in." : 'Thank you! Tell us what you found so we can find its owner.'}</p>
          <span class="timer">⚡ Takes under 30 seconds · <span id="clock">0s</span></span>
        </div>
      </div>
      <form class="card form" id="reportForm" novalidate>
        <div class="field">
          <span class="label">⚡ Quick fill <span class="opt">type one line, we'll fill the form</span></span>
          <div class="quickfill">
            <input id="qf" placeholder="${isLost ? 'Grey hoodie, Library, yesterday at 4 PM' : 'Blue Milton bottle, cafeteria, today 1pm'}" autocomplete="off">
            <button type="button" class="btn btn-primary btn-sm" id="qfBtn">Fill</button>
          </div>
        </div>
        <div class="field">
          <label for="name">What is it?</label>
          <input class="input" id="name" name="name" required placeholder="e.g. Navy water bottle" autocomplete="off">
          <div class="chips" style="margin-top:10px">${quickCats.map(c => `<button type="button" class="chip" data-cat="${esc(c)}">${icon(c)} ${esc(c)}</button>`).join('')}</div>
        </div>
        <div class="field">
          <span class="label">Colour</span>
          <div class="chips" id="colours">${meta.colours.map(c => `<button type="button" class="chip" data-colour="${c.name}"><i class="dot" style="background:${c.hex}"></i>${c.name[0].toUpperCase() + c.name.slice(1)}</button>`).join('')}</div>
          <input class="input" id="colour" name="colour" placeholder="or type a shade, e.g. navy, charcoal" style="margin-top:10px" autocomplete="off">
        </div>
        <div class="field">
          <span class="label">Where? </span>
          <div class="chips" id="locs">${meta.locations.map(l => `<button type="button" class="chip" data-loc="${esc(l.id)}">📍 ${esc(l.short)}</button>`).join('')}</div>
        </div>
        <div class="two">
          <div class="field">
            <label for="time">When? <span class="opt">${isLost ? 'roughly when you lost it' : 'when you found it'}</span></label>
            <input class="input" type="datetime-local" id="time" name="time" required>
            <div class="chips" style="margin-top:10px">
              <button type="button" class="chip" data-when="0">Just now</button>
              <button type="button" class="chip" data-when="1">1 hr ago</button>
              <button type="button" class="chip" data-when="3">3 hrs ago</button>
              <button type="button" class="chip" data-when="y">Yesterday</button>
            </div>
          </div>
          <div class="field">
            <label for="brand">Brand <span class="opt">optional</span></label>
            <input class="input" id="brand" name="brand" list="brands" placeholder="e.g. Nike, Milton, Apple" autocomplete="off">
            <datalist id="brands">${[...new Set(meta.categories.flatMap(c => c.brands))].sort().map(b => `<option value="${esc(b)}">`).join('')}</datalist>
            ${isLost ? '' : `<label for="stored" style="margin-top:14px">Where is it now?</label>
              <select class="input" id="stored" name="stored_at">${meta.storagePoints.map(p => `<option>${esc(p)}</option>`).join('')}</select>`}
          </div>
        </div>
        <div class="field">
          <label for="description">Anything distinctive? <span class="opt">optional — stickers, scratches, keychains</span></label>
          <textarea class="input" id="description" name="description" placeholder="${isLost ? 'e.g. college logo on the chest, drawstring missing' : 'e.g. has a mountain sticker and a dent near the bottom'}"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit" id="submitBtn">${isLost ? '🔍 Report & find matches' : '🤲 Report & find the owner'}</button>
          <span class="err" id="err" role="alert"></span>
        </div>
      </form>
    </div>`;

    const f = $app.querySelector('#reportForm');
    const el = id => f.querySelector('#' + id);
    let loc = '';
    const t0 = Date.now();
    const clockEl = $app.querySelector('#clock');
    const tick = setInterval(() => { if (!document.body.contains(clockEl)) return clearInterval(tick); clockEl.textContent = Math.round((Date.now() - t0) / 1000) + 's'; }, 1000);

    const setLoc = id => { loc = id; f.querySelectorAll('[data-loc]').forEach(b => b.classList.toggle('on', b.dataset.loc === id)); };
    const syncColourChips = () => {
      const v = el('colour').value.toLowerCase();
      const fam = (() => { const hex = colourHex(v); return meta.colours.find(c => c.hex === hex)?.name; })();
      f.querySelectorAll('[data-colour]').forEach(b => b.classList.toggle('on', !!v && b.dataset.colour === fam));
    };
    const setTime = d => { el('time').value = toLocalInput(d); };
    setTime(new Date());

    function fill(p) {
      if (p.name) el('name').value = p.name;
      if (p.colour) el('colour').value = p.colour;
      if (p.brand) el('brand').value = p.brand;
      if (p.location) setLoc(p.location);
      if (p.time) setTime(new Date(p.time));
      if (p.description) el('description').value = p.description;
      syncColourChips();
    }
    if (pre) {
      fill(pre);
      toast('⚡ Form filled from your description — check it and hit report.');
    }

    f.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => {
      const c = b.dataset.cat;
      el('name').value = c === 'ID Card' ? 'ID card' : c[0] + c.slice(1).toLowerCase();
      el('name').focus();
    });
    f.querySelectorAll('[data-colour]').forEach(b => b.onclick = () => {
      el('colour').value = b.classList.contains('on') ? '' : b.dataset.colour[0].toUpperCase() + b.dataset.colour.slice(1);
      syncColourChips();
    });
    el('colour').oninput = syncColourChips;
    f.querySelectorAll('[data-loc]').forEach(b => b.onclick = () => setLoc(b.dataset.loc));
    f.querySelectorAll('[data-when]').forEach(b => b.onclick = () => {
      const w = b.dataset.when, d = new Date();
      if (w === 'y') d.setDate(d.getDate() - 1); else d.setHours(d.getHours() - +w);
      setTime(d);
    });

    const doQuickFill = async () => {
      const text = el('qf').value.trim();
      if (!text) return el('qf').focus();
      const p = await api('/api/parse', { method: 'POST', body: { text } });
      fill(p);
      toast('⚡ Filled in — just check and submit.');
    };
    el('qfBtn').onclick = doQuickFill;
    el('qf').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); doQuickFill(); } };

    f.onsubmit = async e => {
      e.preventDefault();
      const err = $app.querySelector('#err');
      err.textContent = '';
      if (!el('name').value.trim()) { err.textContent = 'Please say what the item is.'; return el('name').focus(); }
      if (!loc) { err.textContent = 'Please tap a location.'; return; }
      const btn = el('submitBtn');
      btn.disabled = true; btn.textContent = 'Matching…';
      try {
        const body = {
          name: el('name').value, colour: el('colour').value, brand: el('brand').value, location: loc,
          time: el('time').value ? new Date(el('time').value).toISOString() : new Date().toISOString(),
          description: el('description').value, stored_at: el('stored')?.value
        };
        const result = await api('/api/' + type, { method: 'POST', body });
        result.seconds = Math.round((Date.now() - t0) / 1000);
        state.lastResult = result;
        location.hash = '#/matches/' + result.item.id;
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false; btn.textContent = 'Try again';
      }
    };
  }

  function matchCard(m, base, i) {
    const it = m.item;
    const c = m.score >= 75 ? '#1d4ed8' : m.score >= 55 ? '#3b82f6' : '#93c5fd';
    const label = m.score >= 75 ? 'Strong match' : m.score >= 55 ? 'Likely match' : 'Possible';
    const parts = [['item', 'Item'], ['colour', 'Colour'], ['location', 'Location'], ['time', 'Time'], ['brand', 'Brand'], ['description', 'Details']];
    const canReunite = base.status === 'open' && it.status === 'open';
    return `<article class="match ${i === 0 && m.score >= 55 ? 'top' : ''}">
      <div><div class="ring" style="--p:${m.score};--c:${c}"><span>${m.score}<small>%</small></span></div><div class="ring-label">${label}</div></div>
      <div>
        <div class="row" style="gap:8px"><span style="font-size:22px">${icon(it.category)}</span><h3 style="font-size:17px">${esc(it.name)}</h3>
          <span class="pill ${it.type}">${it.type === 'found' ? 'Found' : 'Lost'} #${it.id}</span></div>
        <div class="meta" style="margin-top:6px">
          ${it.colour ? `<span><i class="dot" style="background:${colourHex(it.colour) || '#ccc'}"></i> ${esc(it.colour)}</span>` : ''}
          ${it.brand ? `<span>🏷️ ${esc(it.brand)}</span>` : ''}
          <span>📍 ${esc(it.location)}</span><span>🕒 ${relTime(it.time)}</span>
          ${it.stored_at ? `<span>📦 Collect from <b>${esc(it.stored_at)}</b></span>` : ''}
        </div>
        ${it.description ? `<p class="muted" style="margin:8px 0 0;font-size:14px">“${esc(it.description)}”</p>` : ''}
        <div class="breakdown">${parts.map(([k, n]) => `<div>${n} · ${m.breakdown[k]}%<div class="bar"><span style="width:${m.breakdown[k]}%"></span></div></div>`).join('')}</div>
        <div class="reasons">${m.reasons.map(r => `<span>✓ ${esc(r)}</span>`).join('')}</div>
        ${canReunite ? `<div class="row" style="margin-top:14px"><button class="btn btn-good btn-sm" data-reunite="${it.id}">🤝 Mark as Reunited</button>
          <span class="muted" style="font-size:12.5px">${base.type === 'lost' ? "Got it back? Tap once you've collected it." : 'Tap once the owner has collected it.'}</span></div>` : ''}
      </div>
    </article>`;
  }

  async function viewMatches(id) {
    $app.innerHTML = `<div class="skeleton" style="height:120px"></div><div class="skeleton mt" style="height:200px"></div>`;
    const fresh = state.lastResult && state.lastResult.item.id === +id ? state.lastResult : null;
    state.lastResult = null;
    let data;
    try { data = await api(`/api/items/${id}/matches`); }
    catch (e) { $app.innerHTML = `<div class="card empty"><div class="big">🤷</div><p>${esc(e.message)}</p><a class="btn btn-primary" href="#/">Go home</a></div>`; return; }
    const { item, matches } = data;
    let partner = null;
    if (item.status === 'reunited' && item.matched_id) partner = (await api(`/api/items/${item.matched_id}`)).item;
    const best = matches[0];

    $app.innerHTML = `<div class="anim">
      ${fresh ? `<div class="card" style="border-color:var(--blue-200);margin-bottom:16px"><div class="row"><span style="font-size:22px">✅</span>
        <div><b>Report #${item.id} saved${fresh.seconds ? ` in ${fresh.seconds}s` : ''}.</b>
        <div class="muted" style="font-size:13.5px">We'll keep matching it against new ${item.type === 'lost' ? 'found' : 'lost'} reports. Bookmark this page to check back.</div></div></div></div>` : ''}
      ${best && best.score >= 60 && item.status === 'open' ? `<div class="alert-banner" style="margin-bottom:16px"><span class="bell">🔔</span>
        <div><b>Possible match found!</b><div style="opacity:.9;font-size:14px">${esc(best.item.name)} at ${esc(best.item.location)} — ${best.score}% match.</div></div></div>` : ''}
      <div class="card report-summary">
        <div class="item-ico">${icon(item.category)}</div>
        <div>
          <div class="row" style="gap:8px"><span class="pill ${item.status === 'reunited' ? 'reunited' : item.type}">${item.status === 'reunited' ? '✓ Reunited' : (item.type === 'lost' ? 'Your lost report' : 'Your found report')} #${item.id}</span></div>
          <h1 style="font-size:22px;margin-top:6px">${esc(item.name)}</h1>
          <div class="meta">
            ${item.colour ? `<span><i class="dot" style="background:${colourHex(item.colour) || '#ccc'}"></i> ${esc(item.colour)}</span>` : ''}
            ${item.brand ? `<span>🏷️ ${esc(item.brand)}</span>` : ''}
            <span>📍 ${esc(item.location)}</span><span>🕒 ${relTime(item.time)}</span>
            ${item.stored_at ? `<span>📦 ${esc(item.stored_at)}</span>` : ''}
          </div>
          ${item.description ? `<p class="muted" style="margin:6px 0 0;font-size:14px">“${esc(item.description)}”</p>` : ''}
        </div>
      </div>

      ${item.status === 'reunited' ? `
        <div class="card mt empty"><div class="big">🎉</div><h2 style="justify-content:center">Reunited!</h2>
          <p>${partner ? `Matched with ${partner.type} report #${partner.id}: <b>${esc(partner.name)}</b> (${esc(partner.location)}).` : 'This item has been returned to its owner.'}</p>
          <a class="btn btn-primary" href="#/">Back to dashboard</a></div>` : `
        <div class="row mt" style="margin-bottom:12px"><h2 style="font-size:19px">${matches.length ? `🎯 ${matches.length} possible match${matches.length > 1 ? 'es' : ''}` : 'No matches yet'}</h2>
          <span class="spacer"></span>${item.status === 'open' ? `<button class="btn btn-light btn-sm" id="selfReunite">${item.type === 'lost' ? 'I got it back another way' : 'Owner collected it'}</button>` : ''}</div>
        <div class="matches">${matches.length ? matches.map((m, i) => matchCard(m, item, i)).join('') :
          `<div class="card empty"><div class="big">🔎</div><p>Nothing similar has been ${item.type === 'lost' ? 'handed in' : 'reported lost'} yet.<br>Your report is saved — new reports are matched against it automatically.</p></div>`}
        </div>`}
    </div>`;

    if (fresh && fresh.alert) {
      modal(`<div class="big">🔔</div><h2>Possible match found!</h2><p>${esc(fresh.alert.message)}</p>
        <div class="row"><button class="btn btn-primary" data-close>See the match</button></div>`);
      toast(`🔔 <div><b>${fresh.alert.score}% match</b> — ${esc(best.item.name)} at ${esc(best.item.location)}</div>`, '', 6000);
    }

    const reunite = async (matchId) => {
      try {
        await api(`/api/items/${item.id}/reunite`, { method: 'POST', body: matchId ? { matchId } : {} });
        confetti();
        toast('🎉 <div><b>Reunited!</b> Thanks for using BLUE.</div>', 'good');
        viewMatches(item.id);
      } catch (e) { toast('⚠️ ' + esc(e.message)); }
    };
    $app.querySelectorAll('[data-reunite]').forEach(b => b.onclick = () => {
      const m = matches.find(x => x.item.id === +b.dataset.reunite);
      modal(`<div class="big">🤝</div><h2>Mark as reunited?</h2>
        <p>This closes <b>${esc(item.name)}</b> (#${item.id}) and <b>${esc(m.item.name)}</b> (#${m.item.id}).</p>
        <div class="row"><button class="btn btn-light" data-close>Cancel</button><button class="btn btn-good" id="confirmReunite" data-close>Yes, reunited!</button></div>`);
      document.getElementById('confirmReunite').addEventListener('click', () => reunite(m.item.id));
    });
    const self = $app.querySelector('#selfReunite');
    if (self) self.onclick = () => {
      modal(`<div class="big">🤝</div><h2>Close this report?</h2><p>We'll mark <b>${esc(item.name)}</b> as reunited.</p>
        <div class="row"><button class="btn btn-light" data-close>Cancel</button><button class="btn btn-good" id="confirmSelf" data-close>Yes</button></div>`);
      document.getElementById('confirmSelf').addEventListener('click', () => reunite(null));
    };
  }

  async function viewBrowse() {
    const b = state.browse;
    $app.innerHTML = `<div class="anim">
      <div class="page-head"><div class="big-ico">📋</div><div><h1>Browse reports</h1><p>Everything lost and found on campus.</p></div></div>
      <div class="row" style="margin-bottom:16px">
        <div class="tabs" role="tablist">
          ${[['open', 'All open'], ['lost', 'Lost'], ['found', 'Found'], ['reunited', 'Reunited']].map(([k, n]) =>
            `<button role="tab" data-tab="${k}" class="${b.tab === k ? 'active' : ''}">${n}</button>`).join('')}
        </div>
        <label class="search">🔎<input id="q" placeholder="Search bottle, navy, library…" value="${esc(b.q)}"></label>
      </div>
      <div class="items" id="list"><div class="skeleton" style="height:300px"></div></div>
    </div>`;
    const list = $app.querySelector('#list');
    let seq = 0;
    const load = async () => {
      const my = ++seq;
      const params = new URLSearchParams();
      if (b.tab === 'lost' || b.tab === 'found') { params.set('type', b.tab); params.set('status', 'open'); }
      else params.set('status', b.tab);
      if (b.q) params.set('q', b.q);
      const rows = await api('/api/items?' + params);
      if (my !== seq) return;
      list.innerHTML = rows.length
        ? `<div class="muted" style="font-size:13px">${rows.length} report${rows.length > 1 ? 's' : ''}</div>` + rows.map(r => itemRow(r)).join('')
        : `<div class="card empty"><div class="big">🔎</div><p>No reports found.</p></div>`;
    };
    $app.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => {
      b.tab = t.dataset.tab;
      $app.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === t));
      load();
    });
    let deb;
    $app.querySelector('#q').oninput = e => { clearTimeout(deb); deb = setTimeout(() => { b.q = e.target.value.trim(); load(); }, 220); };
    load();
  }

  // ---------- router ----------
  async function route() {
    const h = location.hash.replace(/^#\/?/, '');
    const [page, arg] = h.split('/');
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === (page || 'home')));
    window.scrollTo({ top: 0 });
    try {
      if (!state.meta) state.meta = await api('/api/meta');
      if (page === 'lost' || page === 'found') viewReport(page);
      else if (page === 'matches' && arg) await viewMatches(arg);
      else if (page === 'browse') await viewBrowse();
      else await viewHome();
    } catch (e) {
      $app.innerHTML = `<div class="card empty"><div class="big">⚠️</div><p>Couldn't reach the BLUE server.<br><span class="muted">${esc(e.message)}</span></p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
    }
  }
  window.addEventListener('hashchange', route);
  route();
})();
