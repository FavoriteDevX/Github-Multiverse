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
// LAUNCHER: A LOADING SCREEN AFTER LOGIN (LEGO.COM STYLE)
// ============================================================================
// After signing in, the dev goes straight in: a heavily blurred picture of the
// worlds fills the screen, a thin progress line runs across the middle and the
// cursor avatar rolls along it, leaving a green trail, with the percentage
// below. It follows the real loading and then the world fades in.
// Launcher.open(session, ready) resolves with { session, entry }.
const Launcher = (() => {
  const CURSOR_SVG = `<svg viewBox="0 0 40 40" width="46" height="46"><g transform="translate(9 5)"><path d="M0 0 L0 26 L7 20 L12 31 L17 29 L12 18 L21 18 Z" fill="#ffffff" stroke="#1d1b26" stroke-width="2.4" stroke-linejoin="round"/></g></svg>`;
  function css() {
    if (document.getElementById('launcher-style')) return;
    const style = document.createElement('style');
    style.id = 'launcher-style';
    style.textContent = `
      #launcher { position: fixed; inset: 0; z-index: 80; overflow: hidden; background: #1b1f27; transition: opacity 0.6s; }
      #launcher.leaving { opacity: 0; }
      #launcher .mv-panorama div { filter: blur(28px) saturate(1.25) brightness(0.8); }
      #launcher .mv-panorama::after { background: rgba(18, 20, 26, 0.25); }
      #launcher .ld-box { position: absolute; left: 50%; top: 44%; width: min(400px, 70vw); transform: translate(-50%, -50%); z-index: 1; }
      #launcher .ld-line { position: relative; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.45); }
      #launcher .ld-trail { position: absolute; left: 0; top: 0; height: 100%; width: 0; border-radius: 3px; background: linear-gradient(90deg, rgba(198, 255, 0, 0.2), #c6ff00); box-shadow: 0 0 10px rgba(198, 255, 0, 0.6); }
      #launcher .ld-end { position: absolute; right: -1px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: #3fb950; }
      #launcher .ld-roller { position: absolute; top: 50%; left: 0; width: 46px; height: 46px; margin: -23px 0 0 -23px; filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.35)); }
      #launcher .ld-roller svg { display: block; }
      #launcher .ld-pct { margin-top: 30px; text-align: center; color: #fff; font: 800 17px Inter, "Segoe UI", Arial, sans-serif; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.35); }
      #launcher .ld-place { margin-top: 6px; text-align: center; color: rgba(255, 255, 255, 0.75); font: 500 12px Inter, "Segoe UI", Arial, sans-serif; letter-spacing: 0.04em; }
    `;
    document.head.appendChild(style);
  }

  // Shows the loading screen; resolves with { session, entry } when the world is ready
  function open(session, ready) {
    css();
    return new Promise((resolve) => {
      const root = document.createElement('div');
      root.id = 'launcher';
      root.innerHTML = `<div class="ld-box"><div class="ld-line"><div class="ld-trail"></div><span class="ld-end"></span><div class="ld-roller">${CURSOR_SVG}</div></div>
        <div class="ld-pct">0%</div><div class="ld-place">Joining Genesis City</div></div>`;
      document.body.appendChild(root);
      if (typeof MultiversePanorama !== 'undefined') MultiversePanorama.attach(root);
      const trail = root.querySelector('.ld-trail');
      const roller = root.querySelector('.ld-roller');
      const label = root.querySelector('.ld-pct');
      let progress = 0;
      let target = 0;
      let done = false;
      const shownAt = performance.now();
      // Eases toward 90% while the world loads, then runs to 100% once it is ready
      (function frame() {
        target = done ? 100 : Math.min(90, target + (90 - target) * 0.012 + 0.05);
        progress += (target - progress) * 0.12;
        const shown = done && progress > 99.5 ? 100 : progress;
        trail.style.width = `${shown}%`;
        roller.style.left = `${shown}%`;
        roller.style.transform = `rotate(${shown * 10.8}deg)`;
        label.textContent = `${Math.floor(shown)}%`;
        if (shown >= 100) {
          setTimeout(() => {
            root.classList.add('leaving');
            setTimeout(() => root.remove(), 600);
            resolve({ session, entry: 'plaza' });
          }, 250);
          return;
        }
        requestAnimationFrame(frame);
      })();
      Promise.resolve(ready)
        .then(() => new Promise((wait) => setTimeout(wait, Math.max(0, 1600 - (performance.now() - shownAt)))))
        .then(() => { done = true; });
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
