// ============================================================================
// WELCOME SCREEN: SIGN UP / LOG IN BEFORE ENTERING THE MULTIVERSE
// ============================================================================
// With the Node server, accounts live on the server (scrypt-hashed passwords,
// session tokens). On static hosts without a server (solo mode), the account
// is kept only in this browser, and the screen says so.
const Auth = (() => {
  const TOKEN_KEY = 'github-multiverse-session';
  const LOCAL_ACCOUNTS_KEY = 'github-multiverse-local-accounts';
  const DEVICE_KEY = 'multiverse-device-key';
  const hasServer = typeof io === 'function';
  const screen = document.getElementById('auth-screen');
  const form = document.getElementById('auth-form');
  const tabs = document.querySelectorAll('#auth-tabs button');
  const usernameInput = document.getElementById('auth-username');
  const passwordInput = document.getElementById('auth-password');
  const confirmRow = document.getElementById('auth-confirm-row');
  const confirmInput = document.getElementById('auth-confirm');
  const submitButton = document.getElementById('auth-submit');
  const errorBox = document.getElementById('auth-error');
  const note = document.getElementById('auth-note');
  let mode = 'signup';
  let resolveLogin;

  function storage(action, key, value) {
    try {
      if (action === 'get') return localStorage.getItem(key);
      if (action === 'set') localStorage.setItem(key, value);
      if (action === 'remove') localStorage.removeItem(key);
    } catch (error) {
      return null;
    }
    return null;
  }

  function setMode(nextMode) {
    mode = nextMode;
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
    confirmRow.style.display = mode === 'signup' ? 'block' : 'none';
    confirmInput.required = mode === 'signup';
    passwordInput.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    submitButton.textContent = mode === 'signup' ? 'Create account & enter' : 'Log in';
    errorBox.textContent = '';
  }

  // A random key that stays in this browser; the server keeps only its hash
  // and uses it to reconnect this device without asking for the password
  function deviceKey() {
    let key = storage('get', DEVICE_KEY);
    if (!key || !/^[a-f0-9]{64}$/.test(key)) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      key = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      storage('set', DEVICE_KEY, key);
    }
    return key;
  }

  async function postJson(url, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-session-token'] = token;
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }

  async function hashLocally(password, salt) {
    const data = new TextEncoder().encode(`${salt}:${password}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  // Solo mode: accounts saved in this browser only
  async function localAuth(username, password) {
    let local = {};
    try { local = JSON.parse(storage('get', LOCAL_ACCOUNTS_KEY) || '{}'); } catch (error) { local = {}; }
    const key = username.toLowerCase();
    if (mode === 'signup') {
      if (local[key]) throw new Error('That username already exists in this browser. Log in instead?');
      const salt = Math.random().toString(36).slice(2);
      local[key] = { username, salt, hash: await hashLocally(password, salt) };
      storage('set', LOCAL_ACCOUNTS_KEY, JSON.stringify(local));
    } else if (!local[key] || local[key].hash !== await hashLocally(password, local[key].salt)) {
      throw new Error('Wrong username or password.');
    }
    return { token: `local:${key}`, username: local[key].username };
  }

  async function serverAuth(username, password) {
    const response = await fetch(mode === 'signup' ? '/api/signup' : '/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, deviceKey: deviceKey() })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Something went wrong. Try again.');
    return body;
  }

  function enter(session) {
    storage('set', TOKEN_KEY, JSON.stringify(session));
    storage('set', 'multiverse-last-username', session.username);
    storage('remove', 'multiverse-signed-out');
    screen.classList.add('leaving');
    setTimeout(() => { screen.style.display = 'none'; }, 600);
    resolveLogin(session);
  }

  async function onSubmit(event) {
    event.preventDefault();
    errorBox.textContent = '';
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) { errorBox.textContent = 'Usernames have 3-16 letters, numbers or _.'; return; }
    if (password.length < 8) { errorBox.textContent = 'Passwords need at least 8 characters.'; return; }
    if (mode === 'signup' && password !== confirmInput.value) { errorBox.textContent = 'The passwords do not match.'; return; }
    submitButton.disabled = true;
    try {
      enter(hasServer ? await serverAuth(username, password) : await localAuth(username, password));
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  }

  // Returns a valid session for a returning player, or null if a password is needed
  async function resumeSession(saved, lastName) {
    if (!hasServer) return saved && saved.token && saved.token.startsWith('local:') ? saved : null;
    const key = deviceKey();
    if (saved && saved.token) {
      const status = await fetch('/api/session', { headers: { 'x-session-token': saved.token } })
        .then((response) => (response.status === 401 ? 'expired' : 'ok'))
        .catch(() => 'offline');
      // A network hiccup keeps the session (the game server checks it anyway)
      if (status !== 'expired') {
        if (status === 'ok') postJson('/api/device', { deviceKey: key }, saved.token).catch(() => {});
        return saved;
      }
    }
    if (!lastName) return null;
    try {
      const result = await postJson('/api/resume', { username: lastName, deviceKey: key });
      return result.ok && result.data.token ? { token: result.data.token, username: result.data.username } : null;
    } catch (error) {
      return null;
    }
  }

  // Resolves with { token, username } once the developer is signed in
  function signIn() {
    return new Promise(async (resolve) => {
      resolveLogin = resolve;
      tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
      form.addEventListener('submit', onSubmit);
      note.textContent = hasServer
        ? 'Your password is hashed on the server and never stored in plain text.'
        : 'Solo mode: no multiplayer server found, so this account is saved only in this browser.';

      let saved = null;
      try { saved = JSON.parse(storage('get', TOKEN_KEY)); } catch (error) { saved = null; }
      const lastName = (saved && saved.username) || storage('get', 'multiverse-last-username');
      const signedOut = storage('get', 'multiverse-signed-out') === '1';
      if (!signedOut && ((saved && saved.token) || (hasServer && lastName))) {
        // Returning player: only a "Connecting..." animation, then straight into
        // the world. An expired session is renewed with this device's key; the
        // form appears only if the server does not recognize this device.
        screen.classList.add('resuming');
        const resumeNote = document.getElementById('auth-resume');
        if (resumeNote) resumeNote.innerHTML = '<span class="auth-spinner"></span><span>Connecting</span>';
        const session = await resumeSession(saved, lastName);
        if (session) { enter(session); return; }
        storage('remove', TOKEN_KEY);
        screen.classList.remove('resuming');
        setMode('login');
        usernameInput.value = lastName || '';
        errorBox.textContent = 'This device is not linked to that account yet. Log in once and it will connect automatically next time.';
      } else {
        setMode(lastName ? 'login' : 'signup');
        if (lastName) usernameInput.value = lastName;
      }
      screen.style.display = 'flex';
      (usernameInput.value ? passwordInput : usernameInput).focus();
    });
  }

  async function signOut() {
    let saved = null;
    try { saved = JSON.parse(storage('get', TOKEN_KEY)); } catch (error) { saved = null; }
    if (saved && hasServer) await fetch('/api/logout', { method: 'POST', headers: { 'x-session-token': saved.token } }).catch(() => {});
    storage('remove', TOKEN_KEY);
    storage('set', 'multiverse-signed-out', '1');
    location.reload();
  }

  return { signIn, signOut, hasServer };
})();

// ============================================================================
// LAUNCHER: A MINECRAFT-STYLE TITLE SCREEN AFTER LOGIN
// ============================================================================
// After signing in, the dev sees a title screen like Minecraft's: the logo
// over a slowly moving panorama of the worlds, a yellow splash text and big
// buttons (Join Genesis City, Worlds, Private Lobby, Options). Join shows a
// "Joining world" screen with a progress bar until the world is ready.
// Launcher.open(session, ready) resolves with { session, entry }.
const Launcher = (() => {
  const SPLASHES = ['Now with 100% more cursors!', 'git push --force-with-love', 'Works on my machine!', 'Ship it!', 'Also try Squid Game Epic Edition!', 'Merge conflicts not included!', 'Made by devs, for devs!', 'Commit early, commit often!'];
  let worlds = [];
  let state = null;
  const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function tile(key) {
    const index = worlds.findIndex((world) => world.key === key);
    if (index < 0) return 'background:#2b2f36';
    return `background-image:url(assets/places.jpg);background-size:800% 800%;background-position:${((index % 8) / 7) * 100}% ${(Math.floor(index / 8) / 7) * 100}%`;
  }

  function css() {
    if (document.getElementById('launcher-style')) return;
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
    document.head.appendChild(font);
    const style = document.createElement('style');
    style.id = 'launcher-style';
    style.textContent = `
      #launcher { position: fixed; inset: 0; z-index: 80; overflow: hidden; color: #fff; font: 12px "Press Start 2P", monospace; background: #0d1117; }
      #launcher .mc-page { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 16px; box-sizing: border-box; overflow-y: auto; }
      #launcher .mc-logo { position: relative; margin-bottom: 34px; text-align: center; }
      #launcher .mc-logo img { width: min(560px, 82vw); filter: drop-shadow(0 6px 0 rgba(0,0,0,0.45)); }
      #launcher .mc-splash { position: absolute; right: -10px; bottom: -14px; color: #ffff55; font-size: 12px; text-shadow: 2px 2px 0 #3f3f15; transform: rotate(-18deg); white-space: nowrap; animation: mc-splash 0.9s ease-in-out infinite alternate; }
      @keyframes mc-splash { from { transform: rotate(-18deg) scale(0.92); } to { transform: rotate(-18deg) scale(1.06); } }
      #launcher .mc-btn { width: min(400px, 88vw); padding: 13px 10px; border: 2px solid #000; background: linear-gradient(180deg, #8b8b8b 0%, #6f6f6f 100%); box-shadow: inset 2px 2px 0 #b5b5b5, inset -2px -3px 0 #4b4b4b; color: #fff; font: inherit; text-shadow: 2px 2px 0 #3a3a3a; cursor: pointer; image-rendering: pixelated; }
      #launcher .mc-btn:hover { background: linear-gradient(180deg, #8f9bd8 0%, #6a78c0 100%); box-shadow: inset 2px 2px 0 #c3cbf5, inset -2px -3px 0 #3d4a8f; color: #ffffa0; }
      #launcher .mc-btn[disabled] { background: #3c3c3c; color: #a0a0a0; box-shadow: none; cursor: default; }
      #launcher .mc-row { display: flex; gap: 8px; width: min(400px, 88vw); }
      #launcher .mc-row .mc-btn { width: auto; flex: 1; }
      #launcher .mc-corner { position: absolute; z-index: 2; bottom: 8px; font-size: 9px; color: #fff; text-shadow: 1px 1px 0 #000; }
      #launcher .mc-title { font-size: 14px; margin-bottom: 10px; text-shadow: 2px 2px 0 #3a3a3a; }
      #launcher .mc-list { width: min(620px, 92vw); max-height: 58vh; overflow-y: auto; background: rgba(0,0,0,0.55); border: 2px solid #000; box-shadow: inset 0 0 0 2px #4b4b4b; padding: 6px; box-sizing: border-box; }
      #launcher .mc-entry { display: flex; gap: 12px; align-items: center; padding: 6px; border: 2px solid transparent; cursor: pointer; }
      #launcher .mc-entry:hover, #launcher .mc-entry.on { border-color: #a0a0a0; background: rgba(255,255,255,0.06); }
      #launcher .mc-entry i { width: 96px; height: 67px; flex: none; image-rendering: auto; border: 1px solid #000; }
      #launcher .mc-entry b { display: block; font-size: 11px; margin-bottom: 7px; }
      #launcher .mc-entry span { font: 13px/1.35 "Segoe UI", Arial, sans-serif; color: #b8b8b8; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      #launcher .mc-options label { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: min(400px, 88vw); margin: 4px 0; font-size: 10px; }
      #launcher .mc-options select { font: 10px "Press Start 2P", monospace; background: #1c1c1c; color: #fff; border: 2px solid #000; padding: 6px; }
      #launcher .mc-joining { gap: 18px; }
      #launcher .mc-joining p { margin: 0; text-shadow: 2px 2px 0 #3a3a3a; text-align: center; line-height: 1.6; }
      #launcher .mc-bar { width: min(420px, 80vw); height: 14px; border: 2px solid #000; background: #2b2b2b; box-shadow: inset 0 0 0 2px #555; }
      #launcher .mc-bar div { height: 100%; width: 0; background: linear-gradient(180deg, #7ae36a, #3fa034); transition: width 0.25s linear; }
      #launcher .mc-dirt { position: absolute; inset: 0; z-index: 0; background: #3b2a1e url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' shape-rendering='crispEdges'%3E%3Crect width='32' height='32' fill='%23593d29'/%3E%3Crect x='4' y='6' width='4' height='4' fill='%23795548'/%3E%3Crect x='18' y='2' width='4' height='4' fill='%234a3222'/%3E%3Crect x='24' y='16' width='4' height='4' fill='%23795548'/%3E%3Crect x='10' y='20' width='4' height='4' fill='%234a3222'/%3E%3Crect x='2' y='26' width='4' height='4' fill='%236d4c41'/%3E%3Crect x='20' y='26' width='4' height='4' fill='%234a3222'/%3E%3C/svg%3E") repeat; background-size: 64px 64px; filter: brightness(0.45); }
    `;
    document.head.appendChild(style);
  }

  function request(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', 'x-session-token': state.session.token };
    return fetch(url, { ...options, headers }).then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => ({})) }));
  }

  function page(html) {
    const old = state.root.querySelector('.mc-page');
    if (old) old.remove();
    const div = document.createElement('div');
    div.className = 'mc-page';
    div.innerHTML = html;
    state.root.appendChild(div);
    return div;
  }

  function titleScreen() {
    const coins = state.coins === null ? 'Solo mode' : `${state.coins} MVC`;
    const view = page(`
      <div class="mc-logo"><img src="assets/logo.png" alt="GitHub Multiverse"><span class="mc-splash">${esc(SPLASHES[Math.floor(Math.random() * SPLASHES.length)])}</span></div>
      <button class="mc-btn" data-go="join">Join Genesis City</button>
      <button class="mc-btn" data-go="worlds">Worlds...</button>
      <button class="mc-btn" data-go="lobby">Private Lobby</button>
      <div class="mc-row"><button class="mc-btn" data-go="options">Options...</button><button class="mc-btn" data-go="daily"${Auth.hasServer ? '' : ' disabled'}>Daily bonus</button></div>`);
    view.querySelector('[data-go="join"]').addEventListener('click', () => join('plaza', 'Genesis City'));
    view.querySelector('[data-go="worlds"]').addEventListener('click', worldsScreen);
    view.querySelector('[data-go="lobby"]').addEventListener('click', () => { location.search = `?lobby=${Math.random().toString(36).slice(2, 8)}`; });
    view.querySelector('[data-go="options"]').addEventListener('click', optionsScreen);
    view.querySelector('[data-go="daily"]').addEventListener('click', claimDaily);
    corner(`${esc(state.session.username)} · ${coins}`);
  }

  function corner(text) {
    let left = state.root.querySelector('.mc-corner.left');
    if (!left) {
      left = document.createElement('div'); left.className = 'mc-corner left'; left.style.left = '8px'; state.root.appendChild(left);
      const right = document.createElement('div'); right.className = 'mc-corner'; right.style.right = '8px'; right.textContent = 'GitHub Multiverse v10'; state.root.appendChild(right);
    }
    left.textContent = text;
  }

  function worldsScreen() {
    const list = worlds.filter((world) => world.key !== 'plaza').sort((a, b) => (b.world ? 1 : 0) - (a.world ? 1 : 0));
    const view = page(`<div class="mc-title">Select World</div>
      <div class="mc-list">${list.map((world) => `<div class="mc-entry" data-key="${esc(world.key)}"><i style="${tile(world.key)}"></i><div><b>${esc(world.name)}${world.world ? '' : ' <small style="color:#9e9e9e">(district)</small>'}</b><span>${esc(world.description || '')}</span></div></div>`).join('')}</div>
      <div class="mc-row"><button class="mc-btn" data-go="play" disabled>Join World</button><button class="mc-btn" data-go="back">Back</button></div>`);
    let selected = null;
    view.querySelectorAll('.mc-entry').forEach((entry) => {
      entry.addEventListener('click', () => { selected = entry.dataset.key; view.querySelectorAll('.mc-entry').forEach((other) => other.classList.toggle('on', other === entry)); view.querySelector('[data-go="play"]').disabled = false; });
      entry.addEventListener('dblclick', () => join(entry.dataset.key, entry.querySelector('b').textContent));
    });
    view.querySelector('[data-go="play"]').addEventListener('click', () => { const world = worlds.find((item) => item.key === selected); if (world) join(world.key, world.name); });
    view.querySelector('[data-go="back"]').addEventListener('click', titleScreen);
  }

  function optionsScreen() {
    let quality = 'auto';
    let sound = true;
    try { quality = localStorage.getItem('multiverse-quality') || 'auto'; sound = localStorage.getItem('multiverse-sound') !== 'off'; } catch (error) { /* storage blocked */ }
    const view = page(`<div class="mc-title">Options</div><div class="mc-options">
      <label>Graphics <select class="mc-quality">${['auto', 'minimum', 'low', 'medium', 'high'].map((value) => `<option value="${value}"${value === quality ? ' selected' : ''}>${value[0].toUpperCase() + value.slice(1)}</option>`).join('')}</select></label></div>
      <button class="mc-btn" data-go="sound">Sound: ${sound ? 'ON' : 'OFF'}</button>
      <button class="mc-btn" data-go="signout">Sign out</button>
      <button class="mc-btn" data-go="back">Done</button>`);
    view.querySelector('.mc-quality').addEventListener('change', (event) => { try { localStorage.setItem('multiverse-quality', event.target.value); } catch (error) { /* storage blocked */ } });
    view.querySelector('[data-go="sound"]').addEventListener('click', () => { try { localStorage.setItem('multiverse-sound', sound ? 'off' : 'on'); } catch (error) { /* storage blocked */ } optionsScreen(); });
    view.querySelector('[data-go="signout"]').addEventListener('click', () => Auth.signOut());
    view.querySelector('[data-go="back"]').addEventListener('click', titleScreen);
  }

  function claimDaily() {
    request('/api/daily', { method: 'POST' }).then(({ ok, data }) => {
      if (typeof data.coins === 'number') state.coins = data.coins;
      const button = state.root.querySelector('[data-go="daily"]');
      if (button) { button.textContent = ok ? `+${data.earned} MVC!` : 'Come back later'; button.disabled = true; }
      corner(`${esc(state.session.username)} · ${state.coins === null ? 'Solo mode' : `${state.coins} MVC`}`);
    }).catch(() => {});
  }

  // "Joining world": dirt background, a status line and a progress bar that
  // follows the real loading, then the world fades in
  function join(key, name) {
    const view = page(`<p>Joining world...</p><p class="mc-step" style="color:#c6c6c6;font-size:10px">Connecting to ${esc(name)}</p><div class="mc-bar"><div></div></div>`);
    view.classList.add('mc-joining');
    const panorama = state.root.querySelector('.mv-panorama');
    if (panorama) panorama.style.display = 'none';
    const dirt = document.createElement('div');
    dirt.className = 'mc-dirt';
    state.root.prepend(dirt);
    state.root.querySelectorAll('.mc-corner').forEach((element) => element.remove());
    const bar = view.querySelector('.mc-bar div');
    const step = view.querySelector('.mc-step');
    const steps = ['Connecting to ' + name, 'Loading terrain', 'Building terrain', 'Spawning your cursor'];
    let progress = 0;
    let done = false;
    const timer = setInterval(() => {
      progress = done ? 100 : Math.min(92, progress + (92 - progress) * 0.08 + 0.6);
      bar.style.width = `${progress}%`;
      step.textContent = steps[Math.min(steps.length - 1, Math.floor(progress / 26))];
    }, 120);
    // The joining screen stays at least ~2 s, so the animation is always seen
    const shownAt = performance.now();
    Promise.resolve(state.ready).then(() => new Promise((resolve) => setTimeout(resolve, Math.max(0, 2000 - (performance.now() - shownAt))))).then(() => {
      done = true;
      setTimeout(() => {
        clearInterval(timer);
        state.root.remove();
        state.resolve({ session: state.session, entry: key });
      }, 450);
    });
  }

  // Shows the title screen; resolves with { session, entry } when the dev joins
  function open(session, ready) {
    css();
    return new Promise(async (resolve) => {
      worlds = await fetch('maps/worlds.json').then((response) => response.json()).catch(() => []);
      const root = document.createElement('div');
      root.id = 'launcher';
      document.body.appendChild(root);
      if (typeof MultiversePanorama !== 'undefined') MultiversePanorama.attach(root);
      state = { root, session, ready, resolve, coins: Auth.hasServer ? 0 : null };
      titleScreen();
      if (Auth.hasServer) request('/api/wallet').then(({ ok, data }) => { if (ok) { state.coins = data.coins; corner(`${esc(session.username)} · ${data.coins} MVC`); } }).catch(() => {});
    });
  }

  return { open, currentVersion: () => 'v10' };
})();

// ============================================================================
// PANORAMA (MINECRAFT TITLE SCREEN STYLE)
// ============================================================================
// Behind the welcome card and the title screen, screenshots of the worlds and
// districts drift slowly and cross-fade one into the next, like the Minecraft
// title screen. The shots are tiles of assets/places.jpg (8 x 8, worlds.json order).
const MultiversePanorama = (() => {
  const TILES = [57, 41, 38, 0, 39, 15, 33, 23, 40, 8, 36, 1, 35, 46, 37, 16];
  const SHOW_MS = 7000;
  const style = document.createElement('style');
  style.textContent = `
    .mv-panorama { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; background: #0d1117; }
    #auth-screen > .mv-panorama { position: fixed; }
    .mv-panorama div { position: absolute; left: 50%; top: 50%; width: max(130vw, 186vh); aspect-ratio: 320 / 224; opacity: 0; filter: blur(1.5px) saturate(1.1);
      background-image: url(assets/places.jpg); background-size: 800% 800%; transition: opacity 2.4s ease-in-out; will-change: transform, opacity; }
    .mv-panorama div.on { opacity: 1; }
    .mv-panorama div.pan-a { animation: mv-pan-a 16s linear forwards; }
    .mv-panorama div.pan-b { animation: mv-pan-b 16s linear forwards; }
    @keyframes mv-pan-a { from { transform: translate(-53%, -50%) scale(1.02); } to { transform: translate(-47%, -51%) scale(1.1); } }
    @keyframes mv-pan-b { from { transform: translate(-47%, -51%) scale(1.1); } to { transform: translate(-53%, -49%) scale(1.02); } }
    .mv-panorama::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(13, 17, 23, 0.25), rgba(13, 17, 23, 0.6)); }
    @media (prefers-reduced-motion: reduce) { .mv-panorama div.pan-a, .mv-panorama div.pan-b { animation: none; transform: translate(-50%, -50%); } }
    #auth-screen > :not(.mv-panorama) { position: relative; z-index: 1; }
  `;
  document.head.appendChild(style);
  function attach(host) {
    const panorama = document.createElement('div');
    panorama.className = 'mv-panorama';
    const slides = [document.createElement('div'), document.createElement('div')];
    slides.forEach((slide) => panorama.appendChild(slide));
    host.prepend(panorama);
    let turn = Math.floor(Math.random() * TILES.length);
    function show() {
      const slide = slides[turn % 2];
      const other = slides[(turn + 1) % 2];
      const tile = TILES[turn % TILES.length];
      slide.style.backgroundPosition = `${((tile % 8) / 7) * 100}% ${(Math.floor(tile / 8) / 7) * 100}%`;
      slide.className = '';
      void slide.offsetWidth; // restart the drift animation
      slide.className = `on ${turn % 2 ? 'pan-b' : 'pan-a'}`;
      other.classList.remove('on');
      turn += 1;
    }
    const atlas = new Image();
    atlas.onload = () => {
      show();
      const timer = setInterval(() => {
        const gone = !document.body.contains(panorama) || panorama.style.display === 'none' || host.classList.contains('leaving') || getComputedStyle(host).display === 'none';
        if (gone) { clearInterval(timer); return; }
        show();
      }, SHOW_MS);
    };
    atlas.src = 'assets/places.jpg';
    return panorama;
  }
  const screen = document.getElementById('auth-screen');
  if (screen) attach(screen);
  return { attach };
})();
