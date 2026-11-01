/* Voice chat for the chat panel: live voice between players, directly browser to browser (WebRTC).
   Supabase Realtime is only used to introduce the browsers to each other; no audio goes through your server. */
(function () {
  'use strict';
  var L = window.Leaderboard, rules = document.querySelector('.chat-rules');
  if (!L || !L.config || !rules || !window.RTCPeerConnection || !navigator.mediaDevices || !window.WebSocket) return;
  var ROOM = 'realtime:voice-room', MAX = 6, me = Math.random().toString(36).slice(2, 10);
  var ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
  var ws, hb, stream, peers = {}, on = false, muted = false, ref = 0, joinRef = '';

  var st = document.createElement('style');
  st.textContent = '.vc-bar{flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:.4rem;padding:.4rem .9rem;border-bottom:1px solid var(--line);font:600 .8rem var(--pixel)}' +
    '.vc-bar button{border:0;border-radius:8px;padding:.25rem .7rem;font:700 .8rem var(--pixel);cursor:pointer;background:var(--pink);color:#fff}' +
    '.vc-bar button.alt{background:var(--line);color:var(--text)}.vc-bar button[hidden]{display:none}.vc-info{flex:1;min-width:0;color:var(--muted);font-weight:500}';
  document.head.appendChild(st);
  var bar = document.createElement('div'); bar.className = 'vc-bar';
  bar.innerHTML = '<span class="vc-info" role="status" aria-live="polite"></span><button type="button" class="vc-join">Join voice</button>' +
    '<button type="button" class="vc-mute alt" hidden>Mute</button><button type="button" class="vc-leave alt" hidden>Leave</button><div class="vc-audio" hidden></div>';
  rules.after(bar);
  var $ = function (s) { return bar.querySelector(s); }, info = $('.vc-info');

  // an admin can switch voice off (Settings > Voice chat)
  fetch(L.config.url + '/rest/v1/site_settings?select=value&key=eq.chat_voice_enabled', { headers: { apikey: L.config.key, Authorization: 'Bearer ' + L.config.key } })
    .then(function (r) { return r.ok ? r.json() : []; }).then(function (a) { if (a[0] && a[0].value === false) bar.hidden = true; }).catch(function () {});

  function render() {
    var names = ['You'].concat(Object.keys(peers).map(function (k) { return peers[k].name || 'Player'; }));
    info.textContent = on ? 'In voice (' + names.length + '/' + MAX + '): ' + names.join(', ') : '';
    $('.vc-join').hidden = on; $('.vc-mute').hidden = !on; $('.vc-leave').hidden = !on;
    $('.vc-mute').textContent = muted ? 'Unmute' : 'Mute';
  }
  function send(ev, p) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ topic: ROOM, event: 'broadcast', payload: { type: 'broadcast', event: ev, payload: p }, ref: String(++ref) })); }
  function drop(id) {
    var p = peers[id]; if (!p) return;
    try { p.pc.close(); } catch (e) { /* ignore */ } if (p.audio) p.audio.remove();
    delete peers[id]; render();
  }
  function makePeer(id, name, init) {
    var pc = new RTCPeerConnection(ICE), p = peers[id] = { pc: pc, name: name, init: init, q: [], audio: null, t: 0 };
    stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
    pc.onicecandidate = function (e) { if (e.candidate) send('ice', { id: me, to: id, c: e.candidate }); };
    pc.ontrack = function (e) {
      if (!p.audio) { p.audio = document.createElement('audio'); p.audio.autoplay = true; $('.vc-audio').appendChild(p.audio); }
      p.audio.srcObject = e.streams[0]; var pr = p.audio.play(); if (pr && pr.catch) pr.catch(function () {});
    };
    pc.onconnectionstatechange = function () {
      clearTimeout(p.t);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') drop(id);
      else if (pc.connectionState === 'disconnected') p.t = setTimeout(function () { drop(id); }, 8000);
    };
    render(); return p;
  }
  async function handle(ev, d) {
    if (!d || d.id === me || (d.to && d.to !== me)) return;
    try {
      if (ev === 'hi') {
        if (peers[d.id] || Object.keys(peers).length >= MAX - 1) return;
        var p = makePeer(d.id, d.name, true), o = await p.pc.createOffer();
        await p.pc.setLocalDescription(o); send('offer', { id: me, to: d.id, name: L.getName(), sdp: p.pc.localDescription });
      } else if (ev === 'offer') {
        if (peers[d.id] && peers[d.id].init) { if (me < d.id) return; drop(d.id); }   // both sides offered at once: the lower id keeps its offer
        if (!peers[d.id] && Object.keys(peers).length >= MAX - 1) return;
        var q = peers[d.id] || makePeer(d.id, d.name, false);
        await q.pc.setRemoteDescription(d.sdp);
        var a = await q.pc.createAnswer(); await q.pc.setLocalDescription(a);
        send('answer', { id: me, to: d.id, sdp: q.pc.localDescription });
        q.q.splice(0).forEach(function (c) { q.pc.addIceCandidate(c).catch(function () {}); });
      } else if (ev === 'answer') {
        var r = peers[d.id]; if (r && r.pc.signalingState === 'have-local-offer') {
          await r.pc.setRemoteDescription(d.sdp); r.q.splice(0).forEach(function (c) { r.pc.addIceCandidate(c).catch(function () {}); });
        }
      } else if (ev === 'ice') {
        var s = peers[d.id]; if (!s) return;
        if (s.pc.remoteDescription) s.pc.addIceCandidate(d.c).catch(function () {}); else s.q.push(d.c);
      } else if (ev === 'bye') drop(d.id);
    } catch (e) { drop(d.id); }
  }
  function connect() {
    ws = new WebSocket(L.config.url.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(L.config.key) + '&vsn=1.0.0');
    ws.onopen = function () {
      joinRef = String(++ref);
      ws.send(JSON.stringify({ topic: ROOM, event: 'phx_join', ref: joinRef, join_ref: joinRef, payload: { config: { broadcast: { ack: false, self: false }, presence: { key: me }, postgres_changes: [], private: false }, access_token: L.config.key } }));
      hb = setInterval(function () { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })); }, 20000);
    };
    ws.onmessage = function (e) {
      var m; try { m = JSON.parse(e.data); } catch (x) { return; }
      if (m.topic !== ROOM) return;
      if (m.event === 'phx_reply' && m.ref === joinRef) { if (m.payload && m.payload.status === 'ok') send('hi', { id: me, name: L.getName() }); else info.textContent = 'Voice is not available right now.'; }
      else if (m.event === 'broadcast' && m.payload) handle(m.payload.event, m.payload.payload);
    };
    ws.onclose = function () { if (on) leave('Voice disconnected.'); };
  }
  async function join() {
    var name = L.getName();
    if (!name || !L.isCleanName(name)) { info.textContent = 'Make your profile first, then join voice.'; return; }
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) { info.textContent = 'Microphone blocked. Allow it in your browser to use voice.'; return; }
    on = true; muted = false; render(); connect();
  }
  function leave(msg) {
    send('bye', { id: me }); on = false; clearInterval(hb);
    Object.keys(peers).forEach(drop);
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); stream = null;
    try { ws.close(); } catch (e) { /* ignore */ } render(); if (msg) info.textContent = msg;
  }
  $('.vc-join').onclick = join;
  $('.vc-leave').onclick = function () { leave(); };
  $('.vc-mute').onclick = function () { muted = !muted; if (stream) stream.getAudioTracks().forEach(function (t) { t.enabled = !muted; }); render(); };
  window.addEventListener('pagehide', function () { if (on) leave(); });
})();
