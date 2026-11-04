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
// LAUNCHER: THE DASHBOARD AFTER LOGIN (EAGLERCRAFT / DECENTRALAND STYLE)
// ============================================================================
// After signing in, the dev lands on a launcher instead of straight in the
// world: a top bar (logo, Home / Play / Servers / Worlds / Resource Packs /
// News, the username and the MVC balance), a grid of entry points on the left
// (Genesis Plaza, Gamer District, Underground Cafe, Private Lobby) and the big
// launch panel on the right. "LAUNCH GAME" or a card's play button enters the
// world at that spot. The daily bonus (+50 MVC every 20 hours) can be claimed
// here. Card covers come from the place screenshots in assets/places.jpg.
// The Home tab lists the versions of the game, from the first walkable
// universe to the current one: an older version plays its own build, loaded
// from the repository history (see the ?v= loader in index.html).
const Launcher = (() => {
  const ATLAS = { columns: 8, rows: 8, extra: { underground: 46 } };
  // Versions: commit = the build to load (null = this one); tile = its screenshot in the atlas
  const VERSIONS = [
    { key: 'v10', version: 'v10', commit: null, tile: 57, date: 'Nov 2, 2026', title: 'Squid Game World & Launcher', text: 'Squid Game Epic Edition becomes its own world on a bare concrete island, resources to gather (E or G, hold G to pull them in, /bag), working Mac demos in the House of MAC and this launcher with the daily bonus.' },
    { key: 'v9', version: 'v9', commit: 'fc82b3e', tile: 56, date: 'Oct 24, 2026', title: 'Realistic Surfaces & Scene Builder', text: 'Detailed stone, brick, wood, glass and water with relief, grass back across Genesis City, JUMP IN cards with real screenshots and Decentraland-style scenes built in game with B.' },
    { key: 'v8', version: 'v8', commit: '1a0289d', tile: 55, date: 'Oct 20, 2026', title: 'Night Soundtrack & House of MAC', text: 'A night coding playlist, the Developers Daily Life museum, the underground lounge lit by the pool, firelight at the firepits, a colored Codify editor and the House of MAC billboards and reel.' },
    { key: 'v7', version: 'v7', commit: '73e0b86', tile: 54, date: 'Oct 17, 2026', title: 'Lounge, Forests & Leafy Trees', text: 'Bigger districts, the beach on the West Sea shore, the underground lounge and Gig Plaza, the forest chalet hotel, silent session resume and realistic leafy trees.' },
    { key: 'v6', version: 'v6', commit: '895ce5a', tile: 53, date: 'Oct 16, 2026', title: 'MVC Token, Live Events & Glass Cube', text: 'Seas and islands around the city, new districts, the MVC token on testnet, live community events and The Glass Cube with the Underground Tech Hub.' },
    { key: 'v5', version: 'v5', commit: '7666562', tile: 52, date: 'Oct 14, 2026', title: 'Code Chests & Land Parcels', text: 'Chests drop real code files, cursor wearables, the Underground Cafe menu, the museum timeline and a Decentraland-style city of land parcels.' },
    { key: 'v4', version: 'v4', commit: '95e8bec', tile: 51, date: 'Oct 12, 2026', title: 'Codify & Fry your Code', text: 'Write code right in the world with Codify, fry your bugs at the firepit, sleep in hotels, earn MVC and enjoy a cleaner HUD.' },
    { key: 'v3', version: 'v3', commit: 'd2fe76c', tile: 50, date: 'Oct 12, 2026', title: 'Underground, Metro & Tower of Icons', text: 'An organic Genesis City, the underground plaza below the pool, the Multiverse Metro to every district and the Tower of Icons.' },
    { key: 'v2', version: 'v2', commit: 'f1ba4a4', tile: 49, date: 'Oct 11, 2026', title: 'Genesis Plaza & Real Logos', text: 'Accounts and a welcome screen, dev loot chests, the Genesis City spawn, separate Worlds, real brand logos and HQs you can walk into.' },
    { key: 'v1', version: 'v1', commit: '013e991', tile: 48, date: 'Oct 11, 2026', title: 'The First Walkable Universe', text: 'Where it all began: GitVerse turns into a walkable Decentraland-style universe with Genesis Plaza, districts, chat commands and multiplayer cursors.' }
  ];
  const ENTRIES = [
    { key: 'plaza', title: 'Genesis Plaza', version: '26.3', popular: 4, date: 4, text: 'The heart of the Multiverse: Welcome Hall, Theatre, Events Wall, the firepit and the pool down to the Underground.' },
    { key: 'gamer', title: 'Gamer District', version: '26.2', popular: 3, date: 3, text: 'The Gravity Flip tower, arcades, a LAN party and the mini-game arena.' },
    { key: 'underground', title: 'Underground Cafe', version: '26.1', popular: 2, date: 2, text: 'Start below Genesis Plaza: the lounge, the cafe menu and the Hall of Internet & Software History.' },
    { key: 'private', title: 'Private Lobby', version: 'Invite only', tile: 'lobby', popular: 1, date: 1, text: 'A new instance only the devs you invite can see. Share the link from the top bar once inside.' }
  ];
  const NEWS = [
    ['Squid Game Epic Edition', 'A new world: Red Build Green Build, the Glass Bridge of Code Review and more. Nobody gets hurt, builds just fail.'],
    ['Build your own scene', 'Buy a parcel and press B: Decentraland-style Builder with per-parcel limits, publish for everyone.'],
    ['Gather resources', 'Code Crystals, Coffee Beans, RAM and Git Gems around Genesis City: E or G to pick up, hold G to gather.'],
    ['House of MAC demo Macs', 'Try a working macOS-style desktop on the Avenue tables: Finder, Terminal, Notes, Calculator.'],
    ['Realistic surfaces', 'Stone, brick, wood, glass and water got detailed textures with relief.']
  ];
  let worlds = [];
  let state = null;

  const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function tileStyle(key) {
    const index = typeof key === 'number' ? key : key in ATLAS.extra ? ATLAS.extra[key] : worlds.findIndex((world) => world.key === key);
    const world = worlds[index];
    if (index < 0 || (typeof key !== 'number' && world && !world.photo && !(key in ATLAS.extra))) return world && world.cardImage ? `background-image:url(${world.cardImage});background-size:cover;background-position:center` : 'background:linear-gradient(135deg,#1f6feb,#8957e5)';
    const col = index % ATLAS.columns;
    const row = Math.floor(index / ATLAS.columns);
    return `background-image:url(assets/places.jpg);background-size:${ATLAS.columns * 100}% ${ATLAS.rows * 100}%;background-position:${(col / (ATLAS.columns - 1)) * 100}% ${(row / (ATLAS.rows - 1)) * 100}%`;
  }

  function css() {
    if (document.getElementById('launcher-style')) return;
    const font = document.createElement('link');
    font.rel = 'stylesheet';
    font.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@400;600;700&display=swap';
    document.head.appendChild(font);
    const style = document.createElement('style');
    style.id = 'launcher-style';
    style.textContent = `
      #launcher { position: fixed; inset: 0; z-index: 80; overflow: auto; color: #e9ecef; font: 14px Inter, "Segoe UI", Arial, sans-serif;
        background: radial-gradient(1200px 500px at 15% -10%, rgba(46, 160, 67, 0.28), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(31, 111, 235, 0.22), transparent 60%), linear-gradient(180deg, #0f1115 0%, #15181f 100%); }
      #launcher .ln-top { position: sticky; top: 0; z-index: 2; margin: 14px auto 0; width: min(1180px, calc(100% - 28px)); display: flex; align-items: center; gap: 16px; padding: 12px 18px; border-radius: 18px; background: rgba(24, 26, 32, 0.86); border: 1px solid rgba(255,255,255,0.07); backdrop-filter: blur(10px); box-sizing: border-box; flex-wrap: wrap; }
      #launcher .ln-logo { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 18px; letter-spacing: -0.02em; }
      #launcher .ln-logo img { height: 28px; }
      #launcher nav { display: flex; gap: 4px; flex-wrap: wrap; }
      #launcher nav button { background: none; border: 0; color: #adb5bd; font: 600 13px Inter, sans-serif; padding: 7px 10px; border-radius: 10px; cursor: pointer; }
      #launcher nav button:hover { color: #fff; }
      #launcher nav button.on { background: rgba(255,255,255,0.1); color: #fff; }
      #launcher .ln-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
      #launcher .ln-user { color: #ced4da; font-weight: 600; }
      #launcher .ln-coins { font: 10px "Press Start 2P", monospace; padding: 9px 12px; border-radius: 12px; background: #f59f00; color: #1b1300; box-shadow: 0 0 18px rgba(245,159,0,0.35); white-space: nowrap; }
      #launcher .ln-daily { font: 8px/1.4 "Press Start 2P", monospace; padding: 9px 12px; border-radius: 12px; border: 0; cursor: pointer; background: #2ea043; color: #fff; }
      #launcher .ln-daily[disabled] { background: #2b3138; color: #8b949e; cursor: default; }
      #launcher .ln-main { width: min(1180px, calc(100% - 28px)); margin: 26px auto 40px; display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 26px; align-items: start; }
      @media (max-width: 900px) { #launcher .ln-main { grid-template-columns: 1fr; } }
      #launcher .ln-tools { display: flex; gap: 10px; margin-bottom: 16px; }
      #launcher .ln-search { flex: 1; max-width: 280px; padding: 11px 14px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: #1e2229; color: #fff; font: inherit; }
      #launcher .ln-sort { padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: #1e2229; color: #fff; font: inherit; }
      #launcher .ln-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 18px; }
      #launcher .ln-card { cursor: pointer; }
      #launcher .ln-cover { aspect-ratio: 3 / 4; border-radius: 18px; border: 3px solid transparent; position: relative; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.35); transition: transform 0.15s; }
      #launcher .ln-card:hover .ln-cover { transform: translateY(-3px); }
      #launcher .ln-card.on .ln-cover { border-color: #3fb950; box-shadow: 0 0 0 2px rgba(63,185,80,0.25), 0 10px 30px rgba(0,0,0,0.35); }
      #launcher .ln-cover::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.65) 100%); }
      #launcher .ln-cover b { position: absolute; left: 12px; right: 12px; top: 12px; z-index: 1; font: 11px/1.5 "Press Start 2P", monospace; color: #fff; text-shadow: 0 2px 0 #000, 0 0 8px rgba(0,0,0,0.8); }
      #launcher .ln-cover em { position: absolute; left: 12px; bottom: 10px; z-index: 1; font: 600 11px Inter, sans-serif; font-style: normal; color: #ced4da; }
      #launcher .ln-card-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
      #launcher .ln-card-foot span { font: 12px "Press Start 2P", monospace; color: #fff; }
      #launcher .ln-play { width: 34px; height: 34px; border-radius: 50%; border: 0; background: #2ea043; color: #fff; font-size: 13px; cursor: pointer; box-shadow: 0 0 0 4px rgba(46,160,67,0.18); }
      #launcher .ln-play:hover { background: #3fb950; }
      #launcher .ln-panel { position: sticky; top: 96px; padding: 18px; border-radius: 22px; background: #1c1f26; border: 1px solid rgba(255,255,255,0.07); box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
      #launcher .ln-hero { aspect-ratio: 16 / 10; border-radius: 16px; }
      #launcher .ln-title { display: flex; align-items: center; gap: 12px; margin: 18px 0 10px; }
      #launcher .ln-title i { width: 44px; height: 44px; border-radius: 10px; background: #2ea043 url(assets/icon.png) center / 70% no-repeat; flex: none; }
      #launcher .ln-title h2 { margin: 0; font: 15px/1.6 "Press Start 2P", monospace; letter-spacing: 0.02em; }
      #launcher .ln-desc { color: #adb5bd; line-height: 1.55; margin: 0 0 16px; padding-bottom: 16px; border-bottom: 1px solid rgba(255,255,255,0.08); }
      #launcher .ln-launch-row { display: flex; gap: 10px; align-items: center; }
      #launcher .ln-launch { flex: 1; padding: 15px; border-radius: 18px; border: 0; background: linear-gradient(180deg, #3fb950, #2ea043); color: #fff; font: 13px "Press Start 2P", monospace; cursor: pointer; box-shadow: 0 6px 0 #1a7f37, 0 10px 30px rgba(46,160,67,0.35); }
      #launcher .ln-launch:active { transform: translateY(3px); box-shadow: 0 3px 0 #1a7f37; }
      #launcher .ln-launch[disabled] { filter: grayscale(0.6); cursor: progress; }
      #launcher .ln-gear { width: 50px; height: 50px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.12); background: #262a32; color: #fff; font-size: 20px; cursor: pointer; }
      #launcher .ln-settings { display: none; margin-top: 14px; padding: 12px; border-radius: 14px; background: #262a32; }
      #launcher .ln-settings label { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; color: #ced4da; }
      #launcher .ln-settings select { background: #1c1f26; color: #fff; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 5px 8px; }
      #launcher .ln-entry { margin-top: 12px; font-size: 12px; color: #8b949e; }
      #launcher .ln-list { display: grid; gap: 12px; }
      #launcher .ln-row { display: flex; gap: 14px; align-items: center; padding: 14px; border-radius: 16px; background: #1c1f26; border: 1px solid rgba(255,255,255,0.06); }
      #launcher .ln-row h3 { margin: 0 0 4px; font-size: 15px; }
      #launcher .ln-row p { margin: 0; color: #adb5bd; }
      #launcher .ln-dot { width: 10px; height: 10px; border-radius: 50%; background: #3fb950; box-shadow: 0 0 8px #3fb950; flex: none; }
      #launcher .ln-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 12px 18px; border-radius: 14px; background: #1c1f26; border: 1px solid rgba(255,255,255,0.12); display: none; z-index: 3; }
    `;
    document.head.appendChild(style);
  }

  function request(url, options = {}) {
    const headers = { 'Content-Type': 'application/json', 'x-session-token': state.session.token };
    return fetch(url, { ...options, headers }).then(async (response) => ({ ok: response.ok, data: await response.json().catch(() => ({})) }));
  }

  function toast(text) {
    const box = state.root.querySelector('.ln-toast');
    box.textContent = text;
    box.style.display = 'block';
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { box.style.display = 'none'; }, 3200);
  }

  function renderWallet() {
    const coins = state.root.querySelector('.ln-coins');
    const daily = state.root.querySelector('.ln-daily');
    coins.textContent = state.coins === null ? 'MVC · solo' : `${state.coins} MVC`;
    if (!Auth.hasServer) { daily.disabled = true; daily.textContent = 'Daily bonus · online only'; return; }
    const wait = Math.max(0, (state.nextDailyAt || 0) - Date.now());
    daily.disabled = wait > 0;
    daily.textContent = wait > 0 ? `Next bonus in ${Math.ceil(wait / 3600000)} h` : 'Claim daily bonus (+50 MVC)';
  }

  function cardHtml(entry) {
    return `<div class="ln-card${state.selected === entry.key ? ' on' : ''}" data-key="${entry.key}">
      <div class="ln-cover" style="${tileStyle(entry.tile ?? entry.key)}"><b>${esc(entry.title)}</b>${entry.date ? `<em>${esc(entry.date)}</em>` : ''}</div>
      <div class="ln-card-foot"><span>${esc(entry.version)}</span><button class="ln-play" data-play="${entry.key}" title="Play ${esc(entry.title)}">&#9654;</button></div></div>`;
  }

  function renderLeft() {
    const left = state.root.querySelector('.ln-left');
    const tab = state.tab;
    if (tab === 'home' || tab === 'play' || tab === 'worlds') {
      const query = (state.query || '').toLowerCase();
      let list = tab === 'worlds'
        ? worlds.filter((world) => world.world).map((world, i) => ({ key: world.key, title: world.name, version: 'World', popular: i, date: i, text: world.description }))
        : tab === 'home' ? VERSIONS.map((entry, i) => ({ ...entry, popular: VERSIONS.length - i, date: VERSIONS.length - i }))
          : ENTRIES.concat(worlds.filter((world) => !world.world && world.key !== 'plaza' && world.photo).map((world, i) => ({ key: world.key, title: world.name, version: 'District', popular: 0, date: -i, text: world.description })));
      list = list.filter((entry) => !query || `${entry.title} ${entry.version} ${entry.text || ''}`.toLowerCase().includes(query));
      const sort = state.sort || 'popular';
      list.sort((a, b) => (sort === 'az' ? a.title.localeCompare(b.title) : sort === 'newest' ? b.date - a.date : b.popular - a.popular));
      left.innerHTML = `<div class="ln-tools"><input class="ln-search" placeholder="${tab === 'worlds' ? 'Search worlds...' : tab === 'home' ? 'Search versions and updates...' : 'Search starting points...'}" value="${esc(state.query || '')}"/>
        <select class="ln-sort"><option value="popular"${sort === 'popular' ? ' selected' : ''}>Popular</option><option value="newest"${sort === 'newest' ? ' selected' : ''}>Newest</option><option value="az"${sort === 'az' ? ' selected' : ''}>A-Z</option></select></div>
        <div class="ln-grid">${list.map(cardHtml).join('') || '<p style="color:#8b949e">Nothing found.</p>'}</div>`;
      const search = left.querySelector('.ln-search');
      search.addEventListener('input', () => { state.query = search.value; const caret = search.selectionStart; renderLeft(); const again = state.root.querySelector('.ln-search'); again.focus(); again.setSelectionRange(caret, caret); });
      left.querySelector('.ln-sort').addEventListener('change', (event) => { state.sort = event.target.value; renderLeft(); });
      state.visible = list;
      left.querySelectorAll('.ln-card').forEach((card) => card.addEventListener('click', (event) => {
        if (event.target.closest('.ln-play')) return;
        select(card.dataset.key);
      }));
      left.querySelectorAll('[data-play]').forEach((button) => button.addEventListener('click', () => launch(button.dataset.play)));
    } else if (tab === 'servers') {
      left.innerHTML = `<div class="ln-list">
        <div class="ln-row"><span class="ln-dot" style="${Auth.hasServer ? '' : 'background:#f59f00;box-shadow:0 0 8px #f59f00'}"></span><div style="flex:1"><h3>Genesis · main server</h3><p>${Auth.hasServer ? 'Online · multiplayer, chat, land and scenes' : 'Solo mode: no multiplayer server on this host'}</p></div><button class="ln-play" data-play="plaza">&#9654;</button></div>
        <div class="ln-row"><span class="ln-dot"></span><div style="flex:1"><h3>Private lobby</h3><p>Your own instance: only devs with the invite link see you</p></div><button class="ln-play" data-play="private">&#9654;</button></div></div>`;
      left.querySelectorAll('[data-play]').forEach((button) => button.addEventListener('click', () => launch(button.dataset.play)));
    } else if (tab === 'packs') {
      let quality = 'auto';
      let sound = true;
      try { quality = localStorage.getItem('multiverse-quality') || 'auto'; sound = localStorage.getItem('multiverse-sound') !== 'off'; } catch (error) { /* storage blocked */ }
      left.innerHTML = `<div class="ln-list">${[['minimum', 'Potato', 'Old computers: no shadows, short view distance'], ['low', 'Light', 'Laptops and integrated graphics'], ['medium', 'Default', 'Balanced look and speed'], ['high', 'Ultra', 'Big shadows and the longest view distance'], ['auto', 'Auto', 'The game picks and adapts while you play']].map(([value, name, text]) => `<div class="ln-row"><div style="flex:1"><h3>${name} graphics pack</h3><p>${text}</p></div><button class="ln-play" data-pack="${value}" style="${quality === value ? '' : 'background:#30363d'}">${quality === value ? '&#10003;' : '+'}</button></div>`).join('')}
        <div class="ln-row"><div style="flex:1"><h3>Sound pack</h3><p>Mouse glide, firepits, birds and the night soundtrack</p></div><button class="ln-play" data-sound="1" style="${sound ? '' : 'background:#30363d'}">${sound ? '&#10003;' : '+'}</button></div></div>`;
      left.querySelectorAll('[data-pack]').forEach((button) => button.addEventListener('click', () => { try { localStorage.setItem('multiverse-quality', button.dataset.pack); } catch (error) { /* storage blocked */ } renderLeft(); toast('Graphics pack applied when the world opens.'); }));
      left.querySelector('[data-sound]').addEventListener('click', () => { try { localStorage.setItem('multiverse-sound', sound ? 'off' : 'on'); } catch (error) { /* storage blocked */ } renderLeft(); });
    } else if (tab === 'news') {
      left.innerHTML = `<div class="ln-list">${NEWS.map(([title, text]) => `<div class="ln-row"><div><h3>${esc(title)}</h3><p>${esc(text)}</p></div></div>`).join('')}</div>`;
    }
  }

  function select(key) {
    state.selected = key;
    const entry = VERSIONS.find((item) => item.key === key) || ENTRIES.find((item) => item.key === key) || (() => { const world = worlds.find((item) => item.key === key); return world && { key, title: world.name, text: world.description }; })() || ENTRIES[0];
    const version = entry.commit !== undefined ? entry : VERSIONS[0];
    state.root.querySelector('.ln-hero').setAttribute('style', tileStyle(entry.tile ?? entry.key));
    state.root.querySelector('.ln-title h2').textContent = `GITHUB MULTIVERSE ${version.version}`;
    state.root.querySelector('.ln-desc').textContent = entry.commit !== undefined ? `${entry.title}. ${entry.text}` : entry.text || '';
    state.root.querySelector('.ln-entry').textContent = entry.commit ? `Classic version from ${entry.date}: plays that build as it was (solo world, progress kept apart)` : entry.commit === null ? `Latest version · ${entry.date}` : `Starting point: ${entry.title}`;
    state.root.querySelectorAll('.ln-card').forEach((card) => card.classList.toggle('on', card.dataset.key === key));
  }

  function launch(key) {
    let target = key || state.selected || 'plaza';
    const version = VERSIONS.find((item) => item.key === target);
    if (version && version.commit) {
      const here = new URLSearchParams(location.search);
      const cdn = here.get('cdn') ? `&cdn=${encodeURIComponent(here.get('cdn'))}` : '';
      location.href = `/?v=${version.commit}&label=${version.version}${cdn}`;
      return;
    }
    if (version) target = 'plaza';
    if (target === 'private' && !new URLSearchParams(location.search).get('lobby')) {
      const id = Math.random().toString(36).slice(2, 8);
      location.search = `?lobby=${id}`;
      return;
    }
    const button = state.root.querySelector('.ln-launch');
    button.disabled = true;
    button.textContent = 'LOADING WORLD...';
    Promise.resolve(state.ready).then(() => {
      state.root.remove();
      state.resolve({ session: state.session, entry: target === 'private' ? 'plaza' : target });
    });
  }

  // Shows the launcher; resolves with { session, entry } when the dev launches
  function open(session, ready) {
    css();
    return new Promise(async (resolve) => {
      worlds = await fetch('maps/worlds.json').then((response) => response.json()).catch(() => []);
      const root = document.createElement('div');
      root.id = 'launcher';
      root.innerHTML = `
        <header class="ln-top"><div class="ln-logo"><img src="assets/logo.png" alt="GitHub Multiverse"/></div>
          <nav>${[['home', 'Home'], ['play', 'Play'], ['servers', 'Servers'], ['worlds', 'Worlds'], ['packs', 'Resource Packs'], ['news', 'News']].map(([key, name]) => `<button data-tab="${key}"${key === 'home' ? ' class="on"' : ''}>${name}</button>`).join('')}</nav>
          <div class="ln-right"><span class="ln-user">${esc(session.username)}</span><span class="ln-coins">... MVC</span><button class="ln-daily" type="button">Claim daily bonus (+50 MVC)</button></div></header>
        <main class="ln-main"><section class="ln-left"></section>
          <aside class="ln-panel"><div class="ln-hero"></div>
            <div class="ln-title"><i></i><h2>GITHUB MULTIVERSE v10</h2></div>
            <p class="ln-desc">The developers' metaverse in your browser: walk Genesis City as a 3D cursor, code with Codify, fry your bugs at the firepits, buy land and build scenes, and jump into worlds like Silicon Valley and Squid Game Epic Edition.</p>
            <div class="ln-launch-row"><button class="ln-launch" type="button">&#9654; LAUNCH GAME</button><button class="ln-gear" type="button" title="Settings">&#9881;</button></div>
            <div class="ln-settings"><label>Graphics <select class="ln-quality"><option value="auto">Auto</option><option value="minimum">Minimum</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
              <label>Sound <input type="checkbox" class="ln-sound"/></label><label>Sign out <button type="button" class="ln-signout" style="background:#30363d;color:#fff;border:0;border-radius:8px;padding:5px 10px;cursor:pointer">Sign out</button></label></div>
            <p class="ln-entry"></p></aside></main>
        <div class="ln-toast"></div>`;
      document.body.appendChild(root);
      state = { root, session, ready, resolve, tab: 'home', selected: 'v10', coins: Auth.hasServer ? 0 : null, nextDailyAt: 0 };
      renderLeft();
      select('v10');
      renderWallet();
      root.querySelectorAll('nav button').forEach((button) => button.addEventListener('click', () => {
        state.tab = button.dataset.tab;
        root.querySelectorAll('nav button').forEach((other) => other.classList.toggle('on', other === button));
        renderLeft();
        if (['home', 'play', 'worlds'].includes(state.tab) && state.visible && state.visible.length) select(state.visible[0].key);
      }));
      root.querySelector('.ln-launch').addEventListener('click', () => launch());
      // Settings (gear): graphics quality, sound, sign out
      const settings = root.querySelector('.ln-settings');
      root.querySelector('.ln-gear').addEventListener('click', () => { settings.style.display = settings.style.display === 'block' ? 'none' : 'block'; });
      const quality = root.querySelector('.ln-quality');
      const sound = root.querySelector('.ln-sound');
      try { quality.value = localStorage.getItem('multiverse-quality') || 'auto'; sound.checked = localStorage.getItem('multiverse-sound') !== 'off'; } catch (error) { /* storage blocked */ }
      quality.addEventListener('change', () => { try { localStorage.setItem('multiverse-quality', quality.value); } catch (error) { /* storage blocked */ } });
      sound.addEventListener('change', () => { try { localStorage.setItem('multiverse-sound', sound.checked ? 'on' : 'off'); } catch (error) { /* storage blocked */ } });
      root.querySelector('.ln-signout').addEventListener('click', () => Auth.signOut());
      // Wallet and daily bonus
      if (Auth.hasServer) {
        request('/api/wallet').then(({ ok, data }) => { if (ok) { state.coins = data.coins; state.nextDailyAt = Date.now() + (data.nextDailyInMs || 0); renderWallet(); } }).catch(() => {});
      }
      root.querySelector('.ln-daily').addEventListener('click', () => {
        request('/api/daily', { method: 'POST' }).then(({ ok, data }) => {
          if (typeof data.coins === 'number') state.coins = data.coins;
          state.nextDailyAt = Date.now() + (data.nextDailyInMs || 0);
          renderWallet();
          toast(ok ? `+${data.earned} MVC daily bonus claimed!` : data.error || 'Could not claim the bonus.');
        }).catch(() => toast('Could not reach the server.'));
      });
      setInterval(renderWallet, 60000);
    });
  }

  return { open };
})();
