if (/[?&]embed=social/.test(location.search)) document.documentElement.classList.add('embed');
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import * as CONFIG from './config.js';
import { initOrbit } from './orbit.js?v=11';
import { initCommunities } from './communities.js?v=2';
/* Shop and voice typing are extras: if either file is missing or fails to load, Orbit still starts and just goes without it. */
const { initShop } = await import('./shop.js?v=12').catch(e => (console.warn('Orbit Shop unavailable', e), {}));
const { initTournaments } = await import('./tournaments.js?v=2').catch(e => (console.warn('Tournaments unavailable', e), {}));
const { initGamble } = await import('./gamble.js?v=5').catch(e => (console.warn('Orbit Casino unavailable', e), {}));
const { initArena } = await import('./arena.js?v=3').catch(e => (console.warn('Orbit Game unavailable', e), {}));
const { dictateBtn, bindDictate } = await import('./dictate.js?v=1').catch(e => (console.warn('Voice typing unavailable', e), {}));
const NO_AR = { decorate() {}, start() {}, stop() {}, load() {} };
const NO_GB = { handles: v => v === 'gamble', render: m => { m.innerHTML = '<div class="empty"><h2>Orbit Casino is unavailable</h2><p>Reload the page. If this keeps happening, tell a staff member.</p></div>'; }, onNav() {}, stop() {} };
const NO_TN = { handles: v => v === 'tournaments' || v === 'tournament', render: m => { m.innerHTML = '<div class="empty"><h2>Tournaments are unavailable</h2><p>Reload the page. If this keeps happening, tell a staff member.</p></div>'; }, onNav() {}, stop() {}, load: async () => {} };
const NO_SHOP = { render: m => { m.innerHTML = '<div class="empty"><h2>The shop is unavailable</h2><p>Reload the page. If this keeps happening, tell a staff member.</p></div>'; }, load: async () => {}, avAttr: () => '', glyphOf: () => '', coHtml: () => '', applyOwn() {}, refreshCos: async () => {} };
import { attachFx, afterMain, pageSwap, clickRipple } from './fx.js?v=2';
import { leaderboardHtml, startLeaderboardFx } from './leaderboard.js?v=5';
const { SUPABASE_URL, SUPABASE_ANON_KEY, OAUTH_PROVIDERS } = CONFIG, HCAPTCHA_SITE_KEY = CONFIG.HCAPTCHA_SITE_KEY || '';
const GAMER_URL = 'https://gamer1.unblocker4school.workers.dev/';
const openGamer = () => { try { if (top !== self) { top.location.hash = '#/games'; return; } } catch (e) { /* ignore */ } window.open(GAMER_URL, '_blank', 'noopener,noreferrer'); };

/* "Install as app": Chrome tells us when the site can be installed; we hold on to that and open it from the sidebar tab */
let installEv = null, installed = false;
const isApp = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || navigator.standalone === true;
const canInstall = () => !installed && !isApp() && (!!installEv || /Chrome\//.test(navigator.userAgent));
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; try { renderSide(); } catch {} });
window.addEventListener('appinstalled', () => { installed = true; installEv = null; try { renderSide(); } catch {} });

const $ = (s, e = document) => e.querySelector(s);
const root = $('#root');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let _un = null, _unSize = -1;
const userIdByName = u => { if (_unSize !== S.profiles.size) { _un = new Map([...S.profiles.values()].map(p => [p.username, p.id])); _unSize = S.profiles.size; } return _un.get(u); };
/* ~tabs: type ~events, ~shop, ~friends... in a chat to link to that Orbit tab. [tag, label, nav key, icon, other names that work] */
const TAB_TAGS = [
  ['direct-messages', 'Direct Messages', 'dm', 'dm', ['dm', 'dms', 'messages', 'direct']],
  ['communities', 'Communities', 'communities', 'users', ['community']],
  ['friends', 'Friends', 'friends', 'friends', ['friend']],
  ['events', 'Events', 'events', 'calendar', ['event']],
  ['tournaments', 'Tournaments', 'tournaments', 'trophy', ['tournament']],
  ['orbit-games', 'Orbit Games', 'gamer', 'gamepad', ['games', 'game']],
  ['orbit-shop', 'Orbit Shop', 'shop', 'shop', ['shop']],
  ['orbit-leaderboard', 'Orbit Leaderboard', 'leaderboard', 'trophy', ['leaderboard', 'lb']],
  ['orbit-gamble', 'Orbit Casino', 'gamble', 'dice', ['gamble', 'casino', 'blackjack', 'slots', 'roulette']],
  ['orbitcraft', 'Orbitcraft', 'orbitcraft', 'gamepad', ['craft', 'sandbox']],
];
const TAB_BY = new Map(); for (const [slug, label, nav, icon, alias] of TAB_TAGS) { const o = { slug, label, nav, icon }; TAB_BY.set(slug, o); alias.forEach(x => TAB_BY.set(x, o)); }
/* @mentions, #channels and ~tabs become clickable pills (never inside links or code) */
const rich = html => { let skip = 0; return html.split(/(<[^>]*>)/).map((t, i) => {
  if (i % 2) { if (/^<(a|code)[\s>]/i.test(t)) skip++; else if (/^<\/(a|code)>/i.test(t)) skip = Math.max(0, skip - 1); return t; }
  return skip ? t : t.replace(richRe(), (all, pre, role, sig, name) => {
    if (role) return rolePill(pre, role);
    const k = name.toLowerCase();
    if (sig === '~') {
      const tb = TAB_BY.get(k); if (!tb) return all;
      return `${pre}<span class="mention tab" data-tab="${tb.nav}" role="button" tabindex="0" title="Open ${esc(tb.label)}">~${esc(tb.label)}</span>`;
    }
    if (sig === '@') {
      if (k === 'everyone' || k === 'here') return `${pre}<span class="mention all">@${k}</span>`;
      const id = userIdByName(k); if (!id) return all;
      return `${pre}<span class="mention ${id === S.me?.id ? 'me' : ''}${SHOP?.isHolder?.(id) ? ' loopm' : ''}" data-a="prof" data-u="${id}" role="button" tabindex="0">@${esc(prof(id).display_name)}</span>`;
    }
    const ch = S.chans?.find(c => c.kind === 'text' && c.name === k); if (!ch) return all;
    return `${pre}<span class="mention chan" data-a="chan" data-ch="${ch.id}" role="button" tabindex="0">#${esc(ch.name)}</span>`;
  });
}).join(''); };
/* markdown-lite: `code`, **bold**, *italic* / _italic_, ***bold italic***, ||spoiler||, links, @mentions, #channels,
   plus line-start blocks: # / ## / ### headers, -# small text, and * or - bullet lists (indent two spaces for a sub-list) */
const GIFS = [['lol','laugh funny haha'],['gg','good game win'],['nice','cool good'],['wow','omg surprised'],['yes','correct agree check'],['no','nope wrong disagree'],['sad','cry upset'],['bravo','clap applause congrats'],['party','celebrate confetti'],['fire','lit hot'],['love','heart like'],['thanks','thank you'],['sus','suspicious look'],['mindblown','shocked explode'],['hi','hello wave hey'],['goodnight','sleep bed moon'],['cool','sunglasses chill'],['bruh','unimpressed meh'],['rip','dead f funeral']];
const GIF_RE = /^:gif:([a-z]+):$/, gifSrc = n => GIFS.some(g => g[0] === n) ? `gifs/${n}.gif` : null;
const UGIF_RE = /^:ugif:([0-9a-f-]{36})\/([0-9a-f-]{36}):$/, ugifUrl = (u, id) => `${SUPABASE_URL}/storage/v1/object/public/gifs/${u}/${id}.gif`;
const URL_RE = /https?:\/\/[^\s<]*[^\s<*_|.,;:!?]/g;   // a link never ends on formatting characters or sentence punctuation
const inlineMd = t => t
  .replace(/\{(red|orange|yellow|green|teal|blue|purple|pink|gray):([^{}\n]+?)\}/g, '<span class="tc tc-$1">$2</span>')   // {red:text}
  .replace(/\{(#[0-9a-fA-F]{6}):([^{}\n]+?)\}/g, '<span class="tc" style="color:$1">$2</span>')   // {#ff8800:text}
  .replace(/~~(?=[^\s~])([^\n]*?[^\s~])~~/g, '<s>$1</s>')
  .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '<b><i>$1</i></b>')
  .replace(/\*\*(?=[^\s*])([^\n]*?[^\s*])\*\*/g, '<b>$1</b>')
  .replace(/(^|[\s(>])\*(?=[^\s*])([^*\n]*?[^\s*])\*/g, '$1<i>$2</i>')
  .replace(/(^|[^\w])_(?=[^\s_])([^_\n]*?[^\s_])_(?!\w)/g, '$1<i>$2</i>');   // _italic_ only at word edges, so snake_case stays as typed
const md = (s, key = '') => { const um = UGIF_RE.exec(String(s ?? '').trim()); if (um) return `<img class="gifmsg" src="${ugifUrl(um[1], um[2])}" alt="GIF" loading="lazy">`; const gm = GIF_RE.exec(String(s ?? '').trim()), gs = gm && gifSrc(gm[1]); if (gs) return `<img class="gifmsg" src="${gs}" alt="GIF: ${gm[1]}" loading="lazy">`; let n = 0; const keep = [], stash = h => '\u0001' + (keep.push(h) - 1) + '\u0001';
  const text = esc(String(s ?? '').replace(/[\u0001\u0002]/g, ''))
    .replace(/```(?:[a-z0-9+#-]+\n|\n)?([\s\S]*?)```/g, (_, c) => '\u0002' + (keep.push(`<pre class="cb"><code>${c.replace(/\n$/, '')}</code></pre>`) - 1) + '\u0002')   // code blocks
    .replace(/`([^`\n]+)`/g, (_, c) => stash(`<code>${c}</code>`))   // code and links are set aside so nothing inside them gets formatted
    .replace(/\|\|([^\n]+?)\|\|/g, (_, t) => { const k = key + ':' + (n++), on = S.revealed?.has(k); return `<span class="spoiler${on ? ' on' : ''}" data-sp="${esc(k)}"${on ? '' : ' role="button" tabindex="0" aria-label="Spoiler, click to reveal"'}>${t}</span>`; })
    .replace(URL_RE, u => stash(`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`));
  let html = '', buf = [], ul = [], blk = false;
  const flush = () => { if (buf.length) { html += buf.join('<br>'); buf = []; } };
  const shut = to => { while (ul.length > to) { html += '</li></ul>'; ul.pop(); } };
  const li = (indent, t) => {
    const top = ul[ul.length - 1];
    if (top === undefined || (indent > top && ul.length < 3)) { html += '<ul class="ml">'; ul.push(indent); }
    else { while (ul.length > 1 && indent < ul[ul.length - 1]) { html += '</li></ul>'; ul.pop(); } html += '</li>'; }
    html += '<li>' + inlineMd(t);
  };
  for (const line of text.split('\n')) {
    let m;
    if ((m = /^\u0002(\d+)\u0002$/.exec(line))) { flush(); shut(0); html += keep[m[1]]; blk = true; }
    else if ((m = /^(#{1,3}) (\S.*)$/.exec(line))) { flush(); shut(0); html += `<div class="mh mh${m[1].length}" role="heading" aria-level="${m[1].length}">${inlineMd(m[2])}</div>`; blk = true; }
    else if ((m = /^-# (\S.*)$/.exec(line))) { flush(); shut(0); html += `<div class="sub">${inlineMd(m[1])}</div>`; blk = true; }
    else if ((m = /^( *)[*-] (\S.*)$/.exec(line))) { flush(); li(m[1].length, m[2]); blk = true; }
    else { shut(0); if (!line && blk) { blk = false; continue; } blk = false; buf.push(inlineMd(line)); }   // blocks have their own spacing, so a blank line right after one is dropped
  }
  flush(); shut(0);
  return rich(html.replace(/[\u0001\u0002](\d+)[\u0001\u0002]/g, (_, i) => keep[i])); };
const plain = s => String(s ?? '').replace(/```(?:[a-z0-9+#-]+\n|\n)?([\s\S]*?)```/g, '$1').replace(/\{(?:red|orange|yellow|green|teal|blue|purple|pink|gray|#[0-9a-fA-F]{6}):([^{}\n]+?)\}/g, '$1').replace(/~~(?=[^\s~])([^\n]*?[^\s~])~~/g, '$1').replace(/^:u?gif:[\w\-\/]+:$/, '🎞️ GIF').replace(/\|\|[^\n]+?\|\|/g, '▮▮▮').replace(/^(#{1,3}|-#) /gm, '').replace(/^ *[*-] /gm, '• ');   // hides spoilers and block markers in previews and notifications
const col = () => S.view === 'server' ? 'channel_id' : 'conversation_id';
const hhmm = d => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const day = d => new Date(d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

function toast(msg, isErr) {
  const t = document.createElement('div'); t.className = 'toast' + (isErr ? ' err' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4500);
}
function modal(title, body, buttons = [{ label: 'Close', cls: 'ghost' }], onMount) {
  const bg = document.createElement('div'); bg.className = 'modalbg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><h2>${esc(title)}</h2><div>${body}</div><div class="actions"></div></div>`;
  const kd = e => { if (e.key === 'Escape') close(); };
  const close = () => { bg.remove(); document.removeEventListener('keydown', kd); };
  buttons.forEach(b => {
    const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.label;
    el.onclick = async () => { if (b.fn && (await b.fn(bg, close)) === false) return; close(); };
    $('.actions', bg).append(el);
  });
  let downOn = null;   // a drag that starts inside the box (selecting text) and ends on the backdrop fires a click on the backdrop: ignore it
  bg.addEventListener('pointerdown', e => { downOn = e.target; });
  bg.onclick = e => { const clean = e.target === bg && downOn === bg; downOn = null; if (clean) close(); };
  document.addEventListener('keydown', kd); document.body.append(bg);
  onMount?.(bg, close); (bg.querySelector('input,textarea') || bg.querySelector('button'))?.focus();
}
/* ───────── moderation: explain why something was rejected (the server decides; this only shows its explanation) ───────── */
const modTitle = { channel: 'Message not sent', dm: 'Message not sent', edit: 'Edit not saved', dm_edit: 'Edit not saved', name: 'Name not changed', attachment: 'File not sent' };
function modNotice(res) {
  const until = res.timeout_until ? new Date(res.timeout_until).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  modal(modTitle[res.surface] || 'Not allowed', `<p>${esc(res.message || 'That isn\'t allowed here.')}</p>${until ? `<p class="muted">You can send messages again at ${esc(until)}.</p>` : ''}`, [{ label: 'OK' }]);
}
const confirmBox = (title, text, label, fn) => modal(title, `<p class="muted">${esc(text)}</p>`, [{ label: 'Cancel', cls: 'ghost' }, { label, cls: 'danger', fn }]);

/* theme (UI preference only; all real data lives in Supabase) */
/* theme: 'dark' (default), 'light' or 'system' (follows the device). UI preference only. */
const themePref = () => 'dark';   // Orbit is dark only
const themeNow = p => p === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : p;
const applyTheme = () => { const t = themeNow(themePref()); document.documentElement.dataset.theme = t; document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'light' ? '#ffffff' : '#050c40'); };
const setTheme = p => { try { localStorage.setItem('chatter-theme', p); } catch {} applyTheme(); };
applyTheme();
try { matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (themePref() === 'system') { applyTheme(); if (S.me) renderSide(); } }); } catch {}

const logo = `<div class="logo"><img src="logo.svg" width="28" height="28" alt=""><img class="lwm" src="orbit-wordmark.png" alt="Orbit" height="26"></div>`;


/* ───────── icons + small helpers ───────── */
const I = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  dm: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  friends: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  hash: '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
  voice: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  chev: '<polyline points="6 9 12 15 18 9"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
  mic: '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  pin: '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>',
  up: '<polyline points="18 15 12 9 6 15"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  paperclip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  bellOff: '<path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/>',
  micOff: '<line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>',
  phoneOff: '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  poll: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  gamepad: '<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect x="2" y="6" width="20" height="12" rx="4"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
  sun: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
};
Object.assign(I, {
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
  videoOff: '<path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/>',
  screen: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  arrow: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'
});
const ic = (k, s = 20) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
/* every channel's icon: Suggestions and Tutorials use the # like the other channels, locked and private ones a padlock */
const chIcon = (c, size = 18) => ic(c.special === 'suggestions' || c.special === 'videos' ? 'hash' : c.is_private || c.locked ? 'lock' : 'hash', size);
const logoMark = `<img src="logo.svg" width="38" height="38" alt="" style="border-radius:10px">`;
const menuBtn = () => `<button class="ib menu" id="mb" aria-label="Open sidebar">${ic('menu')}</button>`;
const toggleSide = () => $('#app').classList.toggle('open');
const closeSide = () => $('#app')?.classList.remove('open');
const bindMenu = () => { const b = $('#mb'); if (b) b.onclick = toggleSide; };
const stamp = d => { const x = new Date(d), n = new Date(), y = new Date(n - 864e5); return (x.toDateString() === n.toDateString() ? 'Today at ' : x.toDateString() === y.toDateString() ? 'Yesterday at ' : x.toLocaleDateString() + ' ') + hhmm(d); };
const stText = { online: 'Online', idle: 'Idle', playing: 'Playing in Orbit Games', dnd: 'Do not disturb', offline: 'Offline' };
const vname = n => n.length <= 3 ? n.toUpperCase() : n[0].toUpperCase() + n.slice(1);
const getLr = id => { try { return localStorage.getItem('chatter-lr-' + id); } catch { return null; } };
const setLr = id => { try { localStorage.setItem('chatter-lr-' + id, new Date().toISOString()); } catch {} };
const EMOJI = ['😀', '😂', '😊', '😍', '🥹', '😎', '🤔', '😭', '😮', '😡', '👍', '👎', '👏', '🙏', '🔥', '🎉', '❤️', '💀', '✨', '👀', '🎮', '🍕', '☕', '🌈', '💯', '🤝', '😴', '🥳', '😅', '🙌'];

if (SUPABASE_URL.includes('YOUR-PROJECT')) {
  root.innerHTML = `<div class="authwrap"><div class="card">${logo}<h1>Setup needed</h1><p class="muted">Open <code>chatter/config.js</code> and paste your Supabase project URL and anon key. See README.md.</p></div></div>`;
  throw new Error('Orbit: config.js not filled in');
}
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ───────── state ───────── */
const S = { me: null, profiles: new Map(), convs: [], active: null, list: [], rx: new Map(), view: 'server', replyTo: null, hasMore: true, loadingOlder: false,
  readMark: null, friends: [], incoming: [], outgoing: [], tab: 'online', online: new Map(), filter: '', typingUntil: 0, lastActive: Date.now(), channels: [], servers: [], chans: [], cats: [], members: [], sv: null, ch: null, showMem: innerWidth > 1000, chUnread: {}, collapsed: new Set(), loaded: false, lastDm: null, perms: new Set(), pins: new Set(), pinRows: [], reportCount: 0, blocked: false, dash: null };
S.pending = []; S.voiceUsers = new Map(); S.voiceMeta = new Map(); S.croles = []; S.cmem = new Map(); S.crErr = null; S.rolesEdit = false; S.sending = false; S.revealed = new Set(); S.polls = new Map(); S.typers = new Map(); S.sugs = []; S.sugErr = ''; S.sugFilter = 'all'; S.sugSort = 'top';
const prof = id => S.profiles.get(id) || { id, username: 'unknown', display_name: 'Unknown user', avatar_color: '#6b6b7b' };
/* 'playing' (orange dot) = online or idle and inside Orbit Games; Do not disturb and Invisible are never overridden */
const myStatus = () => S.me.status === 'invisible' ? 'offline' : S.view === 'gamer' && (S.me.status === 'online' || S.me.status === 'idle') ? 'playing' : S.me.status;
const statusOf = p => p.id === S.me.id ? myStatus() : (S.online.get(p.id)?.status || 'offline');
/* last online: when each person was last active (table profile_seen, stamped by touch_last_seen()) */
const SEEN = new Map(), SEEN_TRIED = new Set();
function seenAgo(iso) {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 6e4));
  if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
  const d = Math.floor(h / 24); if (d < 31) return d + (d === 1 ? ' day ago' : ' days ago');
  return 'on ' + new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
}
/* "Last online 3 hours ago" for someone who is offline (nothing for people who are online, for you, or who appear offline on purpose) */
function lastSeenText(p) {
  if (!p || !p.id || p.id === S.me?.id || p.status === 'invisible' || statusOf(p) !== 'offline') return '';
  const t = SEEN.get(p.id); return t ? 'Last online ' + seenAgo(t) : '';
}
async function loadSeen(ids) {
  const need = [...new Set(ids)].filter(i => i && i !== S.me?.id && !SEEN_TRIED.has(i)); if (!need.length) return;
  need.forEach(i => SEEN_TRIED.add(i));
  for (let i = 0; i < need.length; i += 80) {
    const { data, error } = await sb.from('profile_seen').select('user_id, last_seen').in('user_id', need.slice(i, i + 80));
    if (error) return; (data || []).forEach(r => SEEN.set(r.user_id, r.last_seen));
  }
  renderMembers(); if (S.view === 'friends') renderMain();
}
const touchSeen = () => { if (S.me && S.me.status !== 'invisible' && !document.hidden) sb.rpc('touch_last_seen').then(() => {}, () => {}); };
const AV_BASE = SUPABASE_URL + '/storage/v1/object/public/avatars/';
const avatarSrc = p => p?.avatar_url && String(p.avatar_url).startsWith(AV_BASE) ? p.avatar_url : '';
let SHOP = null;   // the Orbit Shop (set up below); avatars ask it for the ring a person has equipped
const av = p => { const src = avatarSrc(p); return `<span class="av"${SHOP ? SHOP.avAttr(p.id) : ''} style="background:${esc(p.avatar_color)}" aria-hidden="true">${esc((p.display_name || '?')[0].toUpperCase())}${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async">` : ''}<i class="${statusOf(p)}"></i>${SHOP?.avLoop?.(p.id) || ''}</span>`; };
document.addEventListener('error', e => { const t = e.target; if (t?.tagName === 'IMG' && t.parentElement?.classList.contains('av')) t.remove(); }, true);   // broken photo: fall back to the letter
const unread = c => c.last_author && c.last_author !== S.me.id && c.last_message_at && c.last_message_at > c.last_read_at;
/* group chats: a conversation with is_group = true, an optional name and 3 to 10 people (c.mems = everyone's id, including you) */
const gOthers = c => (c.mems || []).filter(id => id !== S.me.id).map(prof);
const convName = c => c.is_group ? (c.name || gOthers(c).map(p => p.display_name).join(', ') || 'Group chat') : (c.other?.display_name || 'Unknown user');
const convAv = c => c.is_group ? `<span class="av group-av" aria-hidden="true">${esc(gOthers(c).slice(0, 3).map(p => (p.display_name || '?')[0].toUpperCase()).join('') || '👥')}</span>` : av(c.other);
const grpErr = e => /could not find the function|schema cache/i.test(e?.message || '') ? 'Group chats are not set up yet. Run migration-group-chats.sql in the Supabase SQL Editor.' : (e?.message || 'Something went wrong.');

/* ───────── Orbit features (home, events, whiteboard, AI, formatting bar): see orbit.js ───────── */
const O = initOrbit({ setOrbits: n => setOrbits(n), loadOrbits: () => loadOrbits(), S, sb, $, esc, ic, I, modal, toast, confirmBox, prof, av, md, plain, menuBtn, bindMenu, gamerUrl: GAMER_URL, collectibles: () => SHOP?.collectibles?.() || [],
  needProfiles: ids => needProfiles(ids), renderMain: () => renderMain(), renderSide: () => renderSide(), closeSide: () => closeSide(), navTo: k => navTo(k),
  openChan: id => openChan(id), openFirstChannel: () => openFirstChannel(), profileModal: id => profileModal(id), send: () => send(), osNotify: (t, b, g) => osNotify(t, b, g),
  searchModal: () => searchModal(), bindSearch: (i, o) => bindOrbitSearch(i, o), onlineCount: () => onlineCount(), unreadDms: () => S.convs.filter(unread).length, isStaff: () => isStaff() });

const CM = initCommunities({ S, sb, $, esc, ic, I, modal, toast, confirmBox, prof, av, menuBtn, bindMenu,
  needProfiles: ids => needProfiles(ids), navTo: k => navTo(k), renderSide: () => renderSide(), profileModal: id => profileModal(id), isStaff: () => isStaff() });

SHOP = !initShop ? NO_SHOP : initShop({ S, sb, $, esc, ic, I, modal, toast, menuBtn, renderMain: () => renderMain(), renderSide: () => renderSide(), navTo: k => navTo(k), setOrbits: n => setOrbits(n), loadOrbits: () => loadOrbits() });
const TN = !initTournaments ? NO_TN : initTournaments({ S, sb, $, esc, ic, I, modal, toast, menuBtn, bindMenu, prof, av, needProfiles: ids => needProfiles(ids), renderMain: () => renderMain(), renderSide: () => renderSide(), navTo: k => navTo(k), isStaff: () => isStaff(), loadOrbits: () => loadOrbits() });
const GB = !initGamble ? NO_GB : initGamble({ S, sb, esc, ic, I, toast, menuBtn, bindMenu, prof, av, needProfiles: ids => needProfiles(ids), setOrbits: n => setOrbits(n), loadOrbits: () => loadOrbits() });
const AR = !initArena ? NO_AR : initArena({ S, sb, esc, ic, I, modal, toast, prof, av, needProfiles: ids => needProfiles(ids), setOrbits: n => setOrbits(n), loadOrbits: () => loadOrbits(), openChan: id => { S.view = 'server'; openChan(id); } });

/* ───────── device lock: the first account to sign in on a browser owns it ───────── */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, BOUND_KEY = 'chatter-bound-email';
function deviceId() {
  let id = null;
  try { id = localStorage.getItem('chatter-device'); } catch {}
  if (!UUID_RE.test(id || '')) { const m = document.cookie.match(/(?:^|; )chatter_device=([0-9a-f-]{36})/i); id = m ? m[1] : null; }
  if (!UUID_RE.test(id || '')) id = crypto.randomUUID();
  try { localStorage.setItem('chatter-device', id); } catch {}
  document.cookie = `chatter_device=${id}; max-age=63072000; path=/; SameSite=Lax`;
  return id;
}
const boundEmail = () => { try { return localStorage.getItem(BOUND_KEY) || ''; } catch { return ''; } };
let authNotice = '', maint = { on: false, msg: '', ready: true };

/* ───────── CAPTCHA (hCaptcha). Supabase checks the token on sign-up, log-in and password reset. ───────── */
let hcLoad = null;
const loadHcaptcha = () => hcLoad ||= new Promise((ok, no) => {
  if (window.hcaptcha) return ok(window.hcaptcha);
  const el = document.createElement('script'); el.src = 'https://js.hcaptcha.com/1/api.js?render=explicit'; el.async = true;
  el.onload = () => window.hcaptcha ? ok(window.hcaptcha) : no(new Error('load')); el.onerror = () => { hcLoad = null; no(new Error('load')); };
  document.head.appendChild(el);
});

/* ───────── auth screens ───────── */
function authView(mode = 'login') {
  const t = { login: 'Welcome back', signup: 'Create your account', reset: 'Reset your password' }[mode];
  root.innerHTML = `<div class="authwrap"><form class="card" id="af" novalidate>${logo}<p class="muted" style="margin:.2rem 0 0">Conestoga 2030</p><h1>${t}</h1>
  <label for="em">Email</label><input id="em" type="email" autocomplete="email" placeholder="30yua@tesdk12.net" required>
  ${mode === 'signup' ? '<p class="muted" style="font-size:12px;margin:.5rem 0 0">Use your school email (like 30yua@tesdk12.net). Your name is set from it automatically.</p>' : ''}
  ${mode !== 'reset' ? `<label for="pw">Password</label><input id="pw" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" minlength="8">` : ''}
  ${HCAPTCHA_SITE_KEY ? '<div id="cf" class="cf-wrap" aria-label="Security check"></div>' : ''}
  <p class="err" id="er" role="alert"></p><button class="btn" id="go">${{ login: 'Log in', signup: 'Create account', reset: 'Send reset link' }[mode]}</button>
  <p style="text-align:center;margin:1rem 0 0">${mode === 'login' ? `<button type="button" class="linkbtn" data-m="signup">Create an account</button>` : `<button type="button" class="linkbtn" data-m="login">Back to log in</button>`}</p></form></div>`;
  root.querySelectorAll('[data-m]').forEach(b => b.onclick = () => authView(b.dataset.m));
  const bound = boundEmail();
  if (bound && mode === 'login') $('#em').value = bound;
  if (authNotice) { $('#er').textContent = authNotice; authNotice = ''; }
  let cfToken = '', cfId = null;
  const cfReset = () => { cfToken = ''; try { if (cfId !== null) window.hcaptcha.reset(cfId); } catch {} };
  const cfErr = m => { const er = $('#er'); if (er) { er.style.color = ''; er.textContent = m; } };
  const WRONG = 'The security check is set up wrong (site key or allowed domain). Tell the site owner.';
  const MISSING = 'The "I am human" box did not load. Either your network is blocking hcaptcha.com, or this website address is not added to the site in the hCaptcha dashboard. Reload the page; if the box is still missing, tell the site owner.';
  if (HCAPTCHA_SITE_KEY) setTimeout(() => { const box = $('#cf'); if (box && !box.querySelector('iframe')) { const m = document.createElement('p'); m.className = 'err'; m.textContent = MISSING; box.append(m); } }, 6000);
  if (HCAPTCHA_SITE_KEY) loadHcaptcha().then(hc => { if (!$('#cf')) return; cfId = hc.render($('#cf'), { sitekey: HCAPTCHA_SITE_KEY, theme: document.documentElement.dataset.theme === 'light' ? 'light' : 'dark', size: innerWidth < 380 ? 'compact' : 'normal',
    callback: t => { cfToken = t; }, 'expired-callback': () => { cfToken = ''; }, 'chalexpired-callback': () => { cfToken = ''; },
    'error-callback': code => { cfToken = ''; cfErr(code === 'invalid-data' || code === 'internal-error' ? WRONG : code === 'network-error' ? 'Could not reach the security check. Check your connection, then reload.' : 'The security check had a problem. Reload the page and try again.'); } }); })
    .catch(e => cfErr(e?.message === 'load' ? 'Could not load the security check. Check your connection, or try a different network, then reload.' : 'The security check could not start (' + (e?.message || 'unknown error') + '). Tell the site owner.'));
  loadMaint().then(authMaintNote).catch(() => {});   // tell people about maintenance before they log in (the owner can still log in)
  $('#af').onsubmit = async e => {
    e.preventDefault(); const er = $('#er'), go = $('#go'); er.textContent = '';
    const email = $('#em').value.trim().toLowerCase(), pw = $('#pw')?.value || '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return er.textContent = 'Enter a valid email address.';
    if (!/^[0-9]{2}[a-z]{2,}[0-9]*@tesdk12\.net$/.test(email)) return er.textContent = 'Use your school email, like 30yua@tesdk12.net.';
    if (HCAPTCHA_SITE_KEY && !cfToken) return er.textContent = $('#cf iframe') ? 'Tick the "I am human" box above first, then press the button again.' : MISSING;
    go.disabled = true;
    const captchaToken = cfToken || undefined;
    try {
      if (mode === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname, captchaToken });
        if (error) throw error; er.style.color = 'var(--ok)'; er.textContent = 'If that email has an account, a reset link is on its way.';
      } else if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw, options: { captchaToken } }); if (error) throw error;
      } else {
        if (pw.length < 8) throw new Error('Password must be at least 8 characters.');
        const chk = await sb.rpc('signup_email_problem', { p_email: email });   // no confirmation email, so check the address against the approved list first
        if (!chk.error && chk.data) throw new Error(chk.data);
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { data: { device_id: deviceId() }, emailRedirectTo: location.origin + location.pathname, captchaToken } });
        if (error) throw error;
        if (!data.session) { er.style.color = 'var(--ok)'; er.textContent = 'Check your email to confirm your account, then log in.'; }
      }
    } catch (x) { er.style.color = ''; er.textContent = x.message || 'Something went wrong. Check your connection and try again.'; }
    cfReset(); go.disabled = false;
  };
}
function recoveryView() {
  root.innerHTML = `<div class="authwrap"><form class="card" id="rf">${logo}<h1>Choose a new password</h1><label for="np">New password</label><input id="np" type="password" minlength="8" autocomplete="new-password"><p class="err" id="er"></p><button class="btn">Save password</button></form></div>`;
  $('#rf').onsubmit = async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: $('#np').value }); if (error) $('#er').textContent = error.message; else { toast('Password updated'); location.hash = ''; startApp((await sb.auth.getSession()).data.session, true); } };
}

/* ───────── notifications: sound + banners ─────────
   Sound is synthesised in the browser (no audio files). It plays while Orbit is open in any tab, including a background one.
   Desktop banners use the browser's Notification API once the person allows it. */
const SND_KEY = 'chatter-sound-muted', ALL_KEY = 'chatter-notify-all', ASK_KEY = 'chatter-asked-notify';
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
let soundMuted = lsGet(SND_KEY) === '1', actx = null;
const unlockAudio = () => { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {} };
['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlockAudio, { passive: true }));
function ding(kind, force) {
  if ((soundMuted && !force) || !actx) return;
  try {
    if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime, notes = kind === 'announce' ? [659, 784, 988] : [880, 1175];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain(), t = t0 + i * 0.13;
      o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.start(t); o.stop(t + 0.3);
    });
  } catch {}
}
const NOTE_ICON = 'icon-192.png';
const _tabLogo = new Image(); _tabLogo.src = 'logo.svg';
function banner(title, body, fn) {
  const t = document.createElement('div'); t.className = 'toast banner'; t.tabIndex = 0; t.setAttribute('role', 'button');
  t.innerHTML = `<b>${esc(title)}</b><div>${esc(String(body || '').slice(0, 140))}</div>`;
  const go = () => { t.remove(); fn?.(); };
  t.onclick = go; t.onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#toasts').append(t); setTimeout(() => t.remove(), 7000);
}
/* ───────── tab icon badge: a red number on the page-tab logo counts new messages that arrive while Orbit is in the background ───────── */
let _tabN = 0, _tabBase = null, _tabTitle = null;
function tabBadge(add) {   // add = how many to add; 0 clears the badge
  _tabN = add ? Math.min(_tabN + add, 999) : 0;
  const old = document.querySelector('link[rel~="icon"]'); if (_tabBase === null) { _tabBase = old?.href || ''; _tabTitle = document.title; }
  document.title = _tabN ? `(${_tabN > 99 ? '99+' : _tabN}) ${_tabTitle}` : _tabTitle;
  const link = document.createElement('link'); link.rel = 'icon';
  if (!_tabN) link.href = _tabBase;
  else {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#05103f'; x.beginPath(); if (x.roundRect) x.roundRect(0, 0, 64, 64, 15); else x.rect(0, 0, 64, 64); x.fill();
    if (_tabLogo.complete && _tabLogo.naturalWidth) x.drawImage(_tabLogo, 0, 0, 64, 64);
    const t = _tabN > 9 ? '9+' : String(_tabN), r = 21;   // iOS-style red badge, top right
    x.beginPath(); x.arc(64 - r, r, r, 0, Math.PI * 2); x.fillStyle = '#ff3b30'; x.fill(); x.lineWidth = 3; x.strokeStyle = '#fff'; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold ${t.length > 1 ? 24 : 30}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`; x.fillText(t, 64 - r, r + 2);
    link.href = c.toDataURL('image/png');
  }
  document.querySelectorAll('link[rel~="icon"]').forEach(l => l.remove()); document.head.append(link);
}
addEventListener('focus', () => tabBadge(0));
document.addEventListener('visibilitychange', () => { if (!document.hidden) tabBadge(0); });
async function osNotify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return false;
  const opts = { body: String(body || '').slice(0, 140), tag, renotify: true, silent: true, icon: NOTE_ICON, badge: NOTE_ICON };  // silent: Orbit plays its own (mutable) sound
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg?.showNotification) { await reg.showNotification(title, opts); return true; } } catch {}
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); n.close(); }; return true; } catch { return false; }
}
function notifyKind(m) {
  if (!S.me || m.author_id === S.me.id || S.me.status === 'dnd' || m.is_system) return null;
  if (m.conversation_id) return 'dm';
  const ch = S.chans.find(x => x.id === m.channel_id); if (!ch) return null;
  if (ch.owner_only) return 'announce';
  if (lsGet(ALL_KEY) !== '0') return 'msg';   // on by default for everyone; only an explicit opt-out ('0') turns it off
  return mentionsMe(m) ? 'mention' : null;
}
async function notifyMsg(m) {
  const kind = notifyKind(m); if (!kind) return;
  const focused = document.hasFocus() && !document.hidden;
  if (!focused) tabBadge(1);
  if (focused && (m.conversation_id ? S.view === 'dm' && S.active === m.conversation_id : S.view === 'server' && S.active === m.channel_id)) return;
  await needProfiles([m.author_id]);
  const who = prof(m.author_id).display_name, ch = S.chans.find(x => x.id === m.channel_id);
  const text = plain(m.content || '').trim() || (m.has_poll ? 'Started a poll' : m.attachments?.length ? 'Sent an attachment' : '');
  const cv = m.conversation_id && S.convs.find(c => c.id === m.conversation_id), title = kind === 'dm' ? (cv?.is_group ? `${who} in ${convName(cv)}` : who) : kind === 'announce' ? '📢 Announcement from ' + who : `${who} in #${ch?.name}`;
  const open = async () => {
    window.focus();
    if (m.conversation_id) { if (!S.convs.some(c => c.id === m.conversation_id)) await loadConvs(); S.view = 'dm'; renderSide(); openConv(m.conversation_id); }
    else { S.view = 'server'; openChan(m.channel_id); }
  };
  ding(kind === 'announce' ? 'announce' : 'msg');
  if (focused) return banner(title, text, open);
  if (!(await osNotify(title, text, m.conversation_id || m.channel_id))) banner(title, text, open);
}
function askNotify() {
  if (!('Notification' in window) || Notification.permission !== 'default' || lsGet(ASK_KEY)) return;
  lsSet(ASK_KEY, '1');
  const t = document.createElement('div'); t.className = 'toast banner';
  t.innerHTML = '<b>Turn on desktop notifications?</b><div class="muted">Get a banner and a sound for new messages, even when Orbit is in the background.</div><div class="tb"><button class="btn sm" data-y>Turn on</button><button class="btn ghost sm" data-n>Not now</button></div>';
  t.querySelector('[data-y]').onclick = async () => { t.remove(); try { await Notification.requestPermission(); } catch {} };
  t.querySelector('[data-n]').onclick = () => t.remove();
  $('#toasts').append(t);
}
function toggleSound() {
  soundMuted = !soundMuted; lsSet(SND_KEY, soundMuted ? '1' : '0'); unlockAudio();
  if (!soundMuted) ding('msg');
  renderSide(); toast(soundMuted ? 'Notification sounds muted' : 'Notification sounds on');
}
function notifyBind(bg) {
  const st = $('#nst', bg), en = $('#nen', bg), all = $('#nall', bg);
  const draw = () => { const p = 'Notification' in window ? Notification.permission : 'unsupported'; st.textContent = p === 'granted' ? 'on' : p === 'denied' ? 'blocked in your browser settings' : p === 'unsupported' ? 'not supported here' : 'off'; en.hidden = p !== 'default'; };
  draw(); en.onclick = async () => { try { await Notification.requestPermission(); } catch {} draw(); };
  all.checked = lsGet(ALL_KEY) !== '0'; all.onchange = () => lsSet(ALL_KEY, all.checked ? '1' : '0');
  $('#nsnd', bg).onclick = () => { unlockAudio(); setTimeout(() => ding('msg', true), 50); };
}

/* ───────── voice + video channels ─────────
   Live voice, camera and screen sharing are peer-to-peer (WebRTC). Supabase Realtime only carries the connection set-up messages and
   who-is-in-which-channel (plus who has a camera, screen share or mute on). Audio and video never touch the database.
   Mesh calls work well for small groups: about 6-8 people for voice, about 4-5 once several cameras are on.
   Every connection has three fixed lanes: 0 = microphone, 1 = camera, 2 = screen share. Turning a camera or screen share on or off
   just swaps the track in its lane, so it never needs a new negotiation. */
const V = { ch: null, stream: null, sig: null, pres: null, peers: new Map(), muted: false, deaf: false, cam: null, scr: null, focus: undefined, eff: null, tiles: new Map(), ro: null };
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, ...(Array.isArray(CONFIG.TURN_SERVERS) ? CONFIG.TURN_SERVERS : [])] };   // TURN_SERVERS (config.js) is the relay that connects people STUN alone cannot
const mediaErr = (e, what) => e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? `No ${what} found. Plug one in, then try again.`
  : e?.name === 'NotReadableError' || e?.name === 'AbortError' ? `Your ${what} is being used by another app or tab. Close it, then try again.`
  : `${what[0].toUpperCase() + what.slice(1)} blocked. Allow it in the address bar, then try again.`;
// if the browser refuses to start someone's voice (autoplay rules), try again on their next click or tap
const playAudio = a => a.play().catch(() => addEventListener('pointerdown', () => { a.play().catch(() => {}); SPK.ctx?.resume?.().catch(() => {}); }, { once: true, capture: true }));
const vsend = (to, msg) => V.sig?.send({ type: 'broadcast', event: 'sig', payload: { ch: V.ch, from: S.me.id, to, ...msg } });
const vmeta = () => ({ ch: V.ch, cam: !!V.cam, scr: !!V.scr, mu: V.muted || V.deaf, n: S.me?.display_name || '' });   // what everyone sees about you in the channel list
const pubState = () => { if (V.ch && V.pres) Promise.resolve(V.pres.track(vmeta())).catch(() => {}); };
const stageRefresh = () => { if (S.view === 'call' && V.ch) syncStage(); };
function applyVoiceState() { V.stream?.getAudioTracks().forEach(t => { t.enabled = !(V.muted || V.deaf); }); V.peers.forEach(p => { p.audio.muted = V.deaf; }); }
function toggleMute() { if (V.muted || V.deaf) { V.muted = false; V.deaf = false; } else V.muted = true; applyVoiceState(); pubState(); renderSide(); renderControls(); stageRefresh(); }
function toggleDeaf() { V.deaf = !V.deaf; applyVoiceState(); pubState(); renderSide(); renderControls(); stageRefresh(); }

/* who is talking: a small analyser per audio stream, polled a few times a second */
const SPK = { ctx: null, nodes: new Map(), on: new Set(), timer: 0 };
function watchVoice(key, stream) {
  try {
    unwatchVoice(key);
    SPK.ctx = SPK.ctx || new (window.AudioContext || window.webkitAudioContext)(); SPK.ctx.resume?.().catch(() => {});
    const an = SPK.ctx.createAnalyser(); an.fftSize = 512;
    const src = SPK.ctx.createMediaStreamSource(stream); src.connect(an);
    SPK.nodes.set(key, { an, src, buf: new Uint8Array(an.fftSize), last: 0 });
    if (!SPK.timer) SPK.timer = setInterval(pollSpeak, 140);
  } catch {}
}
function unwatchVoice(key) { const n = SPK.nodes.get(key); if (!n) return; try { n.src.disconnect(); } catch {} SPK.nodes.delete(key); SPK.on.delete(key); if (!SPK.nodes.size && SPK.timer) { clearInterval(SPK.timer); SPK.timer = 0; } }
function pollSpeak() {
  const now = Date.now(); let changed = false;
  SPK.nodes.forEach((n, key) => {
    n.an.getByteTimeDomainData(n.buf);
    let sum = 0; for (const v of n.buf) { const d = (v - 128) / 128; sum += d * d; }
    const loud = Math.sqrt(sum / n.buf.length) > 0.035 && !(key === S.me?.id && (V.muted || V.deaf));
    if (loud) n.last = now;
    const talking = now - n.last < 350;
    if (talking !== SPK.on.has(key)) { talking ? SPK.on.add(key) : SPK.on.delete(key); changed = true; }
  });
  if (changed) applySpeak();
}
const applySpeak = () => V.tiles.forEach((o, k) => o.el.classList.toggle('speak', o.kind === 'user' && SPK.on.has(k)));

/* peer connections */
const capRate = (sender, bps) => { try { const prm = sender.getParameters(); if (!prm.encodings?.length) prm.encodings = [{}]; prm.encodings[0].maxBitrate = bps; sender.setParameters(prm).catch(() => {}); } catch {} };
function attachLocal(p) {
  const put = (tx, stream, bps) => { if (!tx) return; const t = stream?.getVideoTracks()[0] || null; tx.sender.replaceTrack(t).then(() => { if (t) capRate(tx.sender, bps); }).catch(() => {}); };
  put(p.camTx, V.cam, 900e3); put(p.scrTx, V.scr, 2.5e6);
}
function makePeer(uid) {
  const pc = new RTCPeerConnection(ICE), audio = new Audio(), p = { pc, audio, queue: [], cam: null, scr: null, camTx: null, scrTx: null };
  audio.autoplay = true; audio.muted = V.deaf; V.peers.set(uid, p);
  V.stream.getTracks().forEach(t => pc.addTrack(t, V.stream));
  pc.onicecandidate = e => { if (e.candidate) vsend(uid, { type: 'ice', d: e.candidate.toJSON() }); };
  pc.ontrack = e => {
    const lane = pc.getTransceivers().indexOf(e.transceiver);
    if (lane === 1 || lane === 2) {
      p[lane === 1 ? 'cam' : 'scr'] = new MediaStream([e.track]);
      e.track.onunmute = e.track.onmute = stageRefresh; stageRefresh(); return;
    }
    audio.srcObject = e.streams[0]; playAudio(audio); watchVoice(uid, e.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    if (V.peers.get(uid) !== p) return;
    if (pc.connectionState === 'connected') attachLocal(p);   // re-apply now that bitrate limits can be set
    if (pc.connectionState === 'failed') { dropPeer(uid); setTimeout(onVoiceSync, 1500); }
    else if (pc.connectionState === 'disconnected') setTimeout(() => { if (V.peers.get(uid) === p && pc.connectionState === 'disconnected') { dropPeer(uid); onVoiceSync(); } }, 6000);
    renderVoicePanel();
  };
  return p;
}
function dropPeer(uid) { const p = V.peers.get(uid); if (!p) return; V.peers.delete(uid); try { p.pc.close(); } catch {} p.audio.srcObject = null; p.cam = p.scr = null; unwatchVoice(uid); stageRefresh(); }
async function startPeer(uid) {
  const p = makePeer(uid);
  p.camTx = p.pc.addTransceiver('video', { direction: 'sendrecv' }); p.scrTx = p.pc.addTransceiver('video', { direction: 'sendrecv' }); attachLocal(p);
  try { const o = await p.pc.createOffer(); await p.pc.setLocalDescription(o); vsend(uid, { type: 'offer', d: p.pc.localDescription.toJSON() }); } catch { dropPeer(uid); }
}
const flushIce = async p => { for (const c of p.queue.splice(0)) await p.pc.addIceCandidate(c).catch(() => {}); };
async function onSig(m) {
  if (!V.ch || !m || m.ch !== V.ch || m.to !== S.me?.id || !m.from) return;
  try {
    if (m.type === 'offer') {
      dropPeer(m.from); const p = makePeer(m.from);
      await p.pc.setRemoteDescription(m.d); await flushIce(p);
      const tx = p.pc.getTransceivers(); p.camTx = tx[1] || null; p.scrTx = tx[2] || null;   // lanes 1 and 2 were created by the caller's offer
      [p.camTx, p.scrTx].forEach(t => { if (t) t.direction = 'sendrecv'; }); attachLocal(p);
      const a = await p.pc.createAnswer(); await p.pc.setLocalDescription(a); vsend(m.from, { type: 'answer', d: p.pc.localDescription.toJSON() });
    } else if (m.type === 'answer') { const p = V.peers.get(m.from); if (p) { await p.pc.setRemoteDescription(m.d); await flushIce(p); } }
    else if (m.type === 'ice') { const p = V.peers.get(m.from); if (p) { if (p.pc.remoteDescription) await p.pc.addIceCandidate(m.d).catch(() => {}); else p.queue.push(m.d); } }
  } catch (e) { console.warn('voice signal failed', e); }
  renderVoicePanel();
}
function onVoiceSync() {
  if (!V.pres || !S.me) return;
  const users = new Map(), meta = new Map();
  for (const [uid, metas] of Object.entries(V.pres.presenceState())) { const m = metas[metas.length - 1], ch = m?.ch; if (ch) { if (!users.has(ch)) users.set(ch, []); users.get(ch).push(uid); meta.set(uid, m); } }
  S.voiceUsers = users; S.voiceMeta = meta;
  if (V.ch && V.sig) {
    const here = users.get(V.ch) || [];
    [...V.peers.keys()].forEach(uid => { if (!here.includes(uid)) dropPeer(uid); });
    here.forEach(uid => { if (uid !== S.me.id && !V.peers.has(uid) && S.me.id < uid) startPeer(uid); });   // the lower id always makes the offer, so two people never collide
  }
  stageRefresh(); renderSide();
  needProfiles([...users.values()].flat()).then(() => { renderSide(); stageRefresh(); });
}
async function joinVoice(id) {   // one join at a time, so a second click while the mic prompt is open cannot leave a microphone running
  if (V.ch === id || V.joining) return;
  V.joining = true;
  try { await joinVoiceNow(id); } finally { V.joining = false; }
}
async function joinVoiceNow(id) {
  if (V.ch) await leaveVoice(true);
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) return toast('This browser or page cannot use the microphone (it needs HTTPS).', true);
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }); }
  catch (e) { return toast(mediaErr(e, 'microphone'), true); }
  V.ch = id; V.stream = stream; V.focus = undefined; applyVoiceState(); watchVoice(S.me.id, stream); renderSide();
  stream.getAudioTracks()[0].onended = () => { if (V.stream === stream) { toast('Your microphone disconnected, so you left the call. Rejoin once it is back.', true); leaveVoice(); } };
  V.sig = sb.channel('vsig:' + id).on('broadcast', { event: 'sig' }, ({ payload }) => onSig(payload))
    .subscribe(async st => {
      if (st === 'SUBSCRIBED' && V.ch === id) { await V.pres.track(vmeta()); onVoiceSync(); }
      else if ((st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') && V.ch === id) toast('Voice connection problem. Leave and rejoin the channel.', true);
    });
}
function clearTiles() { V.ro?.disconnect(); V.ro = null; V.tiles.forEach(o => { o.video.srcObject = null; o.el.remove(); }); V.tiles.clear(); }
async function leaveVoice(quiet) {
  if (!V.ch && !V.stream) return;
  [...V.peers.keys()].forEach(dropPeer);
  [V.stream, V.cam, V.scr].forEach(s => s?.getTracks().forEach(t => t.stop())); V.stream = V.cam = V.scr = null; V.focus = undefined;
  [...SPK.nodes.keys()].forEach(unwatchVoice); clearTiles();
  if (V.sig) { sb.removeChannel(V.sig); V.sig = null; }
  V.ch = null; try { await V.pres?.untrack(); } catch {}
  if (quiet) return;
  if (S.view === 'call') { S.view = 'server'; return void (S.ch ? openChan(S.ch.id) : renderAll()); }   // hung up from the call screen: back to the chat
  renderSide();
}
function renderVoicePanel() {
  stageRefresh();
  const el = $('#vp'); if (!el || !V.ch) return;
  const live = [...V.peers.values()].filter(p => p.pc.connectionState === 'connected').length, n = (S.voiceUsers.get(V.ch) || []).length;
  $('small', el).textContent = `${vname(S.chans.find(c => c.id === V.ch)?.name || 'voice')} · ${n > 1 ? `${live}/${n - 1} connected` : 'waiting for others'}`;
}
const voiceRow = c => {
  const users = S.voiceUsers.get(c.id) || [], on = V.ch === c.id;
  return `<button class="ch ${on ? 'on' : ''}" data-vc="${c.id}" title="${on ? 'Open call' : 'Join voice'}">${ic('voice', 18)}<span>${esc(vname(c.name))}</span>${users.length ? `<span class="pill">${users.length}</span>` : ''}</button>${users.map(u => { const p = prof(u), m = S.voiceMeta.get(u) || {}, nm = p.username === 'unknown' && m.n ? m.n : p.display_name; return `<div class="vuser" title="${esc(nm)} is in this voice channel">${av(p)}<span class="vn">${esc(nm)}${u === S.me.id ? ' (you)' : ''}</span>${m.scr ? '<em class="live">Live</em>' : m.cam ? `<span class="vcam" title="Camera on">${ic('video', 14)}</span>` : ''}${m.mu ? `<span class="vcam" title="Muted">${ic('micOff', 14)}</span>` : ''}</div>`; }).join('')}`;
};

/* camera + screen share */
function syncLocalVideo() { V.peers.forEach(attachLocal); pubState(); renderControls(); stageRefresh(); }
function stopCam() { V.cam?.getTracks().forEach(t => t.stop()); V.cam = null; syncLocalVideo(); }
function stopScr() { V.scr?.getTracks().forEach(t => t.stop()); V.scr = null; syncLocalVideo(); }
async function toggleCam() {
  if (!V.ch) return;
  if (V.cam) return stopCam();
  if (!navigator.mediaDevices?.getUserMedia) return toast('This browser or page cannot use the camera (it needs HTTPS).', true);
  let s; try { s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } }, audio: false }); }
  catch (e) { return toast(mediaErr(e, 'camera'), true); }
  if (!V.ch || V.cam) { s.getTracks().forEach(t => t.stop()); return; }   // left the call while the prompt was open
  const t = s.getVideoTracks()[0]; t.contentHint = 'motion'; t.onended = () => { if (V.cam === s) stopCam(); };
  V.cam = s; syncLocalVideo();
}
async function toggleScr() {
  if (!V.ch) return;
  if (V.scr) return stopScr();
  if (!navigator.mediaDevices?.getDisplayMedia) return toast('This browser cannot share your screen.', true);
  let s; try { s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false }); } catch (e) { if (e && e.name !== 'NotAllowedError') toast('Could not start screen sharing. Try again.', true); return; }   // closing the picker is not an error
  if (!V.ch || V.scr) { s.getTracks().forEach(t => t.stop()); return; }
  const t = s.getVideoTracks()[0]; t.contentHint = 'detail'; t.onended = () => { if (V.scr === s) stopScr(); };   // the browser's own "Stop sharing" bar ends it too
  V.scr = s; syncLocalVideo();
}

/* call screen: a grid of tiles (camera, or avatar when the camera is off); a screen share takes the big spot */
function openCall() { if (!V.ch) return; S.view = 'call'; renderAll(); }
function renderCall(main) {
  if (!V.ch) { main.innerHTML = `<div class="top">${menuBtn()}<b class="title">Voice</b></div><div class="empty"><h2>You are not in a call</h2><p>Pick a voice channel from the list to join it.</p></div>`; bindMenu(); return; }
  const name = vname(S.chans.find(c => c.id === V.ch)?.name || 'voice');
  main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('voice', 22)}</span><b class="title">${esc(name)}</b><span class="chip" id="cn"></span></div>
  <div class="callbody" id="callbody"><div class="stage" id="stage"><div class="sp-main" id="spm"></div><div class="grid" id="grd"></div><div class="sp-strip" id="sps"></div><p class="hint" id="sh" hidden>You are the only one here. People who join this channel will show up here.</p></div><div class="wbpane" id="wbpane" hidden></div></div>
  <div class="callbar" id="cb"></div>`;
  bindMenu(); renderControls(); O.wbMount(); syncStage();
  V.ro?.disconnect(); V.ro = new ResizeObserver(layoutStage); V.ro.observe($('#stage'));
}
function renderControls() {
  const cb = $('#cb'); if (!cb) return;
  const off = V.muted || V.deaf;
  const b = (id, cls, icon, title, label, pressed) => `<button class="cbtn ${cls}" id="${id}" title="${title}" aria-label="${label}" aria-pressed="${pressed}">${ic(icon, 22)}</button>`;
  cb.innerHTML = b('cmic', off ? 'bad' : '', off ? 'micOff' : 'mic', off ? 'Unmute microphone' : 'Mute microphone', 'Mute microphone', off)
    + b('ccam', V.cam ? 'on' : '', V.cam ? 'video' : 'videoOff', V.cam ? 'Turn off camera' : 'Turn on camera', 'Camera', !!V.cam)
    + b('cwb', O.wbIsOpen() ? 'on' : '', 'brush', O.wbIsOpen() ? 'Close whiteboard' : 'Open whiteboard', 'Whiteboard', O.wbIsOpen())
    + (navigator.mediaDevices?.getDisplayMedia ? b('cscr', V.scr ? 'on' : '', 'screen', V.scr ? 'Stop sharing your screen' : 'Share your screen', 'Share screen', !!V.scr) : '')
    + b('chang', 'hang', 'phoneOff', 'Leave call', 'Leave call', false).replace(' aria-pressed="false"', '');
  $('#cmic').onclick = toggleMute; $('#ccam').onclick = toggleCam; $('#cwb').onclick = () => { O.wbToggle(); renderControls(); }; $('#cscr')?.addEventListener('click', toggleScr); $('#chang').onclick = () => leaveVoice();
}
function stageTiles() {
  const ids = [...new Set([S.me.id, ...(S.voiceUsers.get(V.ch) || [])])], list = [];
  const live = (s, on) => { const t = on && s?.getVideoTracks()[0]; return t && !t.muted ? s : null; };
  for (const uid of ids) {
    const me = uid === S.me.id, m = me ? { cam: !!V.cam, scr: !!V.scr, mu: V.muted || V.deaf } : S.voiceMeta.get(uid) || {}, p = V.peers.get(uid);
    list.push({ key: uid, uid, me, kind: 'user', mu: !!m.mu, stream: me ? V.cam : live(p?.cam, m.cam) });
    const scr = me ? V.scr : live(p?.scr, m.scr);
    if (scr) list.push({ key: uid + ':s', uid, me, kind: 'screen', mu: false, stream: scr });
  }
  return list;
}
function mkTile(t) {
  const el = document.createElement('div'); el.className = 'tile'; el.tabIndex = 0; el.setAttribute('role', 'button'); el.title = 'Click to focus this tile';
  el.innerHTML = `<video autoplay playsinline muted></video><div class="tav"></div><span class="tname"></span><span class="tmic" title="Muted" hidden>${ic('micOff', 14)}</span><button class="tfs" title="Full screen" aria-label="Full screen">${ic('expand', 16)}</button>`;
  const o = { el, kind: t.kind, video: $('video', el), tav: $('.tav', el), tname: $('.tname', el), tmic: $('.tmic', el), sig: '' };
  el.onclick = e => { if (!e.target.closest('.tfs')) pinTile(el.dataset.k); };
  el.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); pinTile(el.dataset.k); } };
  $('.tfs', el).onclick = () => { try { (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.())?.catch?.(() => {}); } catch {} };
  V.tiles.set(t.key, o); return o;
}
function pinTile(key) { V.focus = V.eff === key ? null : key; syncStage(); }   // click a tile to enlarge it, click it again to go back to the grid
function syncStage() {
  const stage = $('#stage'); if (!stage || !V.ch) return;
  const list = stageTiles(), keys = new Set(list.map(t => t.key));
  V.tiles.forEach((o, k) => { if (!keys.has(k)) { o.video.srcObject = null; o.el.remove(); V.tiles.delete(k); } });
  let f = V.focus; if (f && !keys.has(f)) f = V.focus = undefined;
  if (f === undefined) f = list.find(t => t.kind === 'screen')?.key || null;   // a screen share is enlarged automatically
  V.eff = f; stage.classList.toggle('spot', !!f);
  const grd = $('#grd'), spm = $('#spm'), sps = $('#sps'), at = new Map([[grd, 0], [spm, 0], [sps, 0]]);
  list.forEach(t => {
    const o = V.tiles.get(t.key) || mkTile(t), p = prof(t.uid), scr = t.kind === 'screen';
    const sig = [p.display_name, p.avatar_url, p.avatar_color, t.me, t.kind].join('|');
    if (o.sig !== sig) {
      o.sig = sig; o.kind = t.kind; o.el.style.setProperty('--tc', p.avatar_color || '#5865f2');
      o.tav.innerHTML = scr ? '' : av(p); o.tname.textContent = scr ? (t.me ? 'Your screen' : p.display_name + '’s screen') : p.display_name + (t.me ? ' (you)' : '');
    }
    o.el.dataset.k = t.key; o.el.classList.toggle('me', t.me); o.el.classList.toggle('scr', scr); o.el.classList.toggle('big', t.key === f); o.el.classList.toggle('hasvid', !!t.stream);
    o.tmic.hidden = !t.mu;
    if ((o.video.srcObject || null) !== (t.stream || null)) { o.video.srcObject = t.stream || null; if (t.stream) o.video.play().catch(() => {}); }
    const target = f ? (t.key === f ? spm : sps) : grd, i = at.get(target); at.set(target, i + 1);
    if (target.children[i] !== o.el) target.insertBefore(o.el, target.children[i] || null);
  });
  const people = list.filter(t => t.kind === 'user').length;
  $('#cn').textContent = people + (people === 1 ? ' person' : ' people'); $('#sh').hidden = people > 1 || list.length > 1;
  applySpeak(); layoutStage();
}
function layoutStage() {   // pick the biggest 16:9 tile size that fits every tile on screen
  const grd = $('#grd'); if (!grd || $('#stage')?.classList.contains('spot')) return;
  const n = grd.children.length, W = grd.clientWidth, H = grd.clientHeight, gap = 8; if (!n || !W || !H) return;
  let best = 0; for (let c = 1; c <= n; c++) { const r = Math.ceil(n / c); best = Math.max(best, Math.min((W - gap * (c - 1)) / c, (H - gap * (r - 1)) / r * 16 / 9)); }
  grd.style.setProperty('--tw', Math.max(110, Math.floor(best)) + 'px');
}

/* ───────── attachments ───────── */
const ATT_OK = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/plain|application\/zip|audio\/(mpeg|ogg|wav|webm|mp4)|video\/(mp4|webm))$/;
const ATT_FIX = { 'application/x-zip-compressed': 'application/zip', 'audio/x-wav': 'audio/wav', 'audio/mp3': 'audio/mpeg' };
const MAX_FILE = 50 * 1024 * 1024, MAX_FILES = 5, URLS = new Map();
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const cachedUrl = path => { const e = URLS.get(path); return e && e.exp > Date.now() + 6e4 ? e.url : ''; };
function clearPending() { S.pending.forEach(p => p.url && URL.revokeObjectURL(p.url)); S.pending = []; }
function addFiles(files) {
  for (const f of files) {
    if (S.pending.length >= MAX_FILES) { toast(`You can attach up to ${MAX_FILES} files per message.`, true); break; }
    if (f.size > MAX_FILE) { toast(`${f.name} is over 50 MB.`, true); continue; }
    const type = ATT_FIX[f.type] || f.type;
    if (!ATT_OK.test(type)) { toast(`${f.name}: that file type isn't allowed.`, true); continue; }
    if (isVidCh() && !type.startsWith('video/')) { toast(`${f.name}: #tutorials only takes videos (mp4 or webm).`, true); continue; }
    S.pending.push({ file: f, name: f.name || 'file', type, size: f.size, url: type.startsWith('image/') ? URL.createObjectURL(f) : null });
  }
  renderPending();
}
function renderPending() {
  const pf = $('#pf'); if (!pf) return; pf.hidden = !S.pending.length;
  pf.innerHTML = S.pending.map((p, i) => `<div class="pfile">${p.url ? `<img src="${p.url}" alt="">` : ic('file', 18)}<span>${esc(p.name)}<small>${fmtSize(p.size)}</small></span><button type="button" class="ib sm" data-rmf="${i}" aria-label="Remove ${esc(p.name)}">${ic('x', 14)}</button></div>`).join('');
  pf.querySelectorAll('[data-rmf]').forEach(b => b.onclick = () => { const [r] = S.pending.splice(+b.dataset.rmf, 1); if (r?.url) URL.revokeObjectURL(r.url); renderPending(); });
}
async function uploadFiles(files, scope) {
  const out = [];
  try {
    for (const f of files) {
      const safe = f.name.normalize('NFKD').replace(/[^\w.\-]+/g, '_').slice(-80) || 'file';
      const path = `${scope}/${S.me.id}/${crypto.randomUUID()}-${safe}`;
      const { error } = await sb.storage.from('attachments').upload(path, f.file, { contentType: f.type, cacheControl: '3600', upsert: false });
      if (error) throw error;
      out.push({ path, name: f.name.slice(0, 120), type: f.type, size: f.size });
    }
  } catch (e) { if (out.length) sb.storage.from('attachments').remove(out.map(o => o.path)); throw e; }
  return out;
}
function attItem(f) {
  const u = cachedUrl(f.path), t = String(f.type || ''), n = esc(f.name || 'file'), p = esc(f.path), src = u ? ` src="${esc(u)}"` : '', href = u ? ` href="${esc(u)}"` : '';
  if (t.startsWith('image/')) return `<span class="attwrap"><a class="att img" data-att="${p}"${href} target="_blank" rel="noopener noreferrer"><img data-att-src="${p}" alt="${n}" loading="lazy"${src}></a>${t === 'image/gif' ? '' : `<button type="button" class="togif" data-a="togif" data-p="${p}" data-n="${n}" title="Turn this picture into a GIF" aria-label="Turn this picture into a GIF">GIF</button>`}</span>`;
  if (t.startsWith('audio/')) return `<div class="att aud"><span>${ic('mic', 16)} ${n}</span><audio controls preload="none" data-att-src="${p}"${src}></audio></div>`;
  if (t.startsWith('video/')) return `<video class="att vid" controls preload="metadata" data-att-src="${p}"${src}></video>`;
  return `<a class="att file" data-att="${p}"${href} target="_blank" rel="noopener noreferrer">${ic('file', 20)}<span>${n}<small>${fmtSize(f.size || 0)}</small></span></a>`;
}
const attHtml = m => Array.isArray(m.attachments) && m.attachments.length ? `<div class="atts">${m.attachments.map(attItem).join('')}</div>` : '';
async function hydrateAtts(root) {
  const els = [...root.querySelectorAll('[data-att-src], a.att[data-att]')];
  const need = [...new Set(els.map(e => e.dataset.attSrc || e.dataset.att).filter(p => p && !cachedUrl(p)))];
  if (need.length) {
    const { data, error } = await sb.storage.from('attachments').createSignedUrls(need, 3600); if (error) return;
    (data || []).forEach(d => { if (d.signedUrl) URLS.set(d.path, { url: d.signedUrl, exp: Date.now() + 3600e3 }); });
  }
  els.forEach(e => { const u = cachedUrl(e.dataset.attSrc || e.dataset.att); if (!u) return; if (e.hasAttribute('data-att-src')) { if (e.getAttribute('src') !== u) e.setAttribute('src', u); } else e.setAttribute('href', u); });
}

/* picture viewer: clicking a picture in chat opens it right here (arrows / swipe-free: ← → keys and buttons, Esc or click outside to close).
   Ctrl/Cmd/Shift-click and middle-click still open the normal new tab. Other files still download in their own tab. */
let PV = null;
function closePicView() { if (!PV) return; document.removeEventListener('keydown', PV.kd, true); PV.bg.remove(); const f = PV.from; PV = null; try { f && f.isConnected && f.focus({ preventScroll: true }); } catch {} }
function openPicView(a) {
  const group = [...(a.closest('.atts') || a.parentElement).querySelectorAll('a.att.img[href]')], list = group.length ? group : [a];
  let i = Math.max(0, list.indexOf(a));
  closePicView();
  const bg = document.createElement('div'); bg.className = 'picview'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-modal', 'true'); bg.setAttribute('aria-label', 'Picture viewer');
  bg.innerHTML = `<div class="pvbar"><span class="pvn"></span><span class="grow"></span><a class="pvbtn pvnew" target="_blank" rel="noopener noreferrer" title="Open in a new tab">${ic('arrow', 16)}<span>New tab</span></a><a class="pvbtn pvdl" download title="Download">Download</a><button type="button" class="pvbtn pvx" aria-label="Close picture">${ic('x', 18)}</button></div>
    <button type="button" class="pvnav pvprev" aria-label="Previous picture">‹</button><img class="pvimg" alt=""><button type="button" class="pvnav pvnext" aria-label="Next picture">›</button>`;
  const img = bg.querySelector('.pvimg'), show = () => {
    const el = list[i], im = el.querySelector('img'), href = el.getAttribute('href'), name = im?.getAttribute('alt') || 'picture';
    img.src = href; img.alt = name; bg.querySelector('.pvn').textContent = list.length > 1 ? `${name} · ${i + 1} of ${list.length}` : name;
    const nw = bg.querySelector('.pvnew'), dl = bg.querySelector('.pvdl'); nw.href = href; dl.href = href; dl.setAttribute('download', name);
    bg.querySelector('.pvprev').hidden = bg.querySelector('.pvnext').hidden = list.length < 2;
  };
  const step = d => { i = (i + d + list.length) % list.length; show(); };
  const kd = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicView(); }
    else if (e.key === 'ArrowLeft' && list.length > 1) { e.preventDefault(); e.stopPropagation(); step(-1); }
    else if (e.key === 'ArrowRight' && list.length > 1) { e.preventDefault(); e.stopPropagation(); step(1); }
  };
  bg.addEventListener('click', e => { if (e.target === bg || e.target.classList.contains('pvbar')) closePicView(); });
  bg.querySelector('.pvx').onclick = closePicView; bg.querySelector('.pvprev').onclick = () => step(-1); bg.querySelector('.pvnext').onclick = () => step(1);
  PV = { bg, kd, from: a }; document.addEventListener('keydown', kd, true); document.body.append(bg); show(); bg.querySelector('.pvx').focus({ preventScroll: true });
}
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a.att.img');
  if (!a || e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || !a.getAttribute('href')) return;
  e.preventDefault(); openPicView(a);
});

/* ───────── app shell ───────── */
let started = null, dbCh = null, presCh = null, typCh = null, xChs = [];
async function startApp(session, force) {
  if (!session) return authView();
  if (started === session.user.id && !force) return; started = session.user.id;
  const dv = await sb.rpc('claim_device', { p_device: deviceId() });
  if (dv.error) {
    if (dv.error.hint === 'device_locked') { authNotice = dv.error.message; started = null; return void sb.auth.signOut(); }
    started = null; root.innerHTML = `<div class="authwrap"><div class="card"><h1>Can't verify this device</h1><p class="muted">${esc(dv.error.message)}</p><button class="btn" id="rt">Try again</button> <button class="btn ghost" id="lo">Log out</button></div></div>`;
    $('#rt').onclick = () => startApp(session); $('#lo').onclick = () => sb.auth.signOut(); return;
  }
  try { localStorage.setItem(BOUND_KEY, (session.user.email || '').toLowerCase()); } catch {}
  let { data: me, error } = await sb.from('profiles').select('*').eq('id', session.user.id).single();
  if (error || !me) { root.innerHTML = `<div class="authwrap"><div class="card"><h1>Can't load your profile</h1><p class="muted">${esc(error?.message || 'Profile missing. Did you run the migration?')}</p><button class="btn" id="lo">Log out</button></div></div>`; $('#lo').onclick = () => sb.auth.signOut(); return; }
  // Your name comes from your school account and is locked. The first time (and until migration-lock-names.sql is installed) ask the server to apply it.
  if (!me.name_locked && me.name_status !== 'rename_required') { const r = await sb.rpc('lock_account_name'); if (!r.error && r.data?.profile) me = r.data.profile; }
  S.me = me; S.profiles.set(me.id, me); syncGamesIdentity();
  root.innerHTML = `<div class="app" id="app"><aside class="side" id="side"></aside><section class="main" id="main"></section><aside class="members" id="members" aria-label="Members"></aside></div><div class="scrim" id="scrim"></div>`;
  attachFx($('#side'), $('#main')); clickRipple(); window.OrbitMotion?.ask();
  $('#scrim').onclick = () => { closeSide(); if (innerWidth <= 1000 && S.showMem) { S.showMem = false; renderMembers(); renderHead(); } };
  renderAll(); await Promise.all([loadConvs(), loadFriends(), loadServers(), loadClassRoles()]); checkHot();
  if (!S.servers.length) { const r = await sb.rpc('ensure_membership'); if (r.error) return blocked(r.error.message); await loadServers(); }
  await loadPerms(); await loadMaint(); applyMaint();
  if ((S.me.avatar_color || '').toLowerCase() === '#6d5efc') { const r = await sb.rpc('ensure_avatar_color'); if (r.data) { S.me.avatar_color = r.data; S.profiles.set(S.me.id, S.me); } }
  S.loaded = true; subscribe(); nameGate();
  navigator.serviceWorker?.register('sw.js').catch(() => {}); setTimeout(askNotify, 2500);
  O.start(); CM.start();
  if (S.servers[0]) openServer(S.servers[0].id, null, true); else renderAll();
}
function teardown() { O.stop(); CM.stop(); TN.stop(); GB.stop(); AR.stop(); started = null; $('#maint')?.remove(); $('#maintpill')?.remove(); $('#namefix')?.remove(); syncInert(); maint = { on: false, msg: '', ready: maint.ready }; tabBadge(0); leaveVoice(true); if (V.pres) { sb.removeChannel(V.pres); V.pres = null; } clearPending(); [dbCh, presCh, typCh, ...xChs].forEach(c => c && sb.removeChannel(c)); dbCh = presCh = typCh = null; xChs = []; Object.assign(S, { tix: [], tixOpen: null, tixMsgs: [],  me: null, convs: [], active: null, list: [], friends: [], incoming: [], outgoing: [], servers: [], members: [], chans: [], cats: [], sv: null, ch: null, view: 'server', loaded: false, chUnread: {}, lastDm: null, perms: new Set(), pins: new Set(), pinRows: [], reportCount: 0, blocked: false, dash: null, croles: [], cmem: new Map(), crErr: null, rolesEdit: false }); }
const renderAll = () => { renderSide(); renderMain(); renderMembers(); };
const onlineCount = () => S.members.filter(m => statusOf(prof(m.user_id)) !== 'offline').length;

function navTo(k) {
  closeSide(); if (k !== 'gamer') { gamesLock(false); O.gameOpen(false); }   // leaving Orbit Games: the music comes back
  if (k === 'dm' || k === 'communities' || k === 'friends') S.socialOpen = true;
  if (k === 'gamer' || k === 'shop' || k === 'gamble' || k === 'orbitcraft') S.funOpen = true;
  S.sideOff = k === 'gamer' || k === 'gamble' || k === 'orbitcraft';   // Orbit Games and Orbit Casino open full screen: the sidebar tucks away (the arrow in the top bar brings it back)
  S.gamerGo = k === 'gamer' ? (S.gamerNext || '') : ''; S.gamerNext = '';   // a tournament's Play button opens that game; the sidebar opens the game list
  if (k === 'dm') {
    S.view = 'dm'; const id = S.convs.some(c => c.id === S.lastDm) ? S.lastDm : S.convs[0]?.id;
    if (id) return openConv(id); S.active = null; return renderAll();
  }
  const wasGamer = S.view === 'gamer'; S.view = k; if (wasGamer || k === 'gamer') trackStatus();   // the orange "playing" dot follows the person in and out of Orbit Games
  renderAll(); O.onNav(k); CM.onNav(k); TN.onNav(k); GB.onNav(k); if (k === 'tutorials') loadTuts(); if (k === 'leaderboard') { S.lbFresh = true; loadBoard(-1); }   // always opens on Current if (k === 'suggestions') loadSugs(); if (k === 'support') { S.tixOpen = null; loadTickets(); } if (k === 'gifs') loadUgifs().then(() => S.view === 'gifs' && renderMain());
  if (k === 'roles') loadClassRoles().then(() => S.view === 'roles' && renderMain());
}
function dmList() {
  const f = S.filter.toLowerCase();
  const hay = c => (c.is_group ? (c.name || '') + ' ' + gOthers(c).map(p => p.display_name + ' ' + p.username).join(' ') : c.other.display_name + c.other.username).toLowerCase();
  const rows = S.convs.filter(c => (c.is_group || c.other) && hay(c).includes(f))
    .sort((a, b) => (b.last_message_at || b.created_at || '').localeCompare(a.last_message_at || a.created_at || ''));
  return `<div class="dmhead"><input id="cf" placeholder="Search conversations" aria-label="Search conversations" value="${esc(S.filter)}"><button class="ib" id="nd" title="New message" aria-label="New message">${ic('plus')}</button></div>
  <button class="btn ghost group-create" id="ng">${ic('friends', 16)} New group chat</button>
  ${rows.map(c => `<button class="row ${c.id === S.active && S.view === 'dm' ? 'on' : ''} ${unread(c) ? 'unr' : ''}" data-c="${c.id}">${convAv(c)}<span class="t"><b>${esc(convName(c))}</b><small>${esc(plain(c.last_message_preview) || 'No messages yet')}</small></span>${unread(c) ? '<span class="pill">new</span>' : ''}</button>`).join('') || '<p class="empty">No conversations yet.<br>Start one with the + button.</p>'}`;
}
function socialList() {
  const c = S.chans.find(x => x.kind === 'text' && !isRulesCh(x)) || S.chans.find(x => x.kind === 'text');
  if (!c) return `<p class="empty">${S.loaded ? 'No chat yet.' : 'Loading...'}</p>`;
  const all = S.chans.filter(x => x.kind === 'text');
  const list = all.map(x => `<button class="ch ${(x.special === 'suggestions' ? S.view === 'suggestions' : x.special === 'videos' ? S.view === 'tutorials' : x.id === S.active && S.view === 'server') ? 'on' : ''} ${S.chUnread[x.id] ? 'unr' : ''}${x.special === 'suggestions' && S.hot?.sug && S.view !== 'suggestions' ? ' hot' : ''}" data-ch="${x.id}"${x.special ? ` data-sp="${x.special}"` : ''}>${chIcon(x)}<span>${esc(x.name)}</span>${S.chUnread[x.id] ? `<span class="pill red">${S.chUnread[x.id] > 99 ? '99+' : S.chUnread[x.id]}</span>` : ''}</button>`).join('');
  return `<div class="sect">Channels</div>${list}${voiceList()}`;
}
/* voice channels: always listed under Chat so anyone can tap one to join the call */
function voiceList() {
  const vs = S.chans.filter(x => x.kind === 'voice');
  return vs.length ? `<div class="sect" style="margin-top:10px">Voice channels</div>${vs.map(voiceRow).join('')}` : '';
}
/* Orbit Games uses this account: save the player's name where the games read it (same site, shared storage) */
function syncGamesIdentity() {
  try { const n = String(S.me?.display_name || '').trim().slice(0, 12); if (n && S.me?.id) { localStorage.setItem('player-name', n); localStorage.setItem('orbit-uid', S.me.id); } } catch {}
}
/* Orbit Games tells Orbit when a cartridge is chosen: until the player leaves, nothing but the top-left sidebar button
   (and the sidebar itself) can be clicked, and the page cannot scroll. */
const gamesLock = on => document.documentElement.classList.toggle('games-locked', !!on);
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || e.data.orbitGames !== 'lock') return;
  const f = document.querySelector('.gframe'); if (!f || e.source !== f.contentWindow) return;
  gamesLock(e.data.on); O.gameOpen(!!e.data.on);   // a game is open: the music pauses; back on the game list: it plays again
});
function renderGamer(main) {
  syncGamesIdentity();
  const off = !!S.sideOff;
  main.innerHTML = `<div class="top gtop"><button class="ib gtog" id="gtog" aria-label="${off ? 'Show sidebar' : 'Hide sidebar'}" title="${off ? 'Show sidebar' : 'Hide sidebar'}">${ic('chev')}</button>${menuBtn()}<span class="hashi">${ic('gamepad', 20)}</span><b class="title">Orbit Games</b></div>
  <div class="gamer-wrap"><iframe class="gframe" src="../games/${/^[a-z0-9-]+\.html$/.test(S.gamerGo || '') ? S.gamerGo : 'index.html'}" title="Orbit Games" allow="microphone; camera; fullscreen; autoplay; gamepad"></iframe></div>`;
  $('#gtog', main).onclick = () => { S.sideOff = !S.sideOff; renderMain(); };
  const fr = $('.gframe', main), isGame = path => !/\/(index\.html)?$/.test(path || '/');   // anything other than the game list (games/ or games/index.html) is a game
  O.gameOpen(!!S.gamerGo && isGame(fr.getAttribute('src')));
  fr.addEventListener('load', () => { try { O.gameOpen(isGame(fr.contentWindow.location.pathname)); } catch {} });
}
async function loadBoard(d) {
  if (d != null) { S.lbDays = d; S.lbFresh = true; }   // 0 = all-time, -1 = current balance
  const { data, error } = await sb.rpc('orbit_leaderboard', { p_days: S.lbDays ?? -1 });
  S.lb = data || []; S.lbErr = error ? error.message : '';
  try { await needProfiles(S.lb.map(r => r.user_id)); } catch {}
  if (S.view === 'leaderboard') renderMain();
}
/* live game payout percentages (the owner edits them in the Orbit Games admin panel); starting values until the server answers */
const GAME_RATES = { blockblast: 75, game2048: 25, breakout: 50, dino: 50, flappy: 1000, geodash: 100, minesweeper: 50, pacman: 10, slope: 100, snake: 2000, tetris: 5, girder: 5, sudoku: 25 };
const GAME_RATE_ORDER = [['game2048', '2048'], ['blockblast', 'Block Blast'], ['breakout', 'Block Breaker'], ['dino', 'Dino Run'], ['flappy', 'Flappy Bird'], ['geodash', 'Geometry Dash'], ['minesweeper', 'Minesweeper'], ['pacman', 'Pac-Man'], ['slope', 'Slope'], ['snake', 'Snake'], ['tetris', 'Tetris'], ['girder', 'Girder Gorilla'], ['sudoku', 'Sudoku']];
const gameRatesText = () => GAME_RATE_ORDER.filter(([k]) => GAME_RATES[k]).map(([k, n]) => `${n} ${GAME_RATES[k]}%`).join(', ');
sb.rpc('get_game_rates').then(({ data }) => { if (data && data.length) { Object.keys(GAME_RATES).forEach(k => delete GAME_RATES[k]); data.forEach(r => { GAME_RATES[r.game] = Math.round(r.permille) / 10; }); } });
function renderLeaderboard(main) {
  const d = S.lbDays ?? -1, rows = S.lb || [], fresh = !!S.lbFresh && rows.length > 0; if (fresh) S.lbFresh = false;
  main.innerHTML = leaderboardHtml({ rows, days: d, showAll: !!S.lbAll, meId: S.me.id, err: S.lbErr, prof, av, ic, esc, roleOf, logo: 'orbit-logo-planet.png', menu: menuBtn(), fresh })
  + `
  <details class="lbhow"><summary>How to earn Orbits</summary><ul class="lbrules"><li>Spend time on Orbit: +25 per active minute (up to 3,000 a day)</li><li>Attend an official community event: +50</li><li>Host an approved community event: +100</li><li>Complete a community challenge: +25</li><li>Reach a weekly participation milestone: +75</li><li>Win an official tournament: +100 (second place +50, third place +25)</li><li>Complete a daily login streak milestone: +25</li><li>Help another community member: +15</li><li>Submit a verified bug report: +25</li><li>Participate in an official community poll: +5</li><li>Complete a special staff-approved event: +50</li><li>Reach a monthly participation milestone: +150</li><li>Win Community Member of the Month: +200</li></ul>
  <p class="muted"><b>Games:</b> Orbit Games pays a share of each final score in Orbits: ${gameRatesText()}. Games and Orbit share one balance, shown beside your profile.</p>
  <p class="muted">Messages, comments and clicks earn nothing. Staff verify event attendance, tournaments, help and bug reports, and each one pays once. Orbits buy cosmetics (frames, nameplates, themes, badges) and can't be exchanged for money.</p></details></div></div>`;
  main.querySelectorAll('[data-d]').forEach(b => b.onclick = () => loadBoard(+b.dataset.d));
  const mo = main.querySelector('#lbmore'); if (mo) mo.onclick = () => { S.lbAll = !S.lbAll; S.lbFresh = true; renderMain(); };
  startLeaderboardFx(main, fresh);
  AR.decorate(main);
}
function serverList() {
  const sv = S.sv;
  if (!sv) return `<p class="empty">${S.loaded ? 'You are not in the server yet.' : 'Loading…'}</p>`;
  const row = c => c.kind === 'voice'
    ? voiceRow(c)
    : `<button class="ch ${(c.special === 'suggestions' ? S.view === 'suggestions' : c.special === 'videos' ? S.view === 'tutorials' : c.id === S.active && S.view === 'server') ? 'on' : ''} ${S.chUnread[c.id] ? 'unr' : ''}" data-ch="${c.id}"${c.special ? ` data-sp="${c.special}"` : ''}>${chIcon(c)}<span>${esc(c.name)}</span>${S.chUnread[c.id] ? `<span class="pill red">${S.chUnread[c.id] > 99 ? '99+' : S.chUnread[c.id]}</span>` : ''}</button>`;
  const groups = [...S.cats.map(k => [k, S.chans.filter(c => c.category_id === k.id)]), [{ id: '_other', name: 'Channels' }, S.chans.filter(c => !c.category_id)]].filter(([, cs]) => cs.length);
  return `<div class="sect">Your server</div>
  <button class="srv" id="sm" aria-label="Server menu">${svIcon(sv)}<span class="t"><b>${esc(sv.name)}</b><small>${S.members.length ? S.members.length + ' members' : ''}</small></span>${ic('chev', 18)}</button>
  ${groups.map(([k, cs]) => { const shut = S.collapsed.has(k.id); return `<div class="cat"><button class="cat-h ${shut ? 'shut' : ''}" data-cat="${k.id}" aria-expanded="${!shut}">${ic('chev', 14)}<span>${esc(k.name)}</span></button>${isAdm() ? `<button class="ib sm" data-add title="Create channel" aria-label="Create channel">${ic('plus', 16)}</button>` : ''}</div>${shut ? '' : cs.map(row).join('')}`; }).join('')}`;
}
async function installApp() {
  closeSide();
  if (installEv) {   // Chrome is ready: one click opens its own install box
    const ev = installEv; installEv = null;
    try { await ev.prompt(); await ev.userChoice; } catch {}
    renderSide(); return;
  }
  modal('Install Orbit as an app', `<p class="muted">Orbit opens in its own window with its own icon, like a normal app. Use Google Chrome:</p>
    <ol><li><b>On a computer:</b> click the install icon at the right end of the address bar, or open the \u22EE menu, choose <b>Cast, save, and share</b>, then <b>Install page as app</b>.</li>
    <li><b>On an Android phone:</b> open the \u22EE menu and tap <b>Install app</b> (or <b>Add to Home screen</b>).</li></ol>
    <p class="muted">Not seeing it? Open Orbit in a normal Chrome tab (not a private window) and reload.</p>`);
}
/* Orbits balance beside your profile: the same balance the games add to and the Prize Room spends from */
function orbitChip() { return `<span class="orbchip" id="orbchip" title="Your Orbits" aria-label="${Number(S.orbits || 0).toLocaleString()} Orbits"><img src="logo.svg" width="16" height="16" alt="">${Number(S.orbits || 0).toLocaleString()}</span>`; }
function paintOrbits() { document.querySelectorAll('.shp-bal').forEach(e => { e.lastChild.textContent = Number(S.orbits || 0).toLocaleString(); });
  const c = document.querySelector('#orbchip'); if (c) { c.lastChild.textContent = Number(S.orbits || 0).toLocaleString(); c.setAttribute('aria-label', Number(S.orbits || 0).toLocaleString() + ' Orbits'); } }
function setOrbits(n) { S.orbits = Math.max(0, Math.floor(Number(n)) || 0); try { localStorage.setItem('orbit-balance', String(S.orbits)); } catch {} paintOrbits(); }
async function loadOrbits() { try { const { data, error } = await sb.rpc('my_orbits'); if (!error && data != null) setOrbits(data); } catch {} }
addEventListener('storage', e => { if (e.key === 'orbit-balance') { S.orbits = parseInt(e.newValue, 10) || 0; paintOrbits(); } });   // a game page or another tab earned or spent Orbits
function renderSide() {
  const side = $('#side'); if (!side || !S.me) return;
  const keep = $('.scroll', side)?.scrollTop || 0, un = S.convs.filter(unread).length, more = !!S.moreNav || ['roles', 'boards', 'board', 'leaderboard', 'support'].includes(S.view);
  const nav = (k, label, icon, n) => `<button class="nav-i ${S.view === k || S.view === ({ events: 'event', boards: 'board', communities: 'community', tournaments: 'tournament' })[k] ? 'on' : ''}${S.hot?.[HOT_KEY[k]] && S.view !== k ? ' hot' : ''}" data-nav="${k}"${S.hot?.[HOT_KEY[k]] && S.view !== k ? ` aria-label="${label} (new)"` : ''}>${ic(icon)}<span>${label}</span>${n ? `<span class="pill">${n}</span>` : ''}</button>`;
  /* Orbit Social: one dropdown holding Direct Messages, Communities and Friends. It opens by itself while you are on one of them. */
  const inSocial = ['dm', 'communities', 'community', 'friends'].includes(S.view), socOpen = S.socialOpen ?? inSocial, socCount = un + (CM.invites() || 0) + S.incoming.length;
  const socialNav = `<div class="nav-grp${socOpen ? ' open' : ''}"><button type="button" class="nav-i nav-grp-h${inSocial && !socOpen ? ' on' : ''}" data-social aria-expanded="${socOpen}" aria-controls="navsoc">${ic('friends')}<span>Orbit Social</span>${!socOpen && socCount ? `<span class="pill">${socCount}</span>` : ''}<span class="nav-chev" aria-hidden="true">${ic('chev', 16)}</span></button>
    <div class="nav-sub" id="navsoc" role="group" aria-label="Orbit Social"${socOpen ? '' : ' hidden'}>${nav('dm', 'Direct Messages', 'dm', un)}${nav('communities', 'Communities', 'users', CM.invites())}${nav('friends', 'Friends', 'friends', S.incoming.length)}</div></div>`;
  /* Orbit Fun: one dropdown holding Orbit Games, Orbit Shop and Orbit Casino. It opens by itself while you are on one of them. */
  const inFun = ['gamer', 'shop', 'gamble', 'orbitcraft'].includes(S.view), funOpen = S.funOpen ?? inFun;
  const funNav = `<div class="nav-grp${funOpen ? ' open' : ''}"><button type="button" class="nav-i nav-grp-h${inFun && !funOpen ? ' on' : ''}" data-fun aria-expanded="${funOpen}" aria-controls="navfun">${ic('smile')}<span>Orbit Fun</span><span class="nav-chev" aria-hidden="true">${ic('chev', 16)}</span></button>
    <div class="nav-sub" id="navfun" role="group" aria-label="Orbit Fun"${funOpen ? '' : ' hidden'}>${nav('gamer', 'Orbit Games', 'gamepad')}${nav('shop', 'Orbit Shop', 'shop')}${nav('gamble', 'Orbit Casino', 'dice')}${nav('orbitcraft', 'Orbitcraft', 'gamepad')}</div></div>`;
  side.innerHTML = `<div class="brand"><div class="bwrap"><img class="blogo" src="orbit-logo-wide.png" alt="Orbit" width="236" height="auto"></div></div>
  <nav class="nav" aria-label="Orbit navigation">${nav('home', 'Home', 'home')}${nav('roles', 'Roles', 'tag')}${socialNav}${nav('events', 'Events', 'calendar')}${nav('tournaments', 'Tournaments', 'trophy')}${funNav}${nav('leaderboard', 'Orbit Leaderboard', 'trophy')}${nav('ai', 'Ask Orbit AI', 'sparkle')}${S.chans.some(x => x.special === 'suggestions') ? '' : nav('suggestions', 'Suggestions', 'hash')}</nav>
  ${O.sideCal()}
  <div class="scroll">${S.view === 'dm' ? dmList() : socialList()}</div>
  ${V.ch ? `<div class="vpanel" id="vp"><button class="t" id="vo" title="Open call" aria-label="Open call screen"><b>Voice connected</b><small></small></button><button class="ib" id="vl" title="Leave voice" aria-label="Leave voice channel">${ic('phoneOff', 18)}</button></div>` : ''}
  <div class="me"><button class="row" id="mep" title="Your profile">${av(S.me)}<span class="t"><b>${esc(S.me.display_name)}${SHOP.coHtml(S.me.id)}</b><small>${S.me.custom_status ? esc(S.me.custom_status) : '<i class="odot"></i>Online'}</small></span>${orbitChip()}</button><button class="ib ${V.muted || V.deaf ? 'bad' : ''}" id="vm" title="${V.muted || V.deaf ? 'Unmute microphone' : 'Mute microphone'}" aria-label="Toggle microphone" aria-pressed="${V.muted || V.deaf}">${ic(V.muted || V.deaf ? 'micOff' : 'mic', 18)}</button><button class="ib ${V.deaf ? 'bad' : ''}" id="vd" title="${V.deaf ? 'Undeafen' : 'Deafen (stop hearing voice chat)'}" aria-label="Toggle deafen" aria-pressed="${V.deaf}">${ic('headphones', 18)}</button><button class="ib ${soundMuted ? 'bad' : ''}" id="sn" title="${soundMuted ? 'Unmute notification sounds' : 'Mute notification sounds'}" aria-label="Toggle notification sounds" aria-pressed="${soundMuted}">${ic(soundMuted ? 'bellOff' : 'bell', 18)}</button>${canAdmin() ? `<button class="ib" id="adm" title="Admin dashboard" aria-label="Admin dashboard">${ic('shield', 18)}${S.reportCount && can('view_reports') ? '<span class="dot"></span>' : ''}</button>` : ''}<button class="ib" id="set" title="Settings" aria-label="Settings">${ic('settings', 18)}</button></div>`;
  $('.scroll', side).scrollTop = keep;
  side.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => navTo(b.dataset.nav));
  side.querySelectorAll('[data-social]').forEach(b => b.onclick = () => { S.socialOpen = !(S.socialOpen ?? inSocial); renderSide(); });
  side.querySelectorAll('[data-fun]').forEach(b => b.onclick = () => { S.funOpen = !(S.funOpen ?? inFun); renderSide(); });
  side.querySelectorAll('[data-more]').forEach(b => b.onclick = () => { S.moreNav = !S.moreNav; renderSide(); });
  O.bindSide(side);
  side.querySelectorAll('[data-ext="gamer"]').forEach(b => b.onclick = () => openGamer());
  side.querySelectorAll('[data-ext="install"]').forEach(b => b.onclick = installApp);
  side.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { if (b.dataset.sp === 'suggestions') return navTo('suggestions'); if (b.dataset.sp === 'videos') return navTo('tutorials'); closeSide(); openChan(b.dataset.ch); });
  side.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { S.view = 'dm'; closeSide(); openConv(b.dataset.c); });
  side.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { const k = b.dataset.cat; S.collapsed.has(k) ? S.collapsed.delete(k) : S.collapsed.add(k); renderSide(); });
  side.querySelectorAll('[data-add]').forEach(b => b.onclick = channelModal);
  $('#sm')?.addEventListener('click', serverMenu);
  const cf = $('#cf'); if (cf) cf.oninput = e => { S.filter = e.target.value; const p = e.target.selectionStart; renderSide(); const i = $('#cf'); i.focus(); i.setSelectionRange(p, p); };
  $('#nd')?.addEventListener('click', newDmModal);
  $('#ng')?.addEventListener('click', () => groupPicker());
  $('#mep').onclick = $('#set').onclick = settingsModal;
  $('#vm').onclick = toggleMute; $('#vd').onclick = toggleDeaf; $('#sn').onclick = toggleSound; $('#vl')?.addEventListener('click', () => leaveVoice());
  side.querySelectorAll('[data-vc]').forEach(b => b.onclick = async () => { closeSide(); const id = b.dataset.vc; if (V.ch !== id) await joinVoice(id); if (V.ch === id) openCall(); });
  $('#vo')?.addEventListener('click', () => { closeSide(); openCall(); });
  renderVoicePanel();
  $('#adm')?.addEventListener('click', () => adminDashboard());
}
function renderMembers() {
  const el = $('#members'), app = $('#app'); if (!el || !app) return;
  const show = S.view === 'server' && S.sv && S.showMem && !isRulesCh(S.ch);
  app.classList.toggle('hasmem', !!show); if (!show) { el.innerHTML = ''; return; }
  const rank = { owner: 0, admin: 1, moderator: 2, member: 3 };
  const list = S.members.map(m => { const p = prof(m.user_id); return { m, p, st: statusOf(p) }; });
  const byName = (a, b) => (rank[a.m.role] - rank[b.m.role]) || (a.p.display_name || '').localeCompare(b.p.display_name || '');
  const on = list.filter(x => x.st !== 'offline').sort(byName), off = list.filter(x => x.st === 'offline').sort(byName);
  const row = x => `<button class="mrow ${x.st === 'offline' ? 'off' : ''}" data-u="${x.p.id}">${av(x.p)}<span class="t"><b>${esc(x.p.display_name)}${SHOP.coHtml?.(x.p.id) || ''}</b><small>${esc(x.p.custom_status || (x.st === 'offline' && lastSeenText(x.p)) || stText[x.st])}</small></span>${tmoUntil(x.m) ? '<span class="role" title="Timed out">timeout</span>' : ''}${x.m.role !== 'member' ? roleBadge(x.p.id) : ''}</button>`;
  el.innerHTML = `<h3>Online — ${on.length}</h3>${on.map(row).join('')}${off.length ? `<h3>Offline — ${off.length}</h3>${off.map(row).join('')}` : ''}`;
  el.querySelectorAll('[data-u]').forEach(b => b.onclick = () => profileModal(b.dataset.u));
}

/* ───────── data ───────── */
async function loadConvs() {
  const sel = g => `last_read_at, conversation:conversations(id,created_at,last_message_at,last_message_preview,last_author${g ? ',is_group,name,created_by' : ''}, members:conversation_members(user_id, last_read_at, profile:profiles(*)))`;
  let r = await sb.from('conversation_members').select(sel(true)).eq('user_id', S.me.id);
  if (r.error && /is_group|created_by/i.test(r.error.message || '')) r = await sb.from('conversation_members').select(sel(false)).eq('user_id', S.me.id);   // group-chat SQL not run yet: plain DMs still work
  const { data, error } = r;
  if (error) return toast('Could not load conversations: ' + error.message, true);
  S.convs = data.filter(x => x.conversation).map(x => {
    const c = x.conversation, ms = c.members || [], others = ms.filter(m => m.user_id !== S.me.id);
    ms.forEach(m => m.profile && S.profiles.set(m.user_id, m.profile));
    const om = others[0], other = c.is_group ? undefined : om?.profile;
    return { ...c, members: undefined, mems: ms.map(m => m.user_id), reads: Object.fromEntries(others.map(m => [m.user_id, m.last_read_at])), last_read_at: x.last_read_at, other, other_read_at: om?.last_read_at };
  });
}
const convsChangedSoon = debounce(async () => {   // someone joined, left or was removed
  await loadConvs();
  if (!S.me) return;
  if (S.view === 'dm' && S.active && !S.convs.some(c => c.id === S.active)) { toast('You are no longer in that group chat.'); return navTo('dm'); }
  renderSide(); if (S.view === 'dm' && S.active) { renderHead(); paintReceipt(); }
}, 300);
function onConvUpdate(p) {   // renames show up live
  const n = p.new, c = n && S.convs.find(x => x.id === n.id); if (!c || !c.is_group) return;
  const renamed = (n.name ?? null) !== (c.name ?? null); c.name = n.name ?? null; c.created_by = n.created_by ?? c.created_by;
  if (!renamed) return;
  renderSide(); if (S.view === 'dm' && S.active === c.id) { renderHead(); const ta = $('#in'); if (ta) ta.placeholder = 'Message ' + convName(c); }
}
async function loadFriends() {
  const [f, r] = await Promise.all([sb.from('friendships').select('*'), sb.from('friend_requests').select('*')]);
  if (f.error || r.error) return toast('Could not load friends.', true);
  const ids = new Set();
  S.friends = f.data.map(x => x.user_a === S.me.id ? x.user_b : x.user_a); S.friends.forEach(i => ids.add(i));
  S.incoming = r.data.filter(x => x.receiver_id === S.me.id); S.outgoing = r.data.filter(x => x.sender_id === S.me.id);
  r.data.forEach(x => ids.add(x.sender_id === S.me.id ? x.receiver_id : x.sender_id));
  const need = [...ids].filter(i => !S.profiles.has(i));
  if (need.length) (await sb.from('profiles').select('*').in('id', need)).data?.forEach(p => S.profiles.set(p.id, p));
  loadSeen([...ids]);
}

/* ───────── realtime + presence ───────── */
function subscribe() {
  AR.start();
  dbCh = sb.channel('db')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, onMsg)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, onRx)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, async () => { await loadFriends(); renderSide(); S.view === 'friends' && renderMain(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, async () => { await loadFriends(); renderSide(); S.view === 'friends' && renderMain(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, onReadUpdate)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members' }, () => convsChangedSoon())
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'conversation_members' }, p => { const cid = p.old?.conversation_id; if (!cid || S.convs.some(c => c.id === cid)) convsChangedSoon(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, onMemberChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'servers' }, onServerChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channels' }, () => reloadChannelsSoon())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_categories' }, () => reloadChannelsSoon())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, onMaint)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'class_roles' }, () => crChangedSoon())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'class_role_members' }, () => { crChangedSoon(); onPermChange(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'class_role_permissions' }, () => { crChangedSoon(); onPermChange(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => pinsChangedSoon())
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, onProfileChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, onPermChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reports' }, onReportChange)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'audit_log' }, () => dashRefresh())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, onVote)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, onPollChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions' }, sugChangedSoon)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestion_votes' }, sugChangedSoon)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tutorials' }, tutChangedSoon)
    .subscribe(st => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') toast('Live updates disconnected. Reconnecting…', true); });
  xChs.forEach(c => sb.removeChannel(c));   // optional features: separate channels, so a table that has not been set up yet cannot break chat's live updates
  xChs = [
    sb.channel('x-gifts').on('postgres_changes', { event: '*', schema: 'public', table: 'orbit_gifts' }, p => { const g = p.new; if (!g?.id) return; GIFTS.set(g.id, g); if (S.list.some(m => m.gift_id === g.id)) renderMsgs(false, true); if (g.sender_id === S.me.id || g.claimed_by === S.me.id) loadOrbits(); }).subscribe(),
    sb.channel('x-groups').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations' }, onConvUpdate).subscribe(),
    sb.channel('x-support').on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => tixChangedSoon())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_messages' }, onTixMsg).subscribe()];
  V.pres = sb.channel('voice', { config: { presence: { key: S.me.id } } }); V.pres.on('presence', { event: 'sync' }, onVoiceSync).subscribe();
  presCh = sb.channel('online', { config: { presence: { key: S.me.id } } });
  presCh.on('presence', { event: 'sync' }, () => { const was = S.online; S.online = new Map(Object.entries(presCh.presenceState()).map(([k, v]) => [k, v[0]])); was?.forEach((_, k) => { if (!S.online.has(k)) { SEEN.set(k, new Date().toISOString()); SEEN_TRIED.add(k); } }); renderSide(); renderMembers(); S.view === 'friends' || S.view === 'home' ? renderMain() : renderHead(); syncMembers(); })
    .on('presence', { event: 'join' }, p => { if (S.presLive) SHOP.onArrive?.(p.key, p.currentPresences); })   // the loop holder coming online
    .subscribe(async st => { if (st === 'SUBSCRIBED') { trackStatus(); S.presLive = false; setTimeout(() => { S.presLive = true; }, 3000); } });
  ['keydown', 'pointerdown'].forEach(ev => addEventListener(ev, () => { const was = Date.now() - S.lastActive > 3e5; S.lastActive = Date.now(); if (was) trackStatus(); }, { passive: true }));
  setInterval(() => { if (S.me && Date.now() - S.lastActive > 3e5) trackStatus(); }, 6e4);
  /* last online: stamp the time now, every 2 minutes while the tab is open, and again when it is hidden or closed */
  if (!window.__seenTimer) { touchSeen(); window.__seenTimer = setInterval(() => { if (Date.now() - S.lastActive < 6e5) touchSeen(); }, 12e4); addEventListener('pagehide', () => { if (S.me && S.me.status !== 'invisible') sb.rpc('touch_last_seen').then(() => {}, () => {}); }); document.addEventListener('visibilitychange', () => { if (document.hidden && S.me && S.me.status !== 'invisible') sb.rpc('touch_last_seen').then(() => {}, () => {}); else touchSeen(); }); }
  if (!window.__acc) window.__acc = setInterval(verifyAccess, 45000);
  /* time on Orbit: +5 Orbits for every minute the tab is visible (the server pays at most one minute per minute) */
  S.orbits = parseInt(localStorage.getItem('orbit-balance'), 10) || 0; paintOrbits(); loadOrbits(); SHOP.load().then(() => { renderSide(); renderMembers(); O.refreshFloaters?.(); });
  if (!window.__orbMin) { let seen = 0; window.__orbMin = setInterval(async () => {
    if (!S.me || document.hidden) return;
    seen += 5; if (seen < 60) return; seen = 0;
    try { const { data } = await sb.rpc('claim_orbit_minute'); if (data > 0) setOrbits((S.orbits || 0) + data); loadOrbits(); if (data > 0 && S.view === 'leaderboard') loadBoard(); } catch {}
  }, 5000); }
}
async function trackStatus() {
  if (!presCh || !S.me) return;
  if (S.me.status === 'invisible') return presCh.untrack();
  const idle = Date.now() - S.lastActive > 3e5 && S.me.status === 'online';
  presCh.track({ status: S.view === 'gamer' && (S.me.status === 'online' || S.me.status === 'idle') ? 'playing' : idle ? 'idle' : S.me.status });
}
function onMsg(p) {
  if (p.eventType === 'DELETE') { const i = S.list.findIndex(m => m.id === p.old.id); if (i > -1) { S.list.splice(i, 1); renderMsgs(); } return; }
  const m = p.new;
  if (p.eventType === 'INSERT') notifyMsg(m);
  if (m.channel_id) {
    if (S.view === 'server' && m.channel_id === S.active) { S.typers.delete(m.author_id); showTyping(); ensurePoll(m).then(() => { upsert(m); renderMsgs(m.author_id === S.me.id); setLr(m.channel_id); }); }
    else if (p.eventType === 'INSERT' && m.author_id !== S.me.id && S.chans.some(x => x.id === m.channel_id)) { S.chUnread[m.channel_id] = (S.chUnread[m.channel_id] || 0) + 1; renderSide(); }
    return;
  }
  if (!m.conversation_id) return;
  if (m.conversation_id === S.active && S.view === 'dm') {
    S.typers.delete(m.author_id); showTyping();
    ensurePoll(m).then(() => { upsert(m); renderMsgs(m.author_id === S.me.id); });
    if (m.author_id !== S.me.id && p.eventType === 'INSERT') markRead();
  } else if (p.eventType === 'INSERT') {
    const c = S.convs.find(x => x.id === m.conversation_id);
    if (!c) return loadConvs().then(renderAll);
    Object.assign(c, { last_message_at: m.created_at, last_message_preview: (m.content || (m.has_poll ? 'Started a poll' : 'Sent an attachment')).slice(0, 80), last_author: m.author_id });
    renderSide();
  }
}
function onRx(p) {
  const r = p.eventType === 'DELETE' ? p.old : p.new; if (!r?.message_id || !S.list.some(m => m.id === r.message_id)) return;
  const arr = S.rx.get(r.message_id) || [];
  if (p.eventType === 'INSERT' && !arr.some(x => x.user_id === r.user_id && x.emoji === r.emoji)) arr.push(r);
  if (p.eventType === 'DELETE') S.rx.set(r.message_id, arr.filter(x => !(x.user_id === r.user_id && x.emoji === r.emoji)));
  else S.rx.set(r.message_id, arr);
  renderMsgs();
}

/* ───────── conversation view ───────── */
const upsert = m => { const i = S.list.findIndex(x => x.id === m.id); if (i > -1) S.list[i] = m; else { S.list.push(m); S.list.sort((a, b) => a.created_at.localeCompare(b.created_at)); } };
async function openConv(id) {
  clearPending(); S.active = id; S.list = []; S.rx = new Map(); S.hasMore = true; S.replyTo = null; S.typingUntil = 0; S.polls = new Map(); S.typers = new Map();
  const c = S.convs.find(x => x.id === id); S.readMark = c?.last_read_at; S.lastDm = id;
  renderSide(); renderMain(true); renderMembers();
  joinTyping(id);
  await fetchMsgs(); if (S.active !== id) return;
  renderMsgs(true); markRead();
}
async function fetchMsgs(before) {
  let q = sb.from('messages').select('*').eq(col(), S.active).order('created_at', { ascending: false }).limit(50);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q; if (error) { toast('Could not load messages: ' + error.message, true); return; }
  S.hasMore = data.length === 50; data.forEach(upsert);
  if (data.length) { const { data: rs } = await sb.from('message_reactions').select('*').in('message_id', data.map(m => m.id)); (rs || []).forEach(r => { const a = S.rx.get(r.message_id) || []; a.push(r); S.rx.set(r.message_id, a); }); }
  const pm = data.filter(m => m.has_poll).map(m => m.id); if (pm.length) await loadPolls(pm);
}
async function markRead() {
  if (document.hidden || !document.hasFocus()) return;   // "Read" should mean the other person really has the chat in front of them
  const c = S.convs.find(x => x.id === S.active); if (!c) return;
  const t = c.last_message_at || new Date().toISOString(); if (c.last_read_at >= t) return;
  c.last_read_at = t; renderSide();
  await sb.from('conversation_members').update({ last_read_at: t }).eq('conversation_id', c.id).eq('user_id', S.me.id);
}

function renderHead() {
  const a = document.activeElement, keep = a && a.id === 'sq', pos = keep ? a.selectionStart : 0;
  renderHead0();
  if (keep) { const i = $('#sq'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch {} } }
}
function renderHead0() {
  const h = $('#head'); if (!h) return;
  const sbtn = `<div class="sbar"><label class="sbox sin">${ic('search', 16)}<input id="sq" type="text" placeholder="Search messages…" autocomplete="off" spellcheck="false" aria-label="Search messages"></label><div class="sres" id="sres" hidden></div></div>`;
  if (S.view === 'server' && isRulesCh(S.ch)) {
    h.innerHTML = `${menuBtn()}<span class="hashi">${chIcon(S.ch, 22)}</span><b class="title">${esc(S.ch.name)}</b>${S.ch.description ? `<span class="desc">${esc(S.ch.description)}</span>` : ''}<span class="grow"></span>`;
    bindMenu(); return;
  }
  if (S.view === 'server' && S.ch) {
    h.innerHTML = `${menuBtn()}<span class="hashi">${chIcon(S.ch, 22)}</span><b class="title">${esc(S.ch.name)}</b>${S.ch.description ? `<span class="desc">${esc(S.ch.description)}</span>` : ''}<span class="onl"><i></i>${onlineCount()} online</span>${S.ch.locked ? `<span class="chip">${ic('lock', 13)} Locked</span>` : ''}${S.ch.slow_mode_seconds ? `<span class="chip">Slow mode ${fmtSecs(S.ch.slow_mode_seconds)}</span>` : ''}<span class="grow"></span>${sbtn}${O.headBtn()}<button class="ib" id="pins" title="Pinned messages" aria-label="Pinned messages">${ic('pin')}</button><button class="ib ${S.showMem ? 'on' : ''}" id="mem" title="Member list" aria-label="Toggle member list">${ic('friends')}</button>`;
    $('#mem').onclick = () => { S.showMem = !S.showMem; renderMembers(); renderHead(); };
    $('#pins').onclick = pinsModal; O.bindHead();
  } else {
    const c = S.convs.find(x => x.id === S.active);
    if (c?.is_group) {
      h.innerHTML = `${menuBtn()}${convAv(c)}<span><b class="title">${esc(convName(c))}</b> <small class="muted">${c.mems.length} people</small></span><span class="grow"></span>${sbtn}<button class="ib" id="gi" title="Group info" aria-label="Group info">${ic('friends')}</button>`;
      bindMenu(); bindMsgSearch(); $('#gi').onclick = () => groupModal(c.id); return;
    }
    if (!c?.other) return;
    h.innerHTML = `${menuBtn()}${av(c.other)}<span><b class="title">${esc(c.other.display_name)}</b> <small class="muted">${esc(stText[statusOf(c.other)])}${c.other.custom_status ? ' – ' + esc(c.other.custom_status) : ''}</small></span><span class="grow"></span>${sbtn}`;
  }
  bindMenu(); bindMsgSearch();
}
function renderHome(main) {
  const sv = S.sv, text = S.chans.filter(c => c.kind === 'text');
  main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('home', 20)}</span><b class="title">Home</b></div><div class="panel">${sv ? `<div class="hero">${svIcon(sv, 'big')}<div><h1>${esc(sv.name)}</h1><p class="muted">${esc(sv.description || 'Conestoga 2030')}</p><p class="muted">${S.members.length} members, ${onlineCount()} online</p></div></div>
  <h3 class="lbl">Channels</h3>${text.map(c => `<button class="row" data-ch="${c.id}">${chIcon(c)}<span class="t"><b>${esc(c.name)}</b><small>${esc(c.description || 'No description')}</small></span>${S.chUnread[c.id] ? `<span class="pill red">${S.chUnread[c.id]}</span>` : ''}</button>`).join('') || '<p class="muted">No channels yet.</p>'}` : `<p class="empty">${S.loaded ? 'You are not in the server yet.' : 'Loading…'}</p>`}</div>`;
  bindMenu(); main.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => openChan(b.dataset.ch));
}
function emojiPicker(ta, btn) {
  const old = $('.emoji'); if (old) return old.remove();
  const box = document.createElement('div'); box.className = 'emoji';
  box.innerHTML = EMOJI.map(e => `<button type="button" aria-label="Insert ${e}">${e}</button>`).join('');
  box.onclick = e => { const b = e.target.closest('button'); if (!b) return; ta.setRangeText(b.textContent, ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); ta.focus(); box.remove(); };
  $('.composer').append(box);
  const off = e => { if (!box.isConnected) return document.removeEventListener('pointerdown', off); if (!box.contains(e.target) && !btn.contains(e.target)) { box.remove(); document.removeEventListener('pointerdown', off); } };
  setTimeout(() => document.addEventListener('pointerdown', off));
}
let lastMainView = null;
function renderMain(loading) {   // wraps the real renderer: page transition when the section changes, then tab slider + scroll reveal
  const m = $('#main');
  if (m) { if (S.view !== lastMainView) { if (lastMainView) pageSwap(m); lastMainView = S.view; } m.dataset.view = S.view; }
  renderMainInner(loading);
  if (m) afterMain(m);
}
function renderMainInner(loading) {
  $('#app')?.classList.toggle('side-off', (S.view === 'gamer' || S.view === 'gamble' || S.view === 'orbitcraft') && !!S.sideOff);
  const main = $('#main'); if (!main) return;
  if (S.view === 'orbitcraft') {
    // Preserve a live game iframe when unrelated chat updates redraw the shell.
    if (!main.querySelector('[data-orbitcraft]')) {
      main.innerHTML = `<div class="top gtop"><button class="ib gtog" id="octog" aria-label="Show or hide sidebar" title="Show or hide sidebar">${ic('chev')}</button>${menuBtn()}<span class="hashi">${ic('gamepad', 20)}</span><b class="title">Orbitcraft</b><span class="grow"></span><span class="muted">Shared public world</span></div><div class="gamer-wrap"><iframe data-orbitcraft class="gframe" src="../orbitcraft/?autojoin=1&v=20261103-stations11" title="Orbitcraft multiplayer sandbox" allow="fullscreen" allowfullscreen></iframe></div>`;
    }
    $('#octog', main).onclick = () => { S.sideOff = !S.sideOff; renderMain(); };
    bindMenu(); O.onView(S.view); O.gameOpen(true); return;
  }
  O.onView(S.view); if (O.handles(S.view)) return O.render(main);
  if (TN.handles(S.view)) return TN.render(main);
  if (GB.handles(S.view)) return GB.render(main);
  if (CM.handles(S.view)) return CM.render(main);
  if (S.view === 'friends') return renderFriends(main);
  if (S.view === 'home') return renderHome(main);
  if (S.view === 'suggestions') return renderSuggestions(main);
  if (S.view === 'tutorials') return renderTutorials(main);
  if (S.view === 'leaderboard') return renderLeaderboard(main);
  if (S.view === 'shop') return SHOP.render(main);
  if (S.view === 'gamer') return renderGamer(main);
  if (S.view === 'support') return renderSupport(main);
  if (S.view === 'roles') return renderRoles(main);
  if (S.view === 'call') return renderCall(main);
  const ch = S.view === 'server' ? S.ch : null, c = S.view === 'dm' ? S.convs.find(x => x.id === S.active) : null;
  if (S.view === 'server' && !ch) { main.innerHTML = `<div class="top">${menuBtn()}<b class="title">${esc(S.sv?.name || 'Orbit')}</b></div><div class="empty"><h2>${S.sv ? 'No channel selected' : S.loaded ? 'You are not in the server yet' : 'Loading…'}</h2><p>${S.sv ? 'Pick a text channel from the list.' : S.loaded ? 'Try reloading the page. If this keeps happening, tell the site admin.' : ''}</p></div>`; bindMenu(); return; }
  if (!c && !ch) { main.innerHTML = `<div class="top">${menuBtn()}<b class="title">Direct messages</b></div><div class="empty"><h2>Find someone to talk to</h2><p>Start a conversation with the + button, or add friends from the Friends tab.</p><button class="btn" id="ne" style="width:auto">New message</button> <button class="btn ghost" id="ne2" style="width:auto">New group chat</button></div>`; bindMenu(); $('#ne').onclick = newDmModal; $('#ne2').onclick = () => groupPicker(); return; }
  main.innerHTML = `<div class="top" id="head"></div><button class="pinbar" id="pb" hidden></button><div class="msgs" id="msgs" tabindex="0" aria-live="polite">${loading ? '<div class="sk"></div>'.repeat(5) : ''}</div><div class="typing" id="typ"></div>
  <div class="composer"><div class="replybar" id="rb" hidden></div><div class="pfiles" id="pf" hidden></div>${O.fmtBar()}<div class="box"><div class="ac" id="ac" role="listbox" aria-label="Suggestions" hidden></div><button class="ib" id="att" title="Attach files" aria-label="Attach files">${ic('paperclip')}</button><button class="ib" id="cam" title="Take a photo" aria-label="Take a photo">${ic('camera')}</button><input type="file" id="fi" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,application/zip,audio/*,video/mp4,video/webm"><button class="ib" id="pol" title="Create a poll" aria-label="Create a poll">${ic('poll')}</button><button class="ib" id="gft" title="Gift Orbits" aria-label="Gift Orbits">${ic('gift')}</button><textarea id="in" rows="1" placeholder="${esc(ch ? 'Message #' + ch.name : 'Message ' + convName(c))}" maxlength="4000" aria-label="Message"></textarea><button class="ib" id="spo" title="Spoiler: hide the selected text until someone clicks it" aria-label="Spoiler">${ic('eyeOff')}</button><button class="ib gifb" id="gif" title="Send a GIF" aria-label="Send a GIF">GIF</button><button class="ib" id="emo" title="Emoji" aria-label="Emoji">${ic('smile')}</button>${dictateBtn ? dictateBtn(ic) : ''}${O.fmtToggle()}${O.aiBtn()}<button class="send" id="snd" title="Send" aria-label="Send message">${ic('send', 18)}</button></div></div>`;
  renderHead();
  const ta = $('#in'), wrap = f => { const s = ta.selectionStart, e = ta.selectionEnd; ta.setRangeText(f + ta.value.slice(s, e) + f, s, e, 'select'); };
  ta.onkeydown = e => {
    if (acKey(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); wrap('**'); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); wrap('*'); }
  };
  ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; sendTyping(); acUpdate(ta); };
  ta.onblur = () => setTimeout(acClose, 150); ta.onclick = () => acUpdate(ta);
  $('#snd').onclick = send; $('#gif').onclick = gifModal; $('#emo').onclick = () => emojiPicker(ta, $('#emo'));
  $('#gft').onclick = giftModal; $('#pol').onclick = pollModal; $('#spo').onclick = () => { ta.focus(); const s = ta.selectionStart, e = ta.selectionEnd; if (s === e) { ta.setRangeText('||||', s, e, 'end'); ta.setSelectionRange(s + 2, s + 2); } else wrap('||'); ta.dispatchEvent(new Event('input')); };
  $('#cam').onclick = photoModal; $('#att').onclick = () => $('#fi').click(); $('#fi').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
  ta.onpaste = e => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } };
  renderPending(); O.bindFmt(ta); O.bindAiBtn(ta); bindDictate?.(ta, $('#dic'), toast);
  const box = $('#msgs');
  box.onscroll = async () => { if (box.scrollTop < 60 && S.hasMore && !S.loadingOlder && S.list.length) { S.loadingOlder = true; const h = box.scrollHeight; await fetchMsgs(S.list[0].created_at); renderMsgs(false, true); box.scrollTop = box.scrollHeight - h; S.loadingOlder = false; } };
  box.onclick = onMsgClick; box.addEventListener('load', e => { if (box.dataset.stick === '1' && /^(IMG|VIDEO)$/.test(e.target.tagName)) box.scrollTop = box.scrollHeight; }, true);
  if (isVidCh()) { $('#fi').accept = 'video/mp4,video/webm'; ['#pol', '#gif', '#spo', '#cam', '#gft', '#emo'].forEach(q => { const b = $(q); if (b) b.style.display = 'none'; }); ta.placeholder = 'Title your tutorial (for example: How to play Tetris), then attach the video'; }
  if (!loading) renderMsgs(true);
  applyLimit(); scheduleLimit(); updatePinBar();
}

/* ───────── emoji-only messages grow (1 to 3 emojis); with more than 3 they stay normal size so chats don't get flooded ───────── */
const _gseg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const isEmojiG = g => /\p{Emoji_Presentation}|\uFE0F|\u20E3|\p{Regional_Indicator}/u.test(g) || (/\p{Extended_Pictographic}/u.test(g) && g.length > 1);
function jumboOk(text) {
  if (!_gseg || !text || text.length > 60) return false; let n = 0;
  for (const { segment } of _gseg.segment(String(text))) { if (/^\s+$/.test(segment)) continue; if (!isEmojiG(segment) || ++n > 3) return false; }
  return n > 0;
}
function ruleHtml(m) {   // the #rules channel: just the rules, no names, avatars, times or reactions
  if (m.is_system) return '';
  const n = S.list.filter(x => !x.is_system).findIndex(x => x.id === m.id) + 1, ed = canEditRules() && !m.pending && !m.has_poll;
  return `<div class="msg rule ${m.pending ? 'pending' : ''}" data-id="${m.id}"><span class="rnum" aria-hidden="true">${n || '•'}</span><div class="body"><div>${md(m.content, m.id)}${m.edited_at ? ' <small class="muted">(edited)</small>' : ''}</div>${attHtml(m)}</div>${ed ? '<div class="acts"><button data-a="edit" title="Edit rule" aria-label="Edit rule">✎</button><button data-a="del" title="Delete rule" aria-label="Delete rule">🗑</button></div>' : ''}</div>`;
}
function msgHtml(m, prev) {
  if (m.gift_id) return giftHtml(m, prev);
  if (isVidCh()) return tutHtml(m);
  if (S.view === 'server' && isRulesCh(S.ch)) return ruleHtml(m);
  const p = prof(m.author_id), mine = m.author_id === S.me.id;
  const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
  const cont = prev && !newDay && prev.author_id === m.author_id && !m.reply_to && !prev.is_system && new Date(m.created_at) - new Date(prev.created_at) < 3e5;
  if (m.is_system) return `${newDay ? `<div class="divider"><span>${day(m.created_at)}</span></div>` : ''}<div class="msg sys" data-id="${m.id}"><span class="sysi" aria-hidden="true">👋</span><div class="body">${md(m.content, m.id)} <small class="muted">${stamp(m.created_at)}</small></div></div>`;
  const sep = S.readMark && prev && m.author_id !== S.me.id && m.created_at > S.readMark && prev.created_at <= S.readMark ? '<div class="divider new"><span>New Messages</span></div>' : '';
  const orig = m.reply_to && S.list.find(x => x.id === m.reply_to);
  const rxs = {}; (S.rx.get(m.id) || []).forEach(r => { (rxs[r.emoji] ||= []).push(r.user_id); });
  return `${newDay ? `<div class="divider"><span>${day(m.created_at)}</span></div>` : ''}${sep}
  <div class="msg ${cont ? 'cont' : ''} ${m.pending ? 'pending' : ''} ${mentionsMe(m) ? 'mentioned' : ''}" data-id="${m.id}">${av(p)}<div class="body">
  ${m.reply_to ? `<div class="reply">↪ ${orig ? esc(prof(orig.author_id).display_name) + ': ' + esc(plain(orig.content || 'Attachment').slice(0, 60)) : 'Original message'}</div>` : ''}
  <div class="head"><b data-a="prof" data-u="${p.id}" style="--c:${esc(p.avatar_color)}">${esc(p.display_name)}</b>${roleBadge(p.id)}${SHOP.coHtml?.(p.id) || ''}<small>${stamp(m.created_at)}</small>${S.pins.has(m.id) ? '<small title="Pinned">📌</small>' : ''}</div>
  ${m.has_poll && S.polls.has(m.id) ? pollHtml(m) : `<div${jumboOk(m.content) ? ' class="jumbo"' : ''}>${md(m.content, m.id)}${m.edited_at ? ' <small class="muted">(edited)</small>' : ''}</div>`}${attHtml(m)}
  <div class="rx">${Object.entries(rxs).map(([e, u]) => `<button data-a="rx" data-e="${e}" class="${u.includes(S.me.id) ? 'mine' : ''}" aria-label="${e} ${u.length}">${e} ${u.length}</button>`).join('')}</div></div>
  ${m.pending ? '' : `<div class="acts">${['👍', '❤️', '😂'].map(e => `<button data-a="rx" data-e="${e}" aria-label="React ${e}">${e}</button>`).join('')}<button data-a="reply" title="Reply" aria-label="Reply">↩</button><button data-a="copy" title="Copy" aria-label="Copy message">⧉</button>${S.view === 'server' && can('pin_messages') ? `<button data-a="pin" title="${S.pins.has(m.id) ? 'Unpin' : 'Pin'}" aria-label="Pin message">📌</button>` : ''}${!mine && S.view === 'server' ? '<button data-a="report" title="Report" aria-label="Report message">⚑</button>' : ''}${!mine && S.view === 'server' && can('delete_messages') ? '<button data-a="del" title="Delete (moderator)" aria-label="Delete">🗑</button>' : ''}${mine ? (m.has_poll ? '' : '<button data-a="edit" title="Edit" aria-label="Edit">✎</button>') + '<button data-a="del" title="Delete" aria-label="Delete">🗑</button>' : ''}</div>`}</div>`;
}
/* ───────── Delivered / Read captions under the last message you sent in a DM ───────── */
function paintReceipt() {
  const box = $('#msgs'); if (!box) return; box.querySelectorAll('.rcpt').forEach(e => e.remove());
  if (S.view !== 'dm') return;
  const c = S.convs.find(x => x.id === S.active); if (!c) return;
  const last = [...S.list].reverse().find(m => m.author_id === S.me.id && !m.is_system); if (!last) return;
  const el = box.querySelector(`.msg[data-id="${last.id}"] .body`); if (!el) return;
  const saw = t => t && new Date(t) >= new Date(last.created_at);
  let read, text;
  if (c.is_group) {
    const ids = (c.mems || []).filter(id => id !== S.me.id), n = ids.filter(id => saw(c.reads?.[id])).length;
    read = !last.pending && n > 0; text = last.pending ? 'Sending…' : n === 0 ? '✓ Delivered' : n === ids.length ? '✓✓ Read by everyone' : `✓✓ Read by ${n}`;
  } else { read = !last.pending && saw(c.other_read_at); text = last.pending ? 'Sending…' : read ? '✓✓ Read' : '✓ Delivered'; }
  el.insertAdjacentHTML('beforeend', `<div class="rcpt${read ? ' read' : ''}" role="status">${text}</div>`);
}
function onReadUpdate(p) {
  const r = p.new; if (!r || r.user_id === S.me?.id) return;
  const c = S.convs.find(x => x.id === r.conversation_id); if (!c) return;
  (c.reads ||= {})[r.user_id] = r.last_read_at; if (!c.is_group) c.other_read_at = r.last_read_at;
  if (S.view === 'dm' && S.active === c.id) paintReceipt();
}
addEventListener('focus', () => { if (S?.view === 'dm' && S.active) markRead(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && S?.view === 'dm' && S.active) markRead(); });
function renderMsgs(forceBottom, keep) {
  const box = $('#msgs'); if (!box) return;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 140;
  box.classList.toggle('gallery', isVidCh());
  box.innerHTML = S.list.length ? S.list.map((m, i) => msgHtml(m, S.list[i - 1])).join('') : isVidCh() ? '<div class="empty"><h2>No tutorials yet</h2><p>Know how to play a game? Attach a video below and give it a title so others can learn.</p></div>' : S.view === 'server' && isRulesCh(S.ch) ? `<div class="empty"><h2>Rules</h2><p>${canEditRules() ? 'No rules yet. Type the first rule below.' : 'No rules have been posted yet.'}</p></div>` : `<div class="empty"><h2>${S.view === 'server' && S.ch ? 'Welcome to #' + esc(S.ch.name) : 'Say hello'}</h2><p>${S.view === 'server' ? 'This is the start of the channel. Be the first to post.' : (S.convs.find(x => x.id === S.active)?.is_group ? 'This is the start of your group chat. Messages are private to the people in it.' : 'This is the start of your conversation. Messages are private to the two of you.')}</p></div>`;
  if (!keep && (forceBottom || near)) { box.scrollTop = box.scrollHeight; box.dataset.stick = '1'; clearTimeout(box._st); box._st = setTimeout(() => { box.dataset.stick = ''; }, 4000); }
  hydrateAtts(box); paintReceipt(); loadGifts();
  const rb = $('#rb'); if (rb) { rb.hidden = !S.replyTo; if (S.replyTo) { rb.innerHTML = `<span>Replying to ${esc(prof(S.replyTo.author_id).display_name)}</span><button class="linkbtn" id="xr" aria-label="Cancel reply">✕</button>`; $('#xr').onclick = () => { S.replyTo = null; renderMsgs(); }; } }
}
async function onMsgClick(e) {
  const a = e.target.closest('[data-a]'); if (!a) return; const id = a.closest('.msg')?.dataset.id; const m = S.list.find(x => x.id === id); const act = a.dataset.a;
  if (act === 'prof') return profileModal(a.dataset.u);
  if (act === 'chan') return openChan(a.dataset.ch);
  if (act === 'role') return roleModal(a.dataset.rl);
  if (act === 'togif') return pictureGifModal(a.dataset.p, a.dataset.n);
  if (!m) return;
  if (act === 'reply') { S.replyTo = m; renderMsgs(); $('#in').focus(); }
  else if (act === 'claimgift') claimGift(m.gift_id, a);
  else if (act === 'cancelgift') cancelGift(m.gift_id, a);
  else if (act === 'vote') votePoll(m, a.dataset.o);
  else if (act === 'endpoll') endPoll(m);
  else if (act === 'pin') { const { error } = await sb.rpc('pin_message', { p_message: m.id, p_pin: !S.pins.has(m.id) }); if (error) toast(error.message, true); else { await loadPins(); renderMsgs(); updatePinBar(); } }
  else if (act === 'report') reportModal(m);
  else if (act === 'copy') { try { await navigator.clipboard.writeText(m.content); toast('Copied'); } catch { toast('Copy is blocked by this browser.', true); } }
  else if (act === 'rx') {
    const mine = (S.rx.get(m.id) || []).find(r => r.user_id === S.me.id && r.emoji === a.dataset.e);
    const { error } = mine ? await sb.from('message_reactions').delete().match({ message_id: m.id, user_id: S.me.id, emoji: a.dataset.e }) : await sb.from('message_reactions').insert({ message_id: m.id, user_id: S.me.id, emoji: a.dataset.e });
    if (error) return toast(error.message, true);
    onRx({ eventType: mine ? 'DELETE' : 'INSERT', old: { message_id: m.id, user_id: S.me.id, emoji: a.dataset.e }, new: { message_id: m.id, user_id: S.me.id, emoji: a.dataset.e } });
  } else if (act === 'edit') modal('Edit message', `<textarea id="ed" rows="4" maxlength="4000">${esc(m.content)}</textarea>`, [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save', fn: async bg => {
    const v = $('#ed', bg).value.trim(); if (!v && !m.attachments?.length) { toast('Message can\'t be empty.', true); return false; }
    let r = await sb.rpc('edit_message', { p_id: m.id, p_content: v });
    if (r.error?.code === 'PGRST202') r = await sb.from('messages').update({ content: v }).eq('id', m.id).select().single();   // moderation SQL not installed yet: old behaviour
    const { data, error } = r;
    if (error) { toast(error.message, true); return false; }
    if (data?.blocked) { modNotice(data); return false; }
    upsert(data); renderMsgs(); } }]);
  else if (act === 'del') confirmBox('Delete message?', 'This permanently removes the message for everyone in the conversation.', 'Delete', async () => {
    const { error } = await sb.from('messages').delete().eq('id', m.id); if (error) { toast(error.message, true); return false; }
    if (m.attachments?.length && m.author_id === S.me.id) sb.storage.from('attachments').remove(m.attachments.map(a => a.path));
    S.list = S.list.filter(x => x.id !== m.id); renderMsgs(); });
}
async function send() {
  const ta = $('#in'); if (!ta || S.sending) return;
  const text = ta.value.trim(), files = S.pending.slice(), K = col(), A = S.active, reply = S.replyTo;
  if ((!text && !files.length) || !A) return;
  if (isVidCh() && (!files.length || files.some(f => !String(f.type).startsWith('video/')))) return toast('This channel only takes videos. Attach a tutorial video first.', true);
  let atts = [];
  if (files.length) {
    S.sending = true; $('#snd').disabled = true; toast(files.length > 1 ? 'Uploading files…' : 'Uploading file…');
    try { atts = await uploadFiles(files, A); }
    catch (e) { S.sending = false; applyLimit(); return toast('Upload failed: ' + (e.message || e), true); }
  }
  const same = () => S.active === A && $('#in');
  const tmp = { id: 'tmp' + Date.now(), author_id: S.me.id, content: text, attachments: [], created_at: new Date().toISOString(), reply_to: reply?.id || null, pending: true };
  if (same()) { S.list.push(tmp); S.replyTo = null; ta.value = ''; ta.style.height = 'auto'; renderMsgs(true); }
  let sent = await sb.rpc('send_message', { p_channel: K === 'channel_id' ? A : null, p_conversation: K === 'conversation_id' ? A : null, p_content: text, p_attachments: atts, p_reply_to: reply?.id || null });
  if (sent.error?.code === 'PGRST202') sent = await sb.from('messages').insert({ [K]: A, author_id: S.me.id, content: text, ...(atts.length ? { attachments: atts } : {}), reply_to: reply?.id || null }).select().single();   // moderation SQL not installed yet: old behaviour
  const rejected = !sent.error && sent.data?.blocked ? sent.data : null, error = sent.error, data = rejected ? null : sent.data;
  S.list = S.list.filter(x => x.id !== tmp.id);
  if (files.length) { S.sending = false; }
  if (error || rejected) {
    if (atts.length) sb.storage.from('attachments').remove(atts.map(a => a.path));
    if (rejected) modNotice(rejected); else toast('Message not sent: ' + error.message, true);
    if (same()) { ta.value = text; S.replyTo = reply; }
    if (error && /row-level security|permission denied/i.test(error.message)) verifyAccess();
  } else {
    if (files.length && same()) { clearPending(); renderPending(); }
    if (S.active === A) upsert(data);
    const c = S.convs.find(x => x.id === A); if (c) { Object.assign(c, { last_message_at: data.created_at, last_message_preview: (text || 'Sent an attachment').slice(0, 80), last_author: S.me.id, last_read_at: data.created_at }); renderSide(); }
  }
  if (same()) { applyLimit(); renderMsgs(true); }
}

/* ───────── modals: new DM, profile, search, settings ───────── */
function newDmModal() {
  modal('New message', `<input id="us" placeholder="Search by username" aria-label="Search by username"><div id="ur" class="list" style="max-height:260px"></div>`, [{ label: 'Close', cls: 'ghost' }], (bg, close) => {
    const run = debounce(async () => {
      const q = $('#us', bg).value.trim().toLowerCase().replace(/[^a-z0-9_]/g, ''); const out = $('#ur', bg); if (q.length < 2) return out.innerHTML = '<p class="muted">Type at least 2 characters.</p>';
      const { data, error } = await sb.from('profiles').select('*').ilike('username', q + '%').neq('id', S.me.id).limit(8);
      if (error) return out.innerHTML = `<p class="err">${esc(error.message)}</p>`;
      data.forEach(p => S.profiles.set(p.id, p));
      out.innerHTML = data.map(p => `<button class="row" data-u="${p.id}">${av(p)}<span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></span></button>`).join('') || '<p class="muted">No users found.</p>';
      out.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { close(); startDm(b.dataset.u); });
    }, 250);
    $('#us', bg).oninput = run;
  });
}
async function startDm(uid) {
  const { data, error } = await sb.rpc('start_dm', { other: uid }); if (error) return toast(error.message, true);
  await loadConvs(); S.view = 'dm'; renderAll(); openConv(data);
}
/* ───────── group chats: make one, rename it, add or remove people, leave ───────── */
function groupPicker(cid) {   // no cid: make a new group. With a cid: add people to that group.
  const c = cid && S.convs.find(x => x.id === cid), adding = !!c, taken = new Set(c ? c.mems : [S.me.id]), room = adding ? 10 - c.mems.length : 9, need = adding ? 1 : 2, picked = new Map();
  let found = null;
  modal(adding ? 'Add people' : 'New group chat', `${adding ? '' : '<input id="gn" placeholder="Group name (optional)" maxlength="50" aria-label="Group name" style="margin-bottom:8px">'}<div id="gp" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px"></div><input id="gs" placeholder="Search by username, or pick a friend" aria-label="Search by username"><div id="gr" class="list" style="max-height:220px"></div><p class="muted" id="gh" style="font-size:12px"></p>`,
    [{ label: 'Cancel', cls: 'ghost' }, { label: adding ? 'Add' : 'Create group', fn: async bg => {
      if (picked.size < need) { toast(adding ? 'Pick at least one person.' : 'Pick at least 2 people. For one person, send a direct message.', true); return false; }
      const ids = [...picked.keys()];
      const { data, error } = adding ? await sb.rpc('add_group_members', { cid, p_members: ids }) : await sb.rpc('create_group_chat', { p_name: $('#gn', bg).value.trim() || null, p_members: ids });
      if (error) { toast(grpErr(error), true); return false; }
      await loadConvs(); S.view = 'dm'; renderAll(); openConv(adding ? cid : data);
    } }], bg => {
      const paint = () => {
        $('#gp', bg).innerHTML = [...picked.values()].map(p => `<button type="button" class="chip gchip" data-x="${p.id}" title="Remove" aria-label="Remove ${esc(p.display_name)}">${esc(p.display_name)} ✕</button>`).join('');
        $('#gh', bg).textContent = `${picked.size} picked. ` + (adding ? `You can add up to ${room} more.` : 'Pick 2 to 9 people. Groups hold up to 10, including you.');
        const list = (found || S.friends.map(prof).filter(p => p.username !== 'unknown')).filter(p => !taken.has(p.id));
        $('#gr', bg).innerHTML = list.map(p => `<button type="button" class="row" data-u="${p.id}">${av(p)}<span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></span>${picked.has(p.id) ? '<span class="badge">✓</span>' : ''}</button>`).join('') || `<p class="muted">${found ? 'No users found.' : 'No friends to pick from yet. Search by username.'}</p>`;
        bg.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { picked.delete(b.dataset.x); paint(); });
        bg.querySelectorAll('#gr [data-u]').forEach(b => b.onclick = () => {
          const id = b.dataset.u; if (picked.has(id)) picked.delete(id); else if (picked.size >= room) return toast('Groups can have up to 10 people.', true); else picked.set(id, prof(id));
          paint();
        });
      };
      const run = debounce(async () => {
        const q = $('#gs', bg).value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (q.length < 2) { found = null; return paint(); }
        const { data, error } = await sb.from('profiles').select('*').ilike('username', q + '%').neq('id', S.me.id).limit(8);
        if (error) return toast(error.message, true);
        data.forEach(p => S.profiles.set(p.id, p)); found = data; paint();
      }, 250);
      $('#gs', bg).oninput = run; paint();
    });
}
function groupModal(cid) {
  const c = S.convs.find(x => x.id === cid); if (!c?.is_group) return;
  const mine = c.created_by === S.me.id, people = (c.mems || []).map(prof).sort((a, b) => (b.id === S.me.id) - (a.id === S.me.id) || (a.display_name || '').localeCompare(b.display_name || ''));
  modal('Group chat', `<h3 class="lbl" style="margin-left:0">Name</h3><div style="display:flex;gap:6px"><input id="gnm" value="${esc(c.name || '')}" maxlength="50" placeholder="${esc(gOthers(c).map(p => p.display_name).join(', '))}" aria-label="Group name"><button type="button" class="btn" id="gsv" style="width:auto">Save</button></div><p class="muted" style="font-size:12px">Anyone in the group can rename it. Leave it empty to show everyone's names.</p>
    <h3 class="lbl" style="margin-left:0">People (${people.length} of 10)</h3><div class="list" style="max-height:260px">${people.map(p => `<div class="row" style="cursor:default">${av(p)}<span class="t"><b>${esc(p.display_name)}${p.id === S.me.id ? ' (you)' : ''}</b><small>@${esc(p.username)}${p.id === c.created_by ? ' · made this group' : ''}</small></span>${mine && p.id !== S.me.id ? `<button type="button" class="btn ghost" data-rm="${p.id}" style="width:auto">Remove</button>` : ''}</div>`).join('')}</div>${mine ? '' : '<p class="muted" style="font-size:12px">Only the person who made the group can remove people.</p>'}`,
    [{ label: 'Close', cls: 'ghost' }, ...(people.length < 10 ? [{ label: 'Add people', cls: 'ghost', fn: () => { setTimeout(() => groupPicker(cid)); } }] : []),
      { label: 'Leave group', cls: 'danger', fn: () => { setTimeout(() => confirmBox('Leave this group?', people.length <= 1 ? 'You are the last person here, so the group and its messages will be deleted.' : 'You will stop getting its messages. Someone in the group can add you back.', 'Leave', async () => {
        const { error } = await sb.rpc('leave_group', { cid }); if (error) { toast(grpErr(error), true); return false; }
        S.lastDm = null; S.active = null; await loadConvs(); navTo('dm');
      })); } }], (bg, close) => {
      const refresh = async () => { await loadConvs(); renderSide(); if (S.view === 'dm' && S.active === cid) renderHead(); };
      $('#gsv', bg).onclick = async () => {
        const { error } = await sb.rpc('rename_group', { cid, p_name: $('#gnm', bg).value.trim() || null }); if (error) return toast(grpErr(error), true);
        await refresh(); const ta = $('#in'); if (ta && S.active === cid) ta.placeholder = 'Message ' + convName(S.convs.find(x => x.id === cid)); close(); toast('Group name saved');
      };
      bg.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
        const { error } = await sb.rpc('remove_group_member', { cid, uid: b.dataset.rm }); if (error) return toast(grpErr(error), true);
        close(); await refresh(); toast('Removed'); if (S.convs.some(x => x.id === cid)) groupModal(cid);
      });
    });
}
function profileModal(uid) {
  const p = prof(uid), isMe = uid === S.me.id, fr = S.friends.includes(uid), out = S.outgoing.some(r => r.receiver_id === uid), inc = S.incoming.some(r => r.sender_id === uid);
  const mem = S.members.find(m => m.user_id === uid), t = tmoUntil(mem);
  modal(p.display_name, `<div style="display:flex;gap:12px;align-items:center">${av(p)}<div><b>@${esc(p.username)}</b><br><small class="muted">${esc(stText[statusOf(p)] || statusOf(p))}${lastSeenText(p) ? ' · ' + esc(lastSeenText(p)) : ''}${p.custom_status ? ' · ' + esc(p.custom_status) : ''}</small></div></div><p>${esc(p.bio) || '<span class="muted">No bio yet.</span>'}</p>${crOf(uid).length ? `<div class="rpills" aria-label="Classes">${crOf(uid).map(r => `<span class="rpill"${crStyle(r)}>${esc(crLabel(r))}</span>`).join('')}</div>` : isMe ? '<p class="muted">No classes picked yet.</p>' : ''}${mem && mem.role !== 'member' ? `<p class="muted">Role: ${roleBadge(uid)}</p>` : ''}${t ? `<p class="muted">Timed out until ${esc(t.toLocaleString())}</p>` : ''}`,
    [{ label: 'Close', cls: 'ghost' }, ...(isMe ? [{ label: 'Edit roles', fn: () => { navTo('roles'); } }] : [{ label: 'Message', fn: () => { startDm(uid); } }, ...(fr || out || inc ? [] : [{ label: 'Add friend', cls: 'ghost', fn: () => sendFriendRequest(p.username) }]), ...modButtons(uid)])], bg => SHOP.decorateProfile?.(bg, uid));
}
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.me) { e.preventDefault(); if (S.view !== 'home') navTo('home'); setTimeout(() => $('#oq')?.focus(), 60); } });
function bindOrbitSearch(inp, out) {
  const pages = [['home', 'Home'], ['dm', 'Direct Messages'], ['friends', 'Friends'], ['communities', 'Communities'], ['events', 'Events'], ['ai', 'Ask Orbit AI'], ['leaderboard', 'Orbit Leaderboard'], ['gamble', 'Orbit Casino'], ['orbitcraft', 'Orbitcraft'], ['shop', 'Orbit Shop'], ['support', 'Support'], ['gamer', 'Orbit Games'], ['tournaments', 'Tournaments'], ['roles', 'Roles'], ];
  const item = (kind, id, t, s) => `<button class="ores-i" data-k="${kind}" data-id="${esc(id)}"><span class="t"><b>${esc(t)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span></button>`;
  const group = (h, items) => items.length ? `<div class="ores-h">${h}</div>${items.join('')}` : '';
  let seq = 0;
  const run = async () => {
    const q = inp.value.trim(), ql = q.toLowerCase(), my = ++seq;
    if (!q) { out.hidden = true; out.innerHTML = ''; return; }
    const pg = pages.filter(([, l]) => l.toLowerCase().includes(ql)).slice(0, 4).map(([k, l]) => item('nav', k, l, 'Page'));
    const ch = (S.chans || []).filter(c => c.kind === 'text' && (c.name || '').toLowerCase().includes(ql)).slice(0, 5).map(c => item('chan', c.id, '#' + c.name, 'Channel'));
    const pp = [...S.profiles.values()].filter(p => p.id !== S.me.id && ((p.display_name || '').toLowerCase().includes(ql) || (p.username || '').toLowerCase().includes(ql))).slice(0, 6).map(p => item('user', p.id, p.display_name, '@' + p.username));
    const paint = msgs => { if (my !== seq) return; out.hidden = false; out.innerHTML = group('People', pp) + group('Channels', ch) + group('Pages', pg) + group('Messages in this chat', msgs) || '<p class="ores-none">No matches.</p>'; };
    paint([]);
    if (q.length >= 3 && S.active) {
      const { data } = await sb.from('messages').select('*').eq(col(), S.active).ilike('content', '%' + q.replace(/[%_\\]/g, '\\$&') + '%').order('created_at', { ascending: false }).limit(5);
      paint((data || []).map(m => item('msg', m.id, String(m.content).slice(0, 90), prof(m.author_id).display_name + ' · ' + new Date(m.created_at).toLocaleDateString())));
    }
  };
  inp.oninput = debounce(run, 150);
  inp.onfocus = () => { if (inp.value.trim()) run(); };
  inp.onkeydown = e => { if (e.key === 'Escape') { inp.value = ''; out.hidden = true; inp.blur(); } else if (e.key === 'Enter') out.querySelector('.ores-i[data-k]')?.click(); };
  out.onmousedown = e => e.preventDefault();   // keep focus so a click isn't lost
  out.onclick = e => {
    const b = e.target.closest('.ores-i[data-k]'); if (!b) return;
    const { k, id } = b.dataset; inp.value = ''; out.hidden = true; inp.blur();
    if (k === 'nav') navTo(id); else if (k === 'chan') openChan(id); else if (k === 'user') profileModal(id); else if (k === 'msg') jumpToMsg(id, true);
  };
  inp.onblur = () => setTimeout(() => { out.hidden = true; }, 120);
}
let MSQ = '', MSQ_FOR = null, msSeq = 0;
function bindMsgSearch() {
  const inp = $('#sq'), out = $('#sres'); if (!inp || !out) return;
  if (MSQ_FOR !== S.active) { MSQ = ''; MSQ_FOR = S.active; }
  inp.value = MSQ;
  const hide = () => { out.hidden = true; };
  const run = async () => {
    const q = inp.value.trim(), my = ++msSeq; MSQ = inp.value;
    if (q.length < 2) { hide(); out.innerHTML = ''; return; }
    const { data, error } = await sb.from('messages').select('*').eq(col(), S.active).ilike('content', '%' + q.replace(/[%_\\]/g, '\\$&') + '%').order('created_at', { ascending: false }).limit(20);
    if (my !== msSeq) return;
    out.hidden = false;
    if (error) { out.innerHTML = `<p class="ores-none">${esc(error.message)}</p>`; return; }
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out.innerHTML = (data || []).map(m => `<button type="button" class="ores-i" data-mid="${esc(m.id)}"><span class="t"><small>${esc(prof(m.author_id).display_name)} · ${new Date(m.created_at).toLocaleString()}</small>${esc(String(m.content).slice(0, 140)).replace(re, x => `<mark>${x}</mark>`)}</span></button>`).join('') || '<p class="ores-none">No matches.</p>';
  };
  inp.oninput = debounce(run, 200);
  inp.onfocus = () => { if (inp.value.trim().length >= 2) run(); };
  inp.onkeydown = e => { if (e.key === 'Escape') { inp.value = ''; MSQ = ''; hide(); inp.blur(); } else if (e.key === 'Enter') out.querySelector('[data-mid]')?.click(); };
  out.onmousedown = e => e.preventDefault();   // keep focus so the click lands
  out.onclick = e => { const b = e.target.closest('[data-mid]'); if (!b) return; hide(); inp.blur(); jumpToMsg(b.dataset.mid); };
  inp.onblur = () => setTimeout(hide, 120);
}
// Scroll to a message and flash it. Loads older history first if the message isn't on screen yet.
async function jumpToMsg(id, fromHome) {
  if (fromHome && !$('#msgs')) { if (S.chans.some(x => x.id === S.active)) await openChan(S.active); else await openConv(S.active); }
  let tries = 0;
  while (!S.list.some(m => m.id === id) && S.hasMore && tries++ < 40) {
    const oldest = S.list.reduce((a, m) => (!a || m.created_at < a ? m.created_at : a), null), n = S.list.length;
    await fetchMsgs(oldest); if (S.list.length === n) break;
  }
  if (!S.list.some(m => m.id === id)) return toast('Could not find that message.', true);
  renderMsgs(false, true);
  const el = $('#msgs')?.querySelector(`.msg[data-id="${CSS.escape(id)}"]`); if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('jump-hl'); setTimeout(() => el.classList.remove('jump-hl'), 2300);
}
function searchModal() {
  modal('Search this conversation', `<input id="sq" placeholder="Search messages" aria-label="Search messages"><div id="sr" class="list" style="max-height:300px;margin-top:8px"></div>`, [{ label: 'Close', cls: 'ghost' }], bg => {
    $('#sq', bg).oninput = debounce(async e => {
      const q = e.target.value.trim(); const out = $('#sr', bg); if (q.length < 2) return out.innerHTML = '';
      const { data, error } = await sb.from('messages').select('*').eq(col(), S.active).ilike('content', '%' + q.replace(/[%_\\]/g, '\\$&') + '%').order('created_at', { ascending: false }).limit(30);
      if (error) return out.innerHTML = `<p class="err">${esc(error.message)}</p>`;
      const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out.innerHTML = data.map(m => `<div class="row"><span class="t"><small>${esc(prof(m.author_id).display_name)} · ${new Date(m.created_at).toLocaleString()}</small>${esc(m.content).replace(re, x => `<mark>${x}</mark>`)}</span></div>`).join('') || '<p class="muted">No matches.</p>';
    }, 300);
  });
}
function settingsModal() {
  const m = S.me;
  modal('Settings', `<label>Name</label><div class="row" style="cursor:default"><span class="t"><b>${esc(m.display_name)}</b><small>🔒 Taken from your school account, can't be changed</small></span></div>
  <label for="s2">Bio</label><textarea id="s2" rows="2" maxlength="190">${esc(m.bio)}</textarea>
  <label for="s3">Status</label><select id="s3">${[['online', 'Online'], ['idle', 'Idle'], ['dnd', 'Do not disturb'], ['invisible', 'Invisible']].map(([v, l]) => `<option value="${v}" ${m.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <label for="s4">Custom status</label><input id="s4" maxlength="80" value="${esc(m.custom_status)}">
  <label>Profile picture</label><div class="avrow"><span id="avp" class="avbig">${av(m)}</span><div class="avbtns"><button type="button" class="btn ghost sm" id="avu">Upload photo</button><button type="button" class="btn ghost sm" id="avc">${ic('camera', 14)} Take photo</button><button type="button" class="btn ghost sm" id="avr" ${avatarSrc(m) ? '' : 'hidden'}>Remove</button></div><input type="file" id="avf" accept="image/*" hidden></div>
  <label for="s5">Avatar color (shown when you have no photo)</label><input id="s5" type="color" value="${esc(m.avatar_color)}" style="height:38px;padding:2px">
  <div id="curbox" style="margin-top:.8rem"></div>
  <label>Notifications</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span>Desktop banners: <b id="nst"></b></span><button type="button" class="btn ghost sm" id="nen">Turn on</button><button type="button" class="btn ghost sm" id="nsnd">Test sound</button></div>
  <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="nall" style="width:auto"> Notify me for every channel message, not just DMs, announcements and @mentions</label>
  <label for="s7">New password (optional)</label><input id="s7" type="password" minlength="8" autocomplete="new-password">`,
    [{ label: 'Log out', cls: 'ghost', fn: () => { sb.auth.signOut(); } }, ...(canAdmin() ? [{ label: 'Admin dashboard', cls: 'ghost', fn: () => { setTimeout(() => adminDashboard()); } }] : []), { label: 'Cancel', cls: 'ghost' }, { label: 'Save', fn: async bg => {
      const upd = { bio: $('#s2', bg).value, status: $('#s3', bg).value, custom_status: $('#s4', bg).value, avatar_color: $('#s5', bg).value };
      const { data, error } = await sb.from('profiles').update(upd).eq('id', S.me.id).select().single(); if (error) { toast(error.message, true); return false; }
      const pw = $('#s7', bg).value; if (pw) { if (pw.length < 8) { toast('Password must be at least 8 characters.', true); return false; } const r = await sb.auth.updateUser({ password: pw }); if (r.error) { toast(r.error.message, true); return false; } }
      S.me = data; S.profiles.set(data.id, data); trackStatus(); renderAll(); toast('Settings saved'); } }], (bg, close) => { notifyBind(bg); avatarBind(bg, close); const cb = $('#curbox', bg); if (cb && window.StgCursor) cb.append(window.StgCursor.panel()); });
}

/* ───────── friends ───────── */
async function sendFriendRequest(username) {
  const u = username.trim().toLowerCase().replace(/^@/, ''); if (!u) return false;
  const { data: t } = await sb.from('profiles').select('id').eq('username', u).maybeSingle();
  if (!t) { toast('No user named @' + u, true); return false; } if (t.id === S.me.id) { toast("You can't add yourself.", true); return false; }
  const { error } = await sb.from('friend_requests').insert({ sender_id: S.me.id, receiver_id: t.id });
  if (error) { toast(error.code === '23505' ? 'A request between you two already exists. Check Pending.' : error.message, true); return false; }
  toast('Friend request sent'); await loadFriends(); renderSide(); S.view === 'friends' && renderMain();
}
function renderFriends(main) {
  const tabs = [['online', 'Online'], ['all', 'All'], ['pending', `Pending${S.incoming.length ? ' (' + S.incoming.length + ')' : ''}`], ['add', 'Add friend']];
  const fl = S.friends.map(prof).filter(p => S.tab !== 'online' || statusOf(p) !== 'offline');
  const row = (p, btns) => `<div class="row" style="cursor:default"><span data-a="prof" data-u="${p.id}" style="cursor:pointer">${av(p)}</span><span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}${lastSeenText(p) ? ' · ' + esc(lastSeenText(p)) : statusOf(p) !== 'offline' ? ' · ' + esc(stText[statusOf(p)] || '') : ''}</small></span>${btns}</div>`;
  let body = '';
  if (S.tab === 'add') body = `<form id="af2" style="display:flex;gap:8px;max-width:420px"><input id="fu" placeholder="Username" aria-label="Username" autocomplete="off"><button class="btn">Send request</button></form>`;
  else if (S.tab === 'pending') body = (S.incoming.map(r => row(prof(r.sender_id), `<button class="btn" data-ac="${r.id}">Accept</button> <button class="btn ghost" data-rj="${r.id}">Reject</button>`)).join('') + S.outgoing.map(r => row(prof(r.receiver_id), `<small class="muted">Sent</small> <button class="btn ghost" data-cx="${r.id}">Cancel</button>`)).join('')) || '<p class="empty">No pending requests.</p>';
  else body = fl.map(p => row(p, `<button class="btn" data-dm="${p.id}">Message</button> <button class="btn ghost" data-rm="${p.id}">Remove</button>`)).join('') || `<p class="empty">${S.tab === 'online' ? 'No friends online right now.' : 'No friends yet. Use Add friend to send a request.'}</p>`;
  main.innerHTML = `<div class="top">${menuBtn()}<b class="title">Friends</b></div><div class="panel"><div class="tabs">${tabs.map(([k, l]) => `<button class="${S.tab === k ? 'on' : ''}" data-t="${k}">${l}</button>`).join('')}</div>${body}</div>`;
  bindMenu();
  main.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.tab = b.dataset.t; renderMain(); });
  main.querySelectorAll('[data-a=prof]').forEach(b => b.onclick = () => profileModal(b.dataset.u));
  main.querySelectorAll('[data-dm]').forEach(b => b.onclick = () => startDm(b.dataset.dm));
  const resp = (id, ok) => async () => { const { error } = await sb.rpc('respond_friend_request', { req: id, accept: ok }); if (error) toast(error.message, true); else { await loadFriends(); renderSide(); renderMain(); } };
  main.querySelectorAll('[data-ac]').forEach(b => b.onclick = resp(b.dataset.ac, true)); main.querySelectorAll('[data-rj]').forEach(b => b.onclick = resp(b.dataset.rj, false));
  main.querySelectorAll('[data-cx]').forEach(b => b.onclick = async () => { const { error } = await sb.from('friend_requests').delete().eq('id', b.dataset.cx); if (error) toast(error.message, true); else { await loadFriends(); renderSide(); renderMain(); } });
  main.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => confirmBox('Remove friend?', `Remove ${prof(b.dataset.rm).display_name} from your friends? Your messages are kept.`, 'Remove', async () => {
    const [a, c] = [S.me.id, b.dataset.rm].sort(); const { error } = await sb.from('friendships').delete().match({ user_a: a, user_b: c }); if (error) { toast(error.message, true); return false; } await loadFriends(); renderSide(); renderMain(); }));
  $('#af2')?.addEventListener('submit', async e => { e.preventDefault(); if ((await sendFriendRequest($('#fu').value)) !== false) $('#fu').value = ''; });
}

/* ───────── the server (everyone is added automatically on sign-up) ───────── */
const isRulesCh = c => !!c && c.is_rules === true, canEditRules = () => ['owner', 'admin'].includes(S.sv?.role);
const isStaff = () => ['owner', 'admin', 'moderator'].includes(S.sv?.role), can = p => S.perms.has(p), isOwner = () => S.perms.has('manage_roles'), isAdm = () => can('manage_channels');
async function loadServers() {
  const { data, error } = await sb.from('server_members').select('role, timeout_until, server:servers(*)').eq('user_id', S.me.id);
  if (error) return toast('Could not load servers: ' + error.message, true);
  S.servers = data.filter(r => r.server).map(r => ({ ...r.server, role: r.role, timeout_until: r.timeout_until })).sort((a, b) => a.created_at.localeCompare(b.created_at));
}
async function loadMembers() {
  if (!S.sv) return; const id = S.sv.id;
  const { data } = await sb.from('server_members').select('user_id, role, timeout_until, profile:profiles(*)').eq('server_id', id);
  if (!data || S.sv?.id !== id) return;
  S.members = data; data.forEach(x => x.profile && S.profiles.set(x.user_id, x.profile)); renderMembers(); renderSide(); renderHead(); loadSeen(data.map(x => x.user_id));
}
const syncMembers = debounce(() => { const known = new Set(S.members.map(m => m.user_id)); if (S.sv && [...S.online.keys()].some(k => !known.has(k))) loadMembers(); }, 2000);
async function openServer(id, cid, home) {
  const sv = S.servers.find(s => s.id === id); if (!sv) return;
  Object.assign(S, { view: home ? 'home' : 'server', sv, chans: [], cats: [], members: [], ch: null, active: null, list: [] }); renderAll();
  const [c, k, m] = await Promise.all([sb.from('channels').select('*').eq('server_id', id).order('position'), sb.from('channel_categories').select('*').eq('server_id', id).order('position'), sb.from('server_members').select('user_id, role, timeout_until, profile:profiles(*)').eq('server_id', id)]);
  if (S.sv?.id !== id) return; if (c.error) return toast('Could not load channels: ' + c.error.message, true);
  S.chans = c.data; S.cats = k.data || []; loadChanUnread(); S.members = m.data || []; S.members.forEach(x => x.profile && S.profiles.set(x.user_id, x.profile));
  const first = S.chans.find(x => x.id === cid) || S.chans.find(x => x.name === 'chat' && x.kind === 'text') || S.chans.find(x => x.kind === 'text');
  renderSide(); renderMembers(); if (home) renderMain(); else first ? openChan(first.id) : renderMain();
  maybeWelcome();
}
function openFirstChannel() { const ch = (S.ch && S.chans.find(x => x.id === S.ch.id)) || S.chans.find(x => x.name === 'chat' && x.kind === 'text') || S.chans.find(x => x.kind === 'text'); if (ch) openChan(ch.id); }

/* ───────── Orbit gifts: 2-person DM = straight to them; group DM or channel = a gift card, the first click wins ───────── */
const GIFTS = new Map();
const isVidCh = () => S.view === 'server' && S.ch?.special === 'videos';
let giftReq = false;
async function loadGifts() {
  if (giftReq) return; const ids = [...new Set(S.list.filter(m => m.gift_id && !GIFTS.has(m.gift_id)).map(m => m.gift_id))]; if (!ids.length) return;
  giftReq = true; const { data } = await sb.from('orbit_gifts').select('*').in('id', ids); giftReq = false;
  (data || []).forEach(g => GIFTS.set(g.id, g)); ids.forEach(id => { if (!GIFTS.has(id)) GIFTS.set(id, { id, status: 'gone', amount: 0 }); });
  renderMsgs(false, true);
}
function giftHtml(m) {
  const g = GIFTS.get(m.gift_id), p = prof(m.author_id), mine = m.author_id === S.me.id, amt = Number(g?.amount || 0).toLocaleString();
  let line, btn = '';
  if (!g) line = 'Opening the gift…';
  else if (g.status === 'gone') line = 'This gift is no longer available.';
  else if (g.status === 'cancelled') line = 'The sender took this gift back.';
  else if (g.status === 'claimed') line = g.direct ? `Sent to <b>${esc(prof(g.claimed_by).display_name)}</b>` : `Claimed by <b>${esc(prof(g.claimed_by).display_name)}</b>`;
  else if (mine) { line = 'Waiting for someone to claim it…'; btn = '<button class="btn ghost sm" data-a="cancelgift">Take back</button>'; }
  else { line = 'The first person to click gets it!'; btn = '<button class="btn sm" data-a="claimgift">Claim</button>'; }
  return `<div class="msg sys gift" data-id="${m.id}"><div class="giftcard ${g?.status || ''}"><img src="logo.svg" width="34" height="34" alt=""><div class="gt"><b>${esc(p.display_name)} gifted ${g && g.status !== 'gone' ? amt + ' Orbits' : 'Orbits'}</b><small>${line}</small></div>${btn}</div></div>`;
}
async function claimGift(id, btn) {
  if (btn) btn.disabled = true;
  const { data, error } = await sb.rpc('claim_orbit_gift', { p_gift: id });
  const { data: g } = await sb.from('orbit_gifts').select('*').eq('id', id).maybeSingle(); if (g) GIFTS.set(id, g);
  if (error) { toast(error.message, true); renderMsgs(false, true); return; }
  setOrbits(data.balance); toast(`You got ${Number(data.amount).toLocaleString()} Orbits!`); renderMsgs(false, true);
}
async function cancelGift(id, btn) {
  if (btn) btn.disabled = true;
  const { data, error } = await sb.rpc('cancel_orbit_gift', { p_gift: id });
  const { data: g } = await sb.from('orbit_gifts').select('*').eq('id', id).maybeSingle(); if (g) GIFTS.set(id, g);
  if (error) { toast(error.message, true); renderMsgs(false, true); return; }
  setOrbits(data.balance); toast('Gift taken back.'); renderMsgs(false, true);
}
function giftModal() {
  const A = S.active, K = col(), c = K === 'conversation_id' ? S.convs.find(x => x.id === A) : null;
  if (!A) return;
  const direct = !!c && (c.mems || []).length === 2, other = direct ? prof((c.mems || []).find(u => u !== S.me.id)) : null;
  const how = direct ? `The Orbits go straight to <b>${esc(other.display_name)}</b>.` : 'A gift card is posted here. The first person to click Claim gets the Orbits. You can take it back until someone claims it.';
  modal('Gift Orbits', `<p class="muted">${how}</p><p class="muted">You have <b>${Number(S.orbits || 0).toLocaleString()}</b> Orbits.</p><label for="ga">How many Orbits?</label><input id="ga" type="number" min="1" max="100000" step="1" inputmode="numeric" placeholder="e.g. 100"><div class="giftpre">${[10, 50, 100, 500, 1000].map(n => `<button type="button" class="btn ghost sm" data-gv="${n}">${n.toLocaleString()}</button>`).join('')}</div>`, [{ label: 'Cancel', cls: 'ghost' }, { label: 'Send gift', fn: async bg => {
    const n = Math.floor(Number($('#ga', bg).value));
    if (!(n >= 1 && n <= 100000)) { toast('Pick between 1 and 100,000 Orbits.', true); return false; }
    if (n > (S.orbits || 0)) { toast('You do not have that many Orbits.', true); return false; }
    const { data, error } = await sb.rpc('send_orbit_gift', { p_amount: n, p_channel: K === 'channel_id' ? A : null, p_conversation: K === 'conversation_id' ? A : null });
    if (error) { toast(/function|schema cache/i.test(error.message) ? 'Gifts are not set up yet. Run migration-gifts-channels.sql in Supabase.' : error.message, true); return false; }
    setOrbits(data.balance); toast(`Gift sent: ${n.toLocaleString()} Orbits.`);
    const { data: g } = await sb.from('orbit_gifts').select('*').eq('id', data.gift_id).maybeSingle(); if (g) GIFTS.set(g.id, g);
    const { data: mm } = await sb.from('messages').select('*').eq('id', data.message_id).maybeSingle(); if (mm && S.active === A) { upsert(mm); renderMsgs(true); } } }],
  (bg) => { bg.querySelectorAll('[data-gv]').forEach(b => b.onclick = () => { $('#ga', bg).value = b.dataset.gv; }); setTimeout(() => $('#ga', bg)?.focus(), 30); });
}

/* ───────── #tutorials: a gallery of videos (the database only lets videos in) ───────── */
function tutHtml(m) {
  const p = prof(m.author_id), vids = (m.attachments || []).filter(f => String(f.type || '').startsWith('video/')), canDel = m.author_id === S.me.id || can('delete_messages');
  return `<article class="msg tut ${m.pending ? 'pending' : ''}" data-id="${m.id}">${vids.length ? vids.map(attItem).join('') : '<div class="tutwait">Uploading…</div>'}<div class="tinfo"><b class="ttl">${m.content ? md(m.content, m.id) : esc(vids[0]?.name || 'Tutorial')}</b><small>by <span class="tby" data-a="prof" data-u="${p.id}">${esc(p.display_name)}</span> · ${stamp(m.created_at)}</small>${canDel && !m.pending ? '<button class="ib" data-a="del" title="Delete tutorial" aria-label="Delete tutorial">🗑</button>' : ''}</div></article>`;
}
async function openChan(id) {
  const ch = S.chans.find(x => x.id === id); if (!ch || ch.kind === 'voice') return;
  if (ch.special === 'suggestions') return navTo('suggestions');   // #suggestions is the Suggestions board
  if (ch.special === 'videos') return navTo('tutorials');          // #tutorials is the Tutorials page (add videos, no chat)
  clearPending();
  Object.assign(S, { view: 'server', ch, active: id, list: [], rx: new Map(), hasMore: true, replyTo: null, readMark: getLr(id), typingUntil: 0, pins: new Set(), pinRows: [], polls: new Map(), typers: new Map() }); S.chUnread[id] = 0;
  renderSide(); renderMain(true); renderMembers();
  joinTyping(id);
  await Promise.all([fetchMsgs(), loadPins()]); if (S.active !== id) return; renderMsgs(true); setLr(id); updatePinBar();
}
function serverMenu() {
  const sv = S.sv;
  modal(sv.name, `<p class="muted">${esc(sv.description || 'Welcome to Stoga 2030.')}</p><p class="muted">${S.members.length} members. Your role: ${sv.role}.</p>${sv.welcome_message ? `<p>${md(sv.welcome_message)}</p>` : ''}`, [
    { label: 'Close', cls: 'ghost' }, { label: 'Members', cls: 'ghost', fn: () => { setTimeout(membersModal); } },
    ...(canAdmin() ? [{ label: 'Admin dashboard', cls: 'ghost', fn: () => { setTimeout(() => adminDashboard()); } }] : []),
    ...(isAdm() ? [{ label: 'Create channel', cls: 'ghost', fn: () => { setTimeout(channelModal); } }] : []),
    ...(isAdm() && S.ch && S.view === 'server' ? [{ label: 'Edit channel', cls: 'ghost', fn: () => { setTimeout(editChannelModal); } }] : []),
    ...(canClear(S.ch) ? [{ label: 'Clear channel', cls: 'danger', fn: () => { setTimeout(() => clearChannel(S.ch)); } }] : [])]);
}
/* owner, admins and moderators can clear any text channel except Suggestions and Tutorials (the server enforces this too) */
const canClear = ch => !!ch && S.view === 'server' && isStaff() && ch.kind === 'text' && !ch.special && !/^(suggestions|tutorials)$/i.test((ch.name || '').trim());
function clearChannel(ch) {
  if (!canClear(ch)) return;
  confirmBox('Clear #' + ch.name + '?', `Delete every message in #${ch.name}? The channel stays, but the messages can't be brought back.`, 'Clear channel', async () => {
    const { data, error } = await sb.rpc('clear_channel', { p_channel: ch.id }); if (error) { toast(error.message, true); return false; }
    if (S.ch?.id === ch.id) { S.list = []; S.pins = new Set(); S.pinRows = []; S.hasMore = false; renderMsgs(true); updatePinBar(); }
    toast(data ? `Cleared ${data} message${data === 1 ? '' : 's'} from #${ch.name}.` : `#${ch.name} was already empty.`);
  });
}
const channelModal = () => channelForm(), editChannelModal = () => channelForm(S.ch);
function channelForm(ch) {
  const isNew = !ch, slug = v => v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  modal(isNew ? 'Create channel' : 'Edit #' + ch.name, `<label for="cn">Name</label><input id="cn" maxlength="40" value="${esc(ch?.name || '')}" placeholder="e.g. game-night"><label for="cd">Description</label><input id="cd" maxlength="200" value="${esc(ch?.description || '')}">${isNew ? '<label for="ck">Type</label><select id="ck"><option value="text">Text</option><option value="voice">Voice</option></select>' : ''}<label for="cc">Category</label><select id="cc"><option value="">None</option>${S.cats.map(k => `<option value="${k.id}" ${ch?.category_id === k.id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="cp" style="width:auto" ${ch?.is_private ? 'checked' : ''}> Private (staff only)</label>`,
    [...(isNew ? [] : [{ label: 'Delete', cls: 'danger', fn: () => { setTimeout(() => confirmBox('Delete channel?', `Delete #${ch.name} and all its messages? This can't be undone.`, 'Delete', async () => {
      const { error } = await sb.rpc('admin_delete_channel', { p_id: ch.id }); if (error) { toast(error.message, true); return false; } await reloadChannels(); })); } }]),
    { label: 'Cancel', cls: 'ghost' }, { label: isNew ? 'Create' : 'Save', fn: async bg => {
      const name = slug($('#cn', bg).value); if (!name) { toast('Enter a channel name.', true); return false; }
      const { data, error } = await sb.rpc('admin_upsert_channel', { p_id: ch?.id || null, p_name: name, p_description: $('#cd', bg).value.trim(), p_kind: ch?.kind || $('#ck', bg).value, p_category: $('#cc', bg).value || null, p_private: $('#cp', bg).checked });
      if (error) { toast(error.message, true); return false; }
      await reloadChannels(); if (isNew && S.view === 'server' && !S.dash?.bg.isConnected && $('#ck', bg).value === 'text') openChan(data); } }]);
}
function membersModal() {
  const rank = RANK, off = m => statusOf(prof(m.user_id)) === 'offline';
  const rows = [...S.members].sort((a, b) => rank[a.role] - rank[b.role] || off(a) - off(b));
  modal(`Members (${rows.length})`, `<div class="list" style="max-height:340px">${rows.map(m => { const p = prof(m.user_id), canRole = S.sv.role === 'owner' && m.role !== 'owner';
    return `<div class="row" style="cursor:default"><span data-a="prof" data-u="${p.id}" style="cursor:pointer">${av(p)}</span><span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></span>${canRole ? `<select data-role="${p.id}" style="width:auto">${roleOptions(m.role)}</select>` : roleBadge(p.id)}</div>`; }).join('')}</div>`, undefined, bg => {
    bg.querySelectorAll('[data-a=prof]').forEach(b => b.onclick = () => profileModal(b.dataset.u));
    bg.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => { const { error } = await sb.rpc('admin_set_role', { p_target: s.dataset.role, p_role: s.value }); if (error) { toast(error.message, true); return loadMembers(); } S.members.find(x => x.user_id === s.dataset.role).role = s.value; renderMembers(); toast('Role updated'); });
  });
}

/* ───────── owner / moderation system ─────────
   This is only the interface. Every action below is a database function or a Row Level Security policy
   that re-checks who you are, so hiding or editing buttons in the browser gives no extra power. */
const RANK = { owner: 0, admin: 1, moderator: 2, support: 3, member: 4 };
const ROLE_LABEL = { support: 'Support Specialist' }, roleName = r => ROLE_LABEL[r] || r;
const roleOptions = cur => ['admin', 'moderator', 'support', 'member'].map(r => `<option value="${r}" ${cur === r ? 'selected' : ''}>${esc(roleName(r))}</option>`).join('');
const PERMS = [['delete_messages', 'Delete any message'], ['timeout', 'Timeout members'], ['kick', 'Kick members'], ['ban', 'Ban and unban members'], ['pin_messages', 'Pin messages'], ['lock_channels', 'Lock channels'], ['slow_mode', 'Set slow mode'], ['manage_channels', 'Create, edit, reorder and delete channels'], ['view_users', 'See the user list'], ['view_reports', 'See reports'], ['resolve_reports', 'Resolve reports'], ['view_audit', 'See the audit log'], ['manage_moderation', 'Configure moderation (banned words, allowed words, settings)'], ['support_tickets', 'Handle support tickets (reply, notes, status, escalate)']];
const DASH_PERMS = ['view_users', 'manage_channels', 'lock_channels', 'slow_mode', 'view_reports', 'view_audit', 'manage_moderation'];
const canAdmin = () => isOwner() || DASH_PERMS.some(p => can(p));
const svIcon = (sv, cls = '') => `<span class="sico ${cls}" style="background:${esc(sv.icon_color)}">${esc(sv.icon_text || sv.name[0].toUpperCase())}</span>`;
const fmtSecs = s => s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h';
const tmoUntil = m => m?.timeout_until && new Date(m.timeout_until) > new Date() ? new Date(m.timeout_until) : null;
const roleOf = uid => S.members.find(m => m.user_id === uid)?.role || 'member';
// Staff role pill (Owner, Admin, Moderator, Support Specialist) shown to everyone beside a name. Plain members get none.
function roleBadge(uid) { const r = roleOf(uid); return r && r !== 'member' ? `<span class="role r-${esc(r)}" title="${esc(roleName(r))}">${esc(roleName(r))}</span>` : ''; }
const outranks = uid => RANK[S.sv?.role] < RANK[roleOf(uid)];
const cancelBtn = { label: 'Cancel', cls: 'ghost' };
async function needProfiles(ids) {
  const need = [...new Set(ids.filter(Boolean))].filter(i => !S.profiles.has(i));
  if (need.length) (await sb.from('profiles').select('*').in('id', need)).data?.forEach(p => S.profiles.set(p.id, p));
}

async function loadPerms() {
  const { data } = await sb.rpc('my_permissions'); S.perms = new Set(data || []);
  await refreshReportCount();
}
async function refreshReportCount() {
  if (!can('view_reports')) { S.reportCount = 0; return; }
  const { count } = await sb.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
  S.reportCount = count || 0; renderSide();
}
function refreshChrome() { if (!S.me) return; renderSide(); renderMembers(); renderHead(); applyLimit(); updatePinBar(); if ($('#msgs')) renderMsgs(); }

/* banned / kicked: shown instead of the app */
function blocked(msg) {
  S.blocked = true; leaveVoice(true); [dbCh, presCh, typCh, ...xChs].forEach(c => c && sb.removeChannel(c)); dbCh = presCh = typCh = null; xChs = [];
  root.innerHTML = `<div class="authwrap"><div class="card"><h1>Access removed</h1><p class="muted">${esc(msg)}</p><button class="btn" id="lo">Log out</button></div></div>`;
  $('#lo').onclick = () => sb.auth.signOut();
}
/* ───────── maintenance mode: the owner shuts Orbit down from Admin dashboard > Server; everyone else sees the message ───────── */
async function loadMaint() {
  const { data, error } = await sb.from('app_settings').select('maintenance, maintenance_message').eq('id', 1).maybeSingle();
  if (error || !data) { maint = { on: false, msg: '', ready: !error }; return maint; }   // migration-maintenance.sql not run yet: treat as off
  maint = { on: !!data.maintenance, msg: data.maintenance_message || '', ready: true }; return maint;
}
function syncInert() { root.inert = !!document.querySelector('#maint, #namefix'); }
function nameGate() {   // people whose name had to be neutralised are asked to pick one; they are never locked out of their account
  if ($('#namefix') || S.me?.name_status !== 'rename_required') return;
  const ov = document.createElement('div'); ov.id = 'namefix'; ov.className = 'maint'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'nfh');
  ov.innerHTML = `<div class="card"><h1 id="nfh">Choose a display name</h1><p class="muted">The name that came with your account can't be shown in Orbit, so other students see you as "${esc(S.me.display_name)}". Pick the name you want them to see. Once saved it is locked and can't be changed.</p><label for="nfn">Display name</label><input id="nfn" maxlength="20" autocomplete="nickname" placeholder="2 to 20 characters"><p class="err" id="nfe" role="alert"></p><button type="button" class="btn" id="nfs">Save name</button><button type="button" class="btn ghost" id="nfo">Log out</button></div>`;
  document.body.append(ov); syncInert();
  const inp = $('#nfn', ov), err = $('#nfe', ov), btn = $('#nfs', ov);
  const save = async () => {
    const name = inp.value.trim(); if (name.length < 2) { err.textContent = 'Use 2 to 20 characters.'; return; }
    btn.disabled = true; const { data, error } = await sb.rpc('choose_display_name', { p_name: name }); btn.disabled = false;
    if (error) { err.textContent = error.message; return; }
    if (data?.blocked) { err.textContent = data.message; return; }
    S.me = data.profile; S.profiles.set(S.me.id, S.me); ov.remove(); syncInert(); renderAll(); toast('Welcome, ' + S.me.first_name + '!');
  };
  btn.onclick = save; inp.onkeydown = e => { if (e.key === 'Enter') save(); }; $('#nfo', ov).onclick = () => sb.auth.signOut(); inp.focus();
}
function applyMaint() {
  let ov = $('#maint'), pill = $('#maintpill');
  if (!S.me || !maint.on) { ov?.remove(); pill?.remove(); syncInert(); return; }
  if (isOwner()) {   // the owner keeps using Orbit and gets a switch-off pill
    ov?.remove(); syncInert();
    if (!pill) {
      pill = document.createElement('div'); pill.id = 'maintpill'; pill.className = 'maintpill'; pill.setAttribute('role', 'status');
      pill.innerHTML = '<span>Maintenance mode is ON. Only you can use Orbit.</span><button type="button" class="btn sm" id="mpo">Turn off</button>';
      document.body.append(pill); $('#mpo', pill).onclick = e => { e.target.disabled = true; setMaint(false, maint.msg).then(ok => { if (!ok) e.target.disabled = false; }); };
    }
    return;
  }
  pill?.remove();
  if (!ov) {
    leaveVoice(true); document.querySelectorAll('.modalbg').forEach(m => m.remove());
    ov = document.createElement('div'); ov.id = 'maint'; ov.className = 'maint'; ov.setAttribute('role', 'alertdialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'mh');
    ov.innerHTML = `<div class="card"><div class="maint-ico">${ic('settings', 32)}</div><h1 id="mh">Down for maintenance</h1><p class="maint-msg" id="mmsg"></p><button type="button" class="btn" id="mre">Check again</button><button type="button" class="btn ghost" id="mlo">Log out</button></div>`;
    document.body.append(ov); syncInert();
    $('#mre', ov).onclick = async e => { e.target.disabled = true; await loadMaint(); applyMaint(); e.target.disabled = false; if (maint.on) toast('Still down for maintenance'); };
    $('#mlo', ov).onclick = () => sb.auth.signOut();
    $('#mre', ov).focus();
  }
  $('#mmsg', ov).textContent = maint.msg;
}
function authMaintNote() {
  const f = $('#af'); if (!f) return; let n = $('#amn');
  if (!maint.on) return void n?.remove();
  if (!n) { n = document.createElement('p'); n.id = 'amn'; n.className = 'maintnote'; n.setAttribute('role', 'status'); f.prepend(n); }
  n.textContent = 'Maintenance: ' + maint.msg;
}
async function onMaint() { await loadMaint(); applyMaint(); if (S.dash?.tab === 'server') dashRefresh(); }
async function setMaint(on, msg) {
  const { error } = await sb.rpc('admin_set_maintenance', { p_on: on, p_message: msg || '' });
  if (error) { toast(error.message, true); return false; }
  await loadMaint(); applyMaint(); toast(on ? 'Maintenance mode is on' : 'Maintenance mode is off');
  if (S.dash?.tab === 'server') renderDash(); return true;
}
setInterval(async () => { if (document.hidden) return; await loadMaint(); if (S.me && S.loaded) applyMaint(); else authMaintNote(); }, 30000);   // safety net if live updates drop

async function verifyAccess() {
  if (!S.me || S.blocked) return;
  const { data, error } = await sb.from('server_members').select('user_id').eq('user_id', S.me.id).maybeSingle();
  if (error || data) return;
  const r = await sb.rpc('ensure_membership'); if (r.error) return blocked(r.error.message);
  await loadServers(); await loadPerms(); if (S.servers[0]) openServer(S.servers[0].id);
}

/* posting limits: timeout and locked channels disable the composer */
function postLimit() {
  if (S.view !== 'server' || !S.ch) return '';
  if (isRulesCh(S.ch)) { if (!canEditRules()) return 'Only admins can edit the rules.'; }
  else if (S.ch.owner_only && !isOwner() && !(S.ch.admins_can_post && S.sv?.role === 'admin') && !(S.ch.mods_can_post && ['admin', 'moderator'].includes(S.sv?.role))) return 'Only the owner can post in #' + S.ch.name + '.';
  const t = tmoUntil(S.sv); if (t) return 'You are timed out until ' + t.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (S.ch.locked && !can('lock_channels')) return 'This channel is locked.';
  return '';
}
function applyLimit() {
  const ta = $('#in'), s = $('#snd'); if (!ta) return; const lim = postLimit();
  const cmp = $('.composer'); if (cmp) cmp.style.display = S.view === 'server' && isRulesCh(S.ch) && !canEditRules() ? 'none' : '';   // #rules: nobody but admins sees a message box
  ta.disabled = !!lim; if (s) s.disabled = !!lim || S.sending; const at = $('#att'); if (at) at.disabled = !!lim; const pl = $('#pol'); if (pl) pl.disabled = !!lim;
  if (lim) ta.placeholder = lim; else if (S.view === 'server' && S.ch) ta.placeholder = 'Message #' + S.ch.name;
}
let limTimer = 0;
function scheduleLimit() { clearTimeout(limTimer); const t = tmoUntil(S.sv); if (t) limTimer = setTimeout(() => { applyLimit(); refreshChrome(); }, Math.min(t - Date.now() + 500, 2 ** 31 - 1)); }

/* live updates */
async function onMemberChange(p) {
  if (!S.me) return; const r = p.eventType === 'DELETE' ? p.old : p.new;
  if (r?.user_id === S.me.id) {
    if (p.eventType === 'DELETE') return verifyAccess();
    await loadServers(); const sv = S.servers.find(s => s.id === S.sv?.id);
    if (sv) { const was = S.sv.role; S.sv = sv; if (was !== sv.role) toast('Your role is now ' + roleName(sv.role)); }
    await loadPerms(); refreshChrome(); scheduleLimit(); dashRefresh(); return;
  }
  loadMembersSoon(); dashRefresh();
}
const loadMembersSoon = debounce(() => loadMembers(), 300);
async function onServerChange() {
  if (!S.me) return; await loadServers(); const sv = S.servers.find(s => s.id === S.sv?.id); if (!sv) return;
  S.sv = sv; refreshChrome(); if (S.view === 'home') renderMain(); dashRefresh();
}
async function loadChanUnread() {   // channels that got messages while Orbit was closed light up too
  const me = S.me?.id; if (!me) return;
  await Promise.all(S.chans.filter(c => c.kind !== 'voice').map(async c => {
    const lr = getLr(c.id); if (!lr) { setLr(c.id); return; }
    const { count } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('channel_id', c.id).neq('author_id', me).gt('created_at', lr);
    if (count && !(S.view === 'server' && S.active === c.id)) S.chUnread[c.id] = count;
  }));
  renderSide();
}
async function reloadChannels() {
  if (!S.sv || !S.me) return; const id = S.sv.id;
  const [c, k] = await Promise.all([sb.from('channels').select('*').eq('server_id', id).order('position'), sb.from('channel_categories').select('*').eq('server_id', id).order('position')]);
  if (S.sv?.id !== id || c.error) return;
  S.chans = c.data; S.cats = k.data || [];
  if (S.view === 'server' && S.active) {
    const cur = S.chans.find(x => x.id === S.active);
    if (!cur) { const f = S.chans.find(x => x.kind === 'text'); if (f) { toast('That channel was removed.'); openChan(f.id); } else { S.ch = null; S.active = null; renderMain(); } }
    else { S.ch = cur; renderHead(); applyLimit(); }
  }
  renderSide(); if (S.view === 'home') renderMain(); dashRefresh();
}
const reloadChannelsSoon = debounce(() => reloadChannels(), 250);
const pinsChangedSoon = debounce(async () => { await loadPins(); if ($('#msgs')) renderMsgs(); updatePinBar(); }, 250);
function onProfileChange(p) {
  const x = p.new; if (!x?.id || !S.me) return;
  S.profiles.set(x.id, { ...S.profiles.get(x.id), ...x });
  if (x.id === S.me.id) { S.me = { ...S.me, ...x }; S.profiles.set(x.id, S.me); if (x.name_status === 'rename_required') nameGate(); }
  S.convs.forEach(c => { if (c.other?.id === x.id) Object.assign(c.other, x); });
  S.members.forEach(m => { if (m.user_id === x.id) m.profile = S.profiles.get(x.id); });
  refreshChrome(); if (S.view === 'friends' || S.view === 'home') renderMain(); dashRefresh();
}
async function onPermChange() { if (!S.me) return; await loadPerms(); applyMaint(); refreshChrome(); dashRefresh(); }
async function onReportChange(p) {
  if (!S.me) return; await refreshReportCount();
  if (p.eventType === 'INSERT' && can('view_reports') && p.new.reporter_id !== S.me.id) toast('New report filed');
  dashRefresh();
}

/* pinned messages */
async function loadPins() {
  if (S.view !== 'server' || !S.active) { S.pins = new Set(); S.pinRows = []; return; } const id = S.active;
  const { data } = await sb.from('pinned_messages').select('message_id, created_at, message:messages(id,content,author_id,created_at)').eq('channel_id', id).order('created_at', { ascending: false });
  if (S.active !== id) return; S.pinRows = data || []; S.pins = new Set(S.pinRows.map(r => r.message_id));
}
function updatePinBar() {
  const pb = $('#pb'); if (!pb) return; const r = S.pinRows[0];
  if (S.view !== 'server' || !r?.message) { pb.hidden = true; return; }
  pb.hidden = false; pb.innerHTML = `${ic('pin', 14)}<span>${esc(r.message.content.slice(0, 140))}</span>${S.pinRows.length > 1 ? `<small>+${S.pinRows.length - 1} more</small>` : ''}`; pb.onclick = pinsModal;
}
async function pinsModal() {
  await loadPins(); await needProfiles(S.pinRows.map(r => r.message?.author_id));
  modal('Pinned in #' + (S.ch?.name || ''), `<div class="list" style="max-height:340px">${S.pinRows.filter(r => r.message).map(r => `<div class="row" style="cursor:default;align-items:flex-start"><span class="t"><small style="white-space:normal">${esc(prof(r.message.author_id).display_name)} · ${stamp(r.message.created_at)}</small><div style="white-space:normal;overflow-wrap:anywhere">${md(r.message.content)}</div></span>${can('pin_messages') ? `<button class="btn ghost" data-unpin="${r.message_id}">Unpin</button>` : ''}</div>`).join('') || '<p class="muted">Nothing is pinned here yet.</p>'}</div>`, undefined, (bg, close) => {
    bg.querySelectorAll('[data-unpin]').forEach(b => b.onclick = async () => { const { error } = await sb.rpc('pin_message', { p_message: b.dataset.unpin, p_pin: false }); if (error) return toast(error.message, true); close(); await loadPins(); if ($('#msgs')) renderMsgs(); updatePinBar(); });
  });
}
function maybeWelcome() {
  const w = S.sv?.welcome_message?.trim(); if (!w || S.dash?.bg.isConnected) return;
  const k = 'chatter-welcome-' + S.me.id + '-' + [...w].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, w.length);
  try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch {}
  modal('Welcome to ' + S.sv.name, `<p>${md(w)}</p>`, [{ label: "Let's go" }]);
}

/* moderation dialogs */
function reasonModal(title, text, label, call, done) {
  modal(title, `<p class="muted">${esc(text)}</p><label for="rr">Reason (kept in the audit log)</label><input id="rr" maxlength="200">`, [cancelBtn, { label, cls: 'danger', fn: async bg => {
    const { error } = await call($('#rr', bg).value.trim()); if (error) { toast(error.message, true); return false; } toast('Done'); done?.(); } }]);
}
function timeoutModal(uid, done) {
  const opts = [[60, '1 minute'], [300, '5 minutes'], [600, '10 minutes'], [3600, '1 hour'], [86400, '1 day'], [604800, '1 week'], [0, 'Remove timeout']];
  modal('Timeout ' + prof(uid).display_name, `<label for="td">Duration</label><select id="td">${opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select><label for="tr">Reason (kept in the audit log)</label><input id="tr" maxlength="200">`, [cancelBtn, { label: 'Apply', fn: async bg => {
    const { error } = await sb.rpc('timeout_user', { p_target: uid, p_seconds: +$('#td', bg).value, p_reason: $('#tr', bg).value.trim() }); if (error) { toast(error.message, true); return false; } toast('Timeout updated'); done?.(); } }]);
}
function nameModal(u, done) {
  const f = (id, label, key) => key in u ? `<label for="${id}">${label}</label><input id="${id}" maxlength="${key === 'username' ? 20 : 32}" value="${esc(u[key] ?? '')}">` : '';
  modal('Rename ' + u.display_name, `${f('nf', 'First name', 'first_name')}${f('nl', 'Last name', 'last_name')}${f('nd', 'Display name', 'display_name')}${f('nu', 'Username', 'username')}<p class="muted" style="font-size:12px">Changes show for everyone straight away and are kept in the audit log.</p>`, [cancelBtn, { label: 'Save', fn: async bg => {
    const g = (id, key) => { const el = $('#' + id, bg); if (!el) return null; const v = el.value.trim(); return v === (u[key] ?? '') ? null : v; };
    const a = { p_target: u.id, p_first: g('nf', 'first_name'), p_last: g('nl', 'last_name'), p_display: g('nd', 'display_name'), p_username: g('nu', 'username') };
    if (['p_first', 'p_last', 'p_display', 'p_username'].every(k => a[k] === null)) return;
    const { error } = await sb.rpc('admin_set_user_name', a); if (error) { toast(error.message, true); return false; } toast('Name updated'); done?.(); } }]);
}
function reportModal(m, uid) {
  modal('Report ' + (m ? 'message' : prof(uid).display_name), `${m ? `<p class="muted" style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.content.slice(0, 200))}</p>` : ''}<label for="rp">What is wrong?</label><textarea id="rp" rows="3" maxlength="500"></textarea>`, [cancelBtn, { label: 'Send report', fn: async bg => {
    const reason = $('#rp', bg).value.trim(); if (reason.length < 3) { toast('Describe the problem first.', true); return false; }
    const { error } = m ? await sb.rpc('report_message', { p_message: m.id, p_reason: reason }) : await sb.rpc('report_user', { p_user: uid, p_reason: reason });
    if (error) { toast(error.message, true); return false; } toast('Report sent to the moderators'); } }]);
}
function modButtons(uid) {
  if (!S.sv || !S.members.some(m => m.user_id === uid)) return [];
  const low = outranks(uid), name = prof(uid).display_name, L = (label, cls, f) => ({ label, cls, fn: () => { setTimeout(f); } });
  return [L('Report', 'ghost', () => reportModal(null, uid)),
    ...(low && can('timeout') ? [L('Timeout', 'ghost', () => timeoutModal(uid, loadMembers))] : []),
    ...(low && can('kick') ? [L('Kick', 'danger', () => reasonModal('Kick ' + name, 'They are removed now and can come back after 10 minutes.', 'Kick', r => sb.rpc('kick_user', { p_target: uid, p_reason: r }), loadMembers))] : []),
    ...(low && can('ban') ? [L('Ban', 'danger', () => reasonModal('Ban ' + name, 'They are removed and blocked from coming back until someone unbans them.', 'Ban', r => sb.rpc('ban_user', { p_target: uid, p_reason: r }), loadMembers))] : []),
    ...(isOwner() ? [L('Rename', 'ghost', () => nameModal({ ...prof(uid) }, loadMembers))] : [])];
}

/* ───────── admin dashboard ───────── */
const dashRefresh = debounce(() => { const d = S.dash; if (!d?.bg.isConnected) return; if (document.activeElement?.dataset?.keep !== undefined && d.bg.contains(document.activeElement)) return; renderDash(); }, 400);
function adminDashboard(tab) {
  if (!canAdmin()) return;
  modal('Admin dashboard', '<div id="ad"></div>', [{ label: 'Close', cls: 'ghost' }], bg => { bg.firstElementChild.classList.add('wide'); S.dash = { bg, tab: tab || 'overview', q: '', rs: 'open' }; renderDash(); });
}
const dashTabs = () => [['overview', 'Overview', true], ['users', 'Users', can('view_users')], ['channels', 'Channels', can('manage_channels') || can('lock_channels') || can('slow_mode')], ['roles', 'Roles', isOwner()], ['reports', 'Reports' + (S.reportCount && can('view_reports') ? ` (${S.reportCount})` : ''), can('view_reports')], ['moderation', 'Moderation', can('view_reports') || can('manage_moderation')], ['audit', 'Audit log', can('view_audit')], ['rates', 'Rate requests', sugAdmin()], ['games', 'Games admin', isOwner()], ['server', 'Server', isOwner()]].filter(t => t[2]);
async function renderDash() {
  const d = S.dash; if (!d?.bg.isConnected) return; const el = $('#ad', d.bg); if (!el) return;
  const tabs = dashTabs(); if (!tabs.some(t => t[0] === d.tab)) d.tab = 'overview'; const mine = d.tab;
  const [html, bind] = await DASH[mine](); if (!d.bg.isConnected || d.tab !== mine) return;
  el.innerHTML = `<div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" data-dt="${k}" class="${mine === k ? 'on' : ''}" aria-selected="${mine === k}">${esc(l)}</button>`).join('')}</div><div id="adb">${html}</div>`;
  el.querySelectorAll('[data-dt]').forEach(b => b.onclick = () => { d.tab = b.dataset.dt; renderDash(); });
  bind?.($('#adb', el));
}
const errBox = e => [`<p class="err">${esc(e.message)}</p>`];
const DASH = {};

DASH.overview = async () => {
  const { data: s, error } = await sb.rpc('admin_stats'); if (error) return errBox(error);
  const ids = new Set(S.online.keys()); if (S.me.status !== 'invisible') ids.add(S.me.id);
  const card = (n, l) => `<div class="stat"><b>${n ?? '–'}</b><span>${l}</span></div>`;
  return [`<div class="stats">${card(s.total_users, 'Registered users')}${card(ids.size, 'Online now')}${card(s.members, 'In the server')}${card(s.timed_out, 'Timed out')}${card(s.banned, 'Banned')}${card(s.open_reports, 'Open reports')}${card(s.messages_24h, 'Messages, last 24h')}</div><p class="muted" style="margin-top:14px">You are signed in as <b>${esc(roleName(S.sv.role))}</b>. Every action in this panel is checked by the database, not just by this screen.</p>`];
};

DASH.users = async () => {
  const { data, error } = await sb.rpc('admin_list_users'); if (error) return errBox(error);
  const d = S.dash; d.users = data; data.forEach(u => { if (!S.profiles.has(u.id)) S.profiles.set(u.id, { id: u.id, username: u.username, display_name: u.display_name, avatar_color: u.avatar_color, bio: u.bio || '', custom_status: u.custom_status || '' }); });
  return [`<input data-keep id="uq" placeholder="Search by name, username${isOwner() ? ' or email' : ''}" aria-label="Search users" value="${esc(d.q || '')}"><div id="ul" class="list" style="max-height:calc(52vh / var(--pz,1));margin-top:8px"></div>`, el => {
    const list = $('#ul', el), draw = () => {
      const q = (d.q || '').toLowerCase(), now = new Date();
      const rows = d.users.filter(u => !q || [u.username, u.display_name, u.first_name, u.last_name, u.email].join(' ').toLowerCase().includes(q))
        .sort((a, b) => (RANK[a.role || 'member'] - RANK[b.role || 'member']) || (a.display_name || '').localeCompare(b.display_name || ''));
      list.innerHTML = rows.map(u => {
        const me = u.id === S.me.id, role = u.role || 'member', low = !me && role !== 'owner' && RANK[S.sv.role] < RANK[role], to = u.timeout_until && new Date(u.timeout_until) > now;
        const btn = (a, l, cls = 'ghost') => `<button class="btn ${cls} sm" data-act="${a}" data-u="${u.id}">${l}</button>`;
        return `<div class="row drow" style="cursor:default"><span data-a="prof" data-u="${u.id}" style="cursor:pointer">${av(S.profiles.get(u.id))}</span><span class="t"><b>${esc(u.display_name)}${me ? ' (you)' : ''}</b><small>@${esc(u.username)}${u.email ? ' · ' + esc(u.email) : ''}</small></span>
        ${role !== 'member' ? `<span class="role">${esc(roleName(role))}</span>` : ''}${to ? '<span class="role">timed out</span>' : ''}${u.ban_kind === 'ban' ? '<span class="role bad">banned</span>' : u.ban_kind === 'kick' ? '<span class="role bad">kicked</span>' : !u.is_member ? '<span class="role">not in server</span>' : ''}
        ${isOwner() ? btn('name', 'Rename') : ''}${isOwner() && !me ? btn('device', 'Reset device') : ''}${isOwner() && !me && role !== 'owner' ? btn('delete', 'Delete account', 'danger') : ''}
        ${isOwner() && !me && u.is_member && role !== 'owner' ? `<select data-role="${u.id}" class="inl" aria-label="Role of ${esc(u.display_name)}">${roleOptions(role)}</select>` : ''}
        ${low && u.is_member && can('timeout') ? btn('timeout', to ? 'Edit timeout' : 'Timeout') : ''}${low && u.is_member && can('kick') ? btn('kick', 'Kick') : ''}
        ${low && can('ban') ? (u.ban_kind ? btn('unban', u.ban_kind === 'ban' ? 'Unban' : 'Allow back') : btn('ban', 'Ban', 'danger')) : ''}</div>`;
      }).join('') || '<p class="muted">No users match.</p>';
    };
    draw(); $('#uq', el).oninput = e => { d.q = e.target.value; draw(); };
    list.onclick = async e => {
      const pr = e.target.closest('[data-a=prof]'); if (pr) return profileModal(pr.dataset.u);
      const b = e.target.closest('[data-act]'); if (!b) return; const u = d.users.find(x => x.id === b.dataset.u), act = b.dataset.act, done = () => renderDash();
      if (act === 'name') nameModal(u, done);
      else if (act === 'device') confirmBox('Reset device for ' + u.display_name, 'This forgets every device linked to this account. The next account to sign in on each of those devices becomes its owner.', 'Reset', async () => { const { error } = await sb.rpc('admin_reset_device', { p_target: u.id }); if (error) { toast(error.message, true); return false; } toast('Device link reset'); });
      else if (act === 'delete') deleteAccountModal(u, () => { loadMembers(); done(); });
      else if (act === 'timeout') timeoutModal(u.id, done);
      else if (act === 'kick') reasonModal('Kick ' + u.display_name, 'They are removed now and can come back after 10 minutes.', 'Kick', r => sb.rpc('kick_user', { p_target: u.id, p_reason: r }), done);
      else if (act === 'ban') reasonModal('Ban ' + u.display_name, 'They are removed and blocked from coming back until someone unbans them.', 'Ban', r => sb.rpc('ban_user', { p_target: u.id, p_reason: r }), done);
      else if (act === 'unban') { const { error } = await sb.rpc('unban_user', { p_target: u.id }); if (error) toast(error.message, true); else { toast('Done'); done(); } }
    };
    list.onchange = async e => { const s = e.target.closest('[data-role]'); if (!s) return; const { error } = await sb.rpc('admin_set_role', { p_target: s.dataset.role, p_role: s.value }); if (error) toast(error.message, true); else toast('Role updated'); renderDash(); };
  }];
};

function deleteAccountModal(u, done) {
  modal('Delete ' + u.display_name + '\'s account', `<p class="muted">This permanently deletes <b>@${esc(u.username)}</b>: their sign-in, profile, every message they sent, their private chats, friends and settings. It cannot be undone. If they are on the approved email list they could sign up again; to keep someone out, use Ban instead.</p><label for="dcf">Type <b>@${esc(u.username)}</b> to confirm</label><input id="dcf" autocomplete="off" autocapitalize="off" spellcheck="false">`,
    [{ label: 'Cancel', cls: 'ghost' }, { label: 'Delete account', cls: 'danger', fn: async bg => {
      if ($('#dcf', bg).value.trim().replace(/^@/, '').toLowerCase() !== u.username.toLowerCase()) { toast('That does not match the username.', true); return false; }
      const { error } = await sb.rpc('admin_delete_user', { p_target: u.id }); if (error) { toast(error.message, true); return false; }
      toast('Account deleted'); done(); } }]);
}

DASH.channels = async () => {
  const list = [...S.chans].sort((a, b) => a.position - b.position), catName = id => S.cats.find(k => k.id === id)?.name || 'No category';
  const slows = c => [...new Set([0, 5, 10, 30, 60, 300, 900, 3600, c.slow_mode_seconds])].sort((a, b) => a - b);
  return [`${can('manage_channels') ? '<button class="btn" id="nc" style="margin-bottom:8px">New channel</button>' : ''}<div class="list" style="max-height:calc(52vh / var(--pz,1))">${list.map((c, i) => `<div class="row drow" style="cursor:default"><span class="hashi">${c.kind === 'voice' ? ic('voice', 18) : chIcon(c)}</span><span class="t"><b>${esc(c.name)}</b><small>${c.kind} · ${esc(catName(c.category_id))}${c.is_private ? ' · private' : ''}${c.locked ? ' · locked' : ''}</small></span>
    ${c.kind === 'text' && can('slow_mode') ? `<select data-slow="${c.id}" class="inl" aria-label="Slow mode for ${esc(c.name)}">${slows(c).map(v => `<option value="${v}" ${v === c.slow_mode_seconds ? 'selected' : ''}>${v ? 'Slow mode ' + fmtSecs(v) : 'No slow mode'}</option>`).join('')}</select>` : ''}
    ${c.kind === 'text' && can('lock_channels') ? `<button class="btn ghost sm" data-lock="${c.id}">${c.locked ? 'Unlock' : 'Lock'}</button>` : ''}
    ${can('manage_channels') ? `<button class="ib sm" data-mv="${c.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move ${esc(c.name)} up">${ic('up', 16)}</button><button class="ib sm" data-mv="${c.id}" data-d="1" ${i === list.length - 1 ? 'disabled' : ''} aria-label="Move ${esc(c.name)} down">${ic('down', 16)}</button><button class="btn ghost sm" data-edit="${c.id}">Edit</button>` : ''}</div>`).join('')}</div>`, el => {
    $('#nc', el)?.addEventListener('click', () => channelForm());
    el.querySelectorAll('[data-slow]').forEach(s => s.onchange = async () => { const { error } = await sb.rpc('admin_set_slow_mode', { p_id: s.dataset.slow, p_seconds: +s.value }); if (error) toast(error.message, true); await reloadChannels(); });
    el.querySelectorAll('[data-lock]').forEach(b => b.onclick = async () => { const c = S.chans.find(x => x.id === b.dataset.lock); const { error } = await sb.rpc('admin_set_channel_lock', { p_id: c.id, p_locked: !c.locked }); if (error) toast(error.message, true); await reloadChannels(); });
    el.querySelectorAll('[data-mv]').forEach(b => b.onclick = async () => { const ids = list.map(c => c.id), i = ids.indexOf(b.dataset.mv), j = i + +b.dataset.d; if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; const { error } = await sb.rpc('admin_reorder_channels', { p_ids: ids }); if (error) toast(error.message, true); await reloadChannels(); });
    el.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => channelForm(S.chans.find(x => x.id === b.dataset.edit)));
  }];
};

DASH.roles = async () => {
  const { data, error } = await sb.from('role_permissions').select('*'); if (error) return errBox(error);
  const has = (r, p) => data.some(x => x.role === r && x.permission === p && x.granted), staff = S.members.filter(m => m.role !== 'member').sort((a, b) => RANK[a.role] - RANK[b.role]);
  return [`<p class="muted" style="margin-top:0">Choose what admins and moderators may do. Anyone without a tick cannot do it, no matter what their screen shows. The owner always has every permission. Only the owner can rename users, assign roles, edit this table or change server settings. The <b>Support Specialist</b> role is not in this table: it can only use the Support ticket queue, nothing else. Give it from the Users tab.</p>
  <div style="overflow:auto"><table class="perm"><thead><tr><th scope="col">Permission</th><th scope="col">Admin</th><th scope="col">Moderator</th></tr></thead><tbody>${PERMS.map(([p, l]) => `<tr><th scope="row">${l}</th>${['admin', 'moderator'].map(r => `<td><input type="checkbox" style="width:auto" data-perm="${p}" data-r="${r}" ${has(r, p) ? 'checked' : ''} aria-label="${r}: ${l}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
  <h3 class="lbl" style="margin-left:0">Current staff</h3><div class="list">${staff.map(m => { const p = prof(m.user_id); return `<div class="row" style="cursor:default">${av(p)}<span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></span>${m.role === 'owner' || m.user_id === S.me.id ? `<span class="role">${esc(roleName(m.role))}</span>` : `<select data-role="${m.user_id}" class="inl" aria-label="Role of ${esc(p.display_name)}">${roleOptions(m.role)}</select>`}</div>`; }).join('')}</div><p class="muted" style="font-size:12px">To promote someone, find them in the Users tab.</p>`, el => {
    el.querySelectorAll('[data-perm]').forEach(c => c.onchange = async () => { const { error } = await sb.rpc('admin_set_permission', { p_role: c.dataset.r, p_perm: c.dataset.perm, p_granted: c.checked }); if (error) { toast(error.message, true); renderDash(); } else toast('Saved'); });
    el.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => { const { error } = await sb.rpc('admin_set_role', { p_target: s.dataset.role, p_role: s.value }); if (error) toast(error.message, true); else toast('Role updated'); loadMembers(); renderDash(); });
  }];
};

DASH.reports = async () => {
  const d = S.dash; const { data, error } = await sb.from('reports').select('*').eq('status', d.rs).order('created_at', { ascending: false }).limit(100); if (error) return errBox(error);
  await needProfiles(data.flatMap(r => [r.reporter_id, r.target_user, r.resolved_by])); const chn = id => S.chans.find(c => c.id === id)?.name;
  return [`<div class="tabs">${['open', 'resolved'].map(k => `<button data-rs="${k}" class="${d.rs === k ? 'on' : ''}">${k === 'open' ? 'Open' : 'Resolved'}</button>`).join('')}</div>
  ${data.map(r => `<div class="rep"><div><strong>${esc(prof(r.reporter_id).display_name)}</strong> reported <strong>${esc(r.target_user ? prof(r.target_user).display_name : 'a user')}</strong> <small class="muted">${stamp(r.created_at)}</small></div><p>${esc(r.reason)}</p>${r.message_content ? `<blockquote>${esc(r.message_content.slice(0, 300))}${chn(r.channel_id) ? `<small class="muted"> in #${esc(chn(r.channel_id))}</small>` : ''}</blockquote>` : ''}
  ${r.status === 'open' ? `<div class="inline-actions">${r.target_user ? `<button class="btn ghost sm" data-view="${r.target_user}">View user</button>` : ''}${r.message_id && can('delete_messages') ? `<button class="btn ghost sm" data-del="${r.message_id}">Delete message</button>` : ''}${can('resolve_reports') ? `<button class="btn sm" data-res="${r.id}">Resolve</button>` : ''}</div>` : `<small class="muted">Resolved by ${esc(prof(r.resolved_by).display_name)}${r.resolution_note ? ': ' + esc(r.resolution_note) : ''}</small>`}</div>`).join('') || `<p class="muted">No ${d.rs} reports.</p>`}`, el => {
    el.querySelectorAll('[data-rs]').forEach(b => b.onclick = () => { d.rs = b.dataset.rs; renderDash(); });
    el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => profileModal(b.dataset.view));
    el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => confirmBox('Delete this message?', 'It is removed for everyone and the deletion is logged.', 'Delete', async () => { const { error } = await sb.from('messages').delete().eq('id', b.dataset.del); if (error) { toast(error.message, true); return false; } toast('Message deleted'); renderDash(); }));
    el.querySelectorAll('[data-res]').forEach(b => b.onclick = () => modal('Resolve report', '<label for="rn">Note (optional)</label><input id="rn" maxlength="300">', [cancelBtn, { label: 'Resolve', fn: async bg => { const { error } = await sb.rpc('resolve_report', { p_id: b.dataset.res, p_note: $('#rn', bg).value.trim() }); if (error) { toast(error.message, true); return false; } toast('Report resolved'); renderDash(); } }]));
  }];
};

const AUDIT = { 'server.update': 'updated the server settings', 'channel.create': 'created a channel', 'channel.update': 'edited a channel', 'channel.delete': 'deleted a channel', 'channel.reorder': 'reordered the channels', 'channel.lock': 'locked a channel', 'channel.unlock': 'unlocked a channel', 'channel.slowmode': 'changed slow mode on a channel', 'message.pin': 'pinned a message by', 'message.unpin': 'unpinned a message by', 'message.delete': 'deleted a message by', 'member.timeout': 'timed out', 'member.untimeout': 'removed the timeout of', 'member.kick': 'kicked', 'member.ban': 'banned', 'member.unban': 'unbanned', 'member.role': 'changed the role of', 'member.rename': 'renamed', 'member.device_reset': 'reset the linked devices of', 'permission.update': 'changed role permissions', 'report.resolve': 'resolved a report about', 'owner.assigned': 'was made owner', 'suggestion.status': 'updated a suggestion by', 'suggestion.delete': 'removed a suggestion by', 'maintenance.on': 'turned maintenance mode on', 'user.delete': 'deleted the account', 'moderation.timeout': 'automatically timed out', 'moderation.review': 'reviewed a moderation event for', 'moderation.settings': 'changed the moderation settings', 'moderation.term': 'changed the banned word list', 'moderation.allow': 'changed the allowed word list', 'moderation.rescan': 'asked flagged names to be changed', 'maintenance.off': 'turned maintenance mode off', 'ticket.status': 'changed the status of a support ticket from', 'ticket.escalate': 'escalated a support ticket from', 'roster.update': 'updated the approved email list' };

/* ───────── Admin dashboard: Moderation tab (every call below is checked by the database, not by this screen) ───────── */
const MOD_CATS = { profanity: 'Profanity', sexual: 'Sexual', slur: 'Slur', hate: 'Hate', threat: 'Threat', harassment: 'Harassment', impersonation: 'Staff impersonation' };
const MOD_MATCH = { word: 'Whole word', prefix: 'Start of a word', contains: 'Anywhere in a word' };
const MOD_APPLIES = { all: 'Chat and names', chat: 'Chat only', name: 'Names only' };
const MOD_SURF = { channel: 'Channel message', dm: 'Private message', edit: 'Edited message', dm_edit: 'Edited private message', name: 'Name', bio: 'Bio', status: 'Status', poll: 'Poll', suggestion: 'Suggestion', gif: 'GIF name', reaction: 'Reaction', attachment: 'File name' };
const modCfg = async () => { const r = await sb.rpc('mod_get_config'); return r.error ? { error: r.error } : r.data; };
const MODV = {};
DASH.moderation = async () => {
  const d = S.dash, view = can('view_reports') || can('manage_moderation'), mgr = can('manage_moderation');
  const subs = [['events', 'Events', view], ['timeouts', 'Timeouts', view || can('timeout')], ['words', 'Banned words', mgr], ['allow', 'Allowed words', mgr], ['hidden', 'Hidden words', isOwner()], ['settings', 'Settings', mgr], ['test', 'Test the filter', view]].filter(x => x[2]);
  if (!subs.some(x => x[0] === d.mt)) d.mt = subs[0][0];
  const [html, bind] = await MODV[d.mt]();
  return [`<div class="tabs sub" role="tablist">${subs.map(([k, l]) => `<button role="tab" data-mt="${k}" class="${d.mt === k ? 'on' : ''}" aria-selected="${d.mt === k}">${esc(l)}</button>`).join('')}</div>${html}`,
    el => { el.querySelectorAll('[data-mt]').forEach(b => b.onclick = () => { d.mt = b.dataset.mt; renderDash(); }); bind?.(el); }];
};

MODV.events = async () => {
  const d = S.dash, f = d.mev || 'open';
  const { data, error } = await sb.rpc('mod_list_events', { p_status: f, p_limit: 80, p_before: null }); if (error) return errBox(error);
  const now = new Date(), canReview = can('resolve_reports') || can('manage_moderation');
  const rows = (data.events || []).map(e => {
    const to = e.timed_out_until && new Date(e.timed_out_until) > now;
    return `<div class="row drow modrow" style="cursor:default"><span class="t"><b>${esc(e.display_name)} <small style="display:inline">@${esc(e.username)}</small></b>
      <small>${esc(MOD_SURF[e.surface] || e.surface)} · ${esc(MOD_CATS[e.category] || e.category)} · ${e.points ? e.points + ' warning point' + (e.points > 1 ? 's' : '') : 'no points'} · ${esc(stamp(e.created_at))}</small>
      ${e.excerpt ? `<span class="modex">${esc(e.excerpt)}</span>` : '<small>(private message text is not stored)</small>'}
      <small>Matched: <code>${esc(e.matched || e.term)}</code> · warnings in the last ${data.window_hours}h: ${e.strikes}${e.action === 'timeout' ? ' · caused a timeout' : ''}${to ? ' · timed out now' : ''}</small></span>
      ${e.status !== 'open' ? `<span class="role${e.status === 'dismissed' ? '' : ' bad'}">${e.status === 'dismissed' ? 'false positive' : 'confirmed'}</span>` : ''}
      ${canReview && e.status !== 'dismissed' ? `<button type="button" class="btn ghost sm" data-fp="${e.id}" data-to="${to ? 1 : 0}">Not a violation</button>` : ''}${canReview && e.status === 'open' ? `<button type="button" class="btn ghost sm" data-cf="${e.id}">Confirm</button>` : ''}</div>`;
  }).join('') || '<p class="muted">Nothing here. Blocked messages and names will show up in this list.</p>';
  return [`<div class="inline-actions" style="align-items:center;margin-bottom:6px"><label for="mevf" style="margin:0">Show</label><select id="mevf" class="inl">${[['open', 'Needs review'], ['confirmed', 'Confirmed'], ['dismissed', 'False positives'], ['all', 'Everything']].map(([v, l]) => `<option value="${v}" ${f === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="btn ghost sm" id="mevr">Refresh</button></div>
    <p class="muted" style="margin:0 0 6px;font-size:12px">${data.enabled ? '' : '<b>The filter is switched OFF in Settings.</b> '}${data.timeout_after ? `Warnings add up; at ${data.timeout_after} points in ${data.window_hours} hours the person gets a short timeout (never a ban).` : 'Automatic timeouts are off.'} If something was blocked by mistake, press "Not a violation".</p><div class="list" style="max-height:calc(48vh / var(--pz,1))">${rows}</div>`,
    el => {
      $('#mevf', el).onchange = e => { d.mev = e.target.value; renderDash(); }; $('#mevr', el).onclick = () => renderDash();
      el.querySelectorAll('[data-cf]').forEach(b => b.onclick = async () => { const r = await sb.rpc('mod_review_event', { p_id: b.dataset.cf, p_action: 'confirm', p_allow: false, p_lift: false }); if (r.error) return toast(r.error.message, true); renderDash(); });
      el.querySelectorAll('[data-fp]').forEach(b => b.onclick = () => falsePositive(b.dataset.fp, b.dataset.to === '1'));
    }];
};
function falsePositive(id, timedOut) {
  const mgr = can('manage_moderation'), tm = timedOut && can('timeout');
  modal('Not a violation', `<p class="muted">This removes the warning point so it no longer counts toward a timeout.</p>${mgr ? '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="fpa" style="width:auto" checked> Also allow this word from now on</label>' : ''}${tm ? '<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="fpl" style="width:auto" checked> End their timeout now</label>' : ''}`,
    [{ label: 'Cancel', cls: 'ghost' }, { label: 'Mark as false positive', fn: async bg => {
      const { data, error } = await sb.rpc('mod_review_event', { p_id: id, p_action: 'dismiss', p_allow: !!$('#fpa', bg)?.checked, p_lift: !!$('#fpl', bg)?.checked });
      if (error) { toast(error.message, true); return false; }
      toast(data?.allowed ? `Marked as a false positive. "${data.allowed}" is now allowed.` : 'Marked as a false positive.'); renderDash(); } }]);
}

MODV.timeouts = async () => {
  const { data, error } = await sb.rpc('mod_list_timeouts'); if (error) return errBox(error);
  const rows = data.map(t => `<div class="row drow" style="cursor:default"><span class="t"><b>${esc(t.display_name)}</b><small>@${esc(t.username)} · until ${esc(stamp(t.timeout_until))}</small></span>${can('timeout') ? `<button type="button" class="btn ghost sm" data-lift="${t.user_id}">End timeout</button>` : ''}</div>`).join('') || '<p class="muted">Nobody is timed out right now.</p>';
  return [`<p class="muted" style="margin:0 0 6px;font-size:12px">To timeout someone yourself, use the Users tab. Timeouts are always temporary.</p><div class="list" style="max-height:calc(50vh / var(--pz,1))">${rows}</div>`,
    el => el.querySelectorAll('[data-lift]').forEach(b => b.onclick = async () => { const r = await sb.rpc('timeout_user', { p_target: b.dataset.lift, p_seconds: 0, p_reason: 'Ended from the moderation panel' }); if (r.error) return toast(r.error.message, true); toast('Timeout ended'); renderDash(); })];
};

MODV.words = async () => {
  const cfg = await modCfg(); if (cfg.error) return errBox(cfg.error);
  const d = S.dash;
  return [`<div class="inline-actions" style="align-items:center;margin-bottom:6px"><input data-keep id="mwq" placeholder="Search words" aria-label="Search words" value="${esc(d.mq || '')}" style="flex:1;min-width:140px"><select id="mwc" class="inl" aria-label="Category"><option value="">All categories</option>${Object.entries(MOD_CATS).map(([k, l]) => `<option value="${k}" ${d.mcat === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button type="button" class="btn sm" id="mwa">Add a word</button></div>
    <p class="muted" style="margin:0 0 6px;font-size:12px">${cfg.terms.length} words. Disguises (numbers, symbols, spacing, repeated letters) are caught automatically, so add each word once, spelled normally. Built-in words can be turned off but not deleted.</p><div class="list" id="mwl" style="max-height:calc(44vh / var(--pz,1))"></div>`,
    el => {
      const list = $('#mwl', el), draw = () => {
        const q = (d.mq || '').toLowerCase().trim(), c = d.mcat || '';
        const rows = cfg.terms.filter(t => (!q || t.term.includes(q)) && (!c || t.category === c));
        list.innerHTML = rows.map(t => `<div class="row drow" style="cursor:default"><span class="t"><b>${esc(t.term)}</b><small>${esc(MOD_CATS[t.category])} · ${MOD_MATCH[t.match]} · ${MOD_APPLIES[t.applies]} · ${t.weight} point${t.weight === 1 ? '' : 's'}${t.built_in ? ' · built in' : ''}${t.note ? ' · ' + esc(t.note) : ''}</small></span>
          <label class="sw"><input type="checkbox" data-tg="${t.id}" ${t.enabled ? 'checked' : ''} aria-label="Enabled: ${esc(t.term)}"> on</label><button type="button" class="btn ghost sm" data-ed="${t.id}">Edit</button>${t.built_in ? '' : `<button type="button" class="btn ghost sm" data-rm="${t.id}">Delete</button>`}</div>`).join('') || '<p class="muted">No words match.</p>';
      };
      draw();
      $('#mwq', el).oninput = e => { d.mq = e.target.value; draw(); }; $('#mwc', el).onchange = e => { d.mcat = e.target.value; draw(); };
      $('#mwa', el).onclick = () => termModal(null);
      list.onclick = e => {
        const ed = e.target.closest('[data-ed]'), rm = e.target.closest('[data-rm]');
        if (ed) termModal(cfg.terms.find(t => t.id === ed.dataset.ed));
        if (rm) { const t = cfg.terms.find(x => x.id === rm.dataset.rm); confirmBox('Delete this word?', `"${t.term}" will no longer be blocked.`, 'Delete', async () => { const r = await sb.rpc('mod_delete_term', { p_id: t.id }); if (r.error) { toast(r.error.message, true); return false; } toast('Deleted'); renderDash(); }); }
      };
      list.onchange = async e => {
        const tg = e.target.closest('[data-tg]'); if (!tg) return; const t = cfg.terms.find(x => x.id === tg.dataset.tg);
        const r = await sb.rpc('mod_save_term', { p_id: t.id, p_term: t.term, p_category: t.category, p_match: t.match, p_applies: t.applies, p_weight: t.weight, p_enabled: tg.checked, p_note: t.note });
        if (r.error) { toast(r.error.message, true); tg.checked = !tg.checked; return; } t.enabled = tg.checked; toast(tg.checked ? `"${t.term}" is on` : `"${t.term}" is off`);
      };
    }];
};
function termModal(t) {
  const o = (obj, cur) => Object.entries(obj).map(([k, l]) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${l}</option>`).join('');
  modal(t ? 'Edit word' : 'Add a word', `<label for="tw">Word or phrase</label><input id="tw" maxlength="60" value="${esc(t?.term || '')}" ${t?.built_in ? 'disabled' : ''} placeholder="letters only"><label for="tc">Category</label><select id="tc">${o(MOD_CATS, t?.category || 'profanity')}</select>
    <label for="tm">Where it matches</label><select id="tm">${o(MOD_MATCH, t?.match || 'word')}</select><label for="ta">Applies to</label><select id="ta">${o(MOD_APPLIES, t?.applies || 'all')}</select>
    <label for="tp">Warning points (0 = block only, no strike)</label><input id="tp" type="number" min="0" max="5" value="${t ? t.weight : 1}"><label for="tn">Note (optional)</label><input id="tn" maxlength="200" value="${esc(t?.note || '')}">
    <p class="muted" style="font-size:12px">"Whole word" is the safest. "Anywhere in a word" can flag innocent words that contain it, so use it only for long, distinctive words.</p>`,
    [{ label: 'Cancel', cls: 'ghost' }, { label: 'Save', fn: async bg => {
      const r = await sb.rpc('mod_save_term', { p_id: t?.id || null, p_term: $('#tw', bg).value, p_category: $('#tc', bg).value, p_match: $('#tm', bg).value, p_applies: $('#ta', bg).value, p_weight: +$('#tp', bg).value, p_enabled: t ? t.enabled : true, p_note: $('#tn', bg).value });
      if (r.error) { toast(r.error.message, true); return false; } toast('Saved'); renderDash(); } }]);
}

MODV.allow = async () => {
  const cfg = await modCfg(); if (cfg.error) return errBox(cfg.error);
  return [`<p class="muted" style="margin:0 0 6px;font-size:12px">Words and phrases here are never flagged. Use this when an innocent word is caught by mistake, such as a place name or a surname. Letters only; a phrase can have spaces.</p>
    <div class="inline-actions" style="align-items:center;margin-bottom:6px"><input id="mal" maxlength="60" placeholder="e.g. scunthorpe" aria-label="Allowed word" style="flex:1;min-width:160px"><button type="button" class="btn sm" id="maa">Allow</button></div>
    <div class="list" style="max-height:calc(44vh / var(--pz,1))">${cfg.allow.map(a => `<div class="row drow" style="cursor:default"><span class="t"><b>${esc(a.word)}</b>${a.note ? `<small>${esc(a.note)}</small>` : ''}</span><button type="button" class="btn ghost sm" data-ra="${esc(a.word)}">Remove</button></div>`).join('') || '<p class="muted">Nothing allowed yet.</p>'}</div>`,
    el => {
      const add = async () => { const w = $('#mal', el).value.trim(); if (!w) return; const r = await sb.rpc('mod_add_allow', { p_word: w, p_note: '' }); if (r.error) return toast(r.error.message, true); toast(`"${w}" is now allowed`); renderDash(); };
      $('#maa', el).onclick = add; $('#mal', el).onkeydown = e => { if (e.key === 'Enter') add(); };
      el.querySelectorAll('[data-ra]').forEach(b => b.onclick = async () => { const r = await sb.rpc('mod_remove_allow', { p_word: b.dataset.ra }); if (r.error) return toast(r.error.message, true); renderDash(); });
    }];
};

MODV.hidden = async () => {   // owner only: words go in, and are never shown again
  const { data, error } = await sb.rpc('mod_hidden_list'); if (error) return errBox(error);
  const rows = data.map((h, i) => `<div class="row drow" style="cursor:default"><span class="t"><b>Hidden word ${data.length - i}</b><small>Added ${esc(stamp(h.created_at))}${h.enabled ? '' : ' · off'}</small></span><button type="button" class="btn ghost sm" data-rh="${h.id}">Remove</button></div>`).join('') || '<p class="muted">No hidden words yet.</p>';
  return [`<p class="muted" style="margin:0 0 6px;font-size:12px">Type a word that should never be allowed, then press Enter. It is blocked in chat, private messages, names and bios, and counts as a warning like other profanity. Once saved it is hidden: it never appears in any list, the events list or the filter tester, for you or anyone else. To add several, separate them with commas. Letters only; disguises (numbers, symbols, spacing, repeated letters) are caught automatically.</p>
    <div class="inline-actions" style="align-items:center;margin-bottom:6px"><input id="mhw" maxlength="300" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Type a word to block, then press Enter" aria-label="Word to block" style="flex:1;min-width:180px"><button type="button" class="btn sm" id="mha">Block it</button></div>
    <p class="muted" style="margin:0 0 6px;font-size:12px">${data.length} hidden word${data.length === 1 ? '' : 's'}. Typing a word that is already blocked just tells you so.</p><div class="list" style="max-height:calc(40vh / var(--pz,1))">${rows}</div>`,
    el => {
      const box = $('#mhw', el), add = async () => {
        const v = box.value; if (!v.trim()) return; box.value = '';
        const r = await sb.rpc('mod_hidden_add', { p_words: v }); if (r.error) return toast(r.error.message, true);
        const { added, existing, invalid } = r.data;
        toast(added ? `Blocked. It is now hidden${added > 1 ? ` (${added} words)` : ''}.` + (invalid ? ` ${invalid} skipped (letters only).` : '') : existing ? 'That is already blocked.' : invalid ? 'Letters only, please (a phrase can have spaces).' : 'Nothing to add.', !added && !existing);
        if (added) renderDash();
      };
      $('#mha', el).onclick = add; box.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
      el.querySelectorAll('[data-rh]').forEach(b => b.onclick = () => confirmBox('Remove this hidden word?', 'You will not be able to see which word it is. It will no longer be blocked.', 'Remove', async () => {
        const r = await sb.rpc('mod_hidden_remove', { p_id: b.dataset.rh }); if (r.error) { toast(r.error.message, true); return false; } toast('Removed'); renderDash(); }));
    }];
};

MODV.settings = async () => {
  const cfg = await modCfg(); if (cfg.error) return errBox(cfg.error); const st = cfg.settings;
  const num = (id, label, v, min, max, hint) => `<label for="${id}">${label}</label><input id="${id}" type="number" min="${min}" max="${max}" value="${v}">${hint ? `<small class="muted">${hint}</small>` : ''}`;
  return [`<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="mse" style="width:auto" ${st.enabled ? 'checked' : ''}> Filter is on (turn off only if it ever misbehaves)</label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="msd" style="width:auto" ${st.filter_dms ? 'checked' : ''}> Also filter private messages</label>
    ${num('msw', 'Count warnings from the last (hours)', st.window_hours, 1, 720)}${num('ms1', 'First timeout after this many warning points (0 = never time out automatically)', st.timeout_after, 0, 50)}
    ${num('ms1m', 'First timeout length (minutes)', st.timeout_minutes, 1, 1440)}${num('ms2', 'Longer timeout after this many points (0 = off)', st.timeout2_after, 0, 100)}${num('ms2m', 'Longer timeout length (minutes)', st.timeout2_minutes, 1, 1440)}
    <p class="muted" style="font-size:12px">Automatic timeouts are always temporary, and the owner account is never timed out automatically.</p>
    <div class="inline-actions" style="margin-top:10px"><button type="button" class="btn" id="mss">Save settings</button><button type="button" class="btn ghost" id="msn">Check existing names</button></div>`,
    el => {
      $('#mss', el).onclick = async () => {
        const r = await sb.rpc('mod_set_settings', { p_enabled: $('#mse', el).checked, p_filter_dms: $('#msd', el).checked, p_window_hours: +$('#msw', el).value, p_timeout_after: +$('#ms1', el).value, p_timeout_minutes: +$('#ms1m', el).value, p_timeout2_after: +$('#ms2', el).value, p_timeout2_minutes: +$('#ms2m', el).value });
        if (r.error) return toast(r.error.message, true); toast('Moderation settings saved'); renderDash();
      };
      $('#msn', el).onclick = async () => {
        const r = await sb.rpc('mod_rescan_names', { p_apply: false }); if (r.error) return toast(r.error.message, true);
        if (!r.data.count) return toast('All existing names look fine.');
        confirmBox('Ask these people to change their name?', `${r.data.count} existing account${r.data.count === 1 ? ' has' : 's have'} a name that now fails the filter: ${r.data.users.map(u => u.display_name + ' (@' + u.username + ')').join(', ')}. They keep full access, are shown as "New Student", and are asked to choose a display name next time they open Orbit.`, 'Ask them to change it', async () => {
          const a = await sb.rpc('mod_rescan_names', { p_apply: true }); if (a.error) { toast(a.error.message, true); return false; } toast('Done'); });
      };
    }];
};

MODV.test = async () => {
  const d = S.dash;
  return [`<p class="muted" style="margin:0 0 6px;font-size:12px">Type something to see what the filter would do. Nothing is sent or recorded.</p><label for="mtt">Text</label><textarea id="mtt" data-keep rows="3" maxlength="500" placeholder="Try a message, or a disguised word">${esc(d.mtx || '')}</textarea>
    <label for="mts">Check it as</label><select id="mts"><option value="chat">A chat message</option><option value="name">A name</option></select><div class="inline-actions" style="margin-top:8px"><button type="button" class="btn" id="mtg">Check</button></div><div id="mtr" style="margin-top:10px" aria-live="polite"></div>`,
    el => {
      const run = async () => {
        d.mtx = $('#mtt', el).value; const out = $('#mtr', el);
        const r = await sb.rpc('mod_test', { p_text: d.mtx, p_scope: $('#mts', el).value }); if (r.error) { out.innerHTML = `<p class="err">${esc(r.error.message)}</p>`; return; }
        const x = r.data.result;
        out.innerHTML = x ? `<p><b>Would be blocked.</b> ${esc(MOD_CATS[x.category] || x.category)}, matched <code>${esc(x.matched || x.term)}</code> (word list entry: <code>${esc(x.term)}</code>), ${x.weight} warning point${x.weight === 1 ? '' : 's'}.</p><small class="muted">The filter read it as: ${esc(r.data.normalized)}</small>` : `<p><b>Would be allowed.</b></p><small class="muted">The filter read it as: ${esc(r.data.normalized)}</small>`;
      };
      $('#mtg', el).onclick = run;
    }];
};

DASH.audit = async () => {
  const { data, error } = await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(150); if (error) return errBox(error);
  await needProfiles(data.flatMap(r => [r.actor_id, r.target_user]));
  const detail = o => Object.entries(o || {}).map(([k, v]) => `${k}: ${String(v).slice(0, 90)}`).join(' · ');
  return [`<div class="list log" style="max-height:calc(56vh / var(--pz,1))">${data.map(r => `<div class="row" style="cursor:default;align-items:flex-start"><span class="t"><span><strong>${esc(r.actor_id ? prof(r.actor_id).display_name : 'System')}</strong> ${esc(AUDIT[r.action] || r.action)}${r.target_user ? ' <strong>' + esc(prof(r.target_user).display_name) + '</strong>' : ''}</span>${detail(r.details) ? `<small>${esc(detail(r.details))}</small>` : ''}</span><small class="muted" style="white-space:nowrap">${stamp(r.created_at)}</small></div>`).join('') || '<p class="muted">Nothing has been logged yet.</p>'}</div>`];
};

const RATE_NAMES = { game2048: '2048', blockblast: 'Block Blast', breakout: 'Block Breaker', dino: 'Dino Run', flappy: 'Flappy Bird', geodash: 'Geometry Dash', minesweeper: 'Minesweeper', pacman: 'Pac-Man', slope: 'Slope', snake: 'Snake', tetris: 'Tetris', girder: 'Girder Gorilla', sudoku: 'Sudoku' };
DASH.rates = async () => {
  const { data, error } = await sb.rpc('list_rate_requests'); if (error) return errBox(error);
  await needProfiles(data.map(r => r.user_id));
  const row = r => `<div class="row" style="cursor:default;align-items:flex-start"><span class="t"><b>${esc(RATE_NAMES[r.game] || r.game)}: ${+r.current_pct}% to ${+r.wanted_pct}%</b> <small>by ${esc(prof(r.user_id).display_name)} · ${stamp(r.created_at)} · ${r.status === 'open' ? 'Waiting' : r.status === 'approved' ? 'Approved' : 'Declined'}</small><small>${esc(r.reason)}</small>${r.staff_note ? `<small><b>Team note:</b> ${esc(r.staff_note)}</small>` : ''}</span><button type="button" class="btn ghost sm" data-ra="${r.id}">Answer</button></div>`;
  return [`<p class="muted" style="margin-top:0">Players ask for a different percentage on a game from the Prize Room. Approving does not change any rate by itself: the owner changes it in the Orbit Games admin panel (Payouts tab), then you tell the player here.</p><div class="list" style="max-height:calc(56vh / var(--pz,1))">${data.map(row).join('') || '<p class="empty">No requests yet.</p>'}</div>`, el => el.querySelectorAll('[data-ra]').forEach(b => b.onclick = () => {
    const r = data.find(x => x.id === b.dataset.ra);
    modal('Answer request', `<p><b>${esc(RATE_NAMES[r.game] || r.game)}</b>: ${+r.current_pct}% to ${+r.wanted_pct}%</p><label for="rs">Answer</label><select id="rs">${[['open', 'Waiting'], ['approved', 'Approved'], ['declined', 'Declined']].map(([v, l]) => `<option value="${v}" ${r.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select><label for="rn">Note shown to the player (optional)</label><input id="rn" maxlength="300" value="${esc(r.staff_note)}">`,
      [cancelBtn, { label: 'Save', fn: async bg => { const { error } = await sb.rpc('answer_rate_request', { p_id: r.id, p_status: $('#rs', bg).value, p_note: $('#rn', bg).value.trim() }); if (error) { toast(error.message, true); return false; } toast('Saved'); renderDash(); } }]);
  })];
};

DASH.games = async () => [`<p class="muted" style="margin-top:0">The Orbit Games admin panel: games on/off, featured and new badges, scores and MVP, users and bans, game chat, suggestions and bug reports, announcements, site settings (including the recording limit), logs and staff roles.</p>
  <p><a class="btn" href="../games/admin.html" target="_blank" rel="noopener">Open Orbit Games admin</a></p>
  <p class="muted">It opens in a new tab. You are already signed in to Orbit; the panel also asks for the staff Google account the games database knows.</p>`];
DASH.server = async () => {
  const sv = S.sv; await loadMaint();
  const on = maint.on, ro = maint.ready ? await sb.rpc('admin_get_allowed_emails') : { error: true }, emails = ro.data || [];
  const setup = '<p class="muted" style="margin:0">Not set up yet. Run <code>migration-maintenance.sql</code> in the Supabase SQL Editor, then reload.</p>';
  const mcard = `<section class="maintcard ${on ? 'on' : ''}"><div class="mhead"><b>Maintenance mode</b><span class="mstate ${on ? 'on' : ''}">${on ? 'ON' : 'OFF'}</span></div>${!maint.ready ? setup : `
    <p class="muted" style="margin:.3rem 0 0;font-size:13px">While it is on, everyone except you sees the message below instead of Orbit and cannot send messages. You can keep using everything.</p>
    <label for="mm">Message everyone will see</label><textarea id="mm" data-keep rows="2" maxlength="300" placeholder="Orbit is down for maintenance. We will be back soon.">${esc(maint.msg)}</textarea>
    <div class="inline-actions" style="margin-top:10px"><button type="button" class="btn ${on ? '' : 'danger'}" id="mt">${on ? 'Turn maintenance OFF' : 'Shut down for maintenance'}</button>${on ? '<button type="button" class="btn ghost" id="mu">Update message</button>' : ''}</div>`}</section>`;
  const roster = `<h3 class="lbl" style="margin-left:0">Approved school emails</h3>${ro.error ? setup : `
    <p class="muted" style="margin:0 0 .4rem;font-size:12px">Accounts don't need a confirmation email, so this list is how Orbit checks that an address is real. When it has emails in it, only those addresses can create an account (existing accounts are not affected). Leave it empty to allow any school email in the right format. One email per line, like 30yua@tesdk12.net.</p>
    <textarea id="ae" data-keep rows="6" spellcheck="false" placeholder="30abc@tesdk12.net">${esc(emails.join('\n'))}</textarea>
    <div class="inline-actions" style="margin-top:8px;align-items:center"><button type="button" class="btn" id="aes">Save list</button><small class="muted" id="aec">${emails.length ? emails.length + ' approved' : 'Empty: any valid school email can sign up'}</small></div>`}`;
  return [mcard + `<label for="vn">Server name</label><input id="vn" maxlength="50" value="${esc(sv.name)}"><div style="display:flex;gap:12px"><div style="flex:1"><label for="vi">Icon (a letter or emoji)</label><input id="vi" maxlength="4" value="${esc(sv.icon_text || '')}" placeholder="${esc(sv.name[0].toUpperCase())}"></div><div style="flex:1"><label for="vc">Icon colour</label><input id="vc" type="color" value="${esc(sv.icon_color)}" style="height:38px;padding:2px"></div></div>
  <label for="vd">Description</label><input id="vd" maxlength="200" value="${esc(sv.description)}"><label for="vw">Welcome message (shown once to each person when they open the server)</label><textarea id="vw" rows="3" maxlength="500">${esc(sv.welcome_message || '')}</textarea><button class="btn" id="vs" style="width:auto;margin-top:12px">Save changes</button>` + roster, el => {
    $('#mt', el)?.addEventListener('click', e => {
      const msg = $('#mm', el).value.trim();
      if (on) { e.target.disabled = true; setMaint(false, msg).then(ok => { if (!ok) e.target.disabled = false; }); }
      else confirmBox('Shut down Orbit?', 'Everyone except you will see the maintenance message right away and cannot use Orbit until you turn it off.', 'Shut down', async () => (await setMaint(true, msg)) && undefined);
    });
    $('#mu', el)?.addEventListener('click', async () => { if (await setMaint(true, $('#mm', el).value.trim())) toast('Message updated'); });
    $('#aes', el)?.addEventListener('click', async e => {
      const list = $('#ae', el).value.split(/[\s,;]+/).filter(Boolean); e.target.disabled = true;
      const { data, error } = await sb.rpc('admin_set_allowed_emails', { p_emails: list }); e.target.disabled = false;
      if (error) return toast(error.message, true);
      toast(data ? data + ' approved emails saved' : 'List cleared. Any valid school email can sign up'); renderDash();
    });
    $('#vs', el).onclick = async () => { const { error } = await sb.rpc('admin_update_server', { p_name: $('#vn', el).value, p_description: $('#vd', el).value, p_icon_color: $('#vc', el).value, p_icon_text: $('#vi', el).value, p_welcome: $('#vw', el).value }); if (error) return toast(error.message, true); toast('Server updated'); await onServerChange(); };
  }];
};

/* ───────── spoilers: click (or Enter/Space) to reveal; revealed ones stay revealed while Orbit is open ───────── */
function revealSpoiler(el) {
  el.classList.add('on'); el.removeAttribute('role'); el.removeAttribute('tabindex'); el.removeAttribute('aria-label');
  const k = el.dataset.sp; if (k && !k.startsWith(':')) S.revealed.add(k);
}
document.addEventListener('click', e => { const tb = e.target.closest?.('.mention.tab'); if (!tb || !S.me) return; e.preventDefault(); e.stopPropagation(); navTo(tb.dataset.tab); }, true);
document.addEventListener('click', e => { const sp = e.target.closest?.('.spoiler'); if (sp && !sp.classList.contains('on')) { e.preventDefault(); e.stopPropagation(); revealSpoiler(sp); } }, true);
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return; const t = e.target; if (!t?.matches) return;
  if (t.matches('.spoiler:not(.on)')) { e.preventDefault(); revealSpoiler(t); }
  else if (t.matches('.mention[role=button]')) { e.preventDefault(); t.click(); }
});

/* ───────── profile picture: upload a file or take a photo; stored as a small square JPEG in the public "avatars" bucket ───────── */
async function avatarBlob(src) {
  const bmp = await createImageBitmap(src), side = Math.min(bmp.width, bmp.height), c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 256, 256); bmp.close?.();
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not process that image.')), 'image/jpeg', 0.88));
}
async function setAvatar(src) {
  let blob; try { blob = await avatarBlob(src); } catch { throw new Error('That image could not be read. Try a JPG or PNG.'); }
  const path = `${S.me.id}/avatar.jpg`;
  const up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' }); if (up.error) throw up.error;
  const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl + '?v=' + Date.now();
  const { data, error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', S.me.id).select().single(); if (error) throw error;
  S.me = data; S.profiles.set(data.id, data); renderAll();
}
async function removeAvatar() {
  await sb.storage.from('avatars').remove([`${S.me.id}/avatar.jpg`]);
  const { data, error } = await sb.from('profiles').update({ avatar_url: null }).eq('id', S.me.id).select().single(); if (error) throw error;
  S.me = data; S.profiles.set(data.id, data); renderAll();
}
function avatarBind(bg, close) {
  const f = $('#avf', bg), prev = $('#avp', bg), rm = $('#avr', bg), busy = on => bg.querySelectorAll('#avu,#avc,#avr').forEach(b => { b.disabled = on; }), refresh = () => { prev.innerHTML = av(S.me); rm.hidden = !avatarSrc(S.me); };
  $('#avu', bg).onclick = () => f.click();
  f.onchange = async () => {
    const file = f.files[0]; f.value = ''; if (!file) return;
    if (!/^image\//.test(file.type)) return toast('Please choose an image file.', true);
    if (file.size > 25 * 1048576) return toast('That image is too large (25 MB max).', true);
    busy(true); try { await setAvatar(file); toast('Profile picture updated'); } catch (e) { toast(e.message || 'Could not update your picture.', true); } busy(false); refresh();
  };
  $('#avc', bg).onclick = () => { if (!navigator.mediaDevices?.getUserMedia) return toast('This browser cannot use the camera here. Use Upload photo instead.', true); close(); cameraModal(() => settingsModal()); };
  rm.onclick = async () => { busy(true); try { await removeAvatar(); toast('Profile picture removed'); } catch (e) { toast(e.message || 'Could not remove it.', true); } busy(false); refresh(); };
}
function cameraModal(back) {
  let stream = null; const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
  modal('Take a photo', '<video id="cam" class="cam" autoplay playsinline muted></video><p class="muted" id="cmsg" style="font-size:12px">Starting the camera…</p>', [
    { label: 'Cancel', cls: 'ghost', fn: () => { stop(); setTimeout(back); } },
    { label: 'Capture', fn: async bg => {
      const v = $('#cam', bg); if (!stream || !v.videoWidth) { toast('The camera is not ready yet.', true); return false; }
      const s = Math.min(v.videoWidth, v.videoHeight), c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
      g.translate(512, 0); g.scale(-1, 1); g.drawImage(v, (v.videoWidth - s) / 2, (v.videoHeight - s) / 2, s, s, 0, 0, 512, 512);   // mirrored, like the preview
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)); stop();
      try { await setAvatar(blob); toast('Profile picture updated'); } catch (e) { toast(e.message || 'Could not save the photo.', true); }
      setTimeout(back); } }],
    async (bg, close) => {
      const obs = new MutationObserver(() => { if (!bg.isConnected) { stop(); obs.disconnect(); } }); obs.observe(document.body, { childList: true });   // Esc / click outside also turn the camera off
      try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
      catch { close(); toast('Camera blocked. Allow it in the address bar, then try again.', true); return; }
      if (!bg.isConnected) return stop(); $('#cam', bg).srcObject = stream; $('#cmsg', bg).textContent = 'Centre your face and press Capture.';
    });
}

/* ───────── typing indicator (who is typing in the open chat) ───────── */
let lastTyp = 0, typTimer = 0;
function joinTyping(id) {
  if (typCh) sb.removeChannel(typCh); S.typers = new Map(); clearTimeout(typTimer); lastTyp = 0;
  typCh = sb.channel('typing:' + id).on('broadcast', { event: 'typing' }, ({ payload }) => onTyping(payload)).subscribe();
}
function onTyping(p) { if (!p?.uid || p.uid === S.me?.id) return; S.typers.set(p.uid, Date.now() + 4500); needProfiles([p.uid]).then(showTyping); showTyping(); }
function sendTyping() {
  const ta = $('#in'); if (!typCh || !ta || ta.disabled || !ta.value.trim() || Date.now() - lastTyp < 2500) return;
  lastTyp = Date.now(); typCh.send({ type: 'broadcast', event: 'typing', payload: { uid: S.me.id } });
}
function showTyping() {
  const t = $('#typ'); clearTimeout(typTimer); if (!t) return;
  const now = Date.now(); for (const [u, e] of S.typers) if (e <= now) S.typers.delete(u);
  const ids = [...S.typers.keys()], nm = u => `<b${SHOP?.isHolder?.(u) ? ' class="olname"' : ''}>${esc(prof(u).display_name)}</b>`, names = ids.map(nm);
  if (!names.length) { t.textContent = ''; return; }
  const who = names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : names.length === 3 ? `${names[0]}, ${names[1]} and ${names[2]} are typing…` : 'Several people are typing…';
  t.innerHTML = `${ids.some(u => SHOP?.isHolder?.(u)) ? '<u class="oloop tyl" aria-hidden="true"><s></s><s></s></u>' : '<span class="dots"><i></i><i></i><i></i></span>'}${who}`;
  typTimer = setTimeout(showTyping, Math.max(100, Math.min(...S.typers.values()) - now + 50));
}

/* ───────── @mentions and #channels: autocomplete while typing ───────── */
const mentionsMe = m => {
  if (!S.me || !m.content || m.author_id === S.me.id) return false;
  if (new RegExp('(^|[^a-z0-9_])@' + S.me.username + '(?![a-z0-9_])', 'i').test(m.content)) return true;
  if (S.cmem.size && crHas(crHits(m.content), S.me.id)) return true;   // @Biology (AP) pings everyone who picked that role
  return /(^|[^a-z0-9_])@(everyone|here)(?![a-z0-9_])/i.test(m.content) && ['owner', 'admin', 'moderator'].includes(roleOf(m.author_id));   // only staff can ping everyone
};
const AC = { items: [], i: 0, from: 0, to: 0 };
function acClose() { AC.items = []; const el = $('#ac'); if (el) el.hidden = true; }
function acDraw() {
  const el = $('#ac'); if (!el) return; el.hidden = false;
  el.innerHTML = AC.items.map((it, n) => `<button type="button" role="option" class="${n === AC.i ? 'on' : ''}" aria-selected="${n === AC.i}" data-i="${n}">${it.t === 'u' ? `${av(it.p)}<span>${esc(it.p.display_name)}</span><small>@${esc(it.p.username)}</small>` : it.t === 'r' ? `<span class="mention crole">${esc(it.label)}</span><small>${esc(it.sub)}</small>` : it.t === 'c' ? `${ic('hash', 18)}<span>${esc(it.c.name)}</span><small>${esc(it.c.description || '')}</small>` : it.t === 't' ? `${ic(it.icon, 18)}<span>${esc(it.label)}</span><small>~${esc(it.ins.slice(1))}</small>` : `<span class="mention all">${esc(it.label)}</span><small>${esc(it.sub)}</small>`}</button>`).join('');
  el.onmousedown = e => { const b = e.target.closest('[data-i]'); if (!b) return; e.preventDefault(); acPick(+b.dataset.i); };
  el.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
}
function acUpdate(ta) {
  const pos = ta.selectionStart, m = ta.value.slice(0, pos).match(/(^|\s)([@#~])([a-z0-9_-]{0,40})$/i);
  if (!m || ta.disabled) return acClose();
  const type = m[2], q = m[3].toLowerCase(); let items = [];
  if (type === '~') items = TAB_TAGS.filter(([slug, label, , , al]) => !q || slug.includes(q) || label.toLowerCase().includes(q) || al.some(x => x.startsWith(q)))
    .sort((x, y) => (y[0].startsWith(q) || y[4].some(z => z.startsWith(q))) - (x[0].startsWith(q) || x[4].some(z => z.startsWith(q)))).slice(0, 8).map(([slug, label, , icon]) => ({ t: 't', ins: '~' + slug, label, icon }));
  else if (type === '@') {
    const pool = S.view === 'server' ? S.members.map(x => prof(x.user_id)) : (() => { const c = S.convs.find(x => x.id === S.active); return c?.is_group ? (c.mems || []).map(prof) : [S.me, c?.other].filter(Boolean); })();
    const name = p => (p.display_name || '').toLowerCase(), score = p => String(p.username).startsWith(q) ? 0 : name(p).startsWith(q) ? 1 : 2;
    items = pool.filter(p => p.username && (p.username.includes(q) || name(p).includes(q))).sort((a, b) => score(a) - score(b) || name(a).localeCompare(name(b))).slice(0, 8).map(p => ({ t: 'u', ins: '@' + p.username, p }));
    if (S.view === 'server' && isStaff()) items = [...['everyone', 'here'].filter(k => k.startsWith(q)).map(k => ({ t: 'g', ins: '@' + k, label: '@' + k, sub: k === 'here' ? 'Notify everyone who is online' : 'Notify every member' })), ...items].slice(0, 8);
  } else items = S.chans.filter(c => c.kind === 'text' && c.name.includes(q)).sort((a, b) => b.name.startsWith(q) - a.name.startsWith(q)).slice(0, 8).map(c => ({ t: 'c', ins: '#' + c.name, c }));
  if (type === '@' && S.view === 'server' && S.croles.length) {
    const flat = x => x.toLowerCase().replace(/[^a-z0-9]/g, ''), fq = flat(q), seen = new Set(), cand = [];
    for (const r of S.croles) for (const [label, ids] of [[crLabel(r), [r.id]], [r.subject, S.croles.filter(x => x.subject === r.subject).map(x => x.id)]]) {
      if (seen.has(label)) continue; seen.add(label); const n = crPeople(ids).length;
      cand.push({ t: 'r', ins: '@' + label, label: '@' + label, sub: n + (n === 1 ? ' member' : ' members') + (label === r.subject ? ' · any level' : ''), k: flat(label) });
    }
    const hits = cand.filter(x => x.k.includes(fq)).sort((a, b) => b.k.startsWith(fq) - a.k.startsWith(fq) || a.k.length - b.k.length).slice(0, 5);
    items = [...items.slice(0, 6), ...hits].slice(0, 10);
  }
  if (!items.length) return acClose();
  Object.assign(AC, { items, i: 0, from: pos - q.length - 1, to: pos }); acDraw();
}
function acPick(n) {
  const it = AC.items[n], ta = $('#in'); if (!it || !ta) return;
  ta.setRangeText(it.ins + ' ', AC.from, AC.to, 'end'); acClose(); ta.dispatchEvent(new Event('input')); ta.focus();
}
function acKey(e) {
  const el = $('#ac'); if (!AC.items.length || !el || el.hidden) return false;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); AC.i = (AC.i + (e.key === 'ArrowDown' ? 1 : AC.items.length - 1)) % AC.items.length; acDraw(); return true; }
  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); acPick(AC.i); return true; }
  if (e.key === 'Escape') { e.preventDefault(); acClose(); return true; }
  return false;
}

/* ───────── GIFs (built-in collection in the gifs/ folder) ───────── */
async function sendGif(token) {
  const ta = $('#in'); if (!ta || S.sending) return;
  const draft = ta.value, files = S.pending; S.pending = [];
  ta.value = token; await send();
  S.pending = files;
  const t = $('#in'); if (t && (t.value === token || t.value === '')) { t.value = draft; t.dispatchEvent(new Event('input')); }
  renderPending();
}
async function loadUgifs() {
  const { data, error } = await sb.from('user_gifs').select('id,user_id,name,created_at').order('created_at', { ascending: false }).limit(300);
  if (!error) S.ugifs = data || [];
  return S.ugifs || [];
}
function gifModal() {
  const lim = postLimit(); if (lim) return toast(lim, true);
  modal('Send a GIF', `<input id="gq" placeholder="Search GIFs (try: laugh, party, sad)" aria-label="Search GIFs" autocomplete="off"><div id="gr" class="gifgrid" aria-live="polite"></div><p class="muted" style="font-size:11px;margin:.5rem 0 0">Want your own? Tap the + at the top right to add GIFs.</p>`,
    [{ label: 'Close', cls: 'ghost' }], (bg, close) => {
    const out = $('#gr', bg);
    const plus = document.createElement('button'); plus.type = 'button'; plus.className = 'ib gifplus'; plus.title = 'Add a GIF'; plus.setAttribute('aria-label', 'Add a GIF'); plus.innerHTML = ic('plus', 20);
    plus.onclick = () => addGifsModal(); $('.modal', bg).append(plus);
    const run = () => {
      if (!out.isConnected) { if (S.gifsPick === run) S.gifsPick = null; return; }
      const q = $('#gq', bg).value.trim().toLowerCase();
      const built = GIFS.filter(([n, tags]) => !q || n.includes(q) || tags.includes(q)).map(([n]) => ({ token: `:gif:${n}:`, src: `gifs/${n}.gif`, label: n }));
      const mine = (S.ugifs || []).filter(g => !q || g.name.toLowerCase().includes(q)).map(g => ({ token: `:ugif:${g.user_id}/${g.id}:`, src: ugifUrl(g.user_id, g.id), label: g.name }));
      const items = [...built, ...mine];
      out.innerHTML = items.map((g, i) => `<button type="button" data-i="${i}" aria-label="${esc(g.label)}"><img src="${esc(g.src)}" alt="" loading="lazy"></button>`).join('') || '<p class="muted">No GIFs found.</p>';
      out.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const g = items[+b.dataset.i]; close(); sendGif(g.token); });
    };
    S.gifsPick = run; $('#gq', bg).oninput = run; run(); loadUgifs().then(() => bg.isConnected && run());
  });
}
async function uploadGif(file, name, effect = 'still') {
  if (!file) throw new Error('Choose a file first.');
  const isGif = file.type === 'image/gif', isVid = file.type === 'video/mp4' || /\.mp4$/i.test(file.name || '');
  if (isGif && file.size > GIF_MAX) throw new Error('That GIF is over 3 MB.');
  if (!isGif && file.size > (isVid ? 50 : 15) * 1024 * 1024) throw new Error(`That ${isVid ? 'video' : 'picture'} is too large (max ${isVid ? 50 : 15} MB).`);
  const blob = await makeGifBlob(file, effect);
  const sig = String.fromCharCode(...new Uint8Array(await blob.slice(0, 6).arrayBuffer()));
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('That file is not a real GIF.');
  const id = crypto.randomUUID(), path = `${S.me.id}/${id}.gif`;
  const up = await sb.storage.from('gifs').upload(path, blob, { contentType: 'image/gif', cacheControl: '31536000', upsert: false });
  if (up.error) throw up.error;
  const label = (name || (file.name || '').replace(/\.[^.]+$/, '')).trim().slice(0, 30) || 'GIF';
  const ins = await sb.from('user_gifs').insert({ id, user_id: S.me.id, name: label }).select('id,user_id,name,created_at').single();
  if (ins.error) { sb.storage.from('gifs').remove([path]); throw ins.error; }
  S.ugifs = [ins.data, ...(S.ugifs || [])];
}
/* ───────── turn pictures (PNG/JPG/WEBP) and videos (MP4) into GIFs, right in the browser ───────── */
const GIF_MAX = 3 * 1024 * 1024, GIF_EFFECTS = [['still', 'Still picture'], ['zoom', 'Slow zoom'], ['shake', 'Shake'], ['bounce', 'Bounce']];
const gifNap = ms => new Promise(r => setTimeout(r, ms));
async function encodeFit(make, delayCs) {   // tries smaller sizes until the GIF fits in 3 MB
  for (const W of [360, 280, 200, 140]) {
    const { frames, w, h } = make(W), bytes = gifEncode(frames, w, h, delayCs);
    if (bytes.length <= GIF_MAX) return new Blob([bytes], { type: 'image/gif' });
    await gifNap(20);
  }
  throw new Error('That came out over 3 MB even when shrunk. Try a shorter or simpler one.');
}
function pictureFrames(img, W, effect) {
  W = Math.max(2, Math.min(W, img.width)); const H = Math.max(2, Math.round(W * img.height / img.width));
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true });
  const n = effect === 'still' ? 1 : 18, frames = [];
  for (let i = 0; i < n; i++) {
    const t = i / n, a = 2 * Math.PI * t; let sc = 1, dx = 0, dy = 0;
    if (effect === 'zoom') sc = 1 + 0.18 * (0.5 - 0.5 * Math.cos(a));
    else if (effect === 'shake') { sc = 1.1; dx = Math.sin(a * 3) * W * 0.035; }
    else if (effect === 'bounce') { sc = 1.1; dy = -Math.abs(Math.sin(a)) * H * 0.04; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);   // PNGs with see-through areas get a white background
    ctx.translate(W / 2 + dx, H / 2 + dy); ctx.scale(sc, sc); ctx.drawImage(img, -W / 2, -H / 2, W, H);
    frames.push(ctx.getImageData(0, 0, W, H).data);
  }
  return { frames, w: W, h: H };
}
const seekTo = (v, t) => new Promise(res => {
  if (Math.abs(v.currentTime - t) < 0.001) return res();
  const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); }, to = setTimeout(done, 2500);
  v.addEventListener('seeked', done); v.currentTime = t;
});
async function videoToBitmaps(file, secs = 5, fps = 10) {   // grabs up to the first 5 seconds
  const url = URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error('That video could not be read. Try a different MP4.')); });
    if (!v.videoWidth) throw new Error('That video could not be read. Try a different MP4.');
    const dur = Math.min(secs, isFinite(v.duration) && v.duration > 0 ? v.duration : secs), n = Math.max(1, Math.floor(dur * fps));
    const W = Math.min(360, v.videoWidth), H = Math.max(2, Math.round(W * v.videoHeight / v.videoWidth));
    const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d'), out = [];
    for (let i = 0; i < n; i++) {
      await seekTo(v, Math.min(i / fps, Math.max(0, (v.duration || dur) - 0.05)));
      ctx.drawImage(v, 0, 0, W, H); out.push(await createImageBitmap(c));
    }
    return { bitmaps: out, fps };
  } finally { URL.revokeObjectURL(url); }
}
async function makeGifBlob(file, effect = 'still') {   // GIF stays as is; PNG/JPG/WEBP/MP4 are converted
  if (file.type === 'image/gif') return file;
  if (file.type === 'video/mp4' || /\.mp4$/i.test(file.name || '')) {
    const { bitmaps, fps } = await videoToBitmaps(file);
    try {
      return await encodeFit(W => {
        W = Math.min(W, bitmaps[0].width); const H = Math.max(2, Math.round(W * bitmaps[0].height / bitmaps[0].width));
        const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true });
        return { w: W, h: H, frames: bitmaps.map(b => { ctx.drawImage(b, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data; }) };
      }, Math.round(100 / fps));
    } finally { bitmaps.forEach(b => b.close?.()); }
  }
  if (/^image\/(png|jpeg|webp)$/.test(file.type)) {
    let img; try { img = await createImageBitmap(file); } catch { throw new Error('That picture could not be read.'); }
    try { return await encodeFit(W => pictureFrames(img, W, effect), effect === 'still' ? 100 : 8); } finally { img.close?.(); }
  }
  throw new Error('Use a GIF, PNG, JPG or MP4 file.');
}
async function attUrl(p) {
  let u = cachedUrl(p); if (u) return u;
  const { data } = await sb.storage.from('attachments').createSignedUrls([p], 3600), d = data?.[0];
  if (d?.signedUrl) { URLS.set(d.path, { url: d.signedUrl, exp: Date.now() + 3600e3 }); return d.signedUrl; }
  return '';
}
async function pictureGifModal(path, label) {   // the "GIF" button on a picture in chat (yours or anyone's)
  const lim = postLimit(); if (lim) return toast(lim, true);
  const url = await attUrl(path); let src = null;
  try { const r = await fetch(url); if (!r.ok) throw 0; src = await r.blob(); } catch { return toast('Could not load that picture.', true); }
  const base = String(label || 'picture').replace(/\.[^.]+$/, '').slice(0, 30) || 'picture';
  let file = null, token = 0, pUrl = null;
  const build = async bg => {
    const my = ++token, prev = $('#pgp', bg), msg = $('#pgm', bg); file = null; prev.style.opacity = '.4'; msg.textContent = 'Making your GIF…';
    try {
      const f = new File([src], 'p', { type: src.type || 'image/png' }), out = await makeGifBlob(f, $('#pge', bg).value); if (my !== token || !bg.isConnected) return;
      file = new File([out], `${base}.gif`, { type: 'image/gif' });
      if (pUrl) URL.revokeObjectURL(pUrl); pUrl = URL.createObjectURL(out); prev.src = pUrl; prev.style.opacity = '';
      msg.textContent = `Ready (${Math.round(out.size / 1024)} KB).`;
    } catch (e) { if (my === token) msg.textContent = e.message || 'Could not make a GIF from that picture.'; }
  };
  const ready = () => { if (!file) { toast('Hold on, the GIF is still being made.', true); return false; } return true; };
  const use = send => bg => { if (!ready()) return false; addFiles([file]); if (send) setTimeout(() => $('#snd')?.click(), 50); else $('#in')?.focus(); };
  modal('Turn into a GIF', `<img id="pgp" alt="GIF preview" style="display:block;max-width:100%;max-height:260px;margin:0 auto;border-radius:10px;border:1px solid var(--line)">
    <p class="muted" id="pgm" style="margin:.5rem 0" role="status">Making your GIF…</p>
    <label>Effect <select id="pge">${GIF_EFFECTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
    <input id="pgn" maxlength="30" placeholder="Name (only used if you save it)" aria-label="GIF name" style="margin-top:.5rem">
    <p class="muted" style="font-size:11px;margin:.5rem 0 0">Send now or Add to message attaches it to this chat only. Save to GIFs puts it in the community collection, where everyone can see and send it.</p>`,
    [{ label: 'Close', cls: 'ghost' },
     { label: 'Save to GIFs', cls: 'ghost', fn: async bg => { if (!ready()) return false; try { await uploadGif(file, $('#pgn', bg).value.trim() || base); toast('GIF added'); S.gifsRefresh?.(); } catch (e) { toast(e.message || 'Upload failed', true); return false; } } },
     { label: 'Add to message', cls: 'ghost', fn: use(false) },
     { label: 'Send now', fn: use(true) }],
    bg => {
      $('#pge', bg).onchange = () => build(bg);
      new MutationObserver((_, mo) => { if (!bg.isConnected) { if (pUrl) URL.revokeObjectURL(pUrl); mo.disconnect(); } }).observe(document.body, { childList: true });
      build(bg);
    });
}
/* ───────── camera GIF maker: encodes frames into a GIF right in the browser (no libraries, no workers) ───────── */
function gifLzw(data) {   // GIF-flavoured LZW, 8-bit palette indexes
  const out = [8], CLEAR = 256, EOI = 257; let buf = 0, nb = 0, block = [], size = 9, next = 258, dict = new Map();
  const emit = (code, bits) => {
    buf |= code << nb; nb += bits;
    while (nb >= 8) { block.push(buf & 255); buf >>= 8; nb -= 8; if (block.length === 255) { out.push(255, ...block); block = []; } }
  };
  emit(CLEAR, size);
  let prefix = data[0];
  for (let i = 1; i < data.length; i++) {
    const k = data[i], key = prefix * 256 + k, hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix, size); dict.set(key, next++);
    if (next - 1 === (1 << size) && size < 12) size++;
    if (next === 4096) { emit(CLEAR, size); dict.clear(); size = 9; next = 258; }
    prefix = k;
  }
  emit(prefix, size); next++; if (next - 1 === (1 << size) && size < 12) size++;
  emit(EOI, size);
  if (nb > 0) block.push(buf & 255);
  if (block.length) out.push(block.length, ...block);
  out.push(0);
  return out;
}
function gifEncode(frames, w, h, delayCs) {   // frames: RGBA arrays. Returns a Uint8Array holding a looping GIF89a.
  const hist = new Uint32Array(32768), px = w * h;
  for (const f of frames) for (let i = 0; i < f.length; i += 28) hist[((f[i] >> 3) << 10) | ((f[i + 1] >> 3) << 5) | (f[i + 2] >> 3)]++;
  const chan = (k, c) => c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31;
  const boxes = [[]]; for (let k = 0; k < 32768; k++) if (hist[k]) boxes[0].push(k);
  while (boxes.length < 255) {   // median cut: 255 colours (index 255 is kept for "unchanged")
    let bi = -1, best = 0, bc = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 31, hi = 0; for (const k of b) { const v = chan(k, c); if (v < lo) lo = v; if (v > hi) hi = v; } if (hi - lo > best) { best = hi - lo; bi = i; bc = c; } } });
    if (bi < 0) break;
    const b = boxes[bi].sort((x, y) => chan(x, bc) - chan(y, bc));
    let tot = 0, acc = 0, cut = 1; for (const k of b) tot += hist[k];
    for (let i = 0; i < b.length - 1; i++) { acc += hist[b[i]]; cut = i + 1; if (acc >= tot / 2) break; }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  const n = boxes.length, pal = new Uint8Array(768);
  boxes.forEach((b, i) => { let t = 0, r = 0, g = 0, bl = 0; for (const k of b) { const c = hist[k]; t += c; r += c * chan(k, 0); g += c * chan(k, 1); bl += c * chan(k, 2); }
    const e = v => { v = Math.round(v / (t || 1)); return (v << 3) | (v >> 2); }; pal[i * 3] = e(r); pal[i * 3 + 1] = e(g); pal[i * 3 + 2] = e(bl); });
  const cache = new Int16Array(32768).fill(-1);
  const near = (r, g, b) => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3); let m = cache[key]; if (m >= 0) return m;
    let bd = 1e9; for (let i = 0; i < n; i++) { const dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b, d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; m = i; } }
    return cache[key] = m;
  };
  const w16 = v => [v & 255, v >> 8], bytes = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...w16(w), ...w16(h), 0xF7, 0, 0];
  for (let i = 0; i < 768; i++) bytes.push(pal[i]);
  bytes.push(0x21, 0xFF, 0x0B, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  const shown = new Uint8Array(px).fill(255);   // what the viewer currently sees at each pixel
  for (const f of frames) {
    const idx = new Uint8Array(px).fill(255); let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let p = 0, q = 0, x = 0, y = 0; p < px; p++, q += 4, x++) {
      if (x === w) { x = 0; y++; }
      const r = f[q], g = f[q + 1], b = f[q + 2], s = shown[p];
      if (s !== 255) { const dr = pal[s * 3] - r, dg = pal[s * 3 + 1] - g, db = pal[s * 3 + 2] - b; if (dr * dr + dg * dg + db * db < 220) continue; }   // camera noise: leave the pixel alone
      const v = near(r, g, b); idx[p] = v; shown[p] = v;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) { x0 = y0 = x1 = y1 = 0; }   // nothing moved: a 1-pixel frame keeps the timing
    const cw = x1 - x0 + 1, chh = y1 - y0 + 1, d = new Uint8Array(cw * chh);
    for (let yy = 0; yy < chh; yy++) for (let xx = 0; xx < cw; xx++) d[yy * cw + xx] = idx[(y0 + yy) * w + x0 + xx];
    bytes.push(0x21, 0xF9, 0x04, 0x05, ...w16(delayCs), 255, 0, 0x2C, ...w16(x0), ...w16(y0), ...w16(cw), ...w16(chh), 0);
    for (const v of gifLzw(d)) bytes.push(v);
  }
  bytes.push(0x3B);
  return Uint8Array.from(bytes);
}

/* ───────── take a photo with the camera and attach/send it ───────── */
function photoModal() {
  const fallback = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment'); i.onchange = () => addFiles([...i.files]); i.click(); };
  if (!navigator.mediaDevices?.getUserMedia) return fallback();
  let stream = null, facing = 'user', file = null, url = null, busy = false;
  modal('Take a photo', `<div class="camwrap" id="cw"><video id="cv" playsinline muted autoplay></video><img id="cp" alt="Your photo" hidden><div class="camcount" id="cc" hidden></div></div>
    <p class="muted" id="cm">Allow the camera when your browser asks. Nothing is sent until you press Send.</p>
    <div class="camrow"><button type="button" class="btn" id="csnap" disabled>Take photo</button><button type="button" class="btn sm ghost" id="csw">Switch camera</button><button type="button" class="btn" id="csend" hidden>Send</button><button type="button" class="btn ghost" id="cadd" hidden>Add to message</button><button type="button" class="btn ghost" id="cre" hidden>Retake</button></div>`,
    [{ label: 'Close', cls: 'ghost' }], bg => {
    const q = s => $(s, bg), v = q('#cv'), cw = q('#cw'), msg = q('#cm'), snap = q('#csnap'), sw = q('#csw');
    const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
    const mo = new MutationObserver(() => { if (!bg.isConnected) { stop(); if (url) URL.revokeObjectURL(url); mo.disconnect(); } });
    mo.observe(document.body, { childList: true });
    async function start() {
      stop(); snap.disabled = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
        if (!bg.isConnected) return stop();
        v.srcObject = stream; cw.classList.toggle('nomirror', facing !== 'user'); snap.disabled = false;
        msg.textContent = 'Nothing is sent until you press Send.';
      } catch (e) {
        msg.textContent = e.name === 'NotAllowedError' ? 'Camera access is blocked. Allow it in your browser\'s site settings, then try again.' : e.name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not start.';
      }
    }
    const results = on => { v.hidden = on; q('#cp').hidden = !on; q('#csend').hidden = q('#cadd').hidden = q('#cre').hidden = !on; snap.hidden = sw.hidden = on; };
    sw.onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
    snap.onclick = async () => {
      if (busy || !stream || !v.videoWidth) return; busy = true;
      const W = Math.min(v.videoWidth, 1280), H = Math.round(W * v.videoHeight / v.videoWidth), c = document.createElement('canvas'); c.width = W; c.height = H;
      c.getContext('2d').drawImage(v, 0, 0, W, H);
      cw.classList.add('flash'); setTimeout(() => cw.classList.remove('flash'), 180);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88)); busy = false;
      if (!blob) { msg.textContent = 'Could not take the photo. Try again.'; return; }
      file = new File([blob], `photo-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.jpg`, { type: 'image/jpeg' });
      if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob); q('#cp').src = url; results(true);
      msg.textContent = 'Looks good? Send it now or add a caption first.';
    };
    q('#cre').onclick = () => { results(false); msg.textContent = 'Nothing is sent until you press Send.'; };
    const done = send => { addFiles([file]); bg.querySelector('.actions button')?.click(); if (send) setTimeout(() => $('#snd')?.click(), 50); else $('#in')?.focus(); };
    q('#cadd').onclick = () => done(false); q('#csend').onclick = () => done(true);
    start();
  });
}
function cameraGifModal() {
  if (!navigator.mediaDevices?.getUserMedia) return toast('This browser cannot use the camera here.', true);
  const nap = ms => new Promise(r => setTimeout(r, ms));
  let stream = null, facing = 'user', blob = null, url = null, busy = false;
  modal('Make a GIF with your camera', `<div class="camwrap" id="cw"><video id="cv" playsinline muted autoplay></video><img id="cp" alt="Your GIF" hidden><div class="camcount" id="cc" hidden></div></div>
    <p class="muted" id="cm">Allow the camera when your browser asks. Nothing is uploaded until you press Save.</p>
    <div class="camrow" id="co"><label>Length <select id="cl"><option value="2">2 seconds</option><option value="3" selected>3 seconds</option><option value="4">4 seconds</option><option value="5">5 seconds</option></select></label><button type="button" class="btn sm ghost" id="csw">Switch camera</button></div>
    <input id="cn" maxlength="30" placeholder="Name (optional, helps search)" aria-label="GIF name" hidden>
    <div class="camrow"><button type="button" class="btn" id="crec" disabled>Record</button><button type="button" class="btn" id="csave" hidden>Save GIF</button><button type="button" class="btn ghost" id="cre" hidden>Retake</button></div>`,
    [{ label: 'Close', cls: 'ghost' }], bg => {
    const q = s => $(s, bg), v = q('#cv'), cw = q('#cw'), msg = q('#cm'), rec = q('#crec'), sw = q('#csw');
    const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
    const mo = new MutationObserver(() => { if (!bg.isConnected) { stop(); if (url) URL.revokeObjectURL(url); mo.disconnect(); } });
    mo.observe(document.body, { childList: true });
    async function start() {
      stop(); rec.disabled = true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (!bg.isConnected) return stop();
        v.srcObject = stream; cw.classList.toggle('nomirror', facing !== 'user'); rec.disabled = false;
        msg.textContent = 'Allow the camera when your browser asks. Nothing is uploaded until you press Save.';
      } catch (e) {
        msg.textContent = e.name === 'NotAllowedError' ? 'Camera access is blocked. Allow it in your browser\'s site settings, then try again.' : e.name === 'NotFoundError' ? 'No camera was found on this device.' : 'The camera could not start.';
      }
    }
    const results = on => {   // on = showing the finished GIF
      v.hidden = on; q('#cp').hidden = !on; q('#cn').hidden = !on; q('#csave').hidden = !on; q('#cre').hidden = !on; rec.hidden = on; q('#co').hidden = on;
    };
    sw.onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
    rec.onclick = async () => {
      if (busy || !stream) return; busy = true; rec.disabled = sw.disabled = true;
      const cc = q('#cc'); for (let n = 3; n > 0; n--) { cc.hidden = false; cc.textContent = n; await nap(700); } cc.hidden = true;
      const secs = +q('#cl').value, fps = 10, W = 240, H = Math.max(2, Math.round(W * (v.videoHeight || 480) / (v.videoWidth || 640)));
      const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d', { willReadFrequently: true });
      if (facing === 'user') { ctx.translate(W, 0); ctx.scale(-1, 1); }
      const frames = [], t0 = performance.now(); cw.classList.add('rec'); msg.textContent = 'Recording…';
      for (let i = 0; i < secs * fps && bg.isConnected; i++) {
        ctx.drawImage(v, 0, 0, W, H); frames.push(ctx.getImageData(0, 0, W, H).data);
        const wait = t0 + (i + 1) * 1000 / fps - performance.now(); if (wait > 0) await nap(wait);
      }
      cw.classList.remove('rec'); if (!bg.isConnected) return;
      msg.textContent = 'Making your GIF…'; await nap(40);
      try { blob = new Blob([gifEncode(frames, W, H, Math.round(100 / fps))], { type: 'image/gif' }); }
      catch { blob = null; }
      busy = false; rec.disabled = sw.disabled = false;
      if (!blob || blob.size > 3 * 1024 * 1024) { msg.textContent = blob ? 'That GIF came out over 3 MB. Try a shorter one.' : 'Something went wrong making the GIF. Try again.'; blob = null; return; }
      if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob); q('#cp').src = url; results(true);
      msg.textContent = `Looks good? ${Math.round(blob.size / 1024)} KB. Name it and save, or retake.`; q('#cn').focus();
    };
    q('#cre').onclick = () => { results(false); msg.textContent = 'Ready when you are.'; };
    q('#csave').onclick = async e => {
      const b = e.currentTarget, before = S.ugifs?.[0]?.id; b.disabled = true; b.textContent = 'Saving…';
      try { await uploadGif(new File([blob], 'camera.gif', { type: 'image/gif' }), q('#cn').value.trim() || 'My GIF'); }
      catch (err) { toast(err.message || 'Upload failed', true); }
      if (S.ugifs?.[0]?.id === before) { b.disabled = false; b.textContent = 'Save GIF'; return; }
      bg.querySelector('.actions button')?.click(); S.gifsRefresh?.(); toast('GIF added');
    };
    start();
  });
}

function gifsPanelHtml() {
  const list = S.ugifs || [], owner = S.sv?.role === 'owner';
  return `<p class="muted">Upload a GIF (up to 3 MB), turn a PNG, JPG or MP4 into one, or record a short one with your camera, and everyone can send it from the GIF button. MP4s use their first 5 seconds. You can also turn any picture in a chat into a GIF with the GIF button on it. Keep it school-appropriate. Admins can remove anything that isn't.</p>
  <div class="gifup"><input type="file" id="gf" accept="image/gif,image/png,image/jpeg,image/webp,video/mp4,.gif,.png,.jpg,.jpeg,.webp,.mp4" aria-label="Choose a GIF, picture or MP4"><input id="gn" maxlength="30" placeholder="Name (optional, helps search)" aria-label="GIF name"><label class="muted">Picture effect <select id="ge">${GIF_EFFECTS.map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label><button type="button" class="btn" id="gu">Upload GIF</button></div>
  <div class="gifup"><button type="button" class="btn" id="gc">Make a GIF with your camera</button><span class="muted">Up to 5 seconds. It stays on your device until you save it.</span></div>
  <h3 class="lbl">Community GIFs (${list.length})</h3>
  <div class="gifcards">${list.map(g => `<figure class="gifcard"><img src="${esc(ugifUrl(g.user_id, g.id))}" alt="${esc(g.name)}" loading="lazy"><figcaption><b>${esc(g.name)}</b><small>${esc(prof(g.user_id).display_name)}</small>${g.user_id === S.me.id || owner ? `<button type="button" class="btn sm ghost" data-del="${g.id}" data-u="${g.user_id}">Delete</button>` : ''}</figcaption></figure>`).join('') || '<p class="muted">No uploaded GIFs yet. Be the first!</p>'}</div>`;
}
function bindGifs(root, refresh) {
  $('#gc', root).onclick = cameraGifModal;
  $('#gu', root).onclick = async e => {
    const btn = e.currentTarget, f = $('#gf', root).files[0]; btn.disabled = true; btn.textContent = 'Uploading…';
    try { btn.textContent = f && f.type !== 'image/gif' ? 'Converting…' : 'Uploading…'; await uploadGif(f, $('#gn', root).value, $('#ge', root).value); refresh(); toast('GIF added'); }
    catch (err) { toast(err.message || 'Upload failed', true); btn.disabled = false; btn.textContent = 'Upload GIF'; }
  };
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const id = b.dataset.del, u = b.dataset.u; b.disabled = true;
    const { error } = await sb.from('user_gifs').delete().eq('id', id);
    if (error) { b.disabled = false; return toast(error.message, true); }
    sb.storage.from('gifs').remove([`${u}/${id}.gif`]);
    S.ugifs = (S.ugifs || []).filter(g => g.id !== id); refresh();
  });
}
/* "Add GIFs" used to be a sidebar tab; it is now a window opened by the + button at the top right of the GIF picker. Same features. */
function addGifsModal() {
  modal('Add GIFs', '<div id="gadd" style="max-height:calc(68vh / var(--pz,1));overflow:auto"></div>', [{ label: 'Close', cls: 'ghost' }], (bg) => {
    const root = $('#gadd', bg);
    const paint = () => { if (!root.isConnected) { if (S.gifsRefresh === paint) S.gifsRefresh = null; return; } root.innerHTML = gifsPanelHtml(); bindGifs(root, paint); S.gifsPick?.(); };
    S.gifsRefresh = paint; paint(); loadUgifs().then(paint);
  });
}

/* ───────── class roles: Biology (AP), World History (Honors)… The owner edits the list, everyone picks their own ─────────
   A role is a subject plus an optional level. Typing @Biology (AP) pings everyone with that role; @Biology pings every Biology student. */
const LEVEL_ORDER = ['Accelerated', 'Honors', 'AP'], RNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} &'.+/-]*$/u, reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const lvRank = l => { if (!l) return -1; const i = LEVEL_ORDER.findIndex(x => x.toLowerCase() === l.toLowerCase()); return i < 0 ? 99 : i; };
const crLabel = r => r.subject + (r.level ? ` (${r.level})` : '');
const CR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7', '#ec4899', '#84cc16', '#f43f5e'];
const crColor = r => /^#[0-9a-f]{6}$/i.test(r?.color || '') ? r.color.toLowerCase() : null;
const crStyle = r => crColor(r) ? ` style="--rc:${crColor(r)}"` : '';
const crSort = (a, b) => a.subject.localeCompare(b.subject) || lvRank(a.level) - lvRank(b.level) || (a.level || '').localeCompare(b.level || '');
const crLocked = r => !!r.assign_only || !!S.cperms?.get(r.id)?.size;   // roles with abilities (or assign-only) can only be given by the owner
const crOf = uid => S.croles.filter(r => S.cmem.get(r.id)?.has(uid)).sort(crSort);
const crHas = (ids, uid) => [...ids].some(id => S.cmem.get(id)?.has(uid));
const crPeople = ids => [...new Set([...ids].flatMap(id => [...(S.cmem.get(id) || [])]))];
let _crIdx = null;
function crIndex() {   // every name that can follow an @: "Biology (AP)" for one role, "Biology" for all of that subject
  if (_crIdx?.src === S.croles) return _crIdx;
  const map = new Map(), add = (label, id) => { const k = label.toLowerCase(); if (!map.has(k)) map.set(k, { label, ids: new Set() }); map.get(k).ids.add(id); };
  for (const r of S.croles) { add(crLabel(r), r.id); add(r.subject, r.id); }
  const keys = [...map.keys()].sort((a, b) => b.length - a.length), alt = f => keys.map(k => reEsc(f(map.get(k).label))).join('|');
  const rawAlt = alt(x => x);
  return _crIdx = { src: S.croles, map, htmlAlt: alt(esc), rawAlt, byHtml: new Map(keys.map(k => [esc(map.get(k).label).toLowerCase(), k])),
    rawRe: rawAlt ? new RegExp('(^|[^\\w&@#])@(' + rawAlt + ')(?!\\w)', 'gi') : null };
}
let _richRe = null, _richSrc = null;
const richRe = () => {   // one pass finds role names, @users and #channels
  const ix = crIndex(); if (_richRe && _richSrc === ix.src) return _richRe; _richSrc = ix.src;
  return _richRe = new RegExp('(^|[^\\w&@#~])(?:@(' + (ix.htmlAlt || '\\b\\B') + ')(?!\\w)|([@#~])([a-z0-9_-]{1,40})\\b)', 'gi');
};
function rolePill(pre, role) {
  const ix = crIndex(), key = ix.byHtml.get(role.toLowerCase()), e = key && ix.map.get(key); if (!e) return pre + '@' + role;
  const rc = S.croles.find(x => x.id === [...e.ids][0]);
  return `${pre}<span class="mention crole${S.me && crHas(e.ids, S.me.id) ? ' me' : ''}"${crStyle(rc)} data-a="role" data-rl="${esc(key)}" role="button" tabindex="0">@${esc(e.label)}</span>`;
}
const crHits = text => { const ix = crIndex(), out = new Set(); if (ix.rawRe) for (const m of String(text).matchAll(ix.rawRe)) ix.map.get(m[2].toLowerCase())?.ids.forEach(id => out.add(id)); return out; };
async function loadClassRoles() {
  const all = async (table, cols, orders) => {   // the API returns at most 1000 rows per request, so read page by page
    const rows = []; for (let from = 0; ; from += 1000) {
      let q = sb.from(table).select(cols); for (const o of orders) q = q.order(o);   // a unique sort key keeps pages from overlapping
      const { data, error } = await q.range(from, from + 999);
      if (error) throw error; rows.push(...data); if (data.length < 1000) return rows;
    }
  };
  try {
    const [roles, mem] = await Promise.all([all('class_roles', 'id,subject,level,color,assign_only', ['id']).catch(() => all('class_roles', 'id,subject,level,color', ['id'])).catch(e => /color/i.test(e.message || '') ? all('class_roles', 'id,subject,level', ['id']) : Promise.reject(e)), all('class_role_members', 'role_id,user_id,assigned_by', ['role_id', 'user_id'])]);
    S.croles = roles.sort(crSort); S.cmem = new Map(); S.cassigned = new Set(); S.crErr = null;
    for (const x of mem) { if (!S.cmem.has(x.role_id)) S.cmem.set(x.role_id, new Set()); S.cmem.get(x.role_id).add(x.user_id); if (x.assigned_by) S.cassigned.add(x.role_id + '|' + x.user_id); }
    S.cperms = new Map();   // abilities are optional: if migration-role-abilities.sql has not been run yet, roles still work
    try { for (const x of await all('class_role_permissions', 'role_id,permission', ['role_id', 'permission'])) { if (!S.cperms.has(x.role_id)) S.cperms.set(x.role_id, new Set()); S.cperms.get(x.role_id).add(x.permission); } } catch { /* not installed yet */ }
  } catch (e) { S.crErr = e.message || 'Could not load roles.'; }
}
const crChangedSoon = debounce(async () => { await loadClassRoles(); if (S.view === 'roles') renderMain(); }, 300);
const crErrText = e => e?.code === '23505' ? 'A role with that name already exists.' : e?.message || 'Something went wrong.';

function renderRoles(main) {
  const owner = isOwner(), edit = owner && S.rolesEdit, keep = $('.panel', main)?.scrollTop || 0;
  const mine = crOf(S.me.id), groups = new Map();
  for (const r of S.croles) { const k = r.subject.toLowerCase(); if (!groups.has(k)) groups.set(k, { subject: r.subject, roles: [] }); groups.get(k).roles.push(r); }
  const chip = r => {
    const on = S.cmem.get(r.id)?.has(S.me.id), n = S.cmem.get(r.id)?.size || 0, locked = crLocked(r), fixed = on && S.cassigned?.has(r.id + '|' + S.me.id);
    return edit
      ? `<button type="button" class="rchip edit"${crStyle(r)} data-redit="${r.id}" title="Edit ${esc(crLabel(r))}"><i class="rdot"></i>${ic('pencil', 14)}<span>${esc(r.level || 'No level')}</span>${S.cperms?.get(r.id)?.size ? '<small title="Has special abilities">★</small>' : ''}<small>${n}</small></button>`
      : owner
        ? `<button type="button" class="rchip ${on ? 'on' : ''}"${crStyle(r)} data-rid="${r.id}" aria-pressed="${!!on}" title="${esc(crLabel(r))}"><i class="rdot"></i>${on ? ic('check', 14) : ''}<span>${esc(r.level || 'No level')}</span>${locked ? '<small title="Only you can give this role">🔒</small>' : ''}<small>${n}</small></button>`
        : locked
          ? `<button type="button" class="rchip locked ${on ? 'on' : ''}"${crStyle(r)} disabled aria-pressed="${!!on}" title="${esc(crLabel(r))} has special abilities, so only the owner can give it"><i class="rdot"></i>${on ? ic('check', 14) : ''}<span>${esc(r.level || 'No level')}</span><small>🔒</small><small>${n}</small></button>`
          : fixed
            ? `<button type="button" class="rchip on"${crStyle(r)} disabled aria-pressed="true" title="${esc(crLabel(r))} was given to you by the owner, so only the owner can remove it"><i class="rdot"></i>${ic('check', 14)}<span>${esc(r.level || 'No level')}</span><small>${n}</small></button>`
            : `<button type="button" class="rchip ${on ? 'on' : ''}"${crStyle(r)} data-pick="${r.id}" aria-pressed="${!!on}" title="${on ? 'Tap to drop ' : 'Tap to pick '}${esc(crLabel(r))}"><i class="rdot"></i>${on ? ic('check', 14) : ''}<span>${esc(r.level || 'No level')}</span><small>${n}</small></button>`;
  };
  const subjects = [...groups.values()];
  main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('tag', 20)}</span><b class="title">Roles</b></div>
  <div class="panel roles"><p class="muted">${owner ? 'You can give or remove any role. Everyone else can pick their own class roles, except roles with special abilities (🔒), which only you can give.' : 'Tap a role to pick it or drop it. Roles with special abilities (🔒) can only be given by the owner.'} They show on profiles, and anyone can ping a class by typing <b>@</b> and its name, like <span class="mention crole">@Biology (AP)</span>. Pinging just <span class="mention crole">@Biology</span> reaches every Biology student.</p>
  ${S.crErr ? `<p class="err">${/relation|schema cache|does not exist|PGRST/i.test(S.crErr) ? 'Roles are not set up yet.' + (owner ? ' Run <code>migration-class-roles.sql</code> in the Supabase SQL Editor, then reload.' : ' Ask the owner to finish setting them up.') : esc(S.crErr)}</p>` : ''}
  <h3 class="lbl">Your roles</h3>
  <div class="rpills">${mine.map(r => `<span class="rpill"${crStyle(r)}>${esc(crLabel(r))}</span>`).join('') || '<span class="muted">You have not picked any yet.</span>'}</div>
  ${owner ? `<div class="rtools"><b>Owner tools</b> <span class="muted">Only you can add, rename or remove roles.</span>
    <div class="radd"><input id="rs" list="rsubs" maxlength="40" placeholder="Subject, e.g. Chemistry" aria-label="Subject"><datalist id="rsubs">${subjects.map(g => `<option value="${esc(g.subject)}">`).join('')}</datalist>
    <input id="rl" list="rlevs" maxlength="60" placeholder="Levels, e.g. Honors, AP (optional)" aria-label="Levels, separated by commas"><datalist id="rlevs">${LEVEL_ORDER.map(l => `<option value="${l}">`).join('')}</datalist>
    <button type="button" class="btn" id="ra">Add role</button><button type="button" class="btn ghost" id="re" aria-pressed="${!!edit}">${edit ? 'Done editing' : 'Edit roles'}</button></div></div>` : ''}
  <h3 class="lbl">${edit ? 'Tap a role to edit or delete it' : owner ? 'All classes · tap a role to give it or take it away' : 'All classes · tap to pick or drop yours'}</h3>
  <div class="rgrid">${subjects.map(g => `<section class="rcard"><header><h3>${esc(g.subject)}</h3>${edit ? `<button type="button" class="btn sm ghost" data-rsub="${esc(g.subject)}">Rename</button>` : ''}</header><div class="rchips">${g.roles.map(chip).join('')}</div></section>`).join('') || '<p class="muted">No roles yet.' + (owner ? ' Add the first one above.' : '') + '</p>'}</div></div>`;
  $('.panel', main).scrollTop = keep;
  main.querySelectorAll('[data-rid]').forEach(b => b.onclick = () => assignRoleModal(b.dataset.rid));   // only the owner has these buttons
  main.querySelectorAll('[data-pick]').forEach(b => b.onclick = async () => {   // members pick or drop their own (non-ability) roles
    const id = b.dataset.pick, on = S.cmem.get(id)?.has(S.me.id); b.disabled = true;
    const { error } = on ? await sb.from('class_role_members').delete().eq('role_id', id).eq('user_id', S.me.id) : await sb.from('class_role_members').insert({ role_id: id, user_id: S.me.id });
    if (error) { b.disabled = false; return toast(/row-level security|permission denied/i.test(error.message || '') ? 'Only the owner can give that role.' : error.message, true); }
    await loadClassRoles(); if (S.view === 'roles') renderMain(); toast(on ? 'Role dropped' : 'Role picked');
  });
  if (!owner) return;
  main.querySelectorAll('[data-redit]').forEach(b => b.onclick = () => editRoleModal(b.dataset.redit));
  main.querySelectorAll('[data-rsub]').forEach(b => b.onclick = () => renameSubjectModal(b.dataset.rsub));
  $('#re', main).onclick = () => { S.rolesEdit = !S.rolesEdit; renderMain(); };
  $('#ra', main).onclick = async e => {
    const btn = e.currentTarget;
    const clean = x => x.trim().replace(/\s+/g, ' '), subject = clean($('#rs', main).value), levels = [...new Set($('#rl', main).value.split(',').map(clean).filter(Boolean))];
    if (!subject) return toast('Type a subject first.', true);
    if (![subject, ...levels].every(x => RNAME_RE.test(x))) return toast('Names can use letters, numbers, spaces and & \' . + / - only.', true);
    const have = new Set(S.croles.map(r => crLabel(r).toLowerCase())), rows = (levels.length ? levels : [null]).map(level => ({ subject, level })).filter(r => !have.has(crLabel(r).toLowerCase()));
    if (!rows.length) return toast('Those roles already exist.', true);
    btn.disabled = true;
    const { error } = await sb.from('class_roles').insert(rows);
    if (error) { toast(crErrText(error), true); btn.disabled = false; return; }
    await loadClassRoles(); toast(rows.length === 1 ? 'Role added' : rows.length + ' roles added'); if (S.view === 'roles') renderMain();
  };
}
function editRoleModal(id) {
  const r = S.croles.find(x => x.id === id); if (!r) return;
  const gp = S.cperms?.get(r.id) || new Set();
  const abil = `<h3 class="lbl">Abilities</h3><p class="muted">Roles with abilities can <b>only be given by you</b>. Members cannot pick them themselves, and people who already picked one lose it as soon as you tick an ability.</p><div style="max-height:180px;overflow:auto">${PERMS.map(([p, l]) => `<label style="display:flex;gap:8px;align-items:center;margin:4px 0"><input type="checkbox" style="width:auto" data-cperm="${p}" ${gp.has(p) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>`;
  modal('Edit role', `<label for="es">Subject</label><input id="es" maxlength="40" value="${esc(r.subject)}"><label for="el">Level (optional)</label><input id="el" maxlength="20" list="rlevs" value="${esc(r.level || '')}"><p class="muted">Everyone who has this role keeps it under the new name.</p><h3 class="lbl">Colour</h3><div class="rswatches" id="ecw">${CR_COLORS.map(c => `<button type="button" class="rsw" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}<input type="color" id="ec" value="${crColor(r) || '#2563eb'}" aria-label="Custom colour" style="width:34px;height:28px;padding:0;border:0;background:none"></div><label style="display:flex;gap:8px;align-items:center;margin:6px 0"><input type="checkbox" id="eca" style="width:auto" checked> Use this colour for every level of ${esc(r.subject)}</label>${abil}<button type="button" class="btn ghost" id="emem">Give or remove this role…</button>`,
    [{ label: 'Cancel', cls: 'ghost' },
     { label: 'Delete role', cls: 'danger', fn: () => { setTimeout(() => confirmBox('Delete ' + crLabel(r) + '?', 'Everyone who picked it loses it. This cannot be undone.', 'Delete', async () => {
         const { error } = await sb.from('class_roles').delete().eq('id', r.id); if (error) { toast(crErrText(error), true); return false; }
         await loadClassRoles(); if (S.view === 'roles') renderMain(); toast('Role deleted'); })); } },
     { label: 'Save', fn: async bg => {
       const clean = x => x.trim().replace(/\s+/g, ' '), subject = clean($('#es', bg).value), level = clean($('#el', bg).value) || null;
       if (!subject || ![subject, ...(level ? [level] : [])].every(x => RNAME_RE.test(x))) { toast('Names can use letters, numbers, spaces and & \' . + / - only.', true); return false; }
       const color = $('#ec', bg).value.toLowerCase(), upd = { subject, level, color };
       let { error } = await sb.from('class_roles').update(upd).eq('id', r.id);
       if (error && /color/i.test(error.message || '')) { delete upd.color; ({ error } = await sb.from('class_roles').update(upd).eq('id', r.id)); if (!error) toast('Run migration-role-colors.sql to save colours.', true); }
       if (error) { toast(crErrText(error), true); return false; }
       if ($('#eca', bg).checked && upd.color) { const sib = S.croles.filter(x => x.subject === r.subject).map(x => x.id), { error: e2 } = await sb.from('class_roles').update({ color }).in('id', [...new Set([...sib, r.id])]); if (e2) { toast(crErrText(e2), true); return false; } }
       await loadClassRoles(); if (S.view === 'roles') renderMain(); toast('Role updated'); } }],
    (bg, close) => {
      bg.querySelectorAll('[data-cperm]').forEach(c => c.onchange = async () => {
        const { error } = await sb.rpc('admin_set_class_role_permission', { p_role: r.id, p_perm: c.dataset.cperm, p_granted: c.checked });
        if (error) { c.checked = !c.checked; return toast(/function|schema cache/i.test(error.message) ? 'Run migration-role-abilities.sql first.' : error.message, true); }
        if (!S.cperms.has(r.id)) S.cperms.set(r.id, new Set()); c.checked ? S.cperms.get(r.id).add(c.dataset.cperm) : S.cperms.get(r.id).delete(c.dataset.cperm);
        toast('Saved');
      });
      $('#emem', bg).onclick = () => { close(); assignRoleModal(r.id); };
      const pick = $('#ec', bg), mark = () => bg.querySelectorAll('.rsw').forEach(b => b.classList.toggle('on', b.dataset.c === pick.value.toLowerCase()));
      bg.querySelectorAll('.rsw').forEach(b => b.onclick = () => { pick.value = b.dataset.c; mark(); }); pick.oninput = mark; mark();
    });
}
function assignRoleModal(id) {   // owner: hand this role to people (or take it away)
  const r = S.croles.find(x => x.id === id); if (!r) return;
  const people = () => [...new Set(S.members.map(m => m.user_id))].map(prof).filter(Boolean).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const draw = bg => {
    const has = S.cmem.get(r.id) || new Set(), q = ($('#aq', bg)?.value || '').trim().toLowerCase();
    const rows = people().filter(p => !q || p.display_name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q)).slice(0, 80);
    $('#alist', bg).innerHTML = rows.map(p => `<div class="row" style="cursor:default">${av(p)}<span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}${has.has(p.id) ? (S.cassigned?.has(r.id + '|' + p.id) ? ' · given by you' : ' · picked it earlier') : ''}</small></span><button type="button" class="btn sm ${has.has(p.id) ? 'danger' : ''}" data-u="${p.id}" data-on="${has.has(p.id) ? 0 : 1}">${has.has(p.id) ? 'Remove' : 'Give'}</button></div>`).join('') || '<p class="muted">Nobody found.</p>';
    $('#alist', bg).querySelectorAll('[data-u]').forEach(b => b.onclick = async () => {
      b.disabled = true;
      const { error } = await sb.rpc('admin_set_class_role_member', { p_role: r.id, p_user: b.dataset.u, p_on: b.dataset.on === '1' });
      if (error) { b.disabled = false; return toast(/function|schema cache/i.test(error.message) ? 'Run migration-role-abilities.sql first.' : error.message, true); }
      await loadClassRoles(); draw(bg); if (S.view === 'roles') renderMain(); toast(b.dataset.on === '1' ? 'Role given' : 'Role removed');
    });
  };
  modal('Give ' + crLabel(r), `<input id="aq" placeholder="Search by name or username" aria-label="Search people"><div class="list" id="alist" style="max-height:320px;margin-top:8px"></div>`,
    [{ label: 'Done', cls: 'ghost' }], bg => { $('#aq', bg).oninput = () => draw(bg); draw(bg); });
}
function renameSubjectModal(subject) {
  const ids = S.croles.filter(r => r.subject === subject).map(r => r.id); if (!ids.length) return;
  modal('Rename ' + subject, `<label for="rn">New subject name</label><input id="rn" maxlength="40" value="${esc(subject)}"><p class="muted">Changes all ${ids.length} role${ids.length === 1 ? '' : 's'} under this subject.</p>`,
    [{ label: 'Cancel', cls: 'ghost' }, { label: 'Rename', fn: async bg => {
      const v = $('#rn', bg).value.trim().replace(/\s+/g, ' ');
      if (!v || !RNAME_RE.test(v)) { toast('Names can use letters, numbers, spaces and & \' . + / - only.', true); return false; }
      const { error } = await sb.from('class_roles').update({ subject: v }).in('id', ids); if (error) { toast(crErrText(error), true); return false; }
      await loadClassRoles(); if (S.view === 'roles') renderMain(); toast('Renamed'); } }]);
}
function roleModal(key) {   // who has this role? (opened by clicking an @Role pill in chat)
  const e = crIndex().map.get(key); if (!e) return;
  const uids = crPeople(e.ids);
  needProfiles(uids).then(() => modal('@' + e.label, `<p class="muted">${uids.length} ${uids.length === 1 ? 'person has' : 'people have'} this role.</p><div class="list" style="max-height:340px">${uids.map(prof).sort((a, b) => a.display_name.localeCompare(b.display_name)).map(p => `<div class="row" style="cursor:default"><span data-a="prof" data-u="${p.id}" style="cursor:pointer">${av(p)}</span><span class="t"><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></span></div>`).join('') || '<p class="muted">Nobody yet.</p>'}</div>`,
    [{ label: 'Close', cls: 'ghost' }, { label: 'Pick roles', fn: () => { navTo('roles'); } }], bg => bg.querySelectorAll('[data-a=prof]').forEach(b => b.onclick = () => profileModal(b.dataset.u))));
}

/* ───────── polls ───────── */
async function loadPolls(ids) {
  if (!ids.length) return;
  const { data, error } = await sb.from('polls').select('id, message_id, multiple, ends_at, created_by, options:poll_options(id, label, position), votes:poll_votes(option_id, user_id)').in('message_id', ids);
  if (!error) (data || []).forEach(p => S.polls.set(p.message_id, p));
}
const ensurePoll = m => m.has_poll && !S.polls.has(m.id) ? loadPolls([m.id]) : Promise.resolve();
function pollHtml(m) {
  const p = S.polls.get(m.id); if (!p) return '';
  const ended = !!p.ends_at && new Date(p.ends_at) <= new Date(), voters = new Set(p.votes.map(v => v.user_id)).size;
  const mine = new Set(p.votes.filter(v => v.user_id === S.me.id).map(v => v.option_id)), cnt = new Map();
  p.votes.forEach(v => cnt.set(v.option_id, (cnt.get(v.option_id) || 0) + 1));
  const opts = [...p.options].sort((a, b) => a.position - b.position), top = Math.max(0, ...opts.map(o => cnt.get(o.id) || 0));
  const meta = [p.multiple ? 'Choose any' : 'Choose one', ended ? 'Ended' : p.ends_at ? 'Ends ' + stamp(p.ends_at) : ''].filter(Boolean).join(' · ');
  return `<div class="poll" data-pm="${m.id}"><div class="pq">${md(m.content, m.id)}</div><div class="pmeta">${ic('poll', 14)} ${esc(meta)}</div>${opts.map(o => { const n = cnt.get(o.id) || 0, pct = voters ? Math.round(n * 100 / voters) : 0;
    return `<button type="button" class="popt ${mine.has(o.id) ? 'mine' : ''} ${ended && n && n === top ? 'win' : ''}" data-a="vote" data-o="${o.id}" aria-pressed="${mine.has(o.id)}" ${ended ? 'disabled' : ''}><i style="width:${pct}%"></i><span class="pl">${mine.has(o.id) ? '✓ ' : ''}${esc(o.label)}</span><span class="pn">${n} · ${pct}%</span></button>`; }).join('')}
  <div class="pfoot"><span>${voters} ${voters === 1 ? 'voter' : 'voters'}</span>${!ended && (p.created_by === S.me.id || can('delete_messages')) ? '<button type="button" class="linkbtn" data-a="endpoll">End poll</button>' : ''}</div></div>`;
}
function redrawPoll(mid) { const m = S.list.find(x => x.id === mid), el = $(`.poll[data-pm="${mid}"]`); if (m && el) el.outerHTML = pollHtml(m); }
async function votePoll(m, oid) {
  const p = S.polls.get(m.id); if (!p) return; const mine = p.votes.some(v => v.user_id === S.me.id && v.option_id === oid);
  const { error } = await sb.rpc('vote_poll', { p_poll: p.id, p_option: oid, p_on: !mine }); if (error) return toast(error.message, true);
  await loadPolls([m.id]); redrawPoll(m.id);
}
function endPoll(m) {
  confirmBox('End this poll?', 'Nobody will be able to vote after this. The results stay visible.', 'End poll', async () => {
    const { error } = await sb.rpc('end_poll', { p_poll: S.polls.get(m.id).id }); if (error) { toast(error.message, true); return false; }
    await loadPolls([m.id]); redrawPoll(m.id); });
}
function onVote(p) {
  const r = p.eventType === 'DELETE' ? p.old : p.new; if (!r?.poll_id) return;
  const poll = [...S.polls.values()].find(x => x.id === r.poll_id); if (!poll) return;
  if (p.eventType === 'INSERT') { if (!poll.votes.some(v => v.user_id === r.user_id && v.option_id === r.option_id)) poll.votes.push({ option_id: r.option_id, user_id: r.user_id }); }
  else if (p.eventType === 'DELETE') poll.votes = poll.votes.filter(v => !(v.user_id === r.user_id && v.option_id === r.option_id));
  redrawPoll(poll.message_id);
}
async function onPollChange(p) { const mid = (p.new || p.old)?.message_id; if (mid && S.polls.has(mid)) { await loadPolls([mid]); redrawPoll(mid); } }
function pollModal() {
  const lim = postLimit(); if (lim) return toast(lim, true);
  modal('Create a poll', `<label for="pq">Question</label><input id="pq" maxlength="300" placeholder="What should we play tonight?" autocomplete="off"><label>Options (2 to 10)</label><div id="po"></div><button type="button" class="btn ghost sm" id="pa" style="margin-top:6px">Add option</button>
  <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pm" style="width:auto"> Allow choosing more than one answer</label>
  <label for="pd">Ends</label><select id="pd"><option value="">Never</option><option value="1">In 1 hour</option><option value="24">In 24 hours</option><option value="72">In 3 days</option><option value="168">In 7 days</option></select>`,
  [cancelBtn, { label: 'Post poll', fn: async bg => {
    const q = $('#pq', bg).value.trim(), opts = [...bg.querySelectorAll('.po')].map(i => i.value.trim()).filter(Boolean);
    if (!q) { toast('Write a question.', true); return false; } if (opts.length < 2) { toast('Add at least two options.', true); return false; }
    if (new Set(opts.map(o => o.toLowerCase())).size < opts.length) { toast('Each option must be different.', true); return false; }
    const A = S.active, view = S.view, hrs = $('#pd', bg).value;
    const { data, error } = await sb.rpc('create_poll', { p_channel: view === 'server' ? A : null, p_conversation: view === 'dm' ? A : null, p_question: q, p_options: opts, p_multiple: $('#pm', bg).checked, p_hours: hrs ? +hrs : null });
    if (error) { toast(error.message, true); if (/row-level security|permission denied/i.test(error.message)) verifyAccess(); return false; }
    await loadPolls([data.id]);
    if (S.active === A) { upsert(data); renderMsgs(true); }
    const c = S.convs.find(x => x.id === A); if (c) { Object.assign(c, { last_message_at: data.created_at, last_message_preview: '📊 ' + q.slice(0, 70), last_author: S.me.id, last_read_at: data.created_at }); renderSide(); } } }],
  bg => {
    const box = $('#po', bg), add = () => { if (box.children.length >= 10) return toast('A poll can have up to 10 options.', true); const i = document.createElement('input'); i.className = 'po'; i.maxLength = 100; i.placeholder = 'Option ' + (box.children.length + 1); i.autocomplete = 'off'; i.style.marginTop = '6px'; box.append(i); i.focus(); };
    add(); add(); $('#pq', bg).focus(); $('#pa', bg).onclick = add;
  });
}

/* ───────── "something new" glow on the Suggestions and Support sidebar items ─────────
   Remembers (per account, in this browser) when you last opened each tab. Anything from someone else after that makes the item glow. */
const HOT_KEY = { suggestions: 'sug', support: 'tix' };
S.hot = { sug: false, tix: false };
const seenKey = k => 'chatter.seen.' + (S.me?.id || '') + '.' + k;
const newest = (rows, col) => (rows || []).reduce((m, r) => (r[col] > m ? r[col] : m), '');
function seenAt(k) {
  try { let v = localStorage.getItem(seenKey(k)); if (!v) { v = new Date().toISOString(); localStorage.setItem(seenKey(k), v); } return v; }   // first visit: start from now, so old items do not glow
  catch { return new Date().toISOString(); }
}
function paintHot() {
  document.querySelectorAll('.nav-i[data-nav]').forEach(b => {
    const k = HOT_KEY[b.dataset.nav]; if (!k) return;
    const on = !!S.hot[k] && S.view !== b.dataset.nav, label = b.querySelector('span')?.textContent || '';
    b.classList.toggle('hot', on); if (on) b.setAttribute('aria-label', label + ' (new)'); else b.removeAttribute('aria-label');
  });
}
function markSeen(k, newestStamp) {
  const t = Math.max(Date.now(), newestStamp ? +new Date(newestStamp) : 0);
  try { localStorage.setItem(seenKey(k), new Date(t).toISOString()); } catch { /* storage blocked: the glow just clears when you open the tab */ }
  if (S.hot[k]) { S.hot[k] = false; paintHot(); }
}
async function checkHot() {
  if (!S.me) return;
  const me = S.me.id, sugSeen = seenAt('sug'), tixSeen = seenAt('tix');
  const any = async q => { try { const { data, error } = await q; return !error && !!data?.length; } catch { return false; } };
  const [sug, tixNew, tixMsg] = await Promise.all([
    S.view === 'suggestions' ? false : any(sb.from('suggestions').select('id').neq('author_id', me).gt('created_at', sugSeen).limit(1)),
    S.view === 'support' ? false : any(sb.from('support_tickets').select('id').neq('author_id', me).gt('created_at', tixSeen).limit(1)),   // staff: a new ticket
    S.view === 'support' ? false : any(sb.from('support_ticket_messages').select('id').neq('author_id', me).eq('kind', 'reply').gt('created_at', tixSeen).limit(1))]);   // staff: a follow-up; everyone else: a reply to their ticket
  S.hot.sug = sug; S.hot.tix = tixNew || tixMsg; paintHot();
}

/* ───────── support tickets ───────── */
const TK_CAT = { account: 'My account', login: 'Login or Google sign-in', messages: 'Messages', notifications: 'Notifications', profile: 'My profile', other: 'Something else' };
const TK_STATUS = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
const tkClass = st => st === 'resolved' ? 'st-done' : st === 'in_progress' ? 'st-in_progress' : '';
const tixStaff = () => can('support_tickets') || can('view_reports');
const tixCanHandle = t => (can('support_tickets') || (t.escalated && can('view_reports'))) && t.author_id !== S.me.id;
async function loadTickets() {
  const { data, error } = await sb.from('support_tickets').select('*').order('updated_at', { ascending: false }).limit(300);
  S.tixErr = error ? error.message : null; S.tix = data || [];
  await needProfiles(S.tix.map(t => t.author_id));
  if (S.tixOpen && !S.tix.some(t => t.id === S.tixOpen)) S.tixOpen = null;
  if (S.view === 'support') { markSeen('tix', newest(S.tix, 'updated_at')); renderMain(); if (S.tixOpen) loadThread(); }
}
async function loadThread() {
  const id = S.tixOpen; if (!id) return;
  const { data, error } = await sb.from('support_ticket_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true });
  if (error) return toast(error.message, true);
  if (S.tixOpen !== id) return;
  S.tixMsgs = data; await needProfiles(data.map(m => m.author_id));
  if (S.view === 'support' && S.tixOpen === id) { renderMain(); $('#tkend')?.scrollIntoView({ block: 'end' }); }
}
function openTicket(id) { S.tixOpen = id; S.tixMsgs = []; S.tixMode = 'reply'; S.tixDraft = ''; renderMain(); loadThread(); }
const tixChangedSoon = debounce(() => { if (!S.me) return; if (S.view === 'support') loadTickets(); else checkHot(); }, 400);
async function onTixMsg(p) {
  const m = p.new; if (!m || !S.me || m.author_id === S.me.id) return;
  if (S.view === 'support') tixChangedSoon(); else checkHot();
  if (m.kind !== 'reply') return;
  let t = (S.tix || []).find(x => x.id === m.ticket_id);
  if (!t) t = (await sb.from('support_tickets').select('author_id,subject').eq('id', m.ticket_id).maybeSingle()).data;
  if (t && t.author_id === S.me.id && !(S.view === 'support' && S.tixOpen === m.ticket_id)) toast('Support replied to your ticket: ' + t.subject.slice(0, 40));
}
function ticketRow(t) {
  const a = prof(t.author_id), mine = t.author_id === S.me.id;
  return `<button type="button" class="tk-row" data-tk="${t.id}"><div class="tk-top"><b>${esc(t.subject)}</b><span class="grow"></span><span class="chip ${tkClass(t.status)}">${TK_STATUS[t.status]}</span></div>
  <div class="tk-meta"><span class="chip">${esc(TK_CAT[t.category] || t.category)}</span>${t.escalated && tixStaff() ? '<span class="chip st-declined">Escalated</span>' : ''}<small class="muted">${mine ? 'You' : esc(a.display_name)} · updated ${stamp(t.updated_at)}</small></div></button>`;
}
function renderSupport(main) {
  S.tix ||= []; S.tixMsgs ||= [];
  if ($('#tkin')) S.tixDraft = $('#tkin').value;
  const staff = tixStaff(), t = S.tixOpen && S.tix.find(x => x.id === S.tixOpen);
  if (t) return renderTicket(main, t);
  const tab = staff ? (S.tixTab || 'queue') : 'mine', f = S.tixFilter || 'active';
  const pool = S.tix.filter(x => tab === 'mine' ? x.author_id === S.me.id : x.author_id !== S.me.id);
  const rows = pool.filter(x => f === 'all' || (f === 'active' ? x.status !== 'resolved' : f === 'escalated' ? x.escalated : x.status === f));
  const filters = [['active', 'Active'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved'], ...(tab === 'queue' ? [['escalated', 'Escalated']] : []), ['all', 'All']];
  main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('headphones', 20)}</span><b class="title">Support</b><span class="grow"></span><button class="btn sm" id="tkn">New ticket</button></div>
  <div class="panel"><p class="muted" style="margin-top:0">${tab === 'queue' ? 'Tickets from people who need help. Reply to them privately, add internal notes, and escalate anything serious to the moderators.' : 'Stuck with your account, login or Google sign-in, messages, notifications or your profile? Send a ticket. Only you and Orbit\'s support team can see it.'}</p>
  ${staff ? `<div class="tabs"><button type="button" data-tt="queue" class="${tab === 'queue' ? 'on' : ''}">Queue</button><button type="button" data-tt="mine" class="${tab === 'mine' ? 'on' : ''}">My tickets</button></div>` : ''}
  <div class="tabs sub">${filters.map(([k, l]) => `<button type="button" data-tf="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
  ${S.tixErr ? `<p class="err">${esc(S.tixErr)}<br>If this says a table is missing, run migration-support-tickets.sql in Supabase.</p>` : rows.map(ticketRow).join('') || `<p class="empty">${pool.length ? 'Nothing with that status.' : tab === 'queue' ? 'No tickets from other people yet.' : 'You have no tickets. Use New ticket if you need help.'}</p>`}</div>`;
  bindMenu(); $('#tkn').onclick = ticketForm;
  main.querySelectorAll('[data-tt]').forEach(b => b.onclick = () => { S.tixTab = b.dataset.tt; if (S.tixFilter === 'escalated') S.tixFilter = 'active'; renderMain(); });
  main.querySelectorAll('[data-tf]').forEach(b => b.onclick = () => { S.tixFilter = b.dataset.tf; renderMain(); });
  main.querySelectorAll('[data-tk]').forEach(b => b.onclick = () => openTicket(b.dataset.tk));
}
function renderTicket(main, t) {
  const staff = tixCanHandle(t), a = prof(t.author_id), mem = S.members.find(m => m.user_id === t.author_id), to = tmoUntil(mem), mode = staff ? (S.tixMode || 'reply') : 'reply';
  const mine = t.author_id === S.me.id, canDel = isOwner() || (mine && t.status === 'resolved');
  const msgs = (S.tixMsgs || []).map(m => m.kind === 'system'
    ? `<div class="tk-sys">${esc(m.body)} <small class="muted">${stamp(m.created_at)}</small></div>`
    : `<div class="tk-msg ${m.kind === 'note' ? 'note' : m.author_id === t.author_id ? 'user' : 'staff'}"><div class="tk-h"><b>${esc(prof(m.author_id).display_name)}</b>${m.kind === 'note' ? '<span class="chip">Internal note</span>' : m.author_id !== t.author_id ? '<span class="chip">Support</span>' : ''}<small class="muted">${stamp(m.created_at)}</small></div><div class="tk-b">${esc(m.body)}</div></div>`).join('');
  main.innerHTML = `<div class="top">${menuBtn()}<button class="ib" id="tkback" title="Back to tickets" aria-label="Back to tickets">${ic('chev', 20)}</button><b class="title">${esc(t.subject)}</b><span class="grow"></span><span class="chip ${tkClass(t.status)}">${TK_STATUS[t.status]}</span></div>
  <div class="panel tk-panel"><div class="tk-meta"><span class="chip">${esc(TK_CAT[t.category] || t.category)}</span>${t.escalated && tixStaff() ? '<span class="chip st-declined">Escalated to moderators</span>' : ''}<small class="muted">opened ${stamp(t.created_at)}</small></div>
  ${staff ? `<div class="tk-info"><b>${esc(a.display_name)}</b> <span class="muted">@${esc(a.username)}${a.created_at ? ' · joined ' + esc(new Date(a.created_at).toLocaleDateString()) : ''}</span><br><small class="muted">${to ? 'Timed out until ' + esc(to.toLocaleString()) : mem ? 'No timeout on this account.' : 'Not in the server right now.'}</small></div>
  <div class="tk-actions">${Object.entries(TK_STATUS).map(([k, l]) => `<button type="button" class="btn ghost sm ${t.status === k ? 'on' : ''}" data-ts="${k}" ${t.status === k ? 'disabled' : ''}>${l}</button>`).join('')}<span class="grow"></span>${can('support_tickets') && !t.escalated ? '<button type="button" class="btn ghost sm" id="tkesc" title="Hand this to the moderators">Escalate to moderators</button>' : ''}</div>` : ''}
  <div class="tk-thread">${msgs || '<div class="sk"></div>'}<div id="tkend"></div></div>
  <div class="tk-compose">${staff ? `<div class="tabs sub"><button type="button" data-tm="reply" class="${mode === 'reply' ? 'on' : ''}">Reply to ${esc(a.display_name)}</button><button type="button" data-tm="note" class="${mode === 'note' ? 'on' : ''}">Internal note</button></div>` : ''}
  <textarea id="tkin" rows="3" maxlength="2000" aria-label="${mode === 'note' ? 'Internal note' : 'Reply'}" placeholder="${mode === 'note' ? 'Only support staff and moderators can see this note.' : staff ? 'Write a private reply. Only this person and staff can see it.' : t.status === 'resolved' ? 'Replying reopens this ticket.' : 'Write a reply…'}"></textarea>
  <div class="tk-actions"><small class="muted">${mode === 'note' ? 'Internal: the user never sees this.' : 'Never share passwords or codes.'}</small><span class="grow"></span>${canDel ? '<button type="button" class="btn ghost sm" id="tkdel">Delete ticket</button>' : ''}<button type="button" class="btn sm" id="tksend">${mode === 'note' ? 'Add note' : 'Send reply'}</button></div></div></div>`;
  bindMenu(); const ta = $('#tkin'); ta.value = S.tixDraft || '';
  $('#tkback').onclick = () => { S.tixOpen = null; S.tixDraft = ''; renderMain(); };
  ta.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#tksend').click(); } };
  main.querySelectorAll('[data-tm]').forEach(b => b.onclick = () => { S.tixDraft = ta.value; S.tixMode = b.dataset.tm; renderMain(); });
  $('#tksend').onclick = async () => {
    const v = ta.value.trim(); if (!v) return; const btn = $('#tksend'); btn.disabled = true;
    const { error } = await sb.rpc(mode === 'note' ? 'add_ticket_note' : 'reply_ticket', { p_ticket: t.id, p_body: v });
    if (error) { btn.disabled = false; return toast(error.message, true); }
    S.tixDraft = ''; await loadTickets();
  };
  main.querySelectorAll('[data-ts]').forEach(b => b.onclick = async () => { const { error } = await sb.rpc('set_ticket_status', { p_ticket: t.id, p_status: b.dataset.ts }); if (error) return toast(error.message, true); await loadTickets(); });
  $('#tkesc')?.addEventListener('click', () => modal('Escalate to moderators', `<p class="muted">Use this for harassment, threats or serious rule-breaking. Moderators will be able to see this ticket and your note. Tell them why.</p><textarea id="tkr" rows="4" maxlength="500" placeholder="What happened, and what do you think needs doing?"></textarea>`,
    [cancelBtn, { label: 'Escalate', cls: 'danger', fn: async bg => { const { error } = await sb.rpc('escalate_ticket', { p_ticket: t.id, p_reason: $('#tkr', bg).value.trim() }); if (error) { toast(error.message, true); return false; } toast('Escalated to the moderators.'); await loadTickets(); } }]));
  $('#tkdel')?.addEventListener('click', () => confirmBox('Delete this ticket?', 'The whole conversation is removed for everyone.', 'Delete', async () => {
    const { error } = await sb.rpc('delete_ticket', { p_ticket: t.id }); if (error) { toast(error.message, true); return false; } S.tixOpen = null; await loadTickets(); }));
}
function ticketForm() {
  modal('New support ticket', `<label for="tkc">What do you need help with?</label><select id="tkc">${Object.entries(TK_CAT).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><label for="tks">Subject</label><input id="tks" maxlength="100" placeholder="A short summary" autocomplete="off"><label for="tkb">Details</label><textarea id="tkb" rows="5" maxlength="2000" placeholder="What happened? What did you expect? Any error message you saw?"></textarea><p class="muted" style="font-size:12px">Never put your password or a login code in a ticket. Support will never ask for them.</p>`,
    [cancelBtn, { label: 'Send ticket', fn: async bg => {
      const sbj = $('#tks', bg).value.trim(), body = $('#tkb', bg).value.trim();
      if (sbj.length < 3) { toast('Give it a subject (at least 3 characters).', true); return false; }
      if (!body) { toast('Tell us what is going on.', true); return false; }
      const { data, error } = await sb.rpc('submit_ticket', { p_category: $('#tkc', bg).value, p_subject: sbj, p_body: body }); if (error) { toast(error.message, true); return false; }
      toast('Ticket sent. Support will reply here.'); S.tixTab = 'mine'; S.tixFilter = 'active'; await loadTickets(); openTicket(data); } }]);
}
/* ───────── Tutorials page: members add tutorial videos (not a chat). Videos live in the attachments bucket under the #tutorials folder. ───────── */
S.tuts = []; S.tutErr = ''; S.tutQ = '';
async function loadTuts() {
  const { data, error } = await sb.from('tutorials').select('id, author_id, title, game, video, created_at').order('created_at', { ascending: false }).limit(200);
  S.tutErr = error ? error.message : ''; S.tuts = data || [];
  try { await needProfiles(S.tuts.map(t => t.author_id)); } catch {}
  if (S.view === 'tutorials') renderMain();
}
const tutChangedSoon = debounce(() => { if (S.me && S.view === 'tutorials') loadTuts(); }, 400);
const tutChannel = () => S.chans.find(c => c.special === 'videos');
function renderTutorials(main) {
  const q = (S.tutQ || '').trim().toLowerCase(), adm = sugAdmin();
  const rows = S.tuts.filter(t => !q || t.title.toLowerCase().includes(q) || (t.game || '').toLowerCase().includes(q));
  const card = t => { const p = prof(t.author_id), mine = t.author_id === S.me.id;
    return `<article class="tcard" data-id="${t.id}">${attItem(t.video)}<div class="tinfo"><b class="ttl">${esc(t.title)}</b>${t.game ? `<span class="chip">${esc(t.game)}</span>` : ''}<small>by <span class="tby" data-a="prof" data-u="${p.id}">${esc(p.display_name)}</span> · ${stamp(t.created_at)}</small>${mine || adm ? `<button type="button" class="ib" data-td="${t.id}" title="Delete tutorial" aria-label="Delete tutorial">${ic('x', 16)}</button>` : ''}</div></article>`; };
  main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('hash', 20)}</span><b class="title">Tutorials</b><span class="grow"></span><button class="btn sm" id="tna">Add tutorial</button></div>
  <div class="panel"><p class="muted" style="margin-top:0">Know how to play a game? Add a short video so others can learn. Videos only (mp4 or webm, up to 50 MB).</p>
  <div class="tabs"><input id="tnq" class="inl" type="search" placeholder="Search tutorials or games" aria-label="Search tutorials" value="${esc(S.tutQ || '')}" autocomplete="off"></div>
  ${S.tutErr ? `<p class="err">${esc(S.tutErr)}</p>` : `<div class="tutgrid">${rows.map(card).join('') || `<p class="empty">${S.tuts.length ? 'No tutorials match your search.' : 'No tutorials yet. Be the first to add one!'}</p>`}</div>`}</div>`;
  bindMenu(); hydrateAtts(main);
  $('#tna').onclick = tutForm;
  $('#tnq').oninput = e => { S.tutQ = e.target.value; const pos = e.target.selectionStart; renderMain(); const i = $('#tnq'); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch {} } };
  main.querySelectorAll('[data-td]').forEach(b => b.onclick = () => confirmBox('Delete this tutorial?', 'The video is removed for everyone.', 'Delete', async () => {
    const { error } = await sb.rpc('delete_tutorial', { p_id: b.dataset.td }); if (error) { toast(error.message, true); return false; } await loadTuts(); }));
}
function tutForm() {
  const ch = tutChannel(); if (!ch) return toast('The tutorials page is not set up yet.', true);
  modal('Add a tutorial', `<label for="tt">Title</label><input id="tt" maxlength="100" placeholder="For example: How to play Tetris" autocomplete="off"><label for="tg">Game (optional)</label><input id="tg" maxlength="40" placeholder="For example: Tetris" autocomplete="off"><label for="tf">Video</label><input id="tf" type="file" accept="video/mp4,video/webm"><p class="muted" style="font-size:12px;margin:.4rem 0 0">mp4 or webm, up to 50 MB. You can add up to 10 a day.</p>`,
    [cancelBtn, { label: 'Add tutorial', fn: async bg => {
      const title = $('#tt', bg).value.trim(), game = $('#tg', bg).value.trim(), f = $('#tf', bg).files[0];
      if (title.length < 3) { toast('Give your tutorial a title (at least 3 letters).', true); return false; }
      if (!f) { toast('Choose a video first.', true); return false; }
      const type = ATT_FIX[f.type] || f.type;
      if (type !== 'video/mp4' && type !== 'video/webm') { toast('Only mp4 or webm videos can be added.', true); return false; }
      if (f.size > MAX_FILE) { toast(`${f.name} is over 50 MB.`, true); return false; }
      toast('Uploading your video…');
      let up;
      try { [up] = await uploadFiles([{ file: f, name: f.name, type, size: f.size }], ch.id); } catch (e) { toast(e.message || 'The upload failed. Try again.', true); return false; }
      const { error } = await sb.rpc('add_tutorial', { p_title: title, p_game: game, p_video: up });
      if (error) { sb.storage.from('attachments').remove([up.path]); toast(error.message, true); return false; }
      toast('Tutorial added!'); await loadTuts(); } }]);
}

/* ───────── Suggestions & Improvements (a board everyone can post on and upvote; the owner/admins set the status) ───────── */
const SUG_KIND = { suggestion: '💡 Suggestion', improvement: '🔧 Improvement', bug: '🐞 Bug', help: '🙋 Need help' };
const SUG_STATUS = { open: 'Open', planned: 'Planned', in_progress: 'In progress', done: 'Done', declined: 'Declined' };
const sugAdmin = () => ['owner', 'admin'].includes(S.sv?.role);
async function loadSugs() {
  const { data, error } = await sb.from('suggestions').select('id, author_id, kind, title, body, status, staff_note, created_at, votes:suggestion_votes(user_id)').order('created_at', { ascending: false }).limit(300);
  S.sugErr = error ? error.message : ''; if (!error) { S.sugs = data; await needProfiles(data.map(x => x.author_id)); }
  if (S.view === 'suggestions') { markSeen('sug', newest(S.sugs, 'created_at')); renderMain(); }
}
const sugChangedSoon = debounce(() => { if (!S.me) return; if (S.view === 'suggestions') loadSugs(); else checkHot(); }, 400);
function renderSuggestions(main) {
  const f = S.sugFilter || 'all', sort = S.sugSort || 'top', adm = sugAdmin(), byNew = (a, b) => b.created_at.localeCompare(a.created_at);
  const rows = S.sugs.filter(x => f === 'all' || x.status === f).sort(sort === 'new' ? byNew : (a, b) => b.votes.length - a.votes.length || byNew(a, b));
  const card = x => { const mine = x.votes.some(v => v.user_id === S.me.id);
    return `<article class="sug" data-id="${x.id}"><button type="button" class="vote ${mine ? 'on' : ''}" data-sv="${x.id}" aria-pressed="${mine}" aria-label="${mine ? 'Remove your upvote' : 'Upvote'}">${ic('up', 16)}<b>${x.votes.length}</b></button>
    <div class="sbody"><div class="smeta"><span class="chip">${SUG_KIND[x.kind]}</span><span class="chip st-${x.status}">${SUG_STATUS[x.status]}</span></div><h3>${esc(x.title)}</h3>${x.body ? `<p>${esc(x.body)}</p>` : ''}${x.staff_note ? `<p class="snote"><b>Team note:</b> ${esc(x.staff_note)}</p>` : ''}
    <small class="muted">by ${esc(prof(x.author_id).display_name)} · ${stamp(x.created_at)}</small>${adm || x.author_id === S.me.id ? `<div class="inline-actions">${adm ? `<button type="button" class="btn ghost sm" data-sm="${x.id}">Manage</button>` : ''}<button type="button" class="btn ghost sm" data-sd="${x.id}">Delete</button></div>` : ''}</div></article>`; };
  main.innerHTML = `<div class="top">${menuBtn()}<span class="hashi">${ic('hash', 20)}</span><b class="title">Suggestions &amp; Improvements</b><span class="grow"></span><button class="btn sm" id="sgn">New suggestion</button></div>
  <div class="panel"><p class="muted" style="margin-top:0">Got an idea, something that could work better, or a bug? Post it here and upvote the ones you want most.</p>
  <div class="tabs">${[['all', 'All'], ...Object.entries(SUG_STATUS)].map(([k, l]) => `<button type="button" data-sf="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}<button type="button" id="sgg" title="Opens in a new tab">Gamer ↗</button><span class="grow"></span><select id="sgs" class="inl" aria-label="Sort"><option value="top" ${sort === 'top' ? 'selected' : ''}>Most upvoted</option><option value="new" ${sort === 'new' ? 'selected' : ''}>Newest</option></select></div>
  ${S.sugErr ? `<p class="err">${esc(S.sugErr)}<br>If this says a table is missing, run migration-community-features.sql in Supabase.</p>` : rows.map(card).join('') || `<p class="empty">${S.sugs.length ? 'Nothing with that status yet.' : 'No suggestions yet. Be the first!'}</p>`}</div>`;
  bindMenu(); $('#sgn').onclick = sugForm;
  main.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { S.sugFilter = b.dataset.sf; renderMain(); });
  $('#sgs').onchange = e => { S.sugSort = e.target.value; renderMain(); };
  $('#sgg').onclick = () => openGamer();
  main.querySelectorAll('[data-sv]').forEach(b => b.onclick = async () => {
    const x = S.sugs.find(s => s.id === b.dataset.sv), mine = x.votes.some(v => v.user_id === S.me.id);
    x.votes = mine ? x.votes.filter(v => v.user_id !== S.me.id) : [...x.votes, { user_id: S.me.id }]; renderMain();
    const { error } = await sb.rpc('vote_suggestion', { p_id: x.id, p_on: !mine }); if (error) { toast(error.message, true); loadSugs(); } });
  main.querySelectorAll('[data-sd]').forEach(b => b.onclick = () => confirmBox('Delete this suggestion?', 'It is removed for everyone, along with its votes.', 'Delete', async () => {
    const { error } = await sb.rpc('delete_suggestion', { p_id: b.dataset.sd }); if (error) { toast(error.message, true); return false; } await loadSugs(); }));
  main.querySelectorAll('[data-sm]').forEach(b => b.onclick = () => sugManage(S.sugs.find(s => s.id === b.dataset.sm)));
}
function sugForm() {
  modal('New suggestion', `<label for="gk">Type</label><select id="gk">${Object.entries(SUG_KIND).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><label for="gt">Title</label><input id="gt" maxlength="100" placeholder="A short summary" autocomplete="off"><label for="gb">Details (optional)</label><textarea id="gb" rows="5" maxlength="1000" placeholder="What would you like to see, and why?"></textarea><p class="muted" style="font-size:12px;margin:.4rem 0 0">You can send up to 5 a day.</p>`,
    [cancelBtn, { label: 'Submit', fn: async bg => {
      const t = $('#gt', bg).value.trim(); if (t.length < 3) { toast('Give it a title (at least 3 characters).', true); return false; }
      const { error } = await sb.rpc('submit_suggestion', { p_kind: $('#gk', bg).value, p_title: t, p_body: $('#gb', bg).value.trim() }); if (error) { toast(error.message, true); return false; }
      toast('Thanks! Your suggestion was posted.'); await loadSugs(); } }]);
}
function sugManage(x) {
  if (!x) return;
  modal('Manage suggestion', `<p><b>${esc(x.title)}</b></p><label for="ms">Status</label><select id="ms">${Object.entries(SUG_STATUS).map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select><label for="mn">Note shown to everyone (optional)</label><input id="mn" maxlength="300" value="${esc(x.staff_note)}">`,
    [cancelBtn, { label: 'Save', fn: async bg => { const { error } = await sb.rpc('set_suggestion_status', { p_id: x.id, p_status: $('#ms', bg).value, p_note: $('#mn', bg).value.trim() }); if (error) { toast(error.message, true); return false; } toast('Updated'); await loadSugs(); } }]);
}

/* ───────── boot ───────── */
sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'PASSWORD_RECOVERY') return recoveryView();
  if (ev === 'SIGNED_OUT') { teardown(); return authView(); }
  if (ev === 'INITIAL_SESSION' || ev === 'SIGNED_IN') setTimeout(() => startApp(session), 0);
});
