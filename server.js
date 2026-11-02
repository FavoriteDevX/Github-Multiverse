const express = require('express');
const app = express();
const fs = require('fs');
const crypto = require('crypto');
const TechFeeds = require('./feeds');
// Optional .env file (KEY=VALUE lines) for the Web3 settings, without extra dependencies
try {
  require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !(match[1] in process.env)) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  });
} catch (error) { /* no .env file */ }
const Web3 = require('./web3/server'); // optional MVC token on a testnet (see web3/server.js)
const path = require('path'); // Core module to handle absolute system directory paths smoothly
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*" }
});

const PUBLIC_DIR = path.join(__dirname, 'public');

// Serves all static layout assets (index.html, scripts, maps JSON directories) nested inside public folder
app.use(express.static(PUBLIC_DIR));
app.use(express.json({ limit: '10kb' }));

// Lists the images the owner dropped in public/assets (ads, store, logos), so
// the client loads exactly the files that exist, whatever their format
// (.png, .jpg, .jpeg, .webp, .svg), instead of guessing and causing 404s
const OWNER_ASSET_FOLDERS = ['ads', 'ads/brands', 'store', 'logos'];
// Public Web3 settings for the browser (enabled only when configured)
app.get('/api/web3/config', (req, res) => {
  const config = Web3.publicConfig();
  if (config.enabled) config.landPrice = LAND_PRICE;
  res.set('Cache-Control', 'no-cache');
  res.json(config);
});

app.get('/api/owner-assets', (req, res) => {
  const listing = {};
  OWNER_ASSET_FOLDERS.forEach((folder) => {
    try {
      listing[folder] = fs.readdirSync(path.join(PUBLIC_DIR, 'assets', folder), { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.(png|jpe?g|webp|svg)$/i.test(entry.name))
        .map((entry) => entry.name);
    } catch (error) {
      listing[folder] = [];
    }
  });
  res.set('Cache-Control', 'no-cache');
  res.json(listing);
});

// ----------------------------------------------------------------------------
// Accounts: usernames + scrypt-hashed passwords, persisted in data/users.json
// ----------------------------------------------------------------------------
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
let accounts = { users: {}, sessions: {} };
try {
  accounts = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') console.error('[ACCOUNTS] Could not read users file:', error.message);
}

accounts.lands = accounts.lands || {}; // parcel "x,z" -> { owner, boughtAt }

// In-game economy (like Decentraland's MANA and LAND, but NOT real money):
// Multiverse Coins (MVC) are earned by playing and spent on land parcels.
const STARTING_COINS = 100;
const LAND_PRICE = 250;
// The Underground Tech Hub: the hall under The Glass Cube district (worlds.json)
const glassCube = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'maps', 'worlds.json'), 'utf8')).find((world) => world.key === 'glasscube');
function inTechHub(position) {
  if (!glassCube || !position) return false;
  const [cx, cz] = glassCube.region.center;
  return Math.abs(position.x - cx) < 20 && Math.abs(position.z - cz) < 17 && position.y < -6 && position.y > -14;
}
const pendingParcels = new Set(); // parcels being paid on-chain right now
const claimsInProgress = new Set(); // usernames with a mint in flight (memory only)
const MAX_PARCEL = 60; // Genesis City spans parcels -60..59 (16 m each, up to 960 m)
// Around the central districts the land is a grid of parcels split by roads
// (one parcel wide, every 8 parcels): road parcels cannot be bought
// Same rules as the client (public/city.js): roads from maps/land.json and
// community scenes picked by the same parcel hash cannot be bought
const CORE_PARCELS = 25; // the center commons spans parcels -25..24
const landLayout = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'maps', 'land.json'), 'utf8'));
function parcelHash(px, pz) {
  let h = Math.imul((px * 374761393 + pz * 668265263) | 0, 1274126177);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
}
const isRoadParcel = (px, pz) => landLayout.roadsX.includes(px) || landLayout.roadsZ.includes(pz);
const isSceneParcel = (px, pz) => parcelHash(px, pz) < landLayout.sceneChance;
// Seas (open water is not for sale; island parcels are)
function inSea(px, pz) {
  const x = px * 16 + 8;
  const z = -(pz * 16 + 8);
  const blob = (cx, cz, r, seed) => {
    const angle = Math.atan2(z - cz, x - cx);
    return Math.hypot(x - cx, z - cz) < r * (1 + 0.16 * Math.sin(3 * angle + seed) + 0.08 * Math.sin(5 * angle + seed * 2));
  };
  return (landLayout.seas || []).some((sea, i) => blob(sea.x, sea.z, sea.r, i + 1) && !(sea.islands || []).some((island, k) => blob(island.x, island.z, island.r, i * 7 + k + 3)));
}
function walletOf(account) {
  if (typeof account.coins !== 'number') account.coins = STARTING_COINS;
  return account.coins;
}

let saveTimer = null;
function saveAccounts() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFile(USERS_FILE, JSON.stringify(accounts), (error) => {
      if (error) console.error('[ACCOUNTS] Could not save users file:', error.message);
    });
  }, 300);
}

Web3.init();
Web3.loadUsedTransactions(accounts.web3UsedTransactions);

// ----------------------------------------------------------------------------
// Scenes (Decentraland-style): the content devs build on their own parcels and
// estates, persisted in data/scenes.json like users.json. The validation rules
// (ownership, bounds, per-parcel limits) are shared with the browser Builder.
// ----------------------------------------------------------------------------
const SceneRules = require('./public/scenes-builder.js');
const SCENES_FILE = path.join(DATA_DIR, 'scenes.json');
let sceneStore = { published: {}, drafts: {} }; // base parcel "x,y" -> scene manifest
try {
  sceneStore = JSON.parse(fs.readFileSync(SCENES_FILE, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') console.error('[SCENES] Could not read scenes file:', error.message);
}
sceneStore.published = sceneStore.published || {};
sceneStore.drafts = sceneStore.drafts || {};
let sceneSaveTimer = null;
function saveScenes() {
  clearTimeout(sceneSaveTimer);
  sceneSaveTimer = setTimeout(() => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFile(SCENES_FILE, JSON.stringify(sceneStore), (error) => {
      if (error) console.error('[SCENES] Could not save scenes file:', error.message);
    });
  }, 300);
}
const landOwnerOf = (parcel) => (accounts.lands[parcel] ? accounts.lands[parcel].owner : null);
// Published scenes whose parcels still belong to the scene owner
const publishedScenes = () => Object.values(sceneStore.published).filter((scene) => scene.scene.parcels.every((parcel) => SceneRules.sameName(landOwnerOf(parcel), scene.owner)));
app.get('/api/scenes', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(publishedScenes());
});


function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createSession(userKey) {
  const token = crypto.randomBytes(32).toString('hex');
  accounts.sessions[token] = { user: userKey, expiresAt: Date.now() + SESSION_TTL_MS };
  saveAccounts();
  return token;
}

function userFromToken(token) {
  const session = typeof token === 'string' ? accounts.sessions[token] : null;
  if (!session || session.expiresAt < Date.now()) return null;
  return accounts.users[session.user] || null;
}

// Simple per-IP rate limit for login and sign-up attempts
const authAttempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const entry = authAttempts.get(ip) || { count: 0, resetAt: now + 5 * 60 * 1000 };
  if (entry.resetAt < now) { entry.count = 0; entry.resetAt = now + 5 * 60 * 1000; }
  entry.count++;
  authAttempts.set(ip, entry);
  return entry.count > 10;
}

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
const DEVICE_KEY_PATTERN = /^[a-f0-9]{64}$/;

// Remembered devices: the browser keeps a random device key and the server
// keeps only its SHA-256, so a returning player reconnects without a password
// even after the session token expired or the server lost its sessions.
function deviceHash(deviceKey) {
  return crypto.createHash('sha256').update(deviceKey).digest('hex');
}
function rememberDevice(user, deviceKey) {
  if (typeof deviceKey !== 'string' || !DEVICE_KEY_PATTERN.test(deviceKey)) return;
  const hash = deviceHash(deviceKey);
  user.devices = (user.devices || []).filter((known) => known !== hash);
  user.devices.push(hash);
  if (user.devices.length > 10) user.devices.shift();
  saveAccounts();
}

app.post('/api/signup', (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const { username, password } = req.body || {};
  if (!USERNAME_PATTERN.test(username || '')) return res.status(400).json({ error: 'Usernames have 3-16 letters, numbers or _.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Passwords need at least 8 characters.' });
  const key = username.toLowerCase();
  if (accounts.users[key]) return res.status(409).json({ error: 'That username is taken. Log in instead?' });
  const salt = crypto.randomBytes(16).toString('hex');
  accounts.users[key] = { username, salt, hash: hashPassword(password, salt), createdAt: Date.now(), inventory: [] };
  rememberDevice(accounts.users[key], req.body.deviceKey);
  res.json({ token: createSession(key), username });
});

app.post('/api/login', (req, res) => {
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const { username, password } = req.body || {};
  const user = typeof username === 'string' ? accounts.users[username.toLowerCase()] : null;
  const candidate = user && typeof password === 'string' ? Buffer.from(hashPassword(password, user.salt), 'hex') : null;
  if (!user || !crypto.timingSafeEqual(candidate, Buffer.from(user.hash, 'hex'))) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  rememberDevice(user, req.body.deviceKey);
  res.json({ token: createSession(username.toLowerCase()), username: user.username });
});

// Daily bonus: +50 MVC every 20 hours (socket "daily_bonus" in the game and
// POST /api/daily from the launcher share the same rule)
const DAILY_BONUS = 50;
const DAILY_EVERY_MS = 20 * 60 * 60 * 1000;
function claimDaily(account) {
  const waitMs = DAILY_EVERY_MS - (Date.now() - (account.lastDaily || 0));
  if (waitMs > 0) return { ok: false, waitMs };
  account.lastDaily = Date.now();
  account.coins = walletOf(account) + DAILY_BONUS;
  saveAccounts();
  return { ok: true };
}

// Launcher (the screen after login): balance and the daily bonus before the world opens
app.get('/api/wallet', (req, res) => {
  const user = userFromToken(req.get('x-session-token'));
  if (!user) return res.status(401).json({ error: 'Session expired.' });
  res.json({ username: user.username, coins: walletOf(user), nextDailyInMs: Math.max(0, DAILY_EVERY_MS - (Date.now() - (user.lastDaily || 0))) });
});
app.post('/api/daily', (req, res) => {
  const user = userFromToken(req.get('x-session-token'));
  if (!user) return res.status(401).json({ error: 'Session expired.' });
  const result = claimDaily(user);
  if (!result.ok) return res.status(429).json({ error: `Daily bonus already claimed. Come back in ${Math.ceil(result.waitMs / 3600000)} h.`, nextDailyInMs: result.waitMs, coins: walletOf(user) });
  res.json({ coins: user.coins, earned: DAILY_BONUS, nextDailyInMs: DAILY_EVERY_MS });
});

// Reconnect a remembered device. If the account no longer exists (a server
// with a fresh database, e.g. after a redeploy on a host without a persistent
// disk), it is recreated for this device so the player is never stuck.
app.post('/api/resume', (req, res) => {
  const { username, deviceKey } = req.body || {};
  if (!USERNAME_PATTERN.test(username || '') || typeof deviceKey !== 'string' || !DEVICE_KEY_PATTERN.test(deviceKey)) return res.status(400).json({ error: 'Invalid device.' });
  const key = username.toLowerCase();
  const user = accounts.users[key];
  if (user) {
    if (!(user.devices || []).includes(deviceHash(deviceKey))) return res.status(401).json({ error: 'Please log in on this device.' });
    return res.json({ token: createSession(key), username: user.username });
  }
  if (rateLimited(req.ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  const salt = crypto.randomBytes(16).toString('hex');
  accounts.users[key] = { username, salt, hash: hashPassword(crypto.randomBytes(24).toString('hex'), salt), createdAt: Date.now(), inventory: [], restored: true };
  rememberDevice(accounts.users[key], deviceKey);
  res.json({ token: createSession(key), username, restored: true });
});

// Attach this browser's device key to an already signed-in account
app.post('/api/device', (req, res) => {
  const user = userFromToken(req.get('x-session-token'));
  if (!user) return res.status(401).json({ error: 'Session expired.' });
  rememberDevice(user, (req.body || {}).deviceKey);
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const user = userFromToken(req.get('x-session-token'));
  if (!user) return res.status(401).json({ error: 'Session expired.' });
  // Sliding session: every visit keeps you signed in for another 30 days
  const session = accounts.sessions[req.get('x-session-token')];
  if (session && session.expiresAt - Date.now() < SESSION_TTL_MS - 24 * 60 * 60 * 1000) { session.expiresAt = Date.now() + SESSION_TTL_MS; saveAccounts(); }
  res.json({ username: user.username });
});

app.post('/api/logout', (req, res) => {
  delete accounts.sessions[req.get('x-session-token')];
  saveAccounts();
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// Genius Bar AI (The Orchard Nexus, public/orchard.js): answers questions about
// 3D optimization, spatial audio and SDK scripting. With ANTHROPIC_API_KEY set
// it asks Claude (the key never leaves the server); without it, it answers
// offline with a curated tip picked by keyword.
// ----------------------------------------------------------------------------
const GENIUS_MAX_QUESTION = 500;
const GENIUS_SYSTEM_PROMPT = 'You are the Genius Bar AI in GitHub Multiverse, a developer metaverse. Answer concisely about 3D optimization, spatial audio and metaverse SDK scripting.';
const GENIUS_TIPS = [
  { keywords: ['gltf', 'glb', 'model', 'export', 'blender', 'file size'], answer: 'glTF optimization: export .glb (binary), apply transforms, remove unused nodes, materials and animations, merge meshes that share a material, and run gltf-transform (dedup, prune, weld, quantize) before shipping. Keep each scene file small so it streams fast.' },
  { keywords: ['draco', 'compress', 'meshopt', 'geometry size'], answer: 'Draco (or meshoptimizer) compresses glTF geometry 5-10x. Use gltf-transform draco (or meshopt) and load it with DRACOLoader/MeshoptDecoder in three.js. Decoding costs a little CPU on load, so keep it for heavy meshes, not tiny props.' },
  { keywords: ['texture', 'atlas', 'ktx2', 'basis', 'mipmap', 'png', 'jpg'], answer: 'Texture atlases pack many small textures into one image so many meshes can share one material (fewer draw calls). Use power-of-two sizes (512-2048), KTX2/Basis Universal for GPU-compressed textures, and keep mipmaps on to avoid shimmering.' },
  { keywords: ['lod', 'level of detail', 'distance', 'far away', 'polygon', 'poly'], answer: 'Levels of detail (LODs): ship 2-3 versions of heavy models (100%, ~40%, ~10% triangles) and switch by camera distance (THREE.LOD in three.js). Past a certain distance, replace the model with an impostor billboard or hide it completely.' },
  { keywords: ['instanc', 'draw call', 'repeated', 'many objects', 'trees', 'grass'], answer: 'Instancing: anything repeated more than ~30 times (trees, chairs, lamps) should be one THREE.InstancedMesh with a matrix per copy. That turns hundreds of draw calls into one. Update instanceMatrix only when copies move and set needsUpdate = true.' },
  { keywords: ['spatial audio', 'rolloff', 'panner', 'hrtf', 'positional', 'distance model'], answer: 'Spatial audio rolloff: use a PannerNode (THREE.PositionalAudio) with panningModel "HRTF", distanceModel "inverse", refDistance about 1-2 m, rolloffFactor about 1 and a maxDistance where the sound should fade out. Linear rolloff sounds unnatural; exponential suits small loud sources.' },
  { keywords: ['audio', 'sound', 'music', 'reverb', 'occlusion', 'listener'], answer: 'Spatial audio basics: attach the AudioListener to the camera, give every sound source a position, add a ConvolverNode reverb per room type, and lower the volume with a low-pass filter when a wall blocks the line of sight (cheap occlusion). Stream long music, preload short effects.' },
  { keywords: ['sdk7', 'decentraland', 'component', 'system', 'ecs', 'entity'], answer: 'Decentraland SDK7 is ECS: entities are ids, components hold data (Transform, MeshRenderer, custom components via engine.defineComponent) and systems are functions run every frame (engine.addSystem((dt) => {...})). Query entities with engine.getEntitiesWith(Component) and keep systems small and data-driven.' },
  { keywords: ['collider', 'collision', 'physics', 'raycast', 'walk'], answer: 'Colliders: never collide against the render mesh of a detailed model. Use simple invisible boxes (MeshCollider box/plane in SDK7, or a low-poly proxy) on the collision layer, and disable collisions on decorative and transparent objects so raycasts stay cheap.' },
  { keywords: ['pointer', 'click', 'interact', 'input', 'button', 'event'], answer: 'SDK interactions: in SDK7 use pointerEventsSystem.onPointerDown({ entity, opts: { button: InputAction.IA_PRIMARY, hoverText: "Open" } }, callback). Keep the hover text short, give feedback (sound, animation) immediately and validate anything important on the server.' },
  { keywords: ['performance', 'fps', 'slow', 'lag', 'optimi', 'frame'], answer: 'Performance checklist: count draw calls (renderer.info), merge static meshes by material, instance repeated props, limit real-time lights and shadow casters, cap pixel ratio at 1.5-2, and run per-frame logic only for objects near the player.' },
  { keywords: ['light', 'shadow', 'bake', 'emissive', 'lightmap'], answer: 'Lighting: bake static lighting into lightmaps or vertex colors, fake lamps with emissive materials and additive light cones, and keep one directional light with a tight shadow camera. Point and spot lights are expensive in forward renderers.' }
];
const geniusRequests = new Map();

function geniusRateLimited(ip) {
  const now = Date.now();
  const entry = geniusRequests.get(ip) || { count: 0, resetAt: now + 60 * 1000 };
  if (entry.resetAt < now) { entry.count = 0; entry.resetAt = now + 60 * 1000; }
  entry.count++;
  geniusRequests.set(ip, entry);
  return entry.count > 10;
}

function geniusOfflineAnswer(question) {
  const text = question.toLowerCase();
  let best = null;
  let bestScore = 0;
  GENIUS_TIPS.forEach((tip) => {
    const score = tip.keywords.filter((keyword) => text.includes(keyword)).length;
    if (score > bestScore) { best = tip; bestScore = score; }
  });
  if (best) return best.answer;
  return 'I can help with 3D optimization (glTF, Draco, texture atlases, LODs, instancing), spatial audio (rolloff, HRTF, occlusion) and SDK scripting (SDK7 components and systems, colliders, pointer events). Try asking about one of those.';
}

app.post('/api/genius', async (req, res) => {
  if (geniusRateLimited(req.ip)) return res.status(429).json({ error: 'The Genius Bar is busy. Try again in a minute.' });
  const raw = req.body && typeof req.body.question === 'string' ? req.body.question.trim() : '';
  if (!raw) return res.status(400).json({ error: 'Ask a question first.' });
  const question = raw.slice(0, GENIUS_MAX_QUESTION);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.json({ answer: geniusOfflineAnswer(question), offline: true });
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 600,
        system: GENIUS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: question }]
      }),
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Anthropic API status ${response.status}`);
    const data = await response.json();
    const answer = (data.content || []).filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
    if (!answer || data.stop_reason === 'refusal') return res.json({ answer: geniusOfflineAnswer(question), offline: true });
    res.json({ answer });
  } catch (error) {
    console.error('[GENIUS] AI request failed:', error.message);
    res.json({ answer: geniusOfflineAnswer(question), offline: true });
  }
});

const MAX_CHAT_LENGTH = 200;
const MAX_COORDINATE = 3000;
const TICKS_PER_SECOND = 20; // Minecraft pace: a full day lasts 20 minutes
const MONSTER_RESPAWN_MS = 30000;
const ALLOWED_DAMAGE = new Set([10, 15, 40]);
const CHEST_RESPAWN_MS = 2 * 60 * 1000;
const SUPPLY_DROP_EVERY_MS = Number(process.env.SUPPLY_DROP_EVERY_MS) || 3 * 60 * 1000;
const SUPPLY_DROP_FALL_MS = 20000;
const LOOT_REACH = 7;
const DECOR_ITEMS = new Set(['tree', 'lamp', 'banner', 'fountain', 'duck', 'flag', 'neon', 'bench']);
const WEARABLES = new Set(['hoodie', 'mug', 'cap', 'headphones', 'hammer']); // the crown only comes from Legendary loot

// Active tracking memory for connected developers network clients
const activeDevelopers = {};

// ----------------------------------------------------------------------------
// Shared world state: time of day, weather and the interactive districts
// ----------------------------------------------------------------------------
const worldState = { ticks: 1000, cycle: true, weather: 'clear', changedAt: Date.now() };

function currentTicks() {
  const elapsed = worldState.cycle ? ((Date.now() - worldState.changedAt) / 1000) * TICKS_PER_SECOND : 0;
  return (worldState.ticks + elapsed) % 24000;
}

function worldStatePayload(extra = {}) {
  return { ticks: currentTicks(), cycle: worldState.cycle, weather: worldState.weather, elapsedMs: 0, ...extra };
}

// Debug Dungeon monsters are read from the map file so the server owns their health
// District maps live in public/maps/districts.json (a separate file wins if it exists)
function readMap(file) {
  const separate = path.join(PUBLIC_DIR, 'maps', file);
  if (fs.existsSync(separate)) return JSON.parse(fs.readFileSync(separate, 'utf8'));
  return JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'maps', 'districts.json'), 'utf8')).maps[file];
}
const dungeonMap = readMap('map_debug_dungeon.json');
const monsters = {};
dungeonMap.blocks.filter((block) => block.id && block.hp).forEach((block) => {
  monsters[block.id] = { name: block.label, maxHp: block.hp, hp: block.hp, alive: true };
});

const gameState = {
  scores: {},
  murals: {},
  decorations: { slot1: { item: 'tree' }, slot2: { item: 'lamp' }, slot3: { item: 'banner', color: '#8250df' }, slot4: { item: 'duck' }, slot5: { item: 'tree' }, slot6: { item: 'lamp' }, slot7: { item: 'flag', color: '#2da44e' }, slot8: { item: 'bench' } },
  pullRequests: [],
  stream: null,
  trees: []
};

// ----------------------------------------------------------------------------
// Fortnite-style loot: chests on the streets and supply drops from the sky
// ----------------------------------------------------------------------------
const lootTable = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'maps', 'loot.json'), 'utf8'));
const lootSpawns = {};
lootTable.spawns.forEach((spawn, index) => {
  lootSpawns[`chest${index}`] = { id: `chest${index}`, kind: 'chest', x: spawn.x, z: spawn.z, area: spawn.area, openUntil: 0 };
});
let supplyDropCounter = 0;

function publicLoot() {
  return Object.values(lootSpawns).map(({ id, kind, x, z, area, openUntil, landsAt }) => ({ id, kind, x, z, area, open: openUntil > Date.now(), landsAt }));
}

function rollItem(kind) {
  const weightKey = kind === 'drop' ? 'dropWeight' : 'chestWeight';
  const rarities = Object.entries(lootTable.rarities).filter(([, rarity]) => rarity[weightKey] > 0);
  let roll = Math.random() * rarities.reduce((sum, [, rarity]) => sum + rarity[weightKey], 0);
  const [rarityKey] = rarities.find(([, rarity]) => (roll -= rarity[weightKey]) < 0) || rarities[0];
  const options = lootTable.items.filter((item) => item.rarity === rarityKey);
  return options[Math.floor(Math.random() * options.length)];
}

function spawnSupplyDrop() {
  if (!Object.keys(activeDevelopers).length) return;
  const spot = lootTable.spawns[Math.floor(Math.random() * lootTable.spawns.length)];
  const id = `drop${++supplyDropCounter}`;
  lootSpawns[id] = { id, kind: 'drop', x: spot.x + (Math.random() - 0.5) * 6, z: spot.z + (Math.random() - 0.5) * 6, area: spot.area, openUntil: 0, landsAt: Date.now() + SUPPLY_DROP_FALL_MS };
  io.emit('loot_spawned', publicLoot().find((loot) => loot.id === id));
  io.emit('system_message', `A SUPPLY DROP is falling over ${spot.area}! First dev to reach it gets Rare-to-Legendary loot.`);
  // Unopened drops disappear after five minutes
  setTimeout(() => {
    if (lootSpawns[id] && !lootSpawns[id].openUntil) { delete lootSpawns[id]; io.emit('loot_removed', id); }
  }, 5 * 60 * 1000);
}
setInterval(spawnSupplyDrop, SUPPLY_DROP_EVERY_MS);

// ----------------------------------------------------------------------------
// Community events (public/maps/events.json): the board lists them, stages
// stream them, and a background validator rewards presence. Every 15 s the
// server checks where each developer is (the position the game reports); a
// player who stays inside the stage radius of a LIVE event for N continuous
// minutes gets the reward once per event (stored in the account).
// ----------------------------------------------------------------------------
const EVENTS_FILE = path.join(PUBLIC_DIR, 'maps', 'events.json');
let eventsCache = { mtime: -1, data: { attendance: { radius: 28, minutes: 5, reward: 100 }, events: [] } };
function loadEvents() {
  try {
    const mtime = fs.statSync(EVENTS_FILE).mtimeMs;
    if (mtime !== eventsCache.mtime) {
      const data = JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8'));
      const events = (Array.isArray(data.events) ? data.events : []).filter((event) => event && typeof event.id === 'string'
        && !Number.isNaN(Date.parse(event.dataHoraInicio)) && !Number.isNaN(Date.parse(event.dataHoraFim))
        && event.coordenadasDestino && Number.isFinite(event.coordenadasDestino.x) && Number.isFinite(event.coordenadasDestino.y));
      eventsCache = { mtime, data: { attendance: { radius: 28, minutes: 5, reward: 100, ...(data.attendance || {}) }, events } };
    }
  } catch (error) {
    console.error('[EVENTS] Could not read events.json:', error.message);
  }
  return eventsCache.data;
}

app.get('/api/events', (req, res) => {
  const { attendance, events } = loadEvents();
  res.set('Cache-Control', 'no-cache');
  // serverTime lets every browser correct its own clock for the countdowns
  res.json({ serverTime: Date.now(), attendance, events });
});

const attendanceTimers = new Map(); // "username|eventId" -> { since, lastSeen }
setInterval(() => {
  const { attendance, events } = loadEvents();
  const now = Date.now();
  const live = events.filter((event) => Date.parse(event.dataHoraInicio) <= now && now < Date.parse(event.dataHoraFim));
  if (!live.length) return;
  for (const [socketId, dev] of Object.entries(activeDevelopers)) {
    const socket = io.sockets.sockets.get(socketId);
    const account = socket && accounts.users[socket.data.userKey];
    if (!account) continue;
    account.eventRewards = account.eventRewards || {};
    for (const event of live) {
      if (account.eventRewards[event.id]) continue;
      const key = `${account.username}|${event.id}`;
      const target = event.coordenadasDestino;
      const inside = Math.hypot(dev.position.x - target.x, dev.position.z - target.y) < attendance.radius && dev.position.y > -20;
      if (!inside) { attendanceTimers.delete(key); continue; }
      const entry = attendanceTimers.get(key);
      if (!entry || now - entry.lastSeen > 40000) {
        attendanceTimers.set(key, { since: now, lastSeen: now });
        socket.emit('event_presence', { eventId: event.id, title: event.titulo, minutes: attendance.minutes });
        continue;
      }
      entry.lastSeen = now;
      if (now - entry.since < attendance.minutes * 60000) continue;
      attendanceTimers.delete(key);
      account.eventRewards[event.id] = now;
      account.coins = walletOf(account) + attendance.reward;
      saveAccounts();
      socket.emit('wallet', { coins: account.coins, earned: attendance.reward, reason: `attendance at ${event.titulo}` });
      socket.emit('event_reward', { eventId: event.id, title: event.titulo, reward: attendance.reward });
    }
  }
}, 15000);

// Underground Cafe menu (prices are read here so the client cannot change them)
const cafeMenu = JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'maps', 'cafe_menu.json'), 'utf8'));
const cafeItems = new Map(cafeMenu.sections.flatMap((section) => section.items).map((item) => [item.id, item]));
const AVATAR_OPTIONS = {
  color: ['#c7ceea', '#b5ead7', '#ffdac1', '#ff9aa2', '#e2f0cb', '#a0c4ff', '#ffd166', '#f1f3f5', '#2b2d42', '#ff70a6'],
  eyes: ['none', 'pixel', 'round', 'visor', 'heart'],
  body: ['none', 'leather', 'puffer', 'varsity', 'hoodie', 'tuxedo'],
  head: ['none', 'cap', 'beanie', 'tophat', 'crown', 'headphones', 'halo'],
  bodyColor: ['#212529', '#c92a2a', '#1864ab', '#2b8a3e', '#f08c00', '#862e9c', '#f8f9fa']
};
const sharedCodeBlocks = new Map(); // Codify blocks their owners chose to share
const VEHICLES = new Set(['rosso', 'wedge', 'volt', 'cyberwedge', 'cycle', 'cycleRed']);
const EMOTES = new Set(['wave', 'dance', 'cheer', 'clap', 'sit', 'think', 'ship', 'coffee']);

function commitLeaderboard() {
  return Object.values(accounts.users).filter((user) => user.commits).map((user) => [user.username, user.commits]).sort((a, b) => b[1] - a[1]).slice(0, 10);
}

function publicGameState() {
  const monsterState = {};
  Object.entries(monsters).forEach(([id, monster]) => { monsterState[id] = { hp: monster.hp, alive: monster.alive }; });
  return { ...gameState, monsters: monsterState };
}

function sanitizePosition(position) {
  if (!position || typeof position !== 'object') return null;
  const axes = ['x', 'y', 'z'].map((axis) => Number(position[axis]));
  if (axes.some((value) => !Number.isFinite(value))) return null;
  const [x, y, z] = axes.map((value) => Math.max(-MAX_COORDINATE, Math.min(MAX_COORDINATE, value)));
  return { x, y, z };
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, maxLength) : '';
}

function pullRequestsPayload(message) {
  return { pullRequests: gameState.pullRequests.slice(-40), decorations: gameState.decorations, message };
}

// Only YouTube and Twitch embeds are accepted for the Keynote screen
function toEmbedUrl(rawUrl, hostForTwitch) {
  let url;
  try { url = new URL(rawUrl); } catch (error) { return null; }
  const host = url.hostname.replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const videoId = url.searchParams.get('v') || (url.pathname.startsWith('/live/') ? url.pathname.split('/')[2] : null);
    return videoId && /^[\w-]{6,20}$/.test(videoId) ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : null;
  }
  if (host === 'youtu.be') {
    const videoId = url.pathname.slice(1);
    return /^[\w-]{6,20}$/.test(videoId) ? `https://www.youtube.com/embed/${videoId}?autoplay=1` : null;
  }
  if (host === 'twitch.tv') {
    const channel = url.pathname.split('/')[1];
    return /^\w{3,25}$/.test(channel || '') ? `https://player.twitch.tv/?channel=${channel}&parent=${hostForTwitch}` : null;
  }
  return null;
}

// Only logged-in developers can join the multiverse
io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth && socket.handshake.auth.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.userKey = user.username.toLowerCase();
  // Private lobbies: devs only see and hear others in the same lobby (default: public)
  const lobby = typeof socket.handshake.auth.lobby === 'string' ? socket.handshake.auth.lobby.replace(/[^a-z0-9]/gi, '').slice(0, 12) : '';
  socket.data.room = lobby ? `lobby:${lobby}` : 'lobby:public';
  next();
});

// This manages every developer that connects to your multiverse environment cluster
io.on('connection', (socket) => {
  const account = accounts.users[socket.data.userKey];
  const developerTag = account.username;

  // Assigns initial state parameters to the joining tridimensional cursor mesh pointer
  activeDevelopers[socket.id] = {
    id: socket.id,
    devTag: developerTag,
    position: { x: 0, y: 1, z: 0 },
    color: (account.avatar && account.avatar.color) || getRandomPastelColor(),
    avatar: account.avatar || null,
    wearable: null
  };

  console.log(`[NETWORK] Developer registered: ${developerTag} (${socket.id})`);

  socket.emit('local_registration_success', activeDevelopers[socket.id]);
  const room = socket.data.room;
  socket.join(room);
  activeDevelopers[socket.id].room = room;
  socket.emit('sync_entire_developer_pool', Object.values(activeDevelopers).filter((peer) => peer.room === room));
  socket.emit('commit_leaderboard', commitLeaderboard());
  socket.emit('world_state', worldStatePayload());
  socket.emit('game_state', publicGameState());
  socket.emit('loot_spawns', publicLoot());
  socket.emit('tech_feeds', TechFeeds.snapshot());
  socket.to(room).emit('new_developer_joined', activeDevelopers[socket.id]);

  const developer = () => activeDevelopers[socket.id];

  // Synchronizes real-time coordinates transform movements across the whole city
  socket.on('update_cursor_transform', (transformData) => {
    const position = sanitizePosition(transformData && transformData.position);
    if (!developer() || !position) return;
    developer().position = position;
    socket.to(room).emit('peer_cursor_transformed', { id: socket.id, position });
  });

  socket.on('chat_message', (rawText) => {
    const text = cleanText(rawText, MAX_CHAT_LENGTH);
    if (!developer() || !text) return;
    io.to(room).emit('chat_message', { id: socket.id, devTag: developer().devTag, color: developer().color, text, timestamp: Date.now() });
  });

  socket.on('private_message', ({ targetId, text } = {}) => {
    const target = activeDevelopers[targetId];
    const cleanMessage = cleanText(text, MAX_CHAT_LENGTH);
    if (!developer() || !target || !cleanMessage) return;
    const message = { fromId: socket.id, devTag: developer().devTag, toTag: target.devTag, color: developer().color, text: cleanMessage };
    io.to(targetId).emit('private_message', message);
    socket.emit('private_message', message);
  });

  socket.on('set_nick', () => {
    socket.emit('system_message', 'Your name is your account username. Create a new account to use another name.');
  });

  // Avatar customization (cursor color, eyewear, jacket, hat), saved on the account
  socket.on('set_avatar', (look = {}) => {
    const dev = developer();
    if (!dev || typeof look !== 'object') return;
    const clean = {};
    Object.entries(AVATAR_OPTIONS).forEach(([key, allowed]) => { clean[key] = allowed.includes(look[key]) ? look[key] : allowed[0]; });
    account.avatar = clean;
    dev.avatar = clean;
    dev.color = clean.color;
    saveAccounts();
    io.to(room).emit('peer_updated', { id: socket.id, devTag: dev.devTag, avatar: clean, color: clean.color });
  });

  socket.on('set_wearable', (item) => {
    if (!developer()) return;
    developer().wearable = WEARABLES.has(item) ? item : null;
    io.to(room).emit('peer_updated', { id: socket.id, devTag: developer().devTag, wearable: developer().wearable });
  });

  // Minecraft-style /time, /gamerule doDaylightCycle and /weather (shared by everyone)
  socket.on('world_state_change', (change = {}) => {
    if (!developer()) return;
    let kind = null;
    if (typeof change.ticks === 'number' && Number.isFinite(change.ticks)) {
      worldState.ticks = ((change.ticks % 24000) + 24000) % 24000;
      worldState.changedAt = Date.now();
      kind = 'time';
    }
    if (typeof change.cycle === 'boolean') {
      worldState.ticks = currentTicks();
      worldState.changedAt = Date.now();
      worldState.cycle = change.cycle;
      kind = 'cycle';
    }
    if (['clear', 'rain', 'snow', 'thunder'].includes(change.weather)) {
      worldState.weather = change.weather;
      kind = 'weather';
    }
    if (kind) io.emit('world_state', worldStatePayload({ by: developer().devTag, kind }));
  });

  // Teleport requests always need the other player's consent (/tpa, /tpahere, /tpaccept)
  socket.on('teleport_request', ({ targetId, mode } = {}) => {
    if (!developer() || !activeDevelopers[targetId] || targetId === socket.id) return;
    io.to(targetId).emit('teleport_request', { fromId: socket.id, fromTag: developer().devTag, mode: mode === 'here' ? 'here' : 'to' });
  });
  socket.on('teleport_accept', ({ requesterId, mode } = {}) => {
    if (!developer() || !activeDevelopers[requesterId]) return;
    io.to(requesterId).emit('teleport_accepted', { byId: socket.id, byTag: developer().devTag, mode: mode === 'here' ? 'here' : 'to' });
  });
  socket.on('teleport_deny', ({ requesterId } = {}) => {
    if (!developer() || !activeDevelopers[requesterId]) return;
    io.to(requesterId).emit('teleport_denied', { byTag: developer().devTag });
  });

  // Debug Dungeon: co-op bug squashing with server-owned health
  socket.on('monster_hit', ({ id, damage } = {}) => {
    const monster = monsters[id];
    if (!developer() || !monster || !monster.alive || !ALLOWED_DAMAGE.has(damage)) return;
    if (developer().lensUntil > Date.now()) damage *= 2; // Debugger Lens buff
    monster.hp = Math.max(0, monster.hp - damage);
    monster.alive = monster.hp > 0;
    io.emit('monster_update', { id, hp: monster.hp, alive: monster.alive, by: developer().devTag, damage });
    if (!monster.alive) {
      gameState.scores[developer().devTag] = (gameState.scores[developer().devTag] || 0) + 1;
      io.emit('scores', gameState.scores);
      setTimeout(() => {
        monster.hp = monster.maxHp;
        monster.alive = true;
        io.emit('monster_update', { id, hp: monster.hp, alive: true });
      }, MONSTER_RESPAWN_MS);
    }
  });

  // Open Source HQ: code murals and visual pull requests
  socket.on('mural_post', ({ muralId, text } = {}) => {
    const cleanCode = cleanText(text, 80);
    if (!developer() || !/^mural[1-4]$/.test(muralId || '') || !cleanCode) return;
    gameState.murals[muralId] = [...(gameState.murals[muralId] || []), { devTag: developer().devTag, text: cleanCode }].slice(-30);
    io.emit('murals', gameState.murals);
  });

  socket.on('pr_open', ({ slot, item, color } = {}) => {
    if (!developer() || !(slot >= 1 && slot <= 8) || !DECOR_ITEMS.has(item)) return;
    const pr = {
      id: gameState.pullRequests.length + 1,
      slot: Math.floor(slot),
      item,
      color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : null,
      author: developer().devTag,
      authorId: socket.id,
      approvals: [],
      status: 'open'
    };
    gameState.pullRequests.push(pr);
    io.emit('pull_requests', pullRequestsPayload(`${pr.author} opened PR #${pr.id}: slot ${pr.slot} -> ${pr.item}. Another dev must /approve ${pr.id} before /merge.`));
  });

  socket.on('pr_review', ({ id, action } = {}) => {
    const pr = gameState.pullRequests.find((candidate) => candidate.id === id);
    if (!developer() || !pr) return;
    if (pr.status !== 'open') { socket.emit('system_message', `PR #${id} is already ${pr.status}.`); return; }
    const reviewer = developer().devTag;
    if (action === 'approve') {
      if (pr.authorId === socket.id) { socket.emit('system_message', 'You cannot approve your own pull request.'); return; }
      if (!pr.approvals.includes(reviewer)) pr.approvals.push(reviewer);
      io.emit('pull_requests', pullRequestsPayload(`${reviewer} approved PR #${id}.`));
    } else if (action === 'merge') {
      // Like a protected branch: one approval from someone else, unless the author is alone online
      const aloneOnline = Object.keys(activeDevelopers).length === 1;
      if (!pr.approvals.length && !aloneOnline) { socket.emit('system_message', `PR #${id} needs an approval from another dev first.`); return; }
      pr.status = 'merged';
      gameState.decorations[`slot${pr.slot}`] = { item: pr.item, color: pr.color };
      io.emit('pull_requests', pullRequestsPayload(`${reviewer} merged PR #${id}: slot ${pr.slot} is now a ${pr.item}!`));
    } else if (action === 'close') {
      pr.status = 'closed';
      io.emit('pull_requests', pullRequestsPayload(`${reviewer} closed PR #${id}.`));
    }
  });

  // Keynote Amphitheater live stream
  socket.on('stream_set', ({ url, title } = {}) => {
    if (!developer()) return;
    if (url === null) { gameState.stream = null; io.emit('stream', null); io.emit('system_message', `${developer().devTag} ended the live stream. The screen is back to the keynote playlist.`); return; }
    const host = (socket.handshake.headers.host || 'localhost').split(':')[0];
    const embedUrl = toEmbedUrl(url, host);
    if (!embedUrl) { socket.emit('system_message', 'Only YouTube and Twitch links are supported.'); return; }
    gameState.stream = { embedUrl, title: cleanText(title, 40) || 'Tech Keynote', by: developer().devTag };
    io.emit('stream', gameState.stream);
  });

  // Green-Tech Sandbox community trees
  socket.on('plant_tree', (position) => {
    const clean = sanitizePosition(position);
    if (!developer() || !clean) return;
    const planted = gameState.trees.filter((tree) => tree.devTag === developer().devTag).length;
    if (planted >= 10) { socket.emit('system_message', 'You already planted 10 trees. Let them grow!'); return; }
    gameState.trees = [...gameState.trees, { ...clean, devTag: developer().devTag }].slice(-150);
    io.emit('trees', gameState.trees);
    io.emit('system_message', `${developer().devTag} planted a tree in the Green-Tech Sandbox. Renewable energy: ${Math.min(100, 40 + gameState.trees.length * 2)}%`);
  });

  // Gravity Flip tower reward: a rare wearable, at most once every 30 minutes
  socket.on('tower_reward', () => {
    const dev = developer();
    if (!dev) return;
    const now = Date.now();
    if (now - (account.lastTowerReward || 0) < 30 * 60 * 1000) { socket.emit('system_message', 'You already claimed the Gravity Flip reward. Come back in 30 minutes!'); return; }
    account.lastTowerReward = now;
    account.coins = walletOf(account) + 50;
    socket.emit('wallet', { coins: account.coins, earned: 50, reason: 'Gravity Flip reward' });
    saveAccounts();
    const prize = lootTable.items.filter((item) => item.rarity === 'epic' || item.rarity === 'legendary');
    socket.emit('loot_result', { item: prize[Math.floor(Math.random() * prize.length)].id, from: 'drop' });
    io.to(room).emit('system_message', `${dev.devTag} conquered the Gravity Flip tower and earned a rare code file!`);
  });

  // Vehicles from the Hypercar Showroom, shown to everyone in the lobby
  socket.emit('packages', account.packages || []);
  socket.on('daily_bonus', () => {
    const result = claimDaily(account);
    if (!result.ok) { socket.emit('system_message', `Daily bonus already claimed. Come back in ${Math.ceil(result.waitMs / 3600000)} h.`); return; }
    socket.emit('wallet', { coins: account.coins, earned: DAILY_BONUS, reason: 'daily bonus' });
  });

  // Underground Cafe: order dishes (code & tool packages) and drinks with MVC
  socket.on('cafe_order', ({ id } = {}) => {
    const dev = developer();
    const item = cafeItems.get(id);
    if (!dev || !item) return;
    const now = Date.now();
    if (now - (dev.lastOrderAt || 0) < 1500) return;
    dev.lastOrderAt = now;
    if (walletOf(account) < item.price) { socket.emit('system_message', `${item.name} costs ${item.price} MVC and you have ${account.coins}. Earn coins with commits, chests and supply drops.`); return; }
    account.coins -= item.price;
    saveAccounts();
    socket.emit('wallet', { coins: account.coins, spent: item.price, reason: item.name });
    account.packages = [...new Set([...(account.packages || []), item.id])];
    saveAccounts();
    socket.emit('cafe_served', { id: item.id });
    socket.emit('packages', account.packages);
    socket.to(room).emit('system_message', `${dev.devTag} ordered a ${item.name} at the Underground Cafe.`);
  });

  // Hotels: sleep in a bed at night; when at least half of the online devs are
  // asleep the night is skipped for everyone (like Minecraft)
  socket.on('sleep', (sleeping) => {
    const dev = developer();
    if (!dev) return;
    const ticks = currentTicks();
    const night = ticks > 12500 && ticks < 23500;
    if (sleeping && !night) { socket.emit('system_message', 'You can only sleep at night. Your spawn point was set to this bed.'); return; }
    dev.sleeping = !!sleeping;
    if (!sleeping) return;
    const online = Object.values(activeDevelopers);
    const asleep = online.filter((other) => other.sleeping).length;
    const needed = Math.max(1, Math.ceil(online.length / 2));
    if (asleep < needed) { io.emit('system_message', `${dev.devTag} is sleeping (${asleep}/${needed} devs needed to skip the night).`); return; }
    worldState.ticks = 0;
    worldState.changedAt = Date.now();
    online.forEach((other) => { other.sleeping = false; });
    io.emit('world_state', worldStatePayload({ by: dev.devTag, kind: 'time' }));
    io.emit('system_message', 'Enough devs slept through the night. Good morning, Genesis City!');
    io.emit('wake_up');
  });

  // Codify: code blocks are private by default; only blocks the owner chose to
  // share are relayed to the devs of the same lobby (and to newcomers)
  socket.emit('code_blocks', [...sharedCodeBlocks.values()].filter((block) => block.room === room).map((block) => block.data));
  socket.on('code_block_share', (data) => {
    const dev = developer();
    if (!dev || !data || typeof data.id !== 'string' || typeof data.code !== 'string') return;
    const id = data.id.slice(0, 60);
    const existing = sharedCodeBlocks.get(id);
    if (existing && existing.socketId !== socket.id) return;
    const position = data.position || {};
    const clean = {
      id,
      owner: dev.devTag,
      language: String(data.language || 'javascript').replace(/[^a-z]/g, '').slice(0, 12),
      code: data.code.slice(0, 4000),
      position: { x: Number(position.x) || 0, y: Number(position.y) || 0, z: Number(position.z) || 0 }
    };
    if (!existing && [...sharedCodeBlocks.values()].filter((block) => block.socketId === socket.id).length >= 10) return;
    sharedCodeBlocks.set(id, { socketId: socket.id, room, data: clean });
    socket.to(room).emit('code_block', clean);
  });
  socket.on('code_block_remove', (id) => {
    const block = sharedCodeBlocks.get(id);
    if (!block || block.socketId !== socket.id) return;
    sharedCodeBlocks.delete(id);
    socket.to(room).emit('code_block_remove', id);
  });

  // Economy: wallet, land parcels and transfers between devs
  socket.emit('wallet', { coins: walletOf(account) });
  socket.emit('lands', accounts.lands);
  // Why a parcel cannot be bought right now (null when it can)
  function landProblem(parcel) {
    if (typeof parcel !== 'string' || !/^-?\d{1,3},-?\d{1,3}$/.test(parcel)) return 'Invalid parcel.';
    const [px, pz] = parcel.split(',').map(Number);
    if (px < -MAX_PARCEL || px >= MAX_PARCEL || pz < -MAX_PARCEL || pz >= MAX_PARCEL) return 'That parcel is outside Genesis City.';
    const inCore = px >= -CORE_PARCELS && px < CORE_PARCELS && pz >= -CORE_PARCELS && pz < CORE_PARCELS;
    if (inSea(px, pz)) return 'That parcel is open sea. Islands can be bought, the water cannot.';
    if (isRoadParcel(px, pz)) return 'That parcel is a road. Pick a green parcel next to it.';
    if (!inCore && isSceneParcel(px, pz)) return 'That parcel already has a community scene.';
    if (accounts.lands[parcel]) return `Parcel ${parcel} already belongs to ${accounts.lands[parcel].owner}.`;
    if (pendingParcels.has(parcel)) return `Someone is buying parcel ${parcel} right now.`;
    return null;
  }

  function grantParcel(parcel, how) {
    accounts.lands[parcel] = { owner: account.username, boughtAt: Date.now(), ...how };
    saveAccounts();
    io.emit('lands', accounts.lands);
    io.emit('system_message', `${developer().devTag} bought parcel ${parcel} in Genesis City!`);
  }

  socket.on('buy_land', ({ parcel } = {}) => {
    const dev = developer();
    if (!dev) return;
    const problem = landProblem(parcel);
    if (problem) { socket.emit('system_message', problem); return; }
    if (walletOf(account) < LAND_PRICE) { socket.emit('system_message', `You need ${LAND_PRICE} MVC to buy a parcel (you have ${account.coins}). Earn coins with commits, chests and supply drops.`); return; }
    account.coins -= LAND_PRICE;
    socket.emit('wallet', { coins: account.coins, spent: LAND_PRICE, reason: `parcel ${parcel}` });
    grantParcel(parcel, { paidWith: 'in-game' });
  });

  // --------------------------------------------------------------------------
  // Scenes: load the drafts of an estate, save a draft, publish to everyone
  // --------------------------------------------------------------------------
  socket.emit('scenes', publishedScenes());
  const reply = (ack, payload) => { if (typeof ack === 'function') ack(payload); };
  socket.on('scene_load', ({ parcels } = {}, ack) => {
    if (!Array.isArray(parcels)) { reply(ack, { ok: false, error: 'Invalid parcels.' }); return; }
    const wanted = new Set(parcels.slice(0, SceneRules.MAX_PARCELS).map(String));
    const found = {};
    [sceneStore.published, sceneStore.drafts].forEach((bucket) => Object.values(bucket).forEach((scene) => {
      if (SceneRules.sameName(scene.owner, account.username) && scene.scene.parcels.some((parcel) => wanted.has(parcel))) found[scene.scene.base] = scene;
    }));
    reply(ack, { ok: true, scenes: Object.values(found) });
  });
  function storeScene(input, publish, ack) {
    const result = SceneRules.validate(input, { owner: account.username, ownerOf: landOwnerOf });
    if (!result.ok) { reply(ack, { ok: false, error: result.error }); return; }
    const scene = { ...result.manifest, updatedAt: Date.now() };
    const id = scene.scene.base;
    const parcels = new Set(scene.scene.parcels);
    // Scenes merged into this one by the Builder (estate grew) are replaced
    const replaced = [];
    [sceneStore.drafts, ...(publish ? [sceneStore.published] : [])].forEach((bucket) => {
      Object.keys(bucket).forEach((otherId) => {
        if (otherId === id || !bucket[otherId].scene.parcels.some((parcel) => parcels.has(parcel))) return;
        if (bucket === sceneStore.published) replaced.push(otherId);
        delete bucket[otherId];
      });
    });
    sceneStore.drafts[id] = scene;
    if (publish) sceneStore.published[id] = scene;
    saveScenes();
    reply(ack, { ok: true, scene, stats: result.stats, limits: result.limits });
    if (publish) {
      io.emit('scene_published', { scene, replaced });
      io.emit('system_message', `${developer().devTag} published the scene "${scene.display.title}" at parcel ${id}. Type /goto ${id} to visit it.`);
    }
  }
  socket.on('scene_save', (manifest, ack) => storeScene(manifest, false, ack));
  socket.on('scene_publish', (manifest, ack) => storeScene(manifest, true, ack));

  // --------------------------------------------------------------------------
  // Web3 (testnet MVC token): link wallet, claim coins, buy land on-chain
  // --------------------------------------------------------------------------
  socket.emit('web3_account', { wallet: account.wallet || null });
  socket.on('web3_account_request', () => socket.emit('web3_account', { wallet: account.wallet || null }));

  socket.on('web3_link_request', () => {
    if (!Web3.enabled) { socket.emit('web3_error', { action: 'link', message: 'The MVC token is not configured on this server.' }); return; }
    socket.emit('web3_link_message', { message: Web3.bindingMessage(account.username) });
  });

  socket.on('web3_link', async ({ address, message, signature } = {}) => {
    if (!Web3.enabled || typeof message !== 'string' || typeof signature !== 'string' || message.length > 500) return;
    try {
      account.wallet = await Web3.verifyBinding(account.username, String(address), message, signature);
      saveAccounts();
      socket.emit('web3_account', { wallet: account.wallet });
    } catch (error) {
      socket.emit('web3_error', { action: 'link', message: error.message });
    }
  });

  // Claim: turns in-game MVC into real testnet MVC in the linked wallet
  socket.on('web3_claim', async ({ amount } = {}) => {
    if (!Web3.enabled) { socket.emit('web3_error', { action: 'claim', message: 'The MVC token is not configured on this server.' }); return; }
    if (!account.wallet) { socket.emit('web3_error', { action: 'claim', message: 'Link your wallet first.' }); return; }
    if (claimsInProgress.has(account.username)) { socket.emit('web3_error', { action: 'claim', message: 'A claim is already in progress.' }); return; }
    const value = Math.floor(Number(amount));
    if (!(value >= 1)) { socket.emit('web3_error', { action: 'claim', message: 'Choose how many MVC to claim.' }); return; }
    if (value > Web3.maxClaim) { socket.emit('web3_error', { action: 'claim', message: `You can claim at most ${Web3.maxClaim} MVC at a time.` }); return; }
    if (walletOf(account) < value) { socket.emit('web3_error', { action: 'claim', message: `You only have ${account.coins} MVC in the game.` }); return; }
    // Reserve the coins first so they cannot be spent twice while the mint is pending
    claimsInProgress.add(account.username);
    account.coins -= value;
    saveAccounts();
    socket.emit('wallet', { coins: account.coins, spent: value, reason: 'claim to wallet (pending)' });
    try {
      const transactionHash = await Web3.mint(account.wallet, value);
      socket.emit('web3_claimed', { amount: value, transactionHash });
    } catch (error) {
      account.coins += value; // refund: nothing was minted
      saveAccounts();
      socket.emit('wallet', { coins: account.coins, earned: value, reason: 'claim refunded' });
      socket.emit('web3_error', { action: 'claim', message: `The claim failed and your ${value} MVC were returned to the game. (${error.message})` });
    } finally {
      claimsInProgress.delete(account.username);
    }
  });

  // Land paid on-chain: the client sends the MVC transfer, the server checks it
  socket.on('buy_land_onchain', async ({ parcel, transactionHash } = {}) => {
    const dev = developer();
    if (!dev || !Web3.enabled) return;
    if (!account.wallet) { socket.emit('web3_error', { action: 'land', parcel, message: 'Link your wallet first.' }); return; }
    const problem = landProblem(parcel);
    if (problem) { socket.emit('web3_error', { action: 'land', parcel, message: `${problem} If you already paid, contact the game admin with your transaction hash.` }); return; }
    pendingParcels.add(parcel);
    try {
      await Web3.verifyPayment(String(transactionHash), account.wallet, LAND_PRICE);
      accounts.web3UsedTransactions = Web3.usedTransactions();
      grantParcel(parcel, { paidWith: 'mvc-token', transactionHash });
      socket.emit('web3_land_bought', { parcel, transactionHash });
    } catch (error) {
      socket.emit('web3_error', { action: 'land', parcel, message: error.message });
    } finally {
      pendingParcels.delete(parcel);
    }
  });

  socket.on('pay', ({ to, amount } = {}) => {
    const dev = developer();
    const value = Math.floor(Number(amount));
    if (!dev || typeof to !== 'string' || !(value >= 1 && value <= 100000)) return;
    const target = accounts.users[to.toLowerCase()];
    if (!target || target === account) { socket.emit('system_message', 'Unknown developer.'); return; }
    if (walletOf(account) < value) { socket.emit('system_message', `Not enough MVC (you have ${account.coins}).`); return; }
    account.coins -= value;
    target.coins = walletOf(target) + value;
    saveAccounts();
    socket.emit('wallet', { coins: account.coins, spent: value, reason: `payment to ${target.username}` });
    Object.entries(activeDevelopers).forEach(([id, other]) => {
      if (other.devTag.toLowerCase() !== target.username.toLowerCase()) return;
      io.to(id).emit('wallet', { coins: target.coins, earned: value, reason: `payment from ${account.username}` });
    });
  });

  socket.on('set_vehicle', (key) => {
    const dev = developer();
    if (!dev) return;
    dev.vehicle = VEHICLES.has(key) ? key : null;
    io.to(room).emit('peer_updated', { id: socket.id, devTag: dev.devTag, vehicle: dev.vehicle });
  });

  // Roblox-style emotes, relayed to the lobby
  socket.on('emote', (emote) => {
    if (!developer() || !EMOTES.has(emote)) return;
    socket.to(room).emit('peer_emote', { id: socket.id, emote });
  });

  // Simulated work: every commit from a laptop is counted on the account
  socket.on('commit', ({ lines } = {}) => {
    const dev = developer();
    const now = Date.now();
    if (!dev || !(lines >= 3) || now - (dev.lastCommitAt || 0) < 5000) return;
    dev.lastCommitAt = now;
    account.commits = (account.commits || 0) + 1;
    // Commits typed in the Underground Tech Hub (below The Glass Cube) give +5
    const bonus = inTechHub(dev.position) ? 5 : 3;
    account.coins = walletOf(account) + bonus;
    socket.emit('wallet', { coins: account.coins, earned: bonus, reason: bonus === 5 ? 'commit in the Tech Hub' : 'commit' });
    saveAccounts();
    io.to(room).emit('system_message', `${dev.devTag} pushed commit #${account.commits} from a laptop (${Math.min(999, Math.floor(lines))} lines).`);
    io.emit('commit_leaderboard', commitLeaderboard());
  });

  // Sent by the client once its loot catalog is loaded
  socket.on('loot_sync', () => {
    socket.emit('loot_spawns', publicLoot());
  });

  // Loot: open a chest or supply drop next to your cursor
  socket.on('loot_open', ({ id } = {}) => {
    const loot = lootSpawns[id];
    const dev = developer();
    if (!dev || !loot) return;
    if (loot.openUntil > Date.now()) { socket.emit('system_message', 'Someone already looted this one.'); return; }
    if (loot.landsAt && loot.landsAt > Date.now()) { socket.emit('system_message', 'The supply drop is still falling!'); return; }
    if (Math.hypot(dev.position.x - loot.x, dev.position.z - loot.z) > LOOT_REACH) { socket.emit('system_message', 'Get closer to open it.'); return; }

    // The loot is a real code file: the client downloads it right away
    const item = rollItem(loot.kind);
    const bonus = loot.kind === 'drop' ? 25 : 5;
    account.coins = walletOf(account) + bonus;
    socket.emit('wallet', { coins: account.coins, earned: bonus, reason: loot.kind === 'drop' ? 'supply drop' : 'chest' });
    saveAccounts();
    socket.emit('loot_result', { item: item.id, from: loot.kind });
    if (loot.kind === 'drop') {
      delete lootSpawns[id];
      io.emit('loot_removed', id);
    } else {
      loot.openUntil = Date.now() + CHEST_RESPAWN_MS;
      io.emit('loot_state', { id, open: true });
      setTimeout(() => io.emit('loot_state', { id, open: false }), CHEST_RESPAWN_MS);
    }
    if (item.rarity === 'legendary' || item.rarity === 'epic') {
      io.emit('system_message', `${dev.devTag} found a ${lootTable.rarities[item.rarity].name.toUpperCase()} ${item.name}!`);
    }
  });

  // Clean-up memory garbage collection sequence triggers when a laptop connection drops down
  socket.on('disconnect', () => {
    if (developer()) {
      console.log(`[NETWORK] Developer disconnected: ${developer().devTag}`);
      delete activeDevelopers[socket.id];
      io.to(room).emit('developer_left_network', socket.id);
      sharedCodeBlocks.forEach((block, id) => {
        if (block.socketId !== socket.id) return;
        sharedCodeBlocks.delete(id);
        io.to(room).emit('code_block_remove', id);
      });
    }
  });
});

// Utility function creating visual styling standards for distinct arrow meshes profiles
function getRandomPastelColor() {
  const pastelColors = ['#ffb7b2', '#ffdac1', '#e2f0cb', '#b5ead7', '#c7ceea', '#ff9aa2', '#a8e6cf'];
  return pastelColors[Math.floor(Math.random() * pastelColors.length)];
}

// Live data for the Tech Square billboards (GitHub, stocks, dev trends)
if (process.env.DISABLE_FEEDS !== '1') {
  TechFeeds.start({
    onUpdate: (snapshot) => io.emit('tech_feeds', snapshot),
    onHighlight: (highlight) => io.emit('feed_highlight', highlight)
  });
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`[ENGINE ACTIVE] GitHub Multiverse cluster rendering successfully deployed on: http://localhost:${PORT}`);
});
