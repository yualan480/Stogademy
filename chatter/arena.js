/* Orbit Leaderboard Game: the "Game" strip on the leaderboard page, the target / gear windows, live notices and their animation.
   The browser only asks. Prices, amounts, cooldowns, weekly limits and every outcome are decided by the functions in migration-orbit-game.sql and migration-orbit-game-v2.sql. */

export function initArena(c) {
  const { S, sb, esc, ic, I, modal, toast, prof, av, needProfiles, setOrbits, loadOrbits, openChan } = c;
  Object.assign(I, { crosshair: '<circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>' });
  const A = { st: null, err: '', busy: false, ch: null, t: 0, loading: false, at: 0 };
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => RM.matches && !document.documentElement.classList.contains('force-motion');
  const fmt = n => Number(n || 0).toLocaleString();
  const RAR = { uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary' };
  const ago = d => { const s = Math.max(0, (Date.now() - new Date(d)) / 1000); return s < 3600 ? Math.max(1, Math.round(s / 60)) + 'm' : s < 172800 ? Math.round(s / 3600) + 'h' : Math.round(s / 86400) + 'd'; };
  const left = d => { const s = Math.max(0, (new Date(d) - Date.now()) / 1000); return s < 3600 ? Math.ceil(s / 60) + 'm' : Math.round(s / 3600) + 'h'; };
  const item = id => A.st?.catalog?.find(i => i.id === id);
  const qty = id => item(id)?.qty || 0;
  const say = e => /function|relation|schema cache|does not exist/i.test(e?.message || '') ? 'The game isn\'t set up yet. Run migration-orbit-game.sql, then migration-orbit-game-v2.sql, in Supabase.' : (e?.message || 'Something went wrong.');

  /* ───────── data ───────── */
  async function load() {
    if (A.loading) return; A.loading = true;
    const { data, error } = await sb.rpc('game_state');
    A.loading = false; A.at = Date.now();
    if (error) { A.err = say(error); A.st = null; } else { A.err = ''; A.st = data; }
    if (A.st?.loop?.holder) { try { await needProfiles([A.st.loop.holder]); } catch {} }
    paint();
  }
  const soon = () => { clearTimeout(A.t); A.t = setTimeout(load, 400); };
  async function act(fn, args) {
    if (A.busy) return null; A.busy = true;
    try {
      const { data, error } = await sb.rpc(fn, args);
      if (error) { toast(say(error), true); return null; }
      if (data?.balance != null) setOrbits?.(data.balance); else loadOrbits?.();
      return data || {};
    } finally { A.busy = false; load(); }
  }

  /* ───────── live notices (both sides are told; neither sees the other's items) ───────── */
  function start() {
    if (A.ch) return;
    A.ch = sb.channel('arena')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_log' }, p => {
        const r = p.new, me = S.me?.id; if (!r || r.target !== me || r.actor === me || r.kind !== 'challenge') return;
        const who = prof(r.actor)?.display_name || 'Someone';
        toast(r.outcome === 'blocked' ? `${who} challenged you for the Orbit Loop. Your Shield held.` : `${who} took the Orbit Loop from you!`, r.outcome === 'transferred'); loadOrbits?.(); soon();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_alerts', filter: 'user_id=eq.' + S.me?.id }, p => {   // thefts are anonymous: you learn what happened, never who
        const r = p.new; if (!r) return;
        toast(r.outcome === 'stolen' ? `Someone stole ${fmt(r.amount)} Orbits from you.` : r.outcome === 'reflected' ? 'Someone tried to steal from you. Your Mirror Amulet reflected it.' : 'Someone tried to steal from you and got nothing.', r.outcome === 'stolen'); loadOrbits?.(); soon();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orbit_loop' }, soon)
      .subscribe();
  }
  const stop = () => { clearTimeout(A.t); A.at = 0; if (A.ch) { sb.removeChannel(A.ch); A.ch = null; } A.st = null; A.err = ''; };

  /* ───────── the Game strip ───────── */
  const GLYPH = (i, big) => `<span class="ar-orb${big ? ' big' : ''}" style="--c1:${esc(i.c1)};--c2:${esc(i.c2)}">${esc(i.glyph)}</span>`;
  function panelHtml() {
    if (A.err) return `<section class="arena" id="arena"><p class="err">${esc(A.err)}</p></section>`;
    const s = A.st; if (!s) return '<section class="arena" id="arena"><div class="ar-sk"></div></section>';
    const L = s.loop || {}, holder = L.holder ? prof(L.holder) : null, mine = L.holder === S.me.id;
    const loop = `<div class="ar-loop"><span class="ar-hav">${holder ? av(holder) : '<span class="ar-none">?</span>'}</span>
      <div><small>Orbit Loop · one of one</small><b class="olname">${holder ? esc(holder.display_name) : 'Nobody yet'}${mine ? ' <em>(you)</em>' : ''}</b>
      <small>${holder ? `held for ${ago(L.since)} · ${L.takes} transfer${L.takes === 1 ? '' : 's'}` : 'No current holder'}</small></div>
      <button class="ar-link" data-ar="hist" type="button">History</button></div>`;
    const bal = `<div class="ar-bal"><span><small>Unlocked</small><b>${fmt(s.balance - s.locked)}</b></span><span class="${s.locked ? 'lk' : ''}"><small>${s.locked ? 'Locked · ' + left(s.vault?.ends_at) : 'Locked'}</small><b>${fmt(s.locked)}</b></span></div>`;
    const chips = `<div class="ar-chips">${s.catalog.map(i => `<span class="ar-chip${i.qty ? ' has' : ''}" title="${esc(i.name)}: ${i.qty} owned, ${i.used}/${i.limit} gained this week">${GLYPH(i)}<b>${i.qty}</b></span>`).join('')}</div>`;
    const act = `<button class="btn sm" data-ar="gear" type="button">Gear</button><button class="btn sm ghost" data-ar="chat" type="button">Intelligence Chat</button>`;
    return `<section class="arena on" id="arena"><div class="ar-top">${loop}</div>
      <div class="ar-mid">${bal}${chips}<div class="ar-act">${act}</div></div>
      <details class="lbhow ar-how"><summary>How the game works</summary><ul class="lbrules">
        <li><b>Steal:</b> pick a player on the board, pay ${fmt(s.cfg.theft_cost)} Orbits per attempt (kept even if it fails) and a success takes up to ${s.cfg.theft_pct}% of their unlocked Orbits. You can target the same player once every 24h. All thefts are anonymous.</li>
        <li><b>Defend:</b> a Galactic Vault locks a chosen amount for ${s.cfg.vault_hours}h (it can't be stolen or spent). Withdrawing early costs ${fmt(s.cfg.vault_early_fee)} and the Orbits become vulnerable. A Mirror Amulet reflects one theft: the thief loses what they would have taken. The Orbit Shield protects the Loop holder from challenges, not from theft.</li>
        <li><b>Investigate:</b> clues show game facts only, never messages or personal data. Clues can be vague or even wrong, so compare evidence and watch for bluffs. They never reveal exact balances, messages or alliances.</li>
        <li><b>The Loop:</b> only one exists and it is not for sale. Only a player who owns a Sword of Stars can challenge the current holder to win it. The Sword can't be bought: one random player gets it each week, and it can be used once every ${s.cfg.sword_cooldown_days} days. If the holder has an active Shield, the challenge fails and the Sword breaks. A Sword left unused by an inactive player (${s.cfg.sword_idle_days}+ days) is passed to someone else. Whether a Shield is up stays secret.</li>
        <li><b>Limits:</b> weekly item limits count every source, reset each Monday (UTC) and never carry over. New players are protected. Earned ranks ignore stolen Orbits.</li></ul>
        <p class="muted ar-small">Everyone on Orbit is in the game, all the time. Your items always stay secret.</p></details></section>`;
  }
  function paint() {
    const old = document.getElementById('arena'); if (!old) return;
    const t = document.createElement('div'); t.innerHTML = panelHtml(); const n = t.firstElementChild;
    const open = old.querySelector('.ar-how')?.open; if (open) n.querySelector('.ar-how')?.setAttribute('open', '');
    old.replaceWith(n); bindPanel(n); markRows(document);
  }
  function bindPanel(p) {
    p.onclick = async e => {
      const b = e.target.closest('[data-ar]'); if (!b) return;
      const k = b.dataset.ar;
      if (k === 'gear') gearModal();
      else if (k === 'hist') histModal();
      else if (k === 'chat') { const ch = S.chans?.find(x => x.name === 'orbit-intelligence'); ch ? openChan(ch.id) : toast('The Intelligence Chat isn\'t set up yet.', true); }
    };
  }

  /* leaderboard rows get a small Target button */
  function markRows(root) {
    const s = A.st; if (!s) { root.querySelectorAll('.ar-tg').forEach(b => b.remove()); return; }
    root.querySelectorAll('.lbrow[data-uid]').forEach(row => {
      const id = row.dataset.uid; if (id === S.me.id || row.querySelector('.ar-tg')) return;
      const pl = s.players[id], isLoop = id === s.loop?.holder, ok = pl && !pl.block;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ar-tg' + (ok || (isLoop && pl) ? '' : ' off'); b.dataset.tg = id;
      b.title = ok || isLoop ? 'Target this player' : (pl ? pl.block : 'Not playing the game');
      b.setAttribute('aria-label', 'Target ' + (prof(id)?.display_name || 'player')); b.innerHTML = ic('crosshair', 16);
      (row.querySelector(':scope > .r:last-child') || row).append(b);
      b.onclick = e => { e.stopPropagation(); targetModal(id); };
    });
  }
  function decorate(main) {
    if (!main.querySelector('.lbscreen')) return;
    if (!main.querySelector('#arena')) { const t = main.querySelector('.lbtabs'); if (t) t.insertAdjacentHTML('beforebegin', panelHtml()); }
    bindPanel(main.querySelector('#arena')); markRows(main); if (!A.st || Date.now() - A.at > 15000) load();
  }

  /* ───────── effects ───────── */
  function burst(host, kind) {
    if (still() || !host) return;
    const n = kind === 'shatter' ? 10 : 14, box = document.createElement('div'); box.className = 'ar-burst ' + kind;
    for (let i = 0; i < n; i++) { const p = document.createElement('i'); const a = (i / n) * 6.283 + Math.random() * .4, d = 40 + Math.random() * 46;
      p.style.cssText = `--x:${Math.cos(a) * d}px;--y:${(kind === 'coin' ? -1 : Math.sin(a)) * d - (kind === 'coin' ? 10 : 0)}px;--r:${Math.round(Math.random() * 240 - 120)}deg;--dl:${i * 18}ms`; box.append(p); }
    host.append(box); setTimeout(() => box.remove(), 1300);
  }
  function loopFx(name) {
    const reduce = still();
    const el = document.createElement('div'); el.className = 'ar-fx'; el.innerHTML = `<div class="ar-fx-dim"></div><span class="ar-fx-sword">⚔</span><u class="oloop big ar-fx-loop" aria-hidden="true"><s></s><s></s></u><div class="ar-fx-ban"><small>Orbit Loop taken</small><b class="olname">${esc(name)}</b></div>`;
    document.body.append(el); setTimeout(() => el.remove(), reduce ? 1600 : 2600);
  }
  const bump = (el, cls) => { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  /* ───────── target window: Steal / Investigate / Challenge ───────── */
  function targetModal(id, tab) {
    const s = A.st; if (!s) return;
    const p = prof(id), pl = s.players[id] || {}, isLoop = id === s.loop?.holder, cfg = s.cfg;
    let cur = tab || 'steal';
    modal('Target: ' + p.display_name, '<div id="ar-m" class="ar-m"></div>', [{ label: 'Close', cls: 'ghost' }], bg => {
      const box = bg.querySelector('#ar-m');
      const tabs = () => `<div class="ar-tabs" role="tablist">${[['steal', 'Steal'], ['inv', 'Investigate'], ...(isLoop ? [['loop', 'Challenge']] : [])].map(([k, l]) => `<button type="button" role="tab" aria-selected="${cur === k}" class="${cur === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>`;
      const head = `<div class="ar-th">${av(p)}<div><b>${esc(p.display_name)}</b>${isLoop ? ' <em class="ar-tag">Loop holder</em>' : ''}<small>${pl.victories ?? 0} victories · ${pl.discoveries ?? 0} discoveries</small></div></div>`;
      const note = () => `<label class="ar-lbl" for="ar-note">Your private theory</label><div class="ar-noterow"><textarea id="ar-note" maxlength="280" rows="2" placeholder="Only you can see this">${esc(s.notes?.[id] || '')}</textarea><button class="btn sm ghost" id="ar-nsave" type="button">Save</button></div>`;
      function pane() {
        if (cur === 'steal') {
          const poor = s.balance - s.locked < cfg.theft_cost;
          const why = pl.block || (s.newcomer ? 'New players can\'t steal yet.' : poor ? `You need ${fmt(cfg.theft_cost)} unlocked Orbits.` : '');
          return `<div class="ar-conf"><div class="ar-row"><span>Cost (kept even if it fails)</span><b class="neg">−${fmt(cfg.theft_cost)}</b></div>
            <div class="ar-row"><span>You could take</span><b class="pos">up to ${cfg.theft_pct}% of their unlocked Orbits</b></div></div>
            <p class="muted ar-small">Locked Orbits can't be taken. A Mirror Amulet reflects the theft and you lose what you would have stolen, on top of the cost. They never learn it was you, and their items stay secret.</p>
            ${why ? `<p class="err">${esc(why)}</p>` : ''}<button class="btn" id="ar-go" type="button"${why || A.busy ? ' disabled' : ''}>Attempt theft (−${fmt(cfg.theft_cost)})</button>`;
        }
        if (cur === 'inv') {
          const cost = cfg.investigate_cost, comp = qty('compass');
          return `<p class="muted ar-small">A clue hints at which special item they may hold. It can be vague or wrong, and never shows balances, messages or personal data.</p>
            <div class="ar-two"><button class="btn" id="ar-inv" type="button"${s.balance - s.locked < cost ? ' disabled' : ''}>Investigate (−${cost})</button>
            <button class="btn ghost" id="ar-comp" type="button"${comp ? '' : ' disabled'}>Use Compass (${comp})</button></div><div id="ar-clue"></div>${note()}`;
        }
        const sw = qty('sword'), wait = s.next_challenge && new Date(s.next_challenge) > Date.now();
        return `<div class="ar-conf"><div class="ar-row"><span>Sword of Stars owned</span><b>${sw}</b></div><div class="ar-row"><span>The Sword is used up</span><b>either way</b></div></div>
          <p class="muted ar-small">If the holder has an active Shield, the challenge fails. Otherwise the Orbit Loop is yours. You can challenge once every ${cfg.sword_cooldown_days} days.</p>
          ${wait ? `<p class="err">You can challenge again in ${left(s.next_challenge)}.</p>` : ''}
          <button class="btn" id="ar-sword" type="button"${sw && !s.newcomer && !wait ? '' : ' disabled'}>Challenge for the Loop</button>`;
      }
      function draw() {
        box.innerHTML = head + tabs() + `<div class="ar-pane" id="ar-pane">${pane()}</div><div class="ar-res" id="ar-res" aria-live="polite"></div>`; wire();
      }
      const res = (cls, html) => { const r = box.querySelector('#ar-res'); r.className = 'ar-res show ' + cls; r.innerHTML = html; burst(r, cls === 'ok' ? 'coin' : cls === 'blocked' ? 'shatter' : ''); bump(r, 'pop'); };
      function wire() {
        box.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { cur = b.dataset.tab; draw(); });
        const g = id2 => box.querySelector(id2);
        g('#ar-nsave') && (g('#ar-nsave').onclick = async () => { const v = g('#ar-note').value; if (await act('game_note_save', { p_target: id, p_note: v })) { toast('Theory saved.'); s.notes[id] = v; } });
        g('#ar-go') && (g('#ar-go').onclick = async () => {
          g('#ar-go').disabled = true; const r = await act('attempt_theft', { p_target: id }); if (!r) return draw();
          if (r.outcome === 'stolen') res('ok', `<b>+${fmt(r.amount)} Orbits</b><span>Stolen from ${esc(p.display_name)}. Cost ${fmt(r.cost)}.</span>`);
          else if (r.outcome === 'reflected') res('blocked', `<b>Reflected</b><span>A Mirror Amulet sent it back. You lost the ${fmt(r.cost)} cost${r.amount ? ' and ' + fmt(r.amount) + ' more' : ''}.</span>`);
          else res('empty', `<b>Nothing taken</b><span>The attempt came up empty. You lost the ${fmt(r.cost)} Orbit cost.</span>`);
          const pn = box.querySelector('#ar-pane'); if (pn) pn.innerHTML = '<p class="muted ar-small">Done. You can try this player again in 24 hours.</p>';
        });
        const clue = async comp => {
          const r = await act('investigate', { p_target: id, p_compass: comp }); if (!r) return;
          const holder = box.querySelector('#ar-clue'); holder.innerHTML = `<div class="ar-clue ${comp ? 'comp' : ''}"><span class="ar-ping"></span><p>${esc(r.clue)}</p><div class="ar-two"><button class="btn sm ghost" id="ar-cs" type="button">Save to notes</button><button class="btn sm ghost" id="ar-cx" type="button">Share in chat</button></div></div>`;
          bump(holder.firstElementChild, 'pop');
          holder.querySelector('#ar-cs').onclick = async () => { const v = ((s.notes?.[id] ? s.notes[id] + ' · ' : '') + r.clue).slice(-280); if (await act('game_note_save', { p_target: id, p_note: v })) { s.notes[id] = v; const t = box.querySelector('#ar-note'); if (t) t.value = v; toast('Saved to your notes.'); } };
          holder.querySelector('#ar-cx').onclick = async () => {
            const ch = S.chans?.find(x => x.name === 'orbit-intelligence'); if (!ch) return toast('The Intelligence Chat isn\'t set up yet.', true);
            const { error } = await sb.from('messages').insert({ channel_id: ch.id, author_id: S.me.id, content: `🔎 Clue about ${p.display_name}: ${r.clue}` });
            error ? toast(error.message, true) : toast('Shared in Orbit Intelligence Chat.');
          };
        };
        g('#ar-inv') && (g('#ar-inv').onclick = () => clue(false)); g('#ar-comp') && (g('#ar-comp').onclick = () => clue(true));
        g('#ar-sword') && (g('#ar-sword').onclick = async () => {
          g('#ar-sword').disabled = true; const r = await act('challenge_loop'); if (!r) return draw();
          if (r.outcome === 'transferred') { loopFx(S.me.display_name || 'You'); res('ok', '<b>The Loop is yours</b><span>Everyone can see it now.</span>'); }
          else res('blocked', '<b>Shield held</b><span>Your Sword broke against it.</span>');
          const pn = box.querySelector('#ar-pane'); if (pn) pn.innerHTML = '';
        });
      }
      draw();
    });
  }

  /* ───────── gear window: buy, lock a Vault, raise a Shield ───────── */
  function gearModal() {
    modal('Game gear', '<div id="ar-m" class="ar-m"></div>', [{ label: 'Close', cls: 'ghost' }], bg => {
      const box = bg.querySelector('#ar-m');
      const draw = flash => {
        const s = A.st; if (!s) return;
        const un = s.balance - s.locked, holds = s.loop?.holder === S.me.id;
        box.innerHTML = `<p class="muted ar-small">You have <b>${fmt(un)}</b> unlocked Orbits. Weekly limits count every source (shop, missions, events) and reset ${new Date(s.week_resets).toLocaleDateString([], { weekday: 'long' })}. They never carry over.</p>
        <div class="ar-gear">${s.catalog.map(i => {
          const full = i.used >= i.limit, poor = un < i.price;
          const use = i.id === 'vault' && i.qty ? `<div class="ar-two"><input id="ar-vamt" type="number" inputmode="numeric" min="${s.cfg.vault_min}" max="${Math.max(0, un)}" placeholder="Orbits to lock" aria-label="Orbits to lock"><button class="btn sm" data-use="vault" type="button"${s.vault ? ' disabled' : ''}>${s.vault ? 'Locked' : 'Lock ' + s.cfg.vault_hours + 'h'}</button></div>${s.vault ? `<button class="btn sm ghost" data-use="unvault" type="button">Withdraw early (−${fmt(s.cfg.vault_early_fee)})</button>` : ''}`
            : i.id === 'shield' && i.qty ? `<button class="btn sm" data-use="shield" type="button"${holds ? '' : ' disabled'}>${holds ? 'Raise Shield ' + s.cfg.shield_hours + 'h' : 'Loop holder only'}</button>`
            : i.id === 'amulet' && i.qty ? '<small class="ar-auto">Active automatically</small>' : '';
          return `<article class="ar-card${flash === i.id ? ' pop' : ''}" data-r="${esc(i.rarity)}">${GLYPH(i, true)}<div class="ar-ci"><b>${esc(i.name)} <em class="ar-rar">${RAR[i.rarity] || ''}</em></b><small>${esc(i.blurb)}</small>
            <small class="ar-meta">Owned <b>${i.qty}</b> · this week ${i.used}/${i.limit}</small>${use}</div>
            ${i.id === 'sword' ? '<span class="ar-meta">Weekly random draw</span>' : `<button class="btn sm" data-buy="${esc(i.id)}" type="button"${full || poor ? ' disabled' : ''}>${full ? 'Limit' : fmt(i.price)}</button>`}</article>`;
        }).join('')}</div>
        ${Object.keys(s.notes || {}).length ? `<h4 class="ar-h">Your theories</h4><ul class="ar-notes">${Object.entries(s.notes).map(([u, n]) => `<li><b>${esc(prof(u)?.display_name || 'Player')}</b> ${esc(n)}</li>`).join('')}</ul>` : ''}`;
        box.querySelectorAll('[data-buy]').forEach(b => b.onclick = async () => { b.disabled = true; const r = await act('game_buy', { p_item: b.dataset.buy }); if (r) { toast(`${item(b.dataset.buy).name} added.`); await load(); draw(b.dataset.buy); } else draw(); });
        box.querySelectorAll('[data-use]').forEach(b => b.onclick = async () => {
          b.disabled = true; let r;
          if (b.dataset.use === 'vault') r = await act('use_vault', { p_amount: Math.floor(Number(box.querySelector('#ar-vamt').value)) });
          else if (b.dataset.use === 'unvault') { if (!confirm(`Withdraw early? It costs ${fmt(A.st.cfg.vault_early_fee)} Orbits and your Orbits become open to theft.`)) return draw(); r = await act('withdraw_vault'); }
          else r = await act('use_shield');
          if (r) { toast(b.dataset.use === 'vault' ? `Vault locked for ${A.st.cfg.vault_hours} hours.` : b.dataset.use === 'unvault' ? 'Vault opened. Those Orbits can be stolen again.' : `Shield raised for ${A.st.cfg.shield_hours} hours.`); await load(); draw(); bump(box.firstElementChild, 'pop'); } else draw();
        });
      };
      load().then(() => draw());
    });
  }
  function histModal() {
    const h = A.st?.loop?.history || [];
    modal('Orbit Loop history', `<ul class="ar-notes">${h.length ? h.map(x => `<li><b>${esc(x.name || 'Unknown')}</b> ${x.how === 'challenge' ? 'won it with a Sword of Stars' : x.how === 'restored' ? 'had ownership restored' : x.how === 'event' ? 'received it at an event' : `bought it for ${fmt(x.price)}`} · ${ago(x.at)} ago</li>`).join('') : '<li>No transfers yet.</li>'}</ul>`, [{ label: 'Close', cls: 'ghost' }]);
  }

  return { decorate, start, stop, load };
}
