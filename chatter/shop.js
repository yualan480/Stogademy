/* Orbit Shop: spend Orbits on cosmetics (avatar rings, click trails, themes, companions, collectibles).
   The server owns prices, ownership and the balance (migration-orbit-shop.sql). This file only draws the shop and calls
   buy_shop_item / equip_shop_item, so editing it in the browser can never get an item for free. */

const KINDS = [
  ['featured', 'Featured', 'sparkle'], ['frame', 'Avatar Rings', 'user'], ['font', 'Text Fonts', 'font'], ['trail', 'Orbit Trails', 'compass'], ['cursor', 'Cursors', 'pointer'],
  ['companion', 'Companions', 'sticky'], ['theme', 'Profile Themes', 'type'], ['collectible', 'Collectibles', 'heart'], ['custom', 'Custom Orders', 'plus'],
];
const CUSTOM_PRICE = 5000;
const CUSTOM_LABEL = { font: 'Text Font', frame: 'Avatar Ring', trail: 'Orbit Trail', cursor: 'Cursor', companion: 'Companion', theme: 'Profile Theme', collectible: 'Collectible' };
const L = a => a.map(k => [k, k[0].toUpperCase() + k.slice(1)]);
const STYLES = {   // what a custom order can be based on (the look of an existing shape; you choose the colours)
  font: [['pixel', 'Pixel Quest'], ['type', 'Typewriter'], ['chalk', 'Chalkboard'], ['bubble', 'Bubblegum'], ['comic', 'Comic Pop'], ['marker', 'Marker'], ['west', 'Wild West'], ['script', 'Dream Script'], ['neon', 'Neon Sign'], ['glitch', 'Glitch'], ['spooky', 'Haunted'], ['ice', 'Frostbite'], ['turbo', 'Turbo'], ['retro', 'Retro Wave'], ['matrix', 'Code Rain'], ['fire', 'Inferno'], ['holo', 'Hologram'], ['ghost', 'Whisper'], ['royal', 'Royal Decree'], ['galaxy', 'Galaxy Ink']],
  frame: [['ring', 'Round ring'], ['hex', 'Hexagon'], ['octagon', 'Octagon'], ['diamond', 'Diamond'], ['square', 'Square'], ['petal', 'Petals'], ['burst', 'Sunburst'], ['star', 'Star'], ['thorn', 'Thorns'], ['gear', 'Gear'], ['cloud', 'Cloud'], ['dash', 'Dashed'], ['double', 'Double ring'], ['orbit', 'Orbiting moon'], ['crown', 'Crown']],
  trail: [['ring', 'Ring'], ['bubbles', 'Bubbles'], ['pixels', 'Pixels'], ['sparkle', 'Glitter'], ['hearts', 'Hearts'], ['snow', 'Snowflakes'], ['notes', 'Music notes'], ['petals', 'Petals'], ['stars', 'Stars'], ['confetti', 'Confetti'], ['bolts', 'Lightning'], ['burst', 'Firework'], ['galaxy', 'Spiral galaxy']],
  theme: [['accent', 'Colours only'], ['minimal', 'Minimal'], ['bubble', 'Bubbly'], ['blueprint', 'Blueprint'], ['sketch', 'Doodle'], ['glass', 'Glass'], ['neon', 'Neon'], ['pixel', 'Pixel'], ['terminal', 'Terminal'], ['aurora', 'Aurora']],
  companion: L(['bounce', 'float', 'wiggle', 'pulse', 'sway', 'hover', 'orbit', 'zig', 'flap', 'breathe']),
  collectible: L(['cube', 'coin', 'bottle', 'lantern', 'book', 'ticket', 'medal', 'globe', 'crest', 'card', 'pedestal', 'gem']),
  cursor: L(['arrow', 'pixel', 'heart', 'plane', 'moon', 'leaf', 'flame', 'comet', 'rocket', 'bolt', 'orb', 'wand', 'star', 'gem', 'bubble', 'planet', 'flake', 'cross', 'hole', 'spark', 'paw', 'ghost', 'crown', 'sword', 'cloud']),
};
const TILES = ['circle', 'squircle', 'square', 'hex', 'blob', 'drop', 'saucer', 'dome', 'shield'];
const FONT_STYLES = new Set(STYLES.font.map(x => x[0]));
/* where a name shows up next to an avatar (same places the Orbit Loop name font works) */
const NAME_SEL = ['.msg:has(>{X}) .head>b', '.mrow:has({X}) .t>b', '.row:has({X}) .t>b', '.lbm:has({X}) .t>b', '.pod:has({X}) .pn', '.lbo:has({X}) .lbo-tip b', '.top:has(>{X}) .title', '.ac button:has({X}) span:not(.av)', '.vuser:has({X}) span:not(.av)'];
const KIND_LABEL = { font: 'Text Font', frame: 'Avatar Ring', trail: 'Orbit Trail', theme: 'Profile Theme', cursor: 'Cursor', companion: 'Companion', collectible: 'Collectible' };
const RARITY = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
/* custom cursors are an extra too: if shop-cursors.js is missing the rest of the shop still works */
const TR = await import('./shop-trails.js?v=1').catch(e => (console.warn('Shop click effects unavailable', e), null));
const CUR = await import('./shop-cursors.js?v=3').catch(e => (console.warn('Shop cursors unavailable', e), null));
const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);

export function initShop(c) {
  const { S, sb, $, esc, ic, I, modal, toast, menuBtn } = c;
  Object.assign(I, {
    shop: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    pointer: '<path d="M5 3l14 8-6 2 4 7-3 1.5-4-7-5 4z"/>',
    font: '<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>',
    plus: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  });

  const SH = { items: [], byId: new Map(), mine: new Map(), cos: new Map(), tab: 'featured', loaded: false, loading: null, err: '', busy: '', reqs: [], reqErr: '' };
  const fmt = n => Number(n || 0).toLocaleString();
  const LP = { holder: null, takes: 0, ok: false, err: '', sub: false };   // read-only holder cosmetics; migration-loop-sword-only.sql owns transfer rules
  const SHAPE_OK = /^[a-z]{2,10}$/;
  const art = it => ({ c1: hex(it?.art?.c1, '#2f6bff'), c2: hex(it?.art?.c2, '#37e0ff'), glyph: typeof it?.art?.glyph === 'string' ? it.art.glyph.slice(0, 4) : '', shape: SHAPE_OK.test(it?.art?.shape || '') ? it.art.shape : '', tile: TILES.includes(it?.art?.tile) ? it.art.tile : 'circle' });
  const grad = it => { const a = art(it); return `linear-gradient(135deg, ${a.c1}, ${a.c2})`; };

  async function load(force) {
    if (SH.loading) return SH.loading;
    if (SH.loaded && !force) return;
    SH.loading = (async () => {
      const lp = loadLoop().catch(e => console.warn('Orbit Loop unavailable', e));   // the loop works even if the rest of the shop fails
      const rq = loadReqs();
      const [it, inv, cos] = await Promise.all([
        sb.from('shop_items').select('*').order('sort'),
        sb.from('shop_inventory').select('item_id,equipped').eq('user_id', S.me.id),
        sb.from('shop_inventory').select('user_id,item_id').eq('equipped', true),
      ]);
      await lp; await rq;
      const bad = it.error || inv.error;
      if (bad) { SH.err = /relation|does not exist|schema cache|function/i.test(bad.message || '') ? 'The shop is not set up yet. Run migration-orbit-shop.sql in Supabase.' : (bad.message || 'Could not load the shop.'); SH.loaded = true; return; }
      SH.err = ''; SH.items = it.data || []; SH.byId = new Map(SH.items.map(x => [x.id, x]));
      SH.mine = new Map((inv.data || []).map(r => [r.item_id, !!r.equipped]));
      setCos(cos.data || []); SH.loaded = true; applyOwn();
    })().finally(() => { SH.loading = null; });
    return SH.loading;
  }
  async function loadReqs() {
    const col = await sb.rpc('collect_custom_items');   // the server turns any finished orders into items (works even if you were away)
    const r = await sb.from('shop_requests').select('*').order('created_at', { ascending: false }).limit(150);
    if (r.error) { SH.reqs = []; SH.reqErr = /relation|does not exist|schema cache|function/i.test(r.error.message || '') ? 'Custom orders are not set up yet. Run migration-shop-v2.sql in Supabase.' : (r.error.message || ''); return; }
    SH.reqErr = ''; SH.reqs = r.data || [];
    await Promise.all([...new Set(SH.reqs.map(x => x.user_id))].map(ensureProfile));
    startTicker();
  }
  /* ───────── custom orders generate for 5 minutes on the server; this only draws the countdown and picks the result up ───────── */
  const GEN = ['generating', 'pending'];
  const mine = () => SH.reqs.filter(r => r.user_id === S.me.id && GEN.includes(r.status));
  const readyMs = r => (r.ready_at ? new Date(r.ready_at).getTime() : Date.now());
  const clock = ms => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  async function finishDue() {
    if (SH.collecting || Date.now() - (SH.lastTry || 0) < 5000) return; SH.collecting = true; SH.lastTry = Date.now();   // at most one check per 5 seconds
    try {
      const before = new Set(mine().map(r => r.id)), names = new Map(mine().map(r => [r.id, r.name]));
      await load(true);   // load() asks the server to finish anything that is due, then reloads the shop
      const done = [...before].filter(id => !mine().some(r => r.id === id));
      if (done.length) {
        const ok = done.filter(id => SH.reqs.find(r => r.id === id)?.status === 'approved'), bad = done.length - ok.length;
        if (ok.length) toast(ok.length === 1 ? `${names.get(ok[0])} is ready! Find it in My Items.` : `${ok.length} custom items are ready! Find them in My Items.`);
        if (bad) toast('A custom item was not appropriate, so your Orbits were returned.', true);
        c.loadOrbits(); c.renderSide(); if (S.view === 'shop') c.renderMain();
      }
    } catch (e) { console.warn('Custom items check failed', e); }
    finally { SH.collecting = false; }
  }
  function tick() {
    const live = mine();
    if (!live.length) { clearInterval(SH.tk); SH.tk = null; return; }
    const now = Date.now();
    document.querySelectorAll('[data-ready]').forEach(el => {
      const end = +el.dataset.ready, left = end - now, tot = 300000;
      const t = el.querySelector('.cx-left'); if (t) t.textContent = left > 0 ? clock(left) : 'Almost there…';
      const bar = el.querySelector('.cx-bar i'); if (bar) bar.style.width = Math.min(100, Math.max(0, (1 - left / tot) * 100)) + '%';
    });
    if (live.some(r => readyMs(r) <= now - 1500)) finishDue();   // a moment of slack so the server clock is surely past ready_at
  }
  function startTicker() { if (mine().length && !SH.tk) SH.tk = setInterval(tick, 1000); }
  const isAdmin = () => ['owner', 'admin'].includes(S.sv?.role);
  /* text-font colours: the style comes from CSS, the two colours are set per person here */
  function paintFonts() {
    let st = document.getElementById('shp-fontvars');
    if (!st) { st = document.createElement('style'); st.id = 'shp-fontvars'; document.head.append(st); }
    const out = [];
    const mine = S.me ? equippedOf('font') : null;
    const all = new Map([...SH.cos].filter(([, m]) => m.font).map(([u, m]) => [u, m.font]));
    if (mine && S.me) all.set(S.me.id, mine);
    for (const [uid, it] of all) {
      if (!/^[0-9a-f-]{36}$/i.test(uid)) continue;
      const a = art(it), X = `.av[data-uid="${uid}"]`;
      out.push(`${NAME_SEL.map(t => t.replace(/\{X\}/g, X)).join(',')}{--f1:${a.c1};--f2:${a.c2}}`);
    }
    st.textContent = out.join('\n');
  }
  function setCos(rows) {
    SH.cos = new Map();
    for (const r of rows) { const it = SH.byId.get(r.item_id); if (!it) continue; const m = SH.cos.get(r.user_id) || {}; m[it.kind] = it; SH.cos.set(r.user_id, m); }
  }
  const equippedOf = kind => { for (const [id, on] of SH.mine) if (on && SH.byId.get(id)?.kind === kind) return SH.byId.get(id); return null; };

  /* what the rest of Orbit uses */
  const frameOf = uid => SH.cos.get(uid)?.frame || (uid === S.me?.id ? equippedOf('frame') : null);
  function avAttr(uid) {   // goes inside the avatar's <span class="av">
    const f = frameOf(uid), a = f ? art(f) : null, fo = SH.cos.get(uid)?.font || (uid === S.me?.id ? equippedOf('font') : null), fs = fo ? art(fo).shape : '';
    return ` data-uid="${esc(uid || '')}"${uid && uid === LP.holder ? ' data-loop="1"' : ''}${fs && FONT_STYLES.has(fs) ? ` data-fs="${fs}"` : ''}${f ? ` data-fr="1"${a.shape && a.shape !== 'ring' ? ` data-frs="${a.shape}"` : ''} style="--fr1:${a.c1};--fr2:${a.c2}"` : ''}`;
  }
  const LOOP_EL = '<u class="oloop" aria-hidden="true"><s></s><s></s></u>';
  const avLoop = uid => (uid && uid === LP.holder ? LOOP_EL : '');   // the floating loop, placed at the end of the avatar
  const compOf = uid => SH.cos.get(uid)?.companion || (uid === S.me?.id ? equippedOf('companion') : null);
  function coHtml(uid) {   // the companion next to a name, with its own movement
    const it = compOf(uid); if (!it) return '';
    const a = art(it), mo = a.shape || 'float';
    return ` <span class="shp-co" data-mo="${esc(mo)}" style="--co1:${a.c1};--co2:${a.c2}" aria-hidden="true">${esc(a.glyph)}</span>`;
  }
  const glyphOf = uid => { const it = SH.cos.get(uid)?.companion || (uid === S.me?.id ? equippedOf('companion') : null); return it ? art(it).glyph : ''; };

  /* your own equipped trail and theme change how Orbit looks to you */
  function applyOwn() {
    const root = document.documentElement, tr = equippedOf('trail'), th = equippedOf('theme'), cu = equippedOf('cursor');
    if (CUR) { CUR.saveCursor(cu); CUR.applyCursor(cu); }   // your cursor follows you to every page of the site
    if (tr) { const a = art(tr); root.style.setProperty('--rip1', a.c1); root.style.setProperty('--rip2', a.c2); if (a.shape && a.shape !== 'ring' && TR) { root.dataset.trail = a.shape; window.__orbitTrail = TR.spawnTrail; } else delete root.dataset.trail; } else { root.style.removeProperty('--rip1'); root.style.removeProperty('--rip2'); delete root.dataset.trail; }
    paintFonts();
    if (th) { const a = art(th); root.style.setProperty('--accent', a.c1); root.style.setProperty('--accent2', a.c2); if (a.shape && a.shape !== 'accent') root.dataset.thm = a.shape; else delete root.dataset.thm; } else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent2'); delete root.dataset.thm; }
  }

  /* ───────── drawing ───────── */
  const HOLDERS = ['cube', 'coin', 'bottle', 'lantern', 'book', 'ticket', 'medal', 'globe', 'crest', 'card', 'pedestal'];
  function holderHtml(it) {
    const a = art(it), g = esc(a.glyph || '✦'), h = a.shape, k = `--k1:${a.c1};--k2:${a.c2}`;
    const inner = {
      cube: `<span class="clv-cube">${`<i>${g}</i>`.repeat(6)}</span>`, coin: `<span class="clv-coin">${g}</span>`, bottle: `<span class="clv-bottle"><u></u><u></u><b>${g}</b></span>`,
      lantern: `<span class="clv-lantern">${g}</span>`, book: `<span class="clv-book"><b>${g}</b></span>`, ticket: `<span class="clv-ticket">${g}</span>`,
      medal: `<span class="clv-medal"><b>${g}</b></span>`, globe: `<span class="clv-globe"><u></u><u></u><u></u><b>${g}</b></span>`, crest: `<span class="clv-crest"><b>${g}</b></span>`,
      card: `<span class="clv-card">${g}</span>`, pedestal: `<span class="clv-ped"><s></s><b>${g}</b></span>`,
    }[h];
    return `<span class="clv" data-hold="${h}" style="${k}">${inner}</span>`;
  }
  function preview(it) {
    const a = art(it), shp = a.shape;
    if (it.kind === 'frame') return `<span class="shp-av" data-fr="1"${shp && shp !== 'ring' ? ` data-frs="${shp}"` : ''} style="--fr1:${a.c1};--fr2:${a.c2}"><span class="av" style="background:${esc(S.me.avatar_color)}">${esc((S.me.display_name || '?')[0].toUpperCase())}</span></span>`;
    if (it.kind === 'font') return `<span class="shp-fntbox"><span class="fnt shp-fnt" data-fs="${FONT_STYLES.has(shp) ? shp : 'none'}" style="--f1:${a.c1};--f2:${a.c2}">${esc(S.me.display_name || 'Your name')}</span><small>${esc(STYLES.font.find(x => x[0] === shp)?.[1] || 'Text font')}</small></span>`;
    if (it.kind === 'trail') {
      if (shp && shp !== 'ring' && TR) { TR.startTrailPreviews(); return `<span class="shp-trailv" data-tpv="${shp}" data-c1="${a.c1}" data-c2="${a.c2}"></span>`; }
      return `<span class="shp-trail" style="--t1:${a.c1};--t2:${a.c2}"><i></i><i></i><i></i><i></i></span>`;
    }
    if (it.kind === 'cursor' && CUR) return `<span class="shp-cur" style="cursor:${CUR.cursorCss(it).arrow.replace(/"/g, '&quot;')}" title="Move your mouse here to try it">${CUR.cursorSvg(it, 'arrow', 56)}${CUR.cursorSvg(it, 'pointer', 36)}</span>`;
    if (it.kind === 'theme') return `<span class="thmv" data-ts="${shp || 'accent'}" style="--a1:${a.c1};--a2:${a.c2}"><i></i><i></i><b>Aa Orbit</b></span>`;
    if (it.kind === 'companion') return `<span class="shp-glyph" data-tile="${a.tile}" style="background:${grad(it)};--co1:${a.c1};--co2:${a.c2}"><span class="shp-co" data-mo="${esc(shp || 'float')}">${esc(a.glyph || '✦')}</span></span>`;
    if (it.kind === 'collectible' && HOLDERS.includes(shp)) return holderHtml(it);
    return `<span class="shp-glyph" style="background:${grad(it)}">${esc(a.glyph || '✦')}</span>`;
  }
  function card(it) {
    const owned = SH.mine.has(it.id), on = SH.mine.get(it.id), can = (S.orbits || 0) >= it.price;
    const act = owned
      ? `<button class="shp-btn ${on ? 'ghost' : ''}" data-eq="${esc(it.id)}">${on ? 'Equipped ✓' : (it.kind === 'collectible' ? 'Display' : 'Equip')}</button>`
      : `<button class="shp-btn ${can ? '' : 'poor'}" data-buy="${esc(it.id)}" ${SH.busy ? 'disabled' : ''}>Buy</button>`;
    return `<article class="shp-card r-${esc(it.rarity)}" aria-label="${esc(it.name)}">
      <span class="shp-rar">${esc(RARITY[it.rarity] || it.rarity)}</span><div class="shp-art">${preview(it)}</div>
      <h3>${esc(it.name)}</h3><p>${esc(it.blurb)}</p>
      <div class="shp-price"><img src="logo.svg" width="18" height="18" alt="">${owned ? '<b class="own">Owned</b>' : `<b>${fmt(it.price)}</b> Orbits`}</div>
      <div class="shp-act">${owned ? '' : `<button class="shp-btn ghost" data-pv="${esc(it.id)}">Preview</button>`}${act}</div></article>`;
  }

  function render(main) {
    if (!SH.loaded) { load().then(() => S.view === 'shop' && c.renderMain()); }
    const pending = mine().length;
    const tabs = [...KINDS.map(k => (k[0] === 'custom' && pending ? [k[0], `${k[1]} (${pending})`, k[2]] : k)), ['inventory', 'My Items', 'box']];
    const t = SH.tab, owned = SH.items.filter(i => SH.mine.has(i.id));
    const store = SH.items.filter(i => !i.for_user);   // custom items belong to one person and are never for sale
    let list;
    if (t === 'featured') list = store.filter(i => i.featured);
    else if (t === 'inventory') list = owned;
    else if (t === 'custom') list = [];
    else list = store.filter(i => i.kind === t);
    const hero = store.find(i => i.featured && !SH.mine.has(i.id)) || store.find(i => i.featured);
    const eqRows = ['frame', 'font', 'trail', 'cursor', 'theme', 'companion'].map(k => { const e = equippedOf(k); return `<li><span>${KIND_LABEL[k]}</span><b>${e ? esc(e.name) : 'None'}</b></li>`; }).join('');
    main.innerHTML = `<div class="shpscreen"><div class="top shptop">${menuBtn()}<span class="hashi">${ic('shop', 20)}</span><b class="title">Orbit Shop</b><span class="orbchip shp-bal" title="Your Orbits"><img src="logo.svg" width="16" height="16" alt="">${fmt(S.orbits)}</span></div>
    <div class="shppage">${SH.err ? `<p class="err">${esc(SH.err)}</p>` : ''}
    ${hero && t === 'featured' ? `<section class="shp-hero" style="--h1:${art(hero).c1};--h2:${art(hero).c2}"><div><span class="shp-tag">Featured</span><h1>${esc(hero.name)}</h1><p>${esc(hero.blurb)}</p>
      <button class="shp-btn big" data-${SH.mine.has(hero.id) ? 'eq' : 'pv'}="${esc(hero.id)}">${SH.mine.has(hero.id) ? 'Equip it' : 'Take a look'} →</button></div><div class="shp-hero-art">${preview(hero)}</div></section>` : ''}
    <div class="shp-tabs" role="tablist">${tabs.map(([k, l, i]) => `<button role="tab" aria-selected="${t === k}" class="${t === k ? 'on' : ''}" data-st="${k}">${ic(i, 16)}<span>${l}</span></button>`).join('')}</div>
    <div class="shp-layout"><div>
      <h2 class="shp-h">${t === 'inventory' ? 'My Items' : (KINDS.find(k => k[0] === t)?.[1] || 'Items')}</h2>
      ${t === 'custom' ? customPage() : SH.loaded ? (list.length || CUSTOM_LABEL[t] ? `<div class="shp-grid">${list.map(card).join('')}${CUSTOM_LABEL[t] ? customCard(t) : ''}</div>` : `<p class="muted">${t === 'inventory' ? 'You do not own anything yet. Earn Orbits in games and events, then pick something from the shop.' : t === 'cursor' ? (['owner', 'admin', 'moderator'].includes(S.sv?.role) ? 'No cursors are in the shop yet. Run migration-shop-cursors.sql in the Orbit Supabase SQL Editor, then reload this page.' : 'New cursors are on the way. Check back soon!') : 'Nothing here yet.'}</p>`) : '<div class="sk"></div>'}
    </div><aside class="shp-side"><div class="shp-box"><h3>Your look</h3><ul>${eqRows}</ul></div>
      <div class="shp-box"><h3>Earn Orbits</h3><p class="muted">Play Orbit Games, join events and spend time on Orbit. Buying here never lowers your leaderboard rank.</p>
      <button class="shp-btn" data-go="gamer">Play games</button></div></aside></div></div></div>`;
    main.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { SH.tab = b.dataset.st; c.renderMain(); });
    main.querySelectorAll('[data-cx]').forEach(b => b.onclick = () => customForm(b.dataset.cx));
    main.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => confirmBuy(b.dataset.buy));
    main.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => previewModal(b.dataset.pv));
    main.querySelectorAll('[data-eq]').forEach(b => b.onclick = () => equip(b.dataset.eq));
    main.querySelectorAll('[data-go]').forEach(b => b.onclick = () => c.navTo(b.dataset.go));
  }

  /* ───────── custom orders: type what you want, pay 5,000 Orbits, it is checked and generated for 5 minutes, then added to your items ───────── */
  const fakeItem = (kind, art_, name) => ({ id: 'cx_prev_' + (art_.shape || 'arrow'), kind, name, art: art_ });
  function customCard(kind) {
    return `<article class="shp-card shp-custom" aria-label="Custom ${esc(CUSTOM_LABEL[kind])}"><span class="plus">+</span><h3>Custom ${esc(CUSTOM_LABEL[kind])}</h3><p>Type what you want. ${fmt(CUSTOM_PRICE)} Orbits.</p>
      <div class="shp-price"><img src="logo.svg" width="18" height="18" alt=""><b>${fmt(CUSTOM_PRICE)}</b> Orbits</div><div class="shp-act"><button class="shp-btn" data-cx="${kind}">Design yours</button></div></article>`;
  }
  const stName = r => (r.status === 'approved' ? 'Added to your items' : r.status === 'rejected' ? 'Not made · Orbits returned' : 'Generating');
  function reqRow(r) {
    const a = art({ art: r.art }), gen = GEN.includes(r.status), end = readyMs(r);
    return `<div class="cx-row"><div class="cx-pv">${preview(fakeItem(r.kind, r.art || {}, r.name))}</div><div><h4>${esc(r.name)} <span class="cx-st ${esc(r.status)}">${esc(stName(r))}</span></h4>
      <p>${esc(CUSTOM_LABEL[r.kind] || r.kind)} · ${esc(a.shape || 'default style')}${a.glyph ? ` · ${esc(a.glyph)}` : ''}</p><p>${esc(r.details)}</p>${r.note && r.status === 'rejected' ? `<p><i>${esc(r.note)}</i></p>` : ''}
      ${gen ? `<div class="cx-gen" data-ready="${end}"><div class="cx-bar"><i style="width:${Math.min(100, Math.max(0, (1 - (end - Date.now()) / 300000) * 100))}%"></i></div><small>Ready in <b class="cx-left">${clock(end - Date.now())}</b>. You can leave Orbit, it will be in My Items when it is done.</small></div>` : ''}</div>
      <span class="muted" style="font-size:12px">${new Date(r.created_at).toLocaleDateString()}</span></div>`;
  }
  function customPage() {
    if (SH.reqErr) return `<p class="err">${esc(SH.reqErr)}</p>`;
    const list = SH.reqs.filter(r => r.user_id === S.me.id);
    return `<p class="cx-note">Want something nobody else has? Pick a kind, type what you want and choose the colours. It costs ${fmt(CUSTOM_PRICE)} Orbits. Your idea is checked right away, then it takes <b>5 minutes</b> to generate and is added to <b>My Items</b>. You can leave the site while it generates. Ideas that are not appropriate are refused and you are not charged.</p>
      <div class="shp-grid" style="margin-top:12px">${Object.keys(CUSTOM_LABEL).map(customCard).join('')}</div>
      <h3 class="cx-sub">Your orders</h3><div class="cx-list">${list.map(reqRow).join('') || '<p class="muted">You have not ordered anything yet.</p>'}</div>`;
  }
  function customForm(kind) {
    const opts = STYLES[kind] || [], first = opts[0]?.[0] || 'ring', hasGlyph = kind === 'companion' || kind === 'collectible';
    const body = `<div class="cx-form"><div class="cx-pv" id="cxpv"></div>
      <label>Name<input id="cxn" maxlength="30" placeholder="e.g. Dragon Fire" autocomplete="off"></label>
      <label>${kind === 'font' ? 'What should it look like?' : 'Describe what you want'}<textarea id="cxd" maxlength="300" placeholder="${kind === 'font' ? 'e.g. Spooky green letters that drip, like a haunted house sign' : 'Type your idea here. The more detail, the better.'}"></textarea></label>
      <label>${kind === 'font' ? 'Closest style' : 'Closest shape / style'}<select id="cxs">${opts.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      ${kind === 'companion' ? `<label>Holder shape<select id="cxt">${TILES.map(t => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></label>` : ''}
      ${hasGlyph ? '<label>Emoji (the picture)<input id="cxg" maxlength="4" value="✨" autocomplete="off"></label>' : ''}
      <div class="cx-colors"><label>Colour 1<input id="cxc1" type="color" value="#7a5cff"></label><label>Colour 2<input id="cxc2" type="color" value="#ff4fd8"></label></div>
      <p class="cx-note">${fmt(CUSTOM_PRICE)} Orbits are taken now. You have ${fmt(S.orbits)}. It is checked right away and takes 5 minutes to generate. You can leave the site while you wait.</p></div>`;
    const read = bg => ({ name: bg.querySelector('#cxn').value.trim(), details: bg.querySelector('#cxd').value.trim(),
      art: { shape: bg.querySelector('#cxs').value, c1: bg.querySelector('#cxc1').value, c2: bg.querySelector('#cxc2').value, glyph: bg.querySelector('#cxg')?.value || '', tile: bg.querySelector('#cxt')?.value || 'circle' } });
    modal(`Custom ${CUSTOM_LABEL[kind]}`, body, [{ label: 'Cancel', cls: 'ghost' }, { label: `Pay ${fmt(CUSTOM_PRICE)} Orbits`, fn: async bg => {
      const v = read(bg);
      if (!v.name) { toast('Give it a name first.', true); return false; }
      if (v.details.length < 3) { toast('Describe what you want first.', true); return false; }
      if ((S.orbits || 0) < CUSTOM_PRICE) { toast(`You need ${fmt(CUSTOM_PRICE - (S.orbits || 0))} more Orbits.`, true); return false; }
      const { data, error } = await sb.rpc('submit_custom_item', { p_kind: kind, p_name: v.name, p_details: v.details, p_art: v.art });
      if (error) { toast(error.message || 'Could not send that.', true); return false; }
      c.setOrbits(data); await loadReqs(); SH.tab = 'custom'; toast('Generating! It will be in My Items in 5 minutes.'); c.renderMain();
    } }], bg => {
      const upd = () => { const v = read(bg); bg.querySelector('#cxpv').innerHTML = preview(fakeItem(kind, v.art, v.name)); };
      bg.querySelectorAll('input,select,textarea').forEach(e => { e.addEventListener('input', upd); e.addEventListener('change', upd); }); upd();
    });
  }
  function previewModal(id) {
    const it = SH.byId.get(id); if (!it) return;
    const owned = SH.mine.has(id);
    modal(it.name, `<div class="shp-pv">${preview(it)}</div><p class="muted">${esc(KIND_LABEL[it.kind])} · ${esc(RARITY[it.rarity])}<br>${esc(it.blurb)}</p>`,
      [{ label: 'Close', cls: 'ghost' }, ...(owned ? [] : [{ label: `Buy for ${fmt(it.price)} Orbits`, fn: () => buy(id) }])]);
  }
  function confirmBuy(id) {
    const it = SH.byId.get(id); if (!it) return;
    if ((S.orbits || 0) < it.price) return toast(`You need ${fmt(it.price - (S.orbits || 0))} more Orbits for ${it.name}.`, true);
    modal('Buy ' + it.name + '?', `<div class="shp-pv">${preview(it)}</div><p class="muted">This costs ${fmt(it.price)} Orbits. You have ${fmt(S.orbits)}, so you will have ${fmt(S.orbits - it.price)} left.</p>`,
      [{ label: 'Cancel', cls: 'ghost' }, { label: 'Buy', fn: () => buy(id) }]);
  }
  async function buy(id) {
    const it = SH.byId.get(id); if (!it || SH.busy) return; SH.busy = id;
    const { data, error } = await sb.rpc('buy_shop_item', { p_item: id });
    SH.busy = '';
    if (error) { toast(error.message || 'Could not buy that.', true); await c.loadOrbits(); return c.renderMain(); }
    c.setOrbits(data); SH.mine.set(id, false); toast(`${it.name} is yours!`);
    await equip(id, true); 
  }
  async function equip(id, quiet) {
    const it = SH.byId.get(id); if (!it) return;
    const on = !(SH.mine.get(id) && !quiet);   // tapping an equipped item takes it off
    const { error } = await sb.rpc('equip_shop_item', { p_item: id, p_on: on });
    if (error) { toast(error.message || 'Could not equip that.', true); return c.renderMain(); }
    for (const [k] of SH.mine) if (SH.byId.get(k)?.kind === it.kind) SH.mine.set(k, false);
    SH.mine.set(id, on);
    const m = SH.cos.get(S.me.id) || {}; if (on) m[it.kind] = it; else delete m[it.kind]; SH.cos.set(S.me.id, m);
    applyOwn(); c.renderSide(); c.renderMain();
    if (!quiet) toast(on ? `${it.name} equipped` : `${it.name} removed`);
  }

  /* other people's equipped rings show up on their avatars after a refresh */
  async function refreshCos() { const r = await sb.from('shop_inventory').select('user_id,item_id').eq('equipped', true); if (!r.error) { if (!SH.byId.size) await load(); setCos(r.data || []); paintFonts(); } }


  /* ───────── Orbit Loop ownership: read-only cosmetics, never a shop item ───────── */
  const holderName = () => (LP.holder ? (S.profiles.get(LP.holder)?.display_name || 'Someone') : '');
  async function ensureProfile(uid) {
    if (!uid || S.profiles.has(uid)) return;
    const r = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (r.data) S.profiles.set(uid, r.data);
  }
  function setLoop(row) {
    LP.holder = row?.holder || null; LP.takes = Number(row?.takes || 0);
  }
  async function loadLoop() {
    const r = await sb.from('orbit_loop').select('*').eq('id', 1).maybeSingle();
    if (r.error) { LP.ok = false; LP.err = /relation|does not exist|schema cache|function/i.test(r.error.message || '') ? 'The Orbit Loop is not set up yet. Run migration-orbit-loop.sql in Supabase.' : (r.error.message || 'Could not load the Orbit Loop.'); return; }
    LP.err = ''; LP.ok = !!r.data; setLoop(r.data); await ensureProfile(LP.holder);
    patchLoop(); watchLoop();
    try { if (LP.holder && LP.holder === S.me.id && !sessionStorage.getItem('ol-arrived')) { sessionStorage.setItem('ol-arrived', '1'); setTimeout(() => playArrival(S.me.id), 1400); } } catch {}
  }
  /* everyone sees the loop change hands live */
  function watchLoop() {
    if (LP.sub) return; LP.sub = true;
    sb.channel('orbit-loop').on('postgres_changes', { event: '*', schema: 'public', table: 'orbit_loop' }, async p => {
      const n = p.new; if (!n || n.id !== 1) return;
      if (Number(n.takes) <= LP.takes && n.holder === LP.holder) return;   // that was our own take, already on screen
      const before = LP.holder; setLoop(n); await ensureProfile(LP.holder);
      if (before === S.me.id && LP.holder !== S.me.id) toast(`${holderName()} took the Orbit Loop from you!`, true);
      patchLoop();
      if (LP.holder !== S.me.id) playAlert(holderName());   // everyone online hears about it (the taker gets the big animation instead)
    }).subscribe();
  }
  /* put the loop on (or take it off) every avatar already on screen, without redrawing the page */
  function patchLoop() {
    document.querySelectorAll('.av[data-uid]').forEach(el => {
      const on = !!LP.holder && el.dataset.uid === LP.holder, has = el.hasAttribute('data-loop');
      if (on && !has) { el.setAttribute('data-loop', '1'); el.insertAdjacentHTML('beforeend', LOOP_EL); }
      else if (!on && has) { el.removeAttribute('data-loop'); el.querySelector(':scope > .oloop')?.remove(); }
    });
    document.querySelectorAll('.mention[data-u]').forEach(el => el.classList.toggle('loopm', !!LP.holder && el.dataset.u === LP.holder));   // @mentions of the holder
    syncTrail();
  }
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches && !document.documentElement.classList.contains('force-motion');

  /* ───────── holder extras: arrival banner, change-of-hands alert, cursor ring trail ───────── */
  const isHolder = uid => !!uid && uid === LP.holder;
  function banner(html, cls, ms = 4300) {
    let w = document.querySelector('.olban-wrap');
    if (!w) { w = document.createElement('div'); w.className = 'olban-wrap'; w.setAttribute('role', 'status'); w.setAttribute('aria-live', 'polite'); document.body.append(w); }
    const b = document.createElement('div'); b.className = 'olban ' + cls; b.innerHTML = html; w.append(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => { b.remove(); if (!w.children.length) w.remove(); }, 550); }, ms);
    return b;
  }
  /* a burst of sparkles and shockwave rings centred on a point (skipped when the device asks for reduced motion) */
  function shock(x, y, colors, hue) {
    if (reduced()) return;
    const box = document.createElement('div'); box.className = 'olfx olfx-mini';
    colors.forEach((col, i) => setTimeout(() => { const r = document.createElement('i'); r.className = 'olfx-ring small'; r.style.cssText = `left:${x}px;top:${y}px;--rc:${col}`; box.append(r); }, i * 140));
    document.body.append(box); setTimeout(() => box.remove(), 2200);
    const cv = document.createElement('canvas'), S2 = 640, dpr = Math.min(devicePixelRatio || 1, 2); cv.width = cv.height = S2 * dpr;
    cv.style.cssText = `zoom:${1 / (window.__pz || 1)};position:fixed;left:${x - S2 / 2}px;top:${y - S2 / 2}px;width:${S2}px;height:${S2}px;pointer-events:none;z-index:99996`; document.body.append(cv);
    const g = cv.getContext('2d'); g.scale(dpr, dpr); const P = [];
    for (let i = 0; i < 90; i++) { const a = Math.random() * 6.283, v = 1.5 + Math.random() * 6.5; P.push({ x: S2 / 2, y: S2 / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 45 + Math.random() * 40, max: 85, size: 1.5 + Math.random() * 3.5, hue: hue[0] + Math.random() * (hue[1] - hue[0]) }); }
    let last = performance.now();
    (function f(now) {
      const dt = Math.min(48, now - last) / 16.67; last = now; g.clearRect(0, 0, S2, S2); g.globalCompositeOperation = 'lighter';
      for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; q.life -= dt; if (q.life <= 0) { P.splice(i, 1); continue; } q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 0.08 * dt; const a = Math.min(1, q.life / 40); g.fillStyle = `hsla(${q.hue},100%,68%,${a})`; g.beginPath(); g.arc(q.x, q.y, q.size * (0.4 + a), 0, 6.283); g.fill(); }
      if (P.length) requestAnimationFrame(f); else cv.remove();
    })(last);
  }
  const burstAt = (b, colors, hue) => requestAnimationFrame(() => setTimeout(() => { const r = b.getBoundingClientRect(); shock(r.left + r.width / 2, r.top + r.height / 2, colors, hue); }, 260));
  let lastArrive = 0;
  function playArrival(uid) {
    if (document.hidden || Date.now() - lastArrive < 60000) return; lastArrive = Date.now();
    const b = banner(`<small>The Loop Holder has arrived</small><b class="olname">${esc(S.profiles.get(uid)?.display_name || 'The Loop Holder')}</b>`, 'arrive');
    burstAt(b, ['#ffd166', '#ffe58a', '#ff9bf0'], [30, 62]);
  }
  function playAlert(name) {
    const b = banner(`<small>The Orbit Loop has changed hands!</small><b class="olname">${esc(name)}</b><span>is the new Loop holder</span>`, 'alert', 4800);
    burstAt(b, ['#ff6bd6', '#8f7bff', '#37e0ff'], [270, 330]);
  }
  /* app.js calls this when somebody newly appears in the online list: only a brand-new arrival of the holder counts */
  async function onArrive(uid, current) {
    if (!isHolder(uid) || (current && current.length)) return;
    await ensureProfile(uid); if (isHolder(uid)) playArrival(uid);
  }
  /* only the holder's own cursor leaves the glowing ring trail */
  let trailOn = false, trailLast = 0, trailX = -99, trailY = -99, trailLayer = null;
  function onTrailMove(e) {
    if (e.pointerType === 'touch') return;
    const now = performance.now(); if (now - trailLast < 24) return;
    const dx = e.clientX - trailX, dy = e.clientY - trailY; if (dx * dx + dy * dy < 100) return;
    trailLast = now; trailX = e.clientX; trailY = e.clientY;
    const el = document.createElement('i'); el.className = 'oltrail'; el.style.cssText = `left:${e.clientX / (window.__pz || 1)}px;top:${e.clientY / (window.__pz || 1)}px;--h:${(now / 6) % 360}deg`; trailLayer.append(el);
    setTimeout(() => el.remove(), 800);
    while (trailLayer.childElementCount > 36) trailLayer.firstElementChild.remove();
  }
  function syncTrail() {
    const want = !!S.me && LP.holder === S.me.id && !reduced();
    if (want && !trailOn) { trailLayer = document.createElement('div'); trailLayer.className = 'oltrail-layer'; document.body.append(trailLayer); addEventListener('pointermove', onTrailMove, { passive: true }); trailOn = true; }
    else if (!want && trailOn) { removeEventListener('pointermove', onTrailMove); trailLayer?.remove(); trailOn = false; }
  }

  /* on someone's profile: a bigger title in the loop font and a badge saying they hold it */
  function decorateProfile(bg, uid) {
    const m = SH.cos.get(uid) || (uid === S.me?.id ? { companion: equippedOf('companion'), collectible: equippedOf('collectible'), font: equippedOf('font') } : {});
    const fo = m.font, body0 = bg.querySelector('.modal > div:not(.actions)');
    if (fo && FONT_STYLES.has(art(fo).shape) && !(LP.holder && uid === LP.holder)) { const h = bg.querySelector('h2'), a = art(fo); if (h) { h.classList.add('fnt'); h.dataset.fs = a.shape; h.style.cssText += `;--f1:${a.c1};--f2:${a.c2};font-size:1.45rem`; } }
    if (m.companion) {   // the companion sits exactly beside the name in the profile heading
      const h = bg.querySelector('h2');
      if (h && !h.querySelector('.shp-co')) h.insertAdjacentHTML('beforeend', coHtml(uid).replace('style="', 'style="margin-left:8px;vertical-align:middle;-webkit-text-fill-color:#fff;color:#fff;'));
    }
    if (body0 && m.collectible) {
      body0.insertAdjacentHTML('beforeend', `<div class="shp-shelf">${m.collectible ? `<span style="display:flex;align-items:center;gap:6px">Shows off <b>${esc(m.collectible.name)}</b>${HOLDERS.includes(art(m.collectible).shape) ? holderHtml(m.collectible) : esc(art(m.collectible).glyph)}</span>` : ''}</div>`);
    }
    if (!LP.holder || uid !== LP.holder) return;
    bg.querySelector('h2')?.classList.add('olname');
    const body = bg.querySelector('.modal > div:not(.actions)'); if (!body) return;
    if (body.firstElementChild) body.firstElementChild.style.paddingTop = '16px';
    body.insertAdjacentHTML('beforeend', `<div class="olbadge"><u class="oloop mini" aria-hidden="true"><s></s></u><span>Holds the <b>Orbit Loop</b></span></div>`);
  }

  /* the collectibles this member owns, equipped one first: the Orbit home page floats them (collectible-float.js) */
  const collectibles = () => {
    const out = [];
    for (const [id, on] of SH.mine) { const it = SH.byId.get(id); if (it?.kind !== 'collectible') continue; const a = art(it); out.push({ id, name: it.name, glyph: a.glyph, c1: a.c1, c2: a.c2, on: !!on }); }
    return out.sort((x, y) => Number(y.on) - Number(x.on));
  };
  return { render, load, avAttr, avLoop, glyphOf, coHtml, applyOwn, refreshCos, patchLoop, decorateProfile, isHolder, onArrive, collectibles };
}
