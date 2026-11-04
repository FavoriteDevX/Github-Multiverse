// ============================================================================
// GITHUB MULTIVERSE CLIENT: ENGINE, 3D CURSORS, TELEPORTS, MINIMAP, CHAT COMMANDS, NETWORK
// ============================================================================
const CURSOR_EMIT_INTERVAL_MS = 50;
const CHAT_BUBBLE_DURATION_MS = 7000;
const WALK_SPEED = 10;
const RUN_SPEED = 20;
const JUMP_SPEED = 10;
const GRAVITY = 26;
const STEP_HEIGHT = 1.15; // the avatar climbs stairs and ledges up to this height
const AVATAR_RADIUS = 0.6;
const MAP_VIEW = new THREE.Vector3(0, 170, 150);
const TICKS_PER_SECOND = 20; // Minecraft pace: a full day lasts 20 minutes
const MINIMAP_RADIUS = 180;

let scene, camera, renderer, controls;
let worldRegistry = [];
const places = []; // every teleport destination: districts + Silicon Valley landmarks

let localDeveloperData = null;
let localCursor = null;
let localWearable = null;
const remoteMeshPointers = {};

const raycaster = new THREE.Raycaster();
raycaster.params.Line.threshold = 0.05;
raycaster.params.Points.threshold = 0;
const pointerNDC = new THREE.Vector2();
const clock = new THREE.Clock();
const keysPressed = new Set();
let pointerInsideCanvas = false;
let pointerDirty = false;
let pointerDownAt = null;
let hoveredObject = null;
let hoverPoint = null;
let lastEmitTime = 0;
const lastEmittedPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
// The local 3D cursor is the avatar: it walks, jumps and climbs like a Decentraland avatar
const avatar = { position: new THREE.Vector3(0, 0, 0), velocityY: 0, grounded: true };
let viewMode = 'explore'; // 'explore' (third person) or 'map' (aerial overview)
let flying = false; // Minecraft creative-style flight: press F
let tunnelFall = null; // the 5-second fall down the underground water tunnel
const TUNNEL_FALL_SECONDS = 5;
let lastAltitudeBlur = 0;
let lastAnimatedRefresh = -1;
const firepitProbe = new THREE.Vector3();
let lastFireDistance = Infinity;
const nearbyAnimated = [];
let animatedProbe = null;
let lastEdgeWarning = 0;
let wallet = 0; // Multiverse Coins (in-game only)
let sleepingLocal = false;

function wakeUp() {
  if (!sleepingLocal) return;
  sleepingLocal = false;
  document.body.classList.remove('sleeping');
  if (socket && socket.connected) socket.emit('sleep', false);
}

function bedSpawn() {
  try { const saved = JSON.parse(localStorage.getItem('multiverse-bed')); return saved ? new THREE.Vector3(saved.x, saved.y, saved.z) : null; } catch (error) { return null; }
}
let jumpRequestedAt = -1;
let lastGroundedAt = 0;
let localCommits = 0;
let lastDayPhase = null;
const FLY_SPEED = 16;
// Private lobbies: ?lobby=<id> in the URL puts you in an instance only invited devs can see
const lobbyId = (new URLSearchParams(location.search).get('lobby') || '').replace(/[^a-z0-9]/gi, '').slice(0, 12) || null;
const downRay = new THREE.Raycaster();
const cameraRay = new THREE.Raycaster();
const wallRay = new THREE.Raycaster();
let lastWhisperFrom = null;
let pendingTeleportRequest = null;
let lightningUntil = 0;

const worldClock = { ticks: 1000, at: performance.now(), cycle: true, weather: 'clear' };

// Socket.io only exists when served by server.js; static hosts (e.g. Vercel) fall back to solo mode.
// The connection opens only after the developer signs in (see auth.js).
let socket = null;
let lastPositionBeforeTeleport = null;

const ui = {
  overlay: document.getElementById('ui-overlay-container'),
  district: document.getElementById('hud-world'),
  parcel: document.getElementById('hud-parcel'),
  devTag: document.getElementById('hud-devtag'),
  clock: document.getElementById('hud-clock'),
  connection: document.getElementById('hud-connection'),
  connectionDot: document.getElementById('connection-dot'),
  online: document.getElementById('hud-online'),
  worldsList: document.getElementById('worlds-list'),
  chatLog: document.getElementById('chat-log'),
  chatForm: document.getElementById('chat-form'),
  chatInput: document.getElementById('chat-input'),
  tooltip: document.getElementById('hover-tooltip'),
  infoCard: document.getElementById('info-card'),
  infoTitle: document.getElementById('info-title'),
  infoType: document.getElementById('info-type'),
  infoClose: document.getElementById('info-close'),
  minimap: document.getElementById('minimap'),
  minimapCaption: document.getElementById('minimap-caption'),
  streamModal: document.getElementById('stream-modal'),
  streamFrame: document.getElementById('stream-frame'),
  streamTitle: document.getElementById('stream-title'),
  streamClose: document.getElementById('stream-close'),
  flash: document.getElementById('lightning-flash')
};

// ============================================================================
// QUALITY GOVERNOR: KEEPS THE GAME SMOOTH ON ANY COMPUTER
// ============================================================================
// Levels: 0 minimum, 1 low, 2 medium (default), 3 high. In "auto" mode the
// governor watches the frame rate and lowers resolution, then shadows, then
// the distance of small details when the game gets slow; it raises them again when there
// is room. /quality low|medium|high|auto fixes or frees the level.
const Quality = (() => {
  const NAMES = ['minimum', 'low', 'medium', 'high'];
  const RATIOS = [0.85, 1, 1.15, 1.6];
  let current = 2;
  let auto = true;
  let frames = 0;
  let windowSeconds = 0;
  let goodWindows = 0;
  let badWindows = 0;
  let cap = 3;
  try {
    const saved = localStorage.getItem('multiverse-quality');
    if (saved && saved !== 'auto' && NAMES.includes(saved)) { current = NAMES.indexOf(saved); auto = false; }
  } catch (error) { /* storage blocked */ }

  // Distance at which small details (benches, lamps, plants, signs) stop being drawn
  const VIEW = [70, 95, 125, 170];
  const pixelRatio = () => Math.min(window.devicePixelRatio || 1, RATIOS[current]);
  const viewDistance = () => VIEW[current];

  function apply() {
    if (!renderer) return;
    renderer.setPixelRatio(pixelRatio());
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene.traverse((node) => { if (node.isDirectionalLight && node.userData.shadowCapable !== false) { if (node.userData.shadowCapable === undefined) node.userData.shadowCapable = node.castShadow; if (node.userData.shadowCapable) node.castShadow = current >= 2;
      // Smaller shadow map on medium: a quarter of the pixels to render every frame
      if (node.userData.shadowCapable) {
        const size = current >= 3 ? 2048 : 1024;
        if (node.shadow.mapSize.x !== size) { node.shadow.mapSize.set(size, size); if (node.shadow.map) { node.shadow.map.dispose(); node.shadow.map = null; } }
      } } });
  }

  function set(level, keepAuto = false) {
    current = Math.max(0, Math.min(3, level));
    if (!keepAuto) auto = false;
    apply();
    return NAMES[current];
  }

  // Called every frame with the real frame time
  function sample(seconds) {
    if (!auto || !worldFullyLoadedFlag()) return;
    frames++;
    windowSeconds += seconds;
    if (windowSeconds < 2) return;
    const fps = frames / windowSeconds;
    frames = 0;
    windowSeconds = 0;
    // Two slow windows in a row (4 s) are needed: a single hitch is ignored
    if (fps < 38 && current > 0) {
      goodWindows = 0;
      if (++badWindows < 2) return;
      badWindows = 0;
      cap = current - 1; // do not climb back to a level that was too heavy
      set(current - 1, true);
      return;
    }
    badWindows = 0;
    if (fps > 57 && current < cap) {
      if (++goodWindows >= 4) { goodWindows = 0; set(current + 1, true); }
    } else goodWindows = 0;
  }

  function choose(name) {
    if (name === 'auto') {
      auto = true; cap = 3;
      try { localStorage.setItem('multiverse-quality', 'auto'); } catch (error) { /* storage blocked */ }
      return 'auto';
    }
    const level = NAMES.indexOf(name);
    if (level < 0) return null;
    try { localStorage.setItem('multiverse-quality', name); } catch (error) { /* storage blocked */ }
    return set(level);
  }

  return { pixelRatio, viewDistance, sample, choose, refresh: apply, level: () => current, name: () => (auto ? `auto (${NAMES[current]})` : NAMES[current]) };
})();
const worldFullyLoadedFlag = () => worldFullyLoaded;

// ============================================================================
// DISTANCE CULLING: FAR AWAY BUILDINGS ARE NOT DRAWN
// ============================================================================
// The world has more than ten thousand meshes; drawing all of them every frame
// is what made it slow. Once the world is built, it is split into "units"
// (the largest groups smaller than ~60 m) and every half second the units
// that the fog already hides completely are skipped; small details
// (benches, lamps, plants) are skipped a bit sooner.
const DistanceCulling = (() => {
  const units = [];
  const probe = new THREE.Vector3();
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  let ready = false;
  let lastRefresh = -1;

  // Units are big pieces (buildings, plazas); small details inside them
  // (benches, lamps, plants, signs) also disappear sooner, at the detail distance
  function collect(node, maxRadius, detail) {
    node.children.forEach((child) => {
      if (child.isCamera || child.isLight || child.userData.alwaysVisible || child.isCSS3DObject) return;
      box.setFromObject(child);
      if (box.isEmpty()) return;
      box.getBoundingSphere(sphere);
      if (sphere.radius <= maxRadius) {
        units.push({ node: child, local: child.worldToLocal(sphere.center.clone()), radius: sphere.radius, detail });
        if (!detail && child.children.length) collect(child, 3, true);
      } else if (child.children.length) collect(child, maxRadius, detail);
    });
  }

  function prepare() {
    units.length = 0;
    scene.updateMatrixWorld(true);
    collect(scene, 60, false);
    ready = true;
  }

  function update(elapsed) {
    if (!ready || elapsed - lastRefresh < 0.5) return;
    lastRefresh = elapsed;
    // Buildings are hidden only where the fog already hides them completely
    // (so the look never changes); small details go sooner
    const view = scene.fog ? Math.max(scene.fog.far, 200) : 900;
    const detailView = Quality.viewDistance();
    units.forEach((unit) => {
      probe.copy(unit.local);
      unit.node.localToWorld(probe);
      const reach = (unit.detail ? detailView : view) + unit.radius * 0.5;
      const near = probe.distanceToSquared(camera.position) < reach * reach;
      // Never re-show something the game itself hid
      if (!near && unit.node.visible) { unit.node.visible = false; unit.culled = true; } else if (near && unit.culled) { unit.node.visible = true; unit.culled = false; }
    });
  }

  return { prepare, update, count: () => units.length };
})();

// ============================================================================
// ENGINE BOOTSTRAP
// ============================================================================
function initEngine() {
  animatedProbe = new THREE.Vector3();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.3, 2600);
  camera.position.set(0, 5, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Quality.pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Filmic tone mapping + an image-based environment give every material soft,
  // realistic reflections (glass, metal, polished floors) instead of flat colors
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.72;
  document.body.prepend(renderer.domElement);
  VideoScreens.init(document.body);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 40;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI / 1.85;
  controls.rotateSpeed = 1.2;
  controls.zoomSpeed = 1.4;
  controls.addEventListener('change', () => { pointerDirty = true; });

  City.init(scene);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
  localCursor = createCursorRecord('Dev_....', '#c7ceea', true);
  bindInputEvents();
  animate();
}

// ============================================================================
// WORLD LOADING: EVERY MAP BECOMES A DISTRICT OF ONE CONTINUOUS CITY
// ============================================================================
async function loadUniverse() {
  const [registry, landLayout] = await Promise.all([
    fetch('maps/worlds.json').then((response) => response.json()),
    fetch('maps/land.json').then((response) => response.json()).catch(() => null)
  ]);
  worldRegistry = registry;
  City.setLandLayout(landLayout);
  window.MULTIVERSE_WORLDS = worldRegistry; // used by the Events Wall to build its JUMP IN cards
  // District maps come bundled in maps/districts.json; maps that are not in the
  // bundle (new ones, or Genesis Plaza) are loaded from their own maps/<file>
  const bundled = await fetch('maps/districts.json').then((response) => (response.ok ? response.json() : { maps: {} })).catch(() => ({ maps: {} }));
  const maps = await Promise.all(worldRegistry.map((world) => bundled.maps[world.file] || fetch(`maps/${world.file}`)
    .then((response) => (response.ok ? response.json() : { blocks: [] }))
    .catch(() => ({ blocks: [] }))));
  // Genesis Plaza is built first so devs can enter right away; the rest of the
  // world is assembled district by district in the background (one per frame)
  const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));
  const order = worldRegistry.map((world, index) => index).sort((a, b) => (worldRegistry[a].key === 'plaza' ? -1 : worldRegistry[b].key === 'plaza' ? 1 : 0));
  for (const index of order) {
    const world = worldRegistry[index];
    try {
      const district = City.addDistrict(world, maps[index]);
      registerPlaces(district);
    } catch (error) {
      console.error(`Could not build ${world.file}:`, error);
      appendSystemMessage(`Could not build ${world.name}.`);
    }
    if (world.key === 'plaza') { City.prepareGround(); resolvePlazaReady(); }
    await nextFrame();
  }
  City.finalize();
  renderWorldList();
  worldFullyLoaded = true;
  DistanceCulling.prepare();
  Quality.refresh();
  FireLights.init(scene);
}

let resolvePlazaReady = () => {};
const plazaReady = new Promise((resolve) => { resolvePlazaReady = resolve; });
let worldFullyLoaded = false;

function registerPlaces(district) {
  const { world, layout } = district;
  const view = world.view ? new THREE.Vector3(...world.view) : world.span ? new THREE.Vector3(0, 55, 75) : new THREE.Vector3(0, 30, 42);
  const spawn = world.spawn ? new THREE.Vector3(world.spawn[0], 0, world.spawn[1]) : null;
  places.push({ key: world.key, name: world.name, description: world.description, target: spawn ? layout.center.clone().add(spawn) : layout.center.clone(), exact: !!spawn, view, color: world.color, isWorld: !!world.world });
  (world.places || []).forEach((place) => {
    places.push({
      key: place.key,
      name: place.name,
      parent: world.key,
      isWorld: !!world.world,
      target: new THREE.Vector3(layout.center.x + place.at[0], 0, layout.center.z + place.at[1]),
      view: new THREE.Vector3(0, 45, 70),
      color: world.color
    });
  });
}

function findPlace(key) {
  const query = key.toLowerCase();
  return places.find((place) => place.key === query) || places.find((place) => place.name.toLowerCase().startsWith(query));
}

function renderWorldList() {
  const population = {};
  [localCursor, ...Object.values(remoteMeshPointers)].forEach((record) => {
    const district = City.districtAt(record.target.x, record.target.z);
    if (district) population[district.world.key] = (population[district.world.key] || 0) + 1;
  });
  ui.worldsList.innerHTML = '';
  const addHeader = (text) => {
    const header = document.createElement('li');
    header.className = 'list-header';
    header.textContent = text;
    ui.worldsList.appendChild(header);
  };
  const addPlace = (place) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.title = place.description || place.name;
    if (place.parent) button.classList.add('sub-place');
    const name = document.createElement('span');
    name.textContent = place.name;
    const count = document.createElement('small');
    count.textContent = !place.parent && population[place.key] ? `${population[place.key]} here` : `/${place.key}`;
    button.append(name, count);
    button.addEventListener('click', () => teleportToPlace(place));
    item.appendChild(button);
    ui.worldsList.appendChild(item);
  };
  // Genesis City: the plaza and its small scenes. Worlds: the big maps, reached by teleport only
  addHeader('Genesis City');
  places.filter((place) => !place.isWorld).forEach(addPlace);
  addHeader('Worlds');
  places.filter((place) => place.isWorld).forEach(addPlace);
}

// ============================================================================
// TELEPORTS & CAMERA FLIGHT
// ============================================================================
// Teleports the avatar (with a short white fade, like Decentraland's jump-in)
function flyTo(target, view, announce) {
  Sound.play('teleport');
  lastPositionBeforeTeleport = avatar.position.clone();
  avatar.position.set(target.x, 0, target.z);
  avatar.position.y = groundHeightAt(target.x, target.z, Math.max(target.y, 0) + 80);
  avatar.velocityY = 0;
  localCursor.mesh.position.copy(avatar.position);
  setViewMode('explore');
  const behind = new THREE.Vector3(0, 4, 10);
  controls.target.copy(avatar.position).add(new THREE.Vector3(0, 1.8, 0));
  camera.position.copy(controls.target).add(behind);
  lightningUntil = performance.now() + 250;
  emitCursor(true);
  if (announce) appendSystemMessage(announce);
}

function setViewMode(mode) {
  viewMode = mode;
  if (mode === 'map') {
    controls.maxDistance = 600;
    controls.minDistance = 40;
    controls.maxPolarAngle = Math.PI / 2.3;
    controls.enablePan = true;
    controls.target.copy(avatar.position);
    camera.position.copy(avatar.position).add(MAP_VIEW);
    appendSystemMessage('Map view: click anywhere to jump there. Press M to walk again.');
  } else {
    controls.maxDistance = 40;
    controls.minDistance = 3;
    controls.maxPolarAngle = Math.PI / 1.85;
    controls.enablePan = false;
    if (camera.position.distanceTo(avatar.position) > 45) {
      controls.target.copy(avatar.position).add(new THREE.Vector3(0, 1.8, 0));
      camera.position.copy(controls.target).add(new THREE.Vector3(0, 4, 10));
    }
  }
}

function toggleFlight() {
  flying = !flying;
  avatar.velocityY = 0;
  appendSystemMessage(flying ? 'Flying! Space = up, Shift = down, press F to stop.' : 'Flight off.');
}

// Place where a teleport lands: the exact spawn for places that define one
function placeLanding(place) {
  return place.exact ? place.target.clone() : place.target.clone().add(new THREE.Vector3(0, 0, place.parent ? 14 : 8));
}

// Highest walkable surface under (x, z), searching downward from fromY
function groundHeightAt(x, z, fromY) {
  downRay.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  downRay.camera = camera; // sprites need a camera to be raycast
  downRay.far = fromY - City.GROUND_LEVEL + 120; // reaches the underground level (about -60)
  const hit = downRay.intersectObjects(City.collidablesAt(x, z), true).find(isSolidHit);
  if (hit) return hit.point.y;
  return fromY < City.GROUND_LEVEL - 2 ? -Infinity : City.GROUND_LEVEL; // underground with nothing below: keep falling
}

function isSolidHit(hit) {
  const object = hit.object;
  if (!object.visible || object.isSprite || object.isLine || object.isPoints) return false;
  const objectMaterial = Array.isArray(object.material) ? object.material[0] : object.material;
  return !(objectMaterial && objectMaterial.opacity < 0.2);
}

// Walking physics: WASD relative to the camera, gravity, jumping, stairs and walls
function gravityScale() {
  const zones = window.lowGravityZones || [];
  const position = new THREE.Vector3();
  for (const zone of zones) {
    zone.group.getWorldPosition(position);
    if (zone.offset) position.add(zone.offset);
    if (Math.abs(avatar.position.x - position.x) < zone.half && Math.abs(avatar.position.z - position.z) < zone.half &&
        avatar.position.y > position.y + zone.minY && avatar.position.y < position.y + zone.maxY) return 0.3;
  }
  return 1;
}

// Square pool entrances: once a cursor drops into the open pool it falls down the
// water tunnel for five seconds, then lands in the underground hall
function updateTunnelFall() {
  if (tunnelFall) {
    const progress = Math.min(1, (performance.now() - tunnelFall.start) / (TUNNEL_FALL_SECONDS * 1000));
    avatar.position.set(tunnelFall.x, tunnelFall.fromY + (tunnelFall.toY - tunnelFall.fromY) * progress, tunnelFall.z);
    avatar.velocityY = 0;
    camera.position.set(tunnelFall.x + 0.5, avatar.position.y + 3.5, tunnelFall.z + 2.8);
    controls.target.copy(avatar.position).add(new THREE.Vector3(0, -1, 0));
    localCursor.target.copy(avatar.position);
    if (progress >= 1) {
      tunnelFall = null;
      camera.position.set(avatar.position.x, avatar.position.y + 4, avatar.position.z + 9);
      appendSystemMessage('Welcome to the Genesis Plaza Underground! Take the elevator (E) to go back up.');
    }
    return true;
  }
  const center = new THREE.Vector3();
  for (const entrance of window.undergroundEntrances || []) {
    entrance.group.getWorldPosition(center);
    const half = entrance.size / 2;
    // Anywhere inside the tunnel (even after a big frame skip) the fall takes over
    const inside = Math.abs(avatar.position.x - center.x) < half + 1 && Math.abs(avatar.position.z - center.z) < half + 1;
    const depth = center.y - avatar.position.y;
    if (inside && ((entrance.group.userData.doorsOpen && depth > 0.2) || depth > 2) && depth < entrance.depth) {
      tunnelFall = { start: performance.now(), x: center.x, z: center.z, fromY: avatar.position.y, toY: center.y - 59.7 };
      flying = false;
      appendSystemMessage('Falling down the water tunnel...');
      return true;
    }
  }
  return false;
}

function updateAvatar(deltaSeconds) {
  if (viewMode !== 'explore') return;
  if (updateTunnelFall()) return;
  const busy = Interactions.isBusy();
  const forwardInput = busy ? 0 : (keysPressed.has('w') || keysPressed.has('arrowup') ? 1 : 0) - (keysPressed.has('s') || keysPressed.has('arrowdown') ? 1 : 0);
  const strafeInput = busy ? 0 : (keysPressed.has('d') || keysPressed.has('arrowright') ? 1 : 0) - (keysPressed.has('a') || keysPressed.has('arrowleft') ? 1 : 0);
  const previous = avatar.position.clone();
  avatar.moving = !!(forwardInput || strafeInput);

  if (forwardInput || strafeInput) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const vehicleSpeed = Vehicles.speedFor();
    const speed = vehicleSpeed ? vehicleSpeed * (keysPressed.has('shift') ? 1.6 : 1) : flying ? FLY_SPEED : keysPressed.has('shift') ? RUN_SPEED : WALK_SPEED;
    const move = forward.multiplyScalar(forwardInput).add(right.multiplyScalar(strafeInput)).normalize().multiplyScalar(speed * LootSystem.modifiers().speed * deltaSeconds);
    // Try the full move, then slide along each axis when a wall blocks it
    [move, new THREE.Vector3(move.x, 0, 0), new THREE.Vector3(0, 0, move.z)].some((attempt) => {
      if (attempt.lengthSq() === 0 || isBlocked(attempt)) return false;
      // Community buildings on the parcels are instanced, so they are checked here
      if (City.solidAt(avatar.position.x + attempt.x, avatar.position.z + attempt.z, avatar.position.y)) return false;
      avatar.position.add(attempt);
      return true;
    });
  }

  const lootModifiers = LootSystem.modifiers();
  if (flying) {
    // Creative flight: Space goes up, Shift goes down, no gravity
    const vertical = busy ? 0 : (keysPressed.has(' ') ? 1 : 0) - (keysPressed.has('shift') ? 1 : 0);
    avatar.velocityY = 0;
    avatar.position.y = Math.min(400, avatar.position.y + vertical * 12 * deltaSeconds);
    avatar.moving = avatar.moving || vertical !== 0;
    const flightGround = groundHeightAt(avatar.position.x, avatar.position.z, avatar.position.y + 0.5);
    if (avatar.position.y <= flightGround) {
      avatar.position.y = flightGround;
      if (vertical < 0) { flying = false; appendSystemMessage('Landed. Press F to fly again.'); }
    }
    avatar.grounded = false;
  } else if (keysPressed.has(' ') && lootModifiers.jetpack) {
    avatar.velocityY = 9; // Jetpack.js: hold Space to fly
    avatar.grounded = false;
  } else {
    // Responsive jump: a press is remembered for 150 ms (jump buffer) and you
    // can still jump 120 ms after walking off an edge (coyote time); holding
    // Space keeps jumping on every landing, like Roblox
    const now = performance.now();
    if (avatar.grounded) lastGroundedAt = now;
    const wantsJump = now - jumpRequestedAt < 150 || keysPressed.has(' ');
    if (wantsJump && now - lastGroundedAt < 120 && avatar.velocityY <= 0.01) {
      avatar.velocityY = JUMP_SPEED * Math.sqrt(lootModifiers.jump);
      Sound.play('jump');
      avatar.grounded = false;
      lastGroundedAt = 0;
      jumpRequestedAt = -1;
    }
  }
  if (!flying) {
    avatar.velocityY -= GRAVITY * gravityScale() * deltaSeconds;
    avatar.position.y += avatar.velocityY * deltaSeconds;
    const ground = groundHeightAt(avatar.position.x, avatar.position.z, Math.max(previous.y, avatar.position.y) + STEP_HEIGHT);
    if (avatar.position.y <= ground) {
      avatar.position.y = ground;
      avatar.velocityY = 0;
      avatar.grounded = true;
    } else {
      avatar.grounded = avatar.position.y - ground < 0.05;
    }
  }
  // Edge of Genesis City: past the outskirts there is only empty land, then an
  // invisible wall at the last coordinates (Worlds far away are not affected)
  const limit = City.WORLD_LIMIT;
  const insideCity = Math.abs(avatar.position.x) < limit + 300 && Math.abs(avatar.position.z) < limit + 300;
  if (insideCity && (Math.abs(avatar.position.x) > limit || Math.abs(avatar.position.z) > limit)) {
    avatar.position.x = THREE.MathUtils.clamp(avatar.position.x, -limit, limit);
    avatar.position.z = THREE.MathUtils.clamp(avatar.position.z, -limit, limit);
    if (performance.now() - lastEdgeWarning > 8000) {
      lastEdgeWarning = performance.now();
      appendSystemMessage('You reached the edge of Genesis City. Beyond this point there is nothing but empty horizon.');
    }
  }
  if (avatar.position.y < City.GROUND_LEVEL - 100) flyTo(bedSpawn() || places[0].target, null, 'You fell out of the world. Back to your spawn point!');

  // The camera follows the avatar in third person
  const delta = avatar.position.clone().sub(previous);
  camera.position.add(delta);
  controls.target.copy(avatar.position).add(new THREE.Vector3(0, 1.8, 0));
  // (ground and wall corrections are applied only while rendering, so the
  // camera keeps the same distance and angle when you walk backwards)
  localCursor.target.copy(avatar.position);
}

// Big surfaces (walls, ceilings, building shells) block the camera; instanced
// trees and small props do not
const cameraBlockerCache = new WeakMap();
function cameraBlocker(object) {
  if (object.isInstancedMesh) return false;
  if (!cameraBlockerCache.has(object)) {
    const geometry = object.geometry;
    if (geometry && !geometry.boundingSphere) geometry.computeBoundingSphere();
    const scale = object.getWorldScale(new THREE.Vector3());
    const radius = geometry && geometry.boundingSphere ? geometry.boundingSphere.radius * Math.max(scale.x, scale.y, scale.z) : 0;
    cameraBlockerCache.set(object, radius > 3);
  }
  return cameraBlockerCache.get(object);
}

function isBlocked(move) {
  const direction = move.clone().normalize();
  for (const height of [STEP_HEIGHT + 0.1, 2.2]) {
    wallRay.set(avatar.position.clone().add(new THREE.Vector3(0, height, 0)), direction);
    wallRay.far = move.length() + AVATAR_RADIUS;
    const objects = City.collidablesAt(avatar.position.x + move.x, avatar.position.z + move.z);
    if (wallRay.intersectObjects(objects, true).some(isSolidHit)) return true;
  }
  return false;
}

function teleportToPlace(place) {
  flyTo(placeLanding(place), null, `Teleported to ${place.name}.`);
  history.replaceState(null, '', `#${place.key}`);
}

// ============================================================================
// 3D CURSORS, WEARABLES, TAGS AND CHAT BUBBLES
// ============================================================================
function create3DMousePointerMesh(hexagonalColor) {
  const pointerGroup = new THREE.Group();
  const outline = [[0, 0], [0, -1.6], [0.38, -1.22], [0.66, -1.86], [0.92, -1.74], [0.64, -1.12], [1.14, -1.12]];
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  outline.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();

  const arrowGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2 });
  arrowGeometry.translate(0, 0, -0.11);
  const arrowMesh = new THREE.Mesh(arrowGeometry, new THREE.MeshStandardMaterial({ color: new THREE.Color(hexagonalColor), roughness: 0.3, metalness: 0.1, emissive: new THREE.Color(hexagonalColor), emissiveIntensity: 0.15 }));
  arrowMesh.castShadow = true;
  arrowMesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(arrowGeometry, 30), new THREE.LineBasicMaterial({ color: 0x1d1b26 })));

  const arrowPivot = new THREE.Group();
  arrowPivot.add(arrowMesh);
  arrowPivot.position.y = 0.25;
  pointerGroup.add(arrowPivot);

  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.38, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(hexagonalColor), transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.03;
  pointerGroup.add(ringMesh);

  pointerGroup.userData.arrowPivot = arrowPivot;
  pointerGroup.userData.arrowMesh = arrowMesh;
  pointerGroup.userData.ring = ringMesh;
  pointerGroup.scale.setScalar(1.1);
  pointerGroup.traverse((node) => { node.raycast = () => {}; });
  return pointerGroup;
}

// Dev wearables attached to the arrow (hoodie, mug, cap, headphones, hammer)
function buildWearable(item, color) {
  const group = new THREE.Group();
  const add = (geometry, meshColor, x, y, z, options = {}) => {
    const part = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: meshColor, roughness: 0.7, ...options }));
    part.position.set(x, y, z);
    part.raycast = () => {};
    group.add(part);
    return part;
  };
  if (item === 'hoodie') {
    const hood = add(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.6), '#495057', 0.15, 0.15, 0);
    hood.rotation.z = 0.3;
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), '#f8f9fa', 0.05, -0.25, 0.15);
  } else if (item === 'mug') {
    add(new THREE.CylinderGeometry(0.25, 0.22, 0.5, 12), color || '#ffffff', 1.2, -0.9, 0);
    const handle = add(new THREE.TorusGeometry(0.13, 0.04, 6, 12), color || '#ffffff', 1.48, -0.9, 0);
    handle.rotation.y = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 12), '#6f4e37', 1.2, -0.66, 0);
  } else if (item === 'cap') {
    add(new THREE.SphereGeometry(0.32, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e63946', 0.1, 0.12, 0);
    add(new THREE.BoxGeometry(0.5, 0.04, 0.35), '#e63946', 0.1, 0.12, 0.3);
  } else if (item === 'headphones') {
    const band = add(new THREE.TorusGeometry(0.42, 0.05, 6, 16, Math.PI), '#212529', 0.4, -0.5, 0);
    band.rotation.y = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), '#ef233c', 0.4, -0.85, 0.42).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), '#ef233c', 0.4, -0.85, -0.42).rotation.x = Math.PI / 2;
  } else if (item === 'crown') {
    add(new THREE.CylinderGeometry(0.42, 0.36, 0.3, 8, 1, true), '#ffd166', 0.15, 0.25, 0, { metalness: 0.9, roughness: 0.2, emissive: '#ffb703', emissiveIntensity: 0.4, side: THREE.DoubleSide });
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      add(new THREE.ConeGeometry(0.08, 0.25, 4), '#ffd166', 0.15 + Math.cos(angle) * 0.4, 0.5, Math.sin(angle) * 0.4, { metalness: 0.9, roughness: 0.2, emissive: '#ffb703', emissiveIntensity: 0.4 });
    }
    add(new THREE.SphereGeometry(0.07, 8, 6), '#e63946', 0.15, 0.27, 0.4, { emissive: '#e63946', emissiveIntensity: 0.6 });
  } else if (item === 'hammer') {
    add(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), '#6d4c41', 1.3, -1, 0).rotation.z = 0.6;
    add(new THREE.BoxGeometry(0.6, 0.3, 0.3), '#ffd54f', 1.0, -0.55, 0, { metalness: 0.7 }).rotation.z = 0.6;
  }
  return group;
}

// Avatar look (color, eyewear, jacket, hat) from the customization screen
let localLook = (() => { try { return Avatar.sanitize(JSON.parse(localStorage.getItem('multiverse-look'))); } catch (error) { return Avatar.sanitize(null); } })();
function applyLook(record, look) {
  if (!record || !look) return;
  const clean = Avatar.sanitize(look);
  const { arrowPivot, arrowMesh, ring } = record.mesh.userData;
  arrowMesh.material.color.set(clean.color);
  arrowMesh.material.emissive.set(clean.color);
  ring.material.color.set(clean.color);
  if (record.outfit) arrowPivot.remove(record.outfit);
  record.outfit = Avatar.buildOutfit(clean);
  arrowPivot.add(record.outfit);
}

function lookPreviewCursor(look) {
  const cursor = create3DMousePointerMesh(look.color);
  applyLook({ mesh: cursor }, look);
  return cursor;
}

function openAvatarCustomizer() {
  Avatar.openCustomizer(localLook, (look) => {
    localLook = look;
    try { localStorage.setItem('multiverse-look', JSON.stringify(look)); } catch (error) { /* storage blocked */ }
    applyLook(localCursor, look);
    if (socket && socket.connected) socket.emit('set_avatar', look);
    appendSystemMessage('Looking good! Change your outfit anytime with the shirt button in the menu.');
  }, lookPreviewCursor);
}

function setCursorWearable(record, item) {
  if (record.wearable) record.mesh.userData.arrowPivot.remove(record.wearable);
  record.wearable = item ? buildWearable(item) : null;
  if (record.wearable) record.mesh.userData.arrowPivot.add(record.wearable);
}

function createDeveloperHTMLOverlayTag(devTag, pastelColor) {
  const overlayNode = document.createElement('div');
  overlayNode.className = 'dev-floating-tag';
  overlayNode.textContent = devTag;
  overlayNode.style.border = `1px solid ${pastelColor}`;
  ui.overlay.appendChild(overlayNode);
  return overlayNode;
}

function createCursorRecord(devTag, color, isLocal) {
  const mesh = create3DMousePointerMesh(color);
  mesh.position.set(0, 1, 0);
  scene.add(mesh);
  return { mesh, target: mesh.position.clone(), domElement: createDeveloperHTMLOverlayTag(isLocal ? `${devTag} (you)` : devTag, color), bubble: null, bubbleTimer: null, isLocal, wearable: null };
}

function disposeCursorRecord(record) {
  scene.remove(record.mesh);
  record.domElement.remove();
  if (record.bubble) record.bubble.remove();
  clearTimeout(record.bubbleTimer);
}

function restyleLocalCursor(devTag, color) {
  const position = localCursor.target.clone();
  disposeCursorRecord(localCursor);
  localCursor = createCursorRecord(devTag, color, true);
  localCursor.mesh.position.copy(position);
  localCursor.target.copy(position);
  setCursorWearable(localCursor, localWearable);
  applyLook(localCursor, localLook);
}

function instantiateNetworkPeerCursor(peerData) {
  if (!localDeveloperData || peerData.id === localDeveloperData.id || remoteMeshPointers[peerData.id]) return;
  const record = createCursorRecord(peerData.devTag, peerData.color, false);
  record.metadata = peerData;
  record.mesh.position.set(peerData.position.x, peerData.position.y, peerData.position.z);
  record.target.copy(record.mesh.position);
  setCursorWearable(record, peerData.wearable || null);
  if (peerData.avatar) applyLook(record, peerData.avatar);
  remoteMeshPointers[peerData.id] = record;
  updateOnlineCounter();
}

function removeNetworkPeerCursor(peerId) {
  const record = remoteMeshPointers[peerId];
  if (!record) return;
  disposeCursorRecord(record);
  delete remoteMeshPointers[peerId];
  updateOnlineCounter();
}

function clearRemotePeers() {
  Object.keys(remoteMeshPointers).forEach(removeNetworkPeerCursor);
}

function projectToScreen(record) {
  const anchor = record.mesh.position.clone();
  anchor.y += 2.9;
  const distance = anchor.distanceTo(camera.position);
  anchor.project(camera);
  const isVisible = anchor.z < 1 && Math.abs(anchor.x) < 1.2 && Math.abs(anchor.y) < 1.2 && (record.isLocal || distance < 220);
  const left = `${(anchor.x * 0.5 + 0.5) * window.innerWidth}px`;
  const top = `${(anchor.y * -0.5 + 0.5) * window.innerHeight}px`;
  [record.domElement, record.bubble].forEach((element) => {
    if (!element) return;
    element.style.display = isVisible ? 'block' : 'none';
    element.style.left = left;
    element.style.top = top;
  });
}

function showChatBubble(record, text) {
  if (!record.bubble) {
    record.bubble = document.createElement('div');
    record.bubble.className = 'chat-bubble';
    ui.overlay.appendChild(record.bubble);
  }
  record.bubble.textContent = text;
  clearTimeout(record.bubbleTimer);
  record.bubbleTimer = setTimeout(() => {
    if (!record.bubble) return;
    record.bubble.remove();
    record.bubble = null;
  }, CHAT_BUBBLE_DURATION_MS);
}

// ============================================================================
// INPUT: CURSOR RAYCASTING, CAMERA WALKING, CLICKS
// ============================================================================
function bindInputEvents() {
  // The minimap is on by default, right under the coin counter (the dock map button hides it)
  document.body.classList.add('show-map');
  const soundDockButton = document.querySelector('#dock [data-action="sound"]');
  if (soundDockButton) soundDockButton.classList.toggle('muted', !Sound.isEnabled());
  const canvas = renderer.domElement;
  canvas.addEventListener('pointermove', (event) => {
    pointerNDC.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerNDC.y = -(event.clientY / window.innerHeight) * 2 + 1;
    pointerInsideCanvas = true;
    pointerDirty = true;
    ui.tooltip.style.left = `${event.clientX}px`;
    ui.tooltip.style.top = `${event.clientY}px`;
  });
  canvas.addEventListener('pointerleave', () => {
    pointerInsideCanvas = false;
    ui.tooltip.style.display = 'none';
  });
  canvas.addEventListener('pointerdown', (event) => { pointerDownAt = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener('pointerup', (event) => {
    if (!pointerDownAt) return;
    const dragDistance = Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y);
    pointerDownAt = null;
    if (dragDistance >= 5 || !hoveredObject) return;
    if (viewMode === 'map' && hoverPoint) { flyTo(hoverPoint, null, 'Jumped in.'); return; }
    // JUMP IN cards (Events Wall, Events Explorer, star pads): a click jumps into the place
    for (let node = hoveredObject; node; node = node.parent) {
      const interactable = node.userData && node.userData.interactable;
      if (interactable && interactable.type === 'jump') { Sound.play('teleport'); interactionHooks().jumpTo(interactable.label); return; }
    }
    if (GameSystems.handleClick(hoveredObject)) return;
    const labeled = findLabeledAncestor(hoveredObject);
    if (labeled) openInfoCard(labeled.userData);
  });

  // Dock (bottom right): opens the panels that are hidden to keep the view clean
  document.querySelectorAll('#dock button').forEach((button) => {
    button.addEventListener('click', () => {
      Sound.play('click');
      if (button.dataset.action === 'sound') { const on = Sound.setEnabled(!Sound.isEnabled()); button.classList.toggle('muted', !on); appendSystemMessage(on ? 'Sound effects on.' : 'Sound effects off.'); return; }
      const toggle = button.dataset.toggle;
      if (toggle) { button.classList.toggle('active', document.body.classList.toggle(toggle)); return; }
      const action = button.dataset.action;
      if (action === 'metro') Metro.open();
      if (action === 'avatar') openAvatarCustomizer();
      if (action === 'codify') Codify.open();
      if (action === 'invite') document.getElementById('invite-button').click();
      if (action === 'lobby') document.getElementById('lobby-button').click();
    });
  });
  // Coin indicator (top right) opens the Multiverse Coins panel
  const store = document.getElementById('mvc-store');
  document.getElementById('wallet-chip').addEventListener('click', () => { Sound.play('click'); store.style.display = 'flex'; });
  document.getElementById('mvc-close').addEventListener('click', () => { store.style.display = 'none'; });
  store.addEventListener('click', (event) => { if (event.target === store) store.style.display = 'none'; });
  document.getElementById('mvc-daily').addEventListener('click', () => {
    if (socket && socket.connected) socket.emit('daily_bonus');
    else appendSystemMessage('The daily bonus needs the multiplayer server.');
  });
  ui.chatInput.addEventListener('focus', () => { document.body.classList.add('chat-active'); ui.chatLog.scrollTop = ui.chatLog.scrollHeight; });
  ui.chatInput.addEventListener('blur', () => document.body.classList.remove('chat-active'));

  window.addEventListener('pointerdown', () => Sound.unlock(), { once: true });
  window.addEventListener('keydown', (event) => {
    Sound.unlock();
    if (document.activeElement === ui.chatInput) {
      if (event.key === 'Escape') ui.chatInput.blur();
      return;
    }
    // Typing in any other field (e.g. the sign-in form) never triggers game shortcuts
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === 'Enter' || event.key === '/' || event.key.toLowerCase() === 't') {
      event.preventDefault();
      ui.chatInput.focus();
      if (event.key === '/') ui.chatInput.value = '/';
      return;
    }
    if (Interactions.isBusy()) { Interactions.handleKey(event); return; }
    // B: Scene Builder on your own parcel (it also takes its keys while building)
    if (window.SceneBuilder && SceneBuilder.handleKey(event)) return;
    // Shift+U: hide every overlay and keep only the scenery (screenshot mode)
    if (event.key === 'U') { document.body.classList.toggle('hide-ui'); return; }
    if (event.key === 'Escape') { closeInfoCard(); closeStream(); Cafe.close(); document.getElementById('mvc-store').style.display = 'none'; }
    // M: the Genesis City map (top view of every parcel); from the 3D overhead view, M walks again
    if (event.key.toLowerCase() === 'm') { if (viewMode === 'map') setViewMode('explore'); else CityMap.toggle(); return; }
    if (event.key.toLowerCase() === 'v') { appendSystemMessage(VideoScreens.toggleSound() ? 'Video screens: sound ON (press V to mute).' : 'Video screens muted (press V for sound).'); return; }
    if (event.key.toLowerCase() === 'c' && !event.ctrlKey && !event.metaKey) { if (Codify.isOpen()) Codify.close(); else Codify.open(); event.preventDefault(); return; }
    if (event.key.toLowerCase() === 'n') { if (Metro.isOpen()) Metro.close(); else Metro.open(); return; }
    if (event.key === 'Escape' && Metro.isOpen()) { Metro.close(); return; }
    if (event.key.toLowerCase() === 'e' && Vehicles.isMounted()) { Vehicles.dismount(); appendSystemMessage('You got off the vehicle.'); return; }
    if (event.key.toLowerCase() === 'e' && viewMode === 'explore' && LootSystem.tryOpen()) return;
    // G picks up the nearest resource; held down it gathers everything nearby
    if (event.key.toLowerCase() === 'g' && viewMode === 'explore') { if (!event.repeat) LootSystem.tryPickup(); else LootSystem.setPulling(true); return; }
    if (event.key.toLowerCase() === 'e' && viewMode === 'explore' && Interactions.handleKey(event)) return;
    // Space jumps right away (like Roblox); flying moved to F so fast jumps never toggle it
    if (event.key === ' ' && !event.repeat) jumpRequestedAt = performance.now();
    if (event.key.toLowerCase() === 'f' && !event.repeat && viewMode === 'explore') {
      // F next to a firepit fries your code (E is for the benches); anywhere else it toggles flight
      const firepit = !flying && Interactions.nearFirepit(avatar.position);
      if (firepit) Codify.startRoast(firepit);
      else toggleFlight();
      return;
    }
    if (event.key === ' ') event.preventDefault();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(event.key.toLowerCase())) wakeUp();
    keysPressed.add(event.key.toLowerCase());
  });
  window.addEventListener('keyup', (event) => { keysPressed.delete(event.key.toLowerCase()); if (event.key.toLowerCase() === 'g') LootSystem.setPulling(false); });
  window.addEventListener('blur', () => keysPressed.clear());

  ui.infoClose.addEventListener('click', closeInfoCard);
  ui.streamClose.addEventListener('click', closeStream);
  ui.chatForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = ui.chatInput.value.trim();
    ui.chatInput.value = '';
    ui.chatInput.blur();
    if (text) handleChatInput(text);
  });

  ui.minimap.addEventListener('click', (event) => {
    const rect = ui.minimap.getBoundingClientRect();
    const scale = (MINIMAP_RADIUS * 2) / rect.width;
    const target = new THREE.Vector3(controls.target.x + (event.clientX - rect.left - rect.width / 2) * scale, 0, controls.target.z + (event.clientY - rect.top - rect.height / 2) * scale);
    flyTo(target, null, 'Jumped in.');
  });

  window.addEventListener('hashchange', () => {
    const place = findPlace(location.hash.slice(1));
    if (place) teleportToPlace(place);
  });
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function findLabeledAncestor(object) {
  let node = object;
  while (node) {
    if (node.userData && node.userData.label) return node;
    node = node.parent;
  }
  return null;
}

function updateLocalCursorFromPointer() {
  if (!pointerInsideCanvas || !pointerDirty) return;
  pointerDirty = false;
  raycaster.setFromCamera(pointerNDC, camera);
  const hit = raycaster.intersectObjects(City.pickables, true).find((candidate) => candidate.object.visible && !(candidate.object.material && candidate.object.material.opacity < 0.1));
  hoveredObject = hit ? hit.object : null;
  const labeled = hoveredObject ? findLabeledAncestor(hoveredObject) : null;
  renderer.domElement.style.cursor = hit ? (labeled ? 'pointer' : 'none') : 'default';
  if (labeled) {
    ui.tooltip.textContent = labeled.userData.label;
    ui.tooltip.style.display = 'block';
  } else {
    ui.tooltip.style.display = 'none';
  }
  hoverPoint = hit ? hit.point.clone() : null;
}

function walkCamera(deltaSeconds) {
  const forwardInput = (keysPressed.has('w') || keysPressed.has('arrowup') ? 1 : 0) - (keysPressed.has('s') || keysPressed.has('arrowdown') ? 1 : 0);
  const strafeInput = (keysPressed.has('d') || keysPressed.has('arrowright') ? 1 : 0) - (keysPressed.has('a') || keysPressed.has('arrowleft') ? 1 : 0);
  const verticalInput = (keysPressed.has('e') ? 1 : 0) - (keysPressed.has('q') ? 1 : 0);
  if (!forwardInput && !strafeInput && !verticalInput) return;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const speed = 60 * (keysPressed.has('shift') ? 3 : 1) * deltaSeconds;
  const step = forward.multiplyScalar(forwardInput * speed).add(right.multiplyScalar(strafeInput * speed));
  step.y = verticalInput * speed;
  camera.position.add(step);
  controls.target.add(step);
  pointerDirty = true;
}

function emitCursor(force) {
  if (!socket || !socket.connected || !localDeveloperData) return;
  const now = performance.now();
  if (!force && now - lastEmitTime < CURSOR_EMIT_INTERVAL_MS) return;
  if (!force && lastEmittedPosition.distanceToSquared(localCursor.target) < 0.0004) return;
  lastEmitTime = now;
  lastEmittedPosition.copy(localCursor.target);
  socket.emit('update_cursor_transform', { position: { x: localCursor.target.x, y: localCursor.target.y, z: localCursor.target.z } });
}

function openInfoCard(userData) {
  const district = City.districtAt(localCursor.target.x, localCursor.target.z);
  ui.infoTitle.textContent = userData.label;
  ui.infoType.textContent = `${userData.blockType || 'object'} · ${district ? district.world.name : 'Genesis City'}`;
  ui.infoCard.style.display = 'block';
}

function closeInfoCard() {
  ui.infoCard.style.display = 'none';
}

function openStream(stream) {
  ui.streamTitle.textContent = stream.title;
  ui.streamFrame.src = stream.embedUrl;
  ui.streamModal.style.display = 'flex';
}

function closeStream() {
  ui.streamModal.style.display = 'none';
  ui.streamFrame.src = 'about:blank';
}

// ============================================================================
// HUD: DISTRICT, PARCEL, CLOCK AND MINIMAP
// ============================================================================
function currentTicks() {
  const elapsed = worldClock.cycle ? ((performance.now() - worldClock.at) / 1000) * TICKS_PER_SECOND : 0;
  return (((worldClock.ticks + elapsed) % 24000) + 24000) % 24000;
}

function ticksToClock(ticks) {
  const hours = (Math.floor(ticks / 1000) + 6) % 24;
  const minutes = Math.floor(((ticks % 1000) / 1000) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function zoneName(district, position) {
  if (!district.world.region) return district.world.name;
  const local = position.clone().sub(district.layout.center);
  const zone = district.mapData.blocks.find((block) => block.type === 'city_zone' &&
    Math.abs(local.x - block.position[0]) <= block.scale[0] / 2 && Math.abs(local.z - block.position[2]) <= block.scale[2] / 2);
  return zone ? `${district.world.name} · ${zone.label}` : district.world.name;
}

let hudFrame = 0;
function updateHud() {
  if (hudFrame++ % 10) return;
  const position = localCursor.target;
  const district = City.districtAt(position.x, position.z);
  const chip = document.getElementById('location-chip');
  let outside = 'Genesis City';
  if (!district) {
    const kind = City.landAt(position.x, position.z);
    const parcelKey = `${Math.floor(position.x / City.PARCEL_SIZE)},${Math.floor(-position.z / City.PARCEL_SIZE)}`;
    const owner = City.landOwner(parcelKey);
    const water = City.seaAt(position.x, position.z);
    if (kind === 'sea') outside = water.sea.name || 'Sea';
    else if (water && water.island) outside = `${water.island.name || 'Island'} · ${owner ? `parcel of ${owner}` : 'for sale (/buyland)'}`;
    else if (kind === 'road') outside = 'Genesis City · Road';
    else if (kind === 'scene') outside = 'Community scene';
    else if (kind === 'land') outside = owner ? `Parcel of ${owner}` : 'Empty parcel · for sale (/buyland)';
    // Decentraland-style scene name: the title of the scene built on this parcel
    const sceneTitle = window.SceneBuilder && SceneBuilder.titleAt(parcelKey);
    if (sceneTitle) outside = `${sceneTitle} · ${owner ? `by ${owner}` : 'scene'}`;
  }
  if (chip) chip.firstChild.textContent = position.y < -20 ? `${district ? district.world.name : 'Genesis City'} · Underground` : district ? zoneName(district, position) : outside;
  ui.district.textContent = position.y < -20 ? `${district ? district.world.name : 'Genesis City'} · Underground` : district ? zoneName(district, position) : 'Genesis City';
  ui.parcel.textContent = district && district.world.world ? 'World' : `${Math.floor(position.x / City.PARCEL_SIZE)},${Math.floor(-position.z / City.PARCEL_SIZE)}`;
  const parcelChip = document.getElementById('location-parcel');
  if (parcelChip) parcelChip.textContent = ui.parcel.textContent;
  // Minecraft-length day: 10 min of day, then night (20 min full cycle)
  const ticks = currentTicks();
  const isDay = ticks < 12000;
  const secondsLeft = Math.max(0, Math.round(((isDay ? 12000 : 24000) - ticks) / TICKS_PER_SECOND));
  const countdown = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`;
  // While it is day, count down to nightfall; at night, count down to sunrise
  ui.clock.textContent = `${ticksToClock(ticks)} · ${isDay ? 'night in' : 'day in'} ${worldClock.cycle ? countdown : '--:--'}`;
  if (lastDayPhase !== null && lastDayPhase !== isDay) appendSystemMessage(isDay ? 'A new day dawns over GitHub Multiverse.' : 'Night has fallen over GitHub Multiverse. The billboards light up!');
  lastDayPhase = isDay;
  if (hudFrame % 60 === 1) renderWorldList();
  drawMinimap();
}

// Decentraland-style minimap (top right): your district highlighted in blue,
// roads, neighbors, compass letters and the devs that share your district
function drawMinimap() {
  const ctx = ui.minimap.getContext('2d');
  const size = ui.minimap.width;
  const scale = size / (MINIMAP_RADIUS * 2);
  const focus = localCursor.target;
  const toMap = (x, z) => [(x - focus.x) * scale + size / 2, (z - focus.z) * scale + size / 2];
  const current = City.districtAt(focus.x, focus.z);
  ctx.fillStyle = '#6fbf73';
  ctx.fillRect(0, 0, size, size);
  // Winding paths (no street grid)
  ctx.strokeStyle = '#e0b07c';
  ctx.lineWidth = Math.max(2, 5 * scale);
  ctx.lineJoin = 'round';
  City.paths.forEach((path) => {
    ctx.beginPath();
    path.forEach(([px, pz], index) => { const [mx, my] = toMap(px, pz); if (index) ctx.lineTo(mx, my); else ctx.moveTo(mx, my); });
    ctx.stroke();
  });
  City.districts.forEach((district) => {
    const { center, size: districtSize } = district.layout;
    const [x, y] = toMap(center.x - districtSize[0] / 2, center.z - districtSize[1] / 2);
    ctx.fillStyle = district === current ? '#3b5bdb' : '#8fd18f';
    if (district.world.key === 'plaza') {
      const [cx, cy] = toMap(center.x, center.z);
      ctx.beginPath(); ctx.arc(cx, cy, (districtSize[0] / 2) * scale, 0, Math.PI * 2); ctx.fill();
    } else {
      const radius = Math.min(districtSize[0], districtSize[1]) * scale * 0.2;
      const width = districtSize[0] * scale;
      const height = districtSize[1] * scale;
      ctx.beginPath();
      ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.arcTo(x + width, y + height, x, y + height, radius);
      ctx.arcTo(x, y + height, x, y, radius); ctx.arcTo(x, y, x + width, y, radius); ctx.fill();
    }
  });
  // Owned parcels (mine red, others green) and published scenes
  if (window.SceneBuilder) SceneBuilder.drawMinimap(ctx, toMap, scale);
  // Devs in the same district (real time)
  Object.values(remoteMeshPointers).forEach((record) => {
    if (City.districtAt(record.target.x, record.target.z) !== current) return;
    const [x, y] = toMap(record.target.x, record.target.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = record.metadata.color;
    ctx.beginPath(); ctx.arc(x, y, 3.2, 0, Math.PI * 2); ctx.fill();
  });
  // You: red dot with the camera heading
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const angle = Math.atan2(direction.z, direction.x);
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(angle);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(4, -6); ctx.lineTo(4, 6); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e03131';
  ctx.beginPath(); ctx.arc(size / 2, size / 2, 6, 0, Math.PI * 2); ctx.fill();
  // Compass letters
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', size / 2, 10);
  ctx.fillText('S', size / 2, size - 10);
  ctx.fillText('W', 10, size / 2);
  ctx.fillText('E', size - 10, size / 2);
  if (ui.minimapCaption) {
    const peersHere = Object.values(remoteMeshPointers).filter((record) => City.districtAt(record.target.x, record.target.z) === current).length;
    ui.minimapCaption.innerHTML = '';
    const title = document.createElement('b');
    title.textContent = current ? current.world.name : 'Genesis City';
    const info = document.createElement('span');
    info.textContent = `${ui.parcel.textContent} · ${peersHere + 1} here`;
    ui.minimapCaption.append(title, info);
  }
}

// ============================================================================
// CHAT & MINECRAFT-STYLE COMMANDS
// ============================================================================
function handleChatInput(text) {
  if (text.startsWith('/')) {
    interpretChatCommand(text);
    return;
  }
  if (!localDeveloperData) {
    appendSystemMessage('Still connecting to the multiverse, try again in a moment.');
  } else if (socket && socket.connected) {
    socket.emit('chat_message', text);
  } else {
    displayChatMessage({ id: localDeveloperData.id, devTag: localDeveloperData.devTag, color: localDeveloperData.color, text });
  }
}

function findPeer(name) {
  if (!name) return null;
  const query = name.toLowerCase();
  const records = Object.entries(remoteMeshPointers);
  const exact = records.find(([, record]) => record.metadata.devTag.toLowerCase() === query);
  const partial = records.find(([, record]) => record.metadata.devTag.toLowerCase().startsWith(query));
  const match = exact || partial;
  return match ? { id: match[0], record: match[1] } : null;
}

function parseCoordinate(value, current) {
  if (value === undefined) return NaN;
  if (value.startsWith('~')) return current + (parseFloat(value.slice(1)) || 0);
  return parseFloat(value);
}

const TIME_PRESETS = { sunrise: 0, day: 1000, morning: 1000, noon: 6000, sunset: 12000, night: 13000, midnight: 18000 };

const HELP_PAGES = [
  ['Teleport', '/tp <player> | /tp <x> <z> | /tp <x> <y> <z> (supports ~ relative) | /tpa <player> | /tpahere <player> | /tpaccept | /tpdeny'],
  ['Places', '/world <place> (alias /warp /goto) | /goto <x,y> (a parcel: lands on its scene spawn point) | /worlds | /spawn | /sethome | /home'],
  ['Builder', 'B on a parcel you own opens the Scene Builder: pick an item, click to place | G move | R rotate | [ ] scale | PgUp/PgDn height | Del delete | Ctrl+Z / Ctrl+Y undo/redo | Save, Publish | Set spawn here'],
  ['Codify', 'C opens Codify: write code, Add to world (private unless you tick Visible to others) | E on your block to edit it | F next to any firepit: Fry your Code (E sits on the benches)'],
  ['Graphics', '/quality low | medium | high | auto — the game lowers it by itself when it gets slow'],
  ['Economy', '/balance | /pay <player> <amount> | /buyland (the parcel you stand on) | /lands — Multiverse Coins are in-game only'],
  ['World', '/time set <day|noon|sunset|night|midnight|ticks> | /time add <ticks> | /time query | /gamerule doDaylightCycle <true|false> | /weather <clear|rain|snow|thunder> | /sound on|off | /music add <YouTube link> | /music list | /music next | /music clear'],
  ['Social', '/nick <name> | /msg <player> <text> (alias /tell /w) | /r <text> | /me <action> | /list | /coords | /clear | /invite'],
  ['Actions', '/e <wave|dance|cheer|clap|sit|think|ship|coffee> | /fly (or F) | E near laptops, seats, coffee, arcades, fishing spots, art, elevators | /commits'],
  ['Metro', 'N or /metro opens the transit map | /metro <place> rides the train there | walk through portals in Genesis Plaza'],
  ['Dungeon', '/bugs | /script <gc|try-catch|break|mutex|unit-test|reboot> | click bugs with the Git Commit Hammer'],
  ['Open Source HQ', '/mural <1-4> <code> | /pr <slot 1-8> <tree|lamp|banner|fountain|duck|flag|neon|bench> [hex] | /prs | /approve <n> | /merge <n> | /close <n>'],
  ['Loot', 'E opens chests & supply drops: each one gives a real code file, downloaded to your computer | /loot (nearest chest) | E or G picks up resources (Code Crystals, Coffee Beans, RAM, Git Gems, Bug Fragments, API Tokens), hold G to gather everything nearby | /bag'],
  ['Keynote & Green-Tech', '/keynotes | /watch [n] | /stream <YouTube/Twitch URL> [title] | /endstream | /wear <hoodie|mug|cap|headphones|none> | /plant | /energy']
];

function interpretChatCommand(inputBuffer) {
  const [rawCommand, ...args] = inputBuffer.slice(1).trim().split(/\s+/);
  const command = (rawCommand || '').toLowerCase();
  const context = { cursorPosition: localCursor.target.clone(), greenTechContains: (position) => { const district = City.districtAt(position.x, position.z); return district && district.world.key === 'greentech'; } };

  switch (command) {
    case 'help':
    case '?': {
      const page = parseInt(args[0], 10);
      if (page >= 1 && page <= HELP_PAGES.length) {
        const [title, text] = HELP_PAGES[page - 1];
        appendSystemMessage(`— ${title} (${page}/${HELP_PAGES.length}) — ${text}`);
      } else {
        HELP_PAGES.forEach(([title, text]) => appendSystemMessage(`${title}: ${text}`));
      }
      break;
    }
    case 'tp':
    case 'teleport': {
      if (args.length === 1) {
        const peer = findPeer(args[0]);
        if (!peer) { appendSystemMessage(`No player named "${args[0]}". Type /list.`); break; }
        flyTo(peer.record.target, new THREE.Vector3(0, 22, 30), `Teleported to ${peer.record.metadata.devTag}.`);
      } else if (args.length === 2 && findPeer(args[0])) {
        appendSystemMessage('Moving another player needs their consent: use /tpahere <player>.');
      } else if (args.length === 2 || args.length === 3) {
        const x = parseCoordinate(args[0], localCursor.target.x);
        const y = args.length === 3 ? parseCoordinate(args[1], localCursor.target.y) : 0;
        const z = parseCoordinate(args[args.length - 1], localCursor.target.z);
        if ([x, y, z].some(Number.isNaN)) { appendSystemMessage('Usage: /tp <x> <z> or /tp <x> <y> <z>'); break; }
        flyTo(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 30, 42), `Teleported to ${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)}.`);
      } else {
        appendSystemMessage('Usage: /tp <player> | /tp <x> <z> | /tp <x> <y> <z>');
      }
      break;
    }
    case 'tpa':
    case 'tpahere': {
      const peer = findPeer(args[0]);
      if (!peer) { appendSystemMessage(`Usage: /${command} <player>. Type /list to see who is online.`); break; }
      if (!socket || !socket.connected) { appendSystemMessage('Teleport requests need the multiplayer server.'); break; }
      socket.emit('teleport_request', { targetId: peer.id, mode: command === 'tpa' ? 'to' : 'here' });
      appendSystemMessage(`Teleport request sent to ${peer.record.metadata.devTag}.`);
      break;
    }
    case 'tpaccept': {
      if (!pendingTeleportRequest) { appendSystemMessage('You have no pending teleport requests.'); break; }
      const request = pendingTeleportRequest;
      pendingTeleportRequest = null;
      socket.emit('teleport_accept', { requesterId: request.fromId, mode: request.mode });
      if (request.mode === 'here') {
        const requester = remoteMeshPointers[request.fromId];
        if (requester) flyTo(requester.target, new THREE.Vector3(0, 22, 30), `Teleported to ${request.fromTag}.`);
      } else {
        appendSystemMessage(`${request.fromTag} is teleporting to you.`);
      }
      break;
    }
    case 'tpdeny':
      if (pendingTeleportRequest) {
        socket.emit('teleport_deny', { requesterId: pendingTeleportRequest.fromId });
        appendSystemMessage(`Denied ${pendingTeleportRequest.fromTag}'s request.`);
        pendingTeleportRequest = null;
      } else {
        appendSystemMessage('You have no pending teleport requests.');
      }
      break;
    case 'world':
    case 'warp':
    case 'goto': {
      // /goto x,y (or /goto x y): a Genesis City parcel, landing on its scene spawn point
      const parcelArgs = args.join(',').replace(/,+/g, ',');
      if (/^-?\d{1,3},-?\d{1,3}$/.test(parcelArgs) && window.SceneBuilder) { SceneBuilder.gotoParcel(parcelArgs); break; }
      const place = args[0] ? findPlace(args.join(' ')) : null;
      if (!place) { appendSystemMessage(`Usage: /${command} <place>. Places: ${places.map((candidate) => candidate.key).join(', ')}`); break; }
      teleportToPlace(place);
      break;
    }
    case 'worlds':
    case 'warps':
      appendSystemMessage(`Places: ${places.map((place) => place.key).join(', ')}`);
      break;
    case 'spawn':
      teleportToPlace(places[0]);
      break;
    case 'sethome':
      try { localStorage.setItem('github-multiverse-home', JSON.stringify(localCursor.target.toArray())); appendSystemMessage('Home set at your cursor. Use /home to come back.'); } catch (error) { appendSystemMessage('Could not save your home in this browser.'); }
      break;
    case 'home': {
      let home = null;
      try { home = JSON.parse(localStorage.getItem('github-multiverse-home')); } catch (error) { home = null; }
      if (!Array.isArray(home)) { appendSystemMessage('No home set. Point at a spot and type /sethome.'); break; }
      flyTo(new THREE.Vector3(...home), new THREE.Vector3(0, 26, 36), 'Welcome home.');
      break;
    }
    case 'time': {
      const action = (args[0] || '').toLowerCase();
      if (action === 'query' || !action) { appendSystemMessage(`It is ${ticksToClock(currentTicks())} (tick ${Math.floor(currentTicks())}).`); break; }
      let ticks;
      if (action === 'set') ticks = TIME_PRESETS[(args[1] || '').toLowerCase()] ?? parseInt(args[1], 10);
      else if (action === 'add') ticks = currentTicks() + parseInt(args[1], 10);
      if (!Number.isFinite(ticks)) { appendSystemMessage('Usage: /time set <day|noon|sunset|night|midnight|0-24000> | /time add <ticks> | /time query'); break; }
      requestWorldState({ ticks: ((ticks % 24000) + 24000) % 24000 });
      break;
    }
    case 'gamerule': {
      if ((args[0] || '').toLowerCase() !== 'dodaylightcycle' || !['true', 'false'].includes(args[1])) { appendSystemMessage('Usage: /gamerule doDaylightCycle <true|false>'); break; }
      requestWorldState({ cycle: args[1] === 'true', ticks: currentTicks() });
      break;
    }
    case 'weather': {
      const weather = (args[0] || '').toLowerCase();
      if (!['clear', 'rain', 'snow', 'thunder'].includes(weather)) { appendSystemMessage('Usage: /weather <clear|rain|snow|thunder>'); break; }
      requestWorldState({ weather });
      break;
    }
    case 'bed': {
      const spot = bedSpawn();
      if (spot) flyTo(spot, null, 'Back to your bed.');
      else appendSystemMessage('You have no bed yet. Sleep in a hotel bed (Multiverse Hotel or the mini hotels) to set your spawn point.');
      break;
    }
    case 'music': {
      Codify.musicChat(args, appendSystemMessage);
      break;
    }
    case 'sound': {
      const on = args[0] ? args[0] !== 'off' : !Sound.isEnabled();
      Sound.setEnabled(on);
      const soundButton = document.querySelector('#dock [data-action="sound"]');
      if (soundButton) soundButton.classList.toggle('muted', !on);
      appendSystemMessage(on ? 'Sound effects on.' : 'Sound effects off.');
      break;
    }
    case 'quality': {
      if (!args[0]) { appendSystemMessage(`Graphics quality: ${Quality.name()}. Use /quality low | medium | high | auto (or minimum on very old computers).`); break; }
      const chosen = Quality.choose(args[0].toLowerCase());
      appendSystemMessage(chosen ? `Graphics quality: ${chosen}.` : 'Use /quality minimum | low | medium | high | auto.');
      break;
    }
    case 'balance':
    case 'wallet':
      appendSystemMessage(`You have ${wallet} MVC (Multiverse Coins: in-game only, no real value). Earn them with commits, chests and supply drops; spend them on land parcels.`);
      break;
    case 'pay': {
      const amount = parseInt(args[1], 10);
      if (!args[0] || !(amount > 0)) { appendSystemMessage('Usage: /pay <player> <amount>'); break; }
      if (socket && socket.connected) socket.emit('pay', { to: args[0], amount });
      break;
    }
    case 'buyland':
    case 'land': {
      const parcel = ui.parcel.textContent;
      if (!/^-?\d+,-?\d+$/.test(parcel)) { appendSystemMessage('Stand on a Genesis City parcel to buy it.'); break; }
      const kind = City.landAt(avatar.position.x, avatar.position.z);
      if (kind === 'district') { appendSystemMessage('This parcel is part of a district. Walk to the empty green parcels around the city (press M for the map).'); break; }
      if (kind === 'sea') { appendSystemMessage('You are in the sea. Islands can be bought; the open water cannot.'); break; }
      if (kind === 'road') { appendSystemMessage('You are on a road. Step onto a green parcel next to it.'); break; }
      if (kind === 'scene') { appendSystemMessage('This parcel already has a community scene. Empty green parcels are for sale (press M).'); break; }
      if (kind === 'commons') { appendSystemMessage('The center of Genesis City is commons land: buy at a "PARCEL FOR SALE" sign here, or any empty green parcel farther out (press M).'); break; }
      interactionHooks().buyLand(parcel);
      break;
    }
    case 'lands': {
      const mine = Object.entries(City.landOwners).filter(([, land]) => localDeveloperData && land.owner.toLowerCase() === localDeveloperData.devTag.toLowerCase()).map(([parcel]) => parcel);
      appendSystemMessage(mine.length ? `Your parcels: ${mine.join(' · ')}` : 'You do not own land yet. Open the map (M): every green parcel around the districts is for sale (250 MVC).');
      break;
    }
    case 'nick': {
      if (!/^[A-Za-z0-9_]{3,16}$/.test(args[0] || '')) { appendSystemMessage('Usage: /nick <name> (3-16 letters, numbers or _)'); break; }
      if (socket && socket.connected) socket.emit('set_nick', args[0]);
      else { localDeveloperData.devTag = args[0]; restyleLocalCursor(args[0], localDeveloperData.color); ui.devTag.textContent = args[0]; }
      break;
    }
    case 'msg':
    case 'tell':
    case 'w':
    case 'r': {
      const isReply = command === 'r';
      const peer = isReply ? (lastWhisperFrom ? { id: lastWhisperFrom } : null) : findPeer(args[0]);
      const text = (isReply ? args : args.slice(1)).join(' ');
      if (!peer || !text) { appendSystemMessage(isReply ? 'Nobody to reply to.' : 'Usage: /msg <player> <text>'); break; }
      if (!socket || !socket.connected) { appendSystemMessage('Private messages need the multiplayer server.'); break; }
      socket.emit('private_message', { targetId: peer.id, text });
      break;
    }
    case 'me': {
      const text = args.join(' ');
      if (!text) { appendSystemMessage('Usage: /me <action>'); break; }
      if (socket && socket.connected) socket.emit('chat_message', `/me ${text}`);
      else displayChatMessage({ id: localDeveloperData.id, devTag: localDeveloperData.devTag, color: localDeveloperData.color, text: `/me ${text}` });
      break;
    }
    case 'list':
    case 'who':
    case 'online': {
      const names = Object.values(remoteMeshPointers).map((record) => {
        const district = City.districtAt(record.target.x, record.target.z);
        return `${record.metadata.devTag} (${district ? district.world.name : 'Genesis City'})`;
      });
      appendSystemMessage(`Online (${names.length + 1}): ${localDeveloperData ? localDeveloperData.devTag : 'you'} (you)${names.length ? ', ' + names.join(', ') : ''}`);
      break;
    }
    case 'coords':
    case 'pos': {
      const { x, y, z } = localCursor.target;
      appendSystemMessage(`Cursor at x=${x.toFixed(1)} y=${y.toFixed(1)} z=${z.toFixed(1)} · parcel ${ui.parcel.textContent}`);
      break;
    }
    case 'clear':
      ui.chatLog.innerHTML = '';
      break;
    case 'e':
    case 'emote': {
      const emote = (args[0] || '').toLowerCase();
      if (!Interactions.EMOTES[emote]) { appendSystemMessage(`Emotes: ${Object.keys(Interactions.EMOTES).map((name) => `/e ${name}`).join(', ')}`); break; }
      playLocalEmote(emote);
      break;
    }
    case 'fly':
      toggleFlight();
      break;
    case 'metro':
    case 'train':
      if (args[0] && findPlace(args.join(' '))) Metro.startRide(findPlace(args.join(' ')).key);
      else Metro.open();
      break;
    case 'commits':
      appendSystemMessage(`You shipped ${localCommits} commits. Sit at any laptop (E) to write more.`);
      break;
    case 'invite':
      copyInviteLink();
      break;
    default:
      if (!GameSystems.command(command, args, context) && !LootSystem.command(command, args)) appendSystemMessage(`Unknown command "/${command}". Type /help.`);
  }
}

function requestWorldState(change) {
  if (socket && socket.connected) {
    socket.emit('world_state_change', change);
  } else {
    applyWorldState({ ...worldClock, ...change, by: 'You', kind: change.weather ? 'weather' : 'cycle' in change ? 'cycle' : 'time' });
  }
}

function applyWorldState(stateUpdate) {
  worldClock.ticks = stateUpdate.ticks;
  worldClock.cycle = stateUpdate.cycle;
  worldClock.weather = stateUpdate.weather;
  worldClock.at = performance.now() - (stateUpdate.elapsedMs || 0);
  if (stateUpdate.by && stateUpdate.kind) {
    if (stateUpdate.kind === 'weather') appendSystemMessage(`${stateUpdate.by} set the weather to ${stateUpdate.weather}.`);
    else if (stateUpdate.kind === 'cycle') appendSystemMessage(`${stateUpdate.by} set doDaylightCycle to ${stateUpdate.cycle}.`);
    else appendSystemMessage(`${stateUpdate.by} set the time to ${ticksToClock(stateUpdate.ticks)}.`);
  }
}

function displayChatMessage(message) {
  const item = document.createElement('li');
  const district = City.districtAt(...(message.id === (localDeveloperData && localDeveloperData.id) ? [localCursor.target.x, localCursor.target.z] : remoteMeshPointers[message.id] ? [remoteMeshPointers[message.id].target.x, remoteMeshPointers[message.id].target.z] : [0, 0]));
  const isAction = message.text.startsWith('/me ');
  if (district && !message.private) {
    const place = document.createElement('span');
    place.className = 'place-tag';
    place.textContent = `[${district.world.name}] `;
    item.appendChild(place);
  }
  const author = document.createElement('span');
  author.className = 'author';
  author.style.color = message.color;
  author.textContent = message.private ? `${message.devTag} whispers: ` : isAction ? `* ${message.devTag} ` : `${message.devTag}: `;
  item.append(author, document.createTextNode(isAction ? message.text.slice(4) : message.text));
  if (message.private) item.classList.add('whisper');
  appendChatItem(item);

  const isLocal = localDeveloperData && message.id === localDeveloperData.id;
  const record = isLocal ? localCursor : remoteMeshPointers[message.id];
  if (record && !message.private) showChatBubble(record, isAction ? `* ${message.text.slice(4)}` : message.text);
}

function appendSystemMessage(text) {
  const item = document.createElement('li');
  item.className = 'system';
  item.textContent = text;
  appendChatItem(item);
}

function appendChatItem(item) {
  ui.chatLog.appendChild(item);
  // Like Decentraland, messages fade away after a while (Enter shows the history)
  setTimeout(() => item.classList.add('faded'), 25000);
  while (ui.chatLog.children.length > 150) ui.chatLog.firstChild.remove();
  ui.chatLog.scrollTop = ui.chatLog.scrollHeight;
}

// ============================================================================
// NETWORK LAYER
// ============================================================================
function setConnectionStatus(state, label) {
  ui.connectionDot.className = state;
  ui.connection.textContent = label;
}

function updateWalletChip() {
  const amount = document.getElementById('wallet-amount');
  if (amount) amount.textContent = wallet.toLocaleString('en-US');
  const balance = document.getElementById('mvc-balance');
  if (balance) balance.textContent = wallet.toLocaleString('en-US');
  const chip = document.getElementById('wallet-chip');
  if (chip) { chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump'); }
}

function updateOnlineCounter() {
  ui.online.textContent = `${Object.keys(remoteMeshPointers).length + 1} online`;
}

function registerLocalDeveloper(identity) {
  localDeveloperData = identity;
  ui.devTag.textContent = identity.devTag;
  restyleLocalCursor(identity.devTag, identity.color);
}

function setLocalWearable(item) {
  localWearable = item;
  setCursorWearable(localCursor, item);
  if (socket && socket.connected) socket.emit('set_wearable', item);
}

function setupNetwork(session) {
  // Show the username chosen at sign-in above the cursor right away, without
  // waiting for the server (it confirms the same name from the account)
  ui.devTag.textContent = session.username;
  restyleLocalCursor(session.username, '#c7ceea');
  GameSystems.init({
    socket,
    scene,
    system: appendSystemMessage,
    localTag: () => (localDeveloperData ? localDeveloperData.devTag : session.username),
    setWearable: setLocalWearable,
    openStream,
    lensActive: () => LootSystem.modifiers().lens
  });

  if (!socket) {
    setConnectionStatus('offline', 'Solo mode (no server)');
    registerLocalDeveloper({ id: 'local', devTag: session.username, color: '#b5ead7' });
    appendSystemMessage('Multiplayer server not found: run "npm start" to explore with other devs.');
    return;
  }

  socket.on('connect_error', (error) => {
    if (error.message === 'unauthorized') Auth.signOut();
  });

  socket.on('connect', () => setConnectionStatus('online', 'Connected'));
  socket.on('disconnect', () => { setConnectionStatus('offline', 'Reconnecting...'); clearRemotePeers(); });

  socket.on('wallet', ({ coins, earned, spent, reason } = {}) => {
    wallet = coins;
    updateWalletChip();
    if (earned) { appendSystemMessage(`+${earned} MVC (${reason}). Balance: ${coins} MVC.`); Sound.play('coin'); }
    if (spent) appendSystemMessage(`-${spent} MVC (${reason}). Balance: ${coins} MVC.`);
  });
  socket.on('lands', (lands) => { City.setLandOwners(lands); CityMap.refresh(); });
  socket.on('wake_up', () => { if (sleepingLocal) { sleepingLocal = false; document.body.classList.remove('sleeping'); } });

  socket.on('local_registration_success', (assignedIdentity) => {
    clearRemotePeers();
    // An outdated server.js would assign a random "Dev_" name: keep the account name
    registerLocalDeveloper({ ...assignedIdentity, devTag: /^Dev_/.test(assignedIdentity.devTag || '') || !assignedIdentity.devTag ? session.username : assignedIdentity.devTag });
    // The account's saved look wins; a look chosen before connecting is uploaded
    if (assignedIdentity.avatar) {
      localLook = Avatar.sanitize(assignedIdentity.avatar);
      applyLook(localCursor, localLook);
      try { localStorage.setItem('multiverse-look', JSON.stringify(localLook)); } catch (error) { /* storage blocked */ }
    }
    else socket.emit('set_avatar', localLook);
    lastEmittedPosition.set(Infinity, Infinity, Infinity);
    emitCursor(true);
    if (localWearable) socket.emit('set_wearable', localWearable);
  });
  socket.on('sync_entire_developer_pool', (developers) => developers.forEach(instantiateNetworkPeerCursor));
  socket.on('new_developer_joined', (peer) => {
    instantiateNetworkPeerCursor(peer);
    appendSystemMessage(`${peer.devTag} joined the multiverse.`);
  });
  socket.on('peer_cursor_transformed', ({ id, position }) => {
    const peer = remoteMeshPointers[id];
    if (peer) peer.target.set(position.x, position.y, position.z);
  });
  socket.on('developer_left_network', (peerId) => {
    const peer = remoteMeshPointers[peerId];
    if (peer) appendSystemMessage(`${peer.metadata.devTag} left the multiverse.`);
    removeNetworkPeerCursor(peerId);
  });
  socket.on('peer_updated', (update) => {
    if (localDeveloperData && update.id === localDeveloperData.id) {
      if (update.devTag !== localDeveloperData.devTag) {
        localDeveloperData.devTag = update.devTag;
        ui.devTag.textContent = update.devTag;
        restyleLocalCursor(update.devTag, localDeveloperData.color);
      }
      return;
    }
    const peer = remoteMeshPointers[update.id];
    if (!peer) return;
    if (update.devTag && update.devTag !== peer.metadata.devTag) {
      appendSystemMessage(`${peer.metadata.devTag} is now known as ${update.devTag}.`);
      peer.metadata.devTag = update.devTag;
      peer.domElement.textContent = update.devTag;
    }
    if ('wearable' in update) setCursorWearable(peer, update.wearable);
    if (update.avatar) applyLook(peer, update.avatar);
    if ('vehicle' in update) Vehicles.setRemote(update.id, peer, update.vehicle);
  });
  socket.on('chat_message', displayChatMessage);
  socket.on('peer_emote', ({ id, emote }) => applyEmote(remoteMeshPointers[id], emote));
  socket.on('commit_leaderboard', (leaderboard) => {
    updateCommitBoards(leaderboard);
    const mine = leaderboard.find(([name]) => localDeveloperData && name === localDeveloperData.devTag);
    if (mine) localCommits = mine[1];
  });
  socket.on('private_message', (message) => {
    if (message.fromId !== localDeveloperData.id) lastWhisperFrom = message.fromId;
    displayChatMessage({ ...message, private: true, devTag: message.fromId === localDeveloperData.id ? `You -> ${message.toTag}` : message.devTag });
  });
  socket.on('system_message', appendSystemMessage);
  socket.on('world_state', applyWorldState);
  socket.on('teleport_request', (request) => {
    pendingTeleportRequest = request;
    appendSystemMessage(request.mode === 'to'
      ? `${request.fromTag} wants to teleport to you. Type /tpaccept or /tpdeny.`
      : `${request.fromTag} wants you to teleport to them. Type /tpaccept or /tpdeny.`);
  });
  socket.on('teleport_accepted', ({ byId, byTag, mode }) => {
    if (mode !== 'to') { appendSystemMessage(`${byTag} accepted and is coming to you.`); return; }
    const target = remoteMeshPointers[byId];
    if (target) flyTo(target.target, new THREE.Vector3(0, 22, 30), `Teleported to ${byTag}.`);
  });
  socket.on('teleport_denied', ({ byTag }) => appendSystemMessage(`${byTag} denied your teleport request.`));
}

// ============================================================================
// RUNTIME LOOP
// ============================================================================
function animate() {
  requestAnimationFrame(animate);
  const frameSeconds = Math.min(clock.getDelta(), 0.25);
  Quality.sample(frameSeconds);
  const deltaSeconds = Math.min(frameSeconds, 0.1);
  const elapsed = clock.elapsedTime;
  const smoothing = 1 - Math.exp(-deltaSeconds * 18);

  // Walking speed no longer depends on the frame rate: slow frames are split
  // into small physics steps instead of being cut short (which made you crawl)
  if (Metro.isRiding()) Metro.update(camera, controls);
  else if (viewMode === 'explore') { let left = frameSeconds; while (left > 0.0001) { const step = Math.min(left, 0.1); updateAvatar(step); left -= step; } } else walkCamera(frameSeconds);
  TechSquare.update(elapsed, deltaSeconds);
  Vehicles.update(deltaSeconds);
  controls.update();
  updateLocalCursorFromPointer();
  emitCursor(false);

  const { flash, haze, inCloud } = City.updateEnvironment({ ticks: currentTicks(), weather: worldClock.weather, camera, focus: controls.target, deltaSeconds, time: elapsed });
  // Firelight: the firepits register themselves once built; 0 by day, 1 at night with a dusk/dawn ramp
  (window.firepits || []).forEach((pit) => { if (!pit.userData.fireLit) { pit.userData.fireLit = true; FireLights.register(pit, { radius: 11, height: 1.4, strength: 1.15 }); } });
  {
    const ticks = currentTicks();
    const night = ticks < 11500 ? 0 : ticks < 13000 ? (ticks - 11500) / 1500 : ticks < 22800 ? 1 : ticks < 24000 ? (24000 - ticks) / 1200 : 0;
    FireLights.update(camera, elapsed, night, Quality.level());
  }
  DistanceCulling.update(elapsed);
  // High altitude blurs the view a little; flying through a cloud blurs it a lot
  // (a CSS blur on the whole canvas is very expensive, so it is skipped on lighter quality levels)
  const blur = Quality.level() >= 2 ? Math.round((haze * 1.6 + inCloud * 4) * 4) / 4 : 0;
  if (blur !== lastAltitudeBlur) { renderer.domElement.style.filter = blur ? `blur(${blur}px)` : ''; lastAltitudeBlur = blur; }
  if (flash) lightningUntil = performance.now() + 120;
  ui.flash.style.opacity = performance.now() < lightningUntil ? '0.55' : '0';

  // Only animate what is near the camera (the list is refreshed twice a second)
  if (elapsed - lastAnimatedRefresh > 0.5) {
    lastAnimatedRefresh = elapsed;
    nearbyAnimated.length = 0;
    PropKit.animatedObjects.forEach((object) => {
      object.getWorldPosition(animatedProbe);
      if (animatedProbe.distanceToSquared(camera.position) < 180 * 180) nearbyAnimated.push(object);
    });
  }
  nearbyAnimated.forEach((object) => object.userData.animate(elapsed));
  Codify.update(elapsed);
  Codify.updateMusic(currentTicks() >= 12000, deltaSeconds);
  {
    // Footsteps: stone in Genesis Plaza and on paths, an echo underground, grass elsewhere
    const here = City.districtAt(avatar.position.x, avatar.position.z);
    const surface = avatar.position.y < -20 ? 'cave' : here && ['plaza', 'techsquare', 'apple', 'hotel'].includes(here.world.key) ? 'stone' : here && ['lobby', 'house', 'arcade', 'gallery'].includes(here.world.key) ? 'wood' : 'grass';
    const ticks = currentTicks();
    // Distance to the nearest firepit (for the crackling fire sound)
    let fireDistance = Infinity;
    if (window.firepits && hudFrame % 6 === 0) {
      window.firepits.forEach((pit) => { pit.getWorldPosition(firepitProbe); fireDistance = Math.min(fireDistance, firepitProbe.distanceTo(avatar.position)); });
      lastFireDistance = fireDistance;
    }
    // Streets and the paved commons sound like stone; the parcels for sale sound like grass
    const onGrass = !here && avatar.position.y > -20 && !['road', 'commons'].includes(City.landAt(avatar.position.x, avatar.position.z));
    Sound.update(deltaSeconds, { moving: avatar.moving && viewMode === 'explore', grounded: avatar.grounded || flying, running: keysPressed.has('shift'), surface: onGrass ? 'grass' : surface === 'grass' && !here ? 'stone' : surface, night: ticks > 13000 && ticks < 23000 && avatar.position.y > -20, fireDistance: lastFireDistance, day: ticks < 12000 && avatar.position.y > -20 });
  }
  Cafe.update(elapsed);
  LootSystem.update(elapsed, deltaSeconds);
  if (viewMode === 'explore') Prank.update(avatar.position);
  Interactions.update(avatar.position, !!avatar.moving);
  // District titles fade out when the camera gets close, so they never block the view
  City.districts.forEach((district) => {
    const titlePosition = district.title.getWorldPosition(new THREE.Vector3());
    const distance = titlePosition.distanceTo(camera.position);
    const fadeStart = district.world.region ? 160 : 55;
    district.title.material.opacity = Math.max(0, Math.min(1, (distance - fadeStart) / 40));
    district.title.visible = district.title.material.opacity > 0.01;
  });

  [localCursor, ...Object.values(remoteMeshPointers)].forEach((record, index) => {
    record.mesh.position.lerp(record.target, record.isLocal || record.target.distanceTo(record.mesh.position) > 60 ? 1 : smoothing);
    record.mesh.rotation.y = Math.atan2(camera.position.x - record.mesh.position.x, camera.position.z - record.mesh.position.z);
    const pivot = record.mesh.userData.arrowPivot;
    pivot.position.y = 1.9 + Math.sin(elapsed * 3 + index) * 0.08;
    pivot.rotation.set(0, 0, 0);
    pivot.scale.setScalar(1);
    // Emote animations (wave, dance, cheer, clap, sit...)
    const emote = record.emote && record.emote.until > performance.now() ? record.emote.type : null;
    if (emote === 'wave') pivot.rotation.z = Math.sin(elapsed * 10) * 0.35;
    else if (emote === 'dance') { pivot.rotation.y = elapsed * 6; pivot.position.y += Math.abs(Math.sin(elapsed * 8)) * 0.5; }
    else if (emote === 'cheer') pivot.position.y += Math.abs(Math.sin(elapsed * 7)) * 1.2;
    else if (emote === 'clap') pivot.scale.setScalar(1 + Math.abs(Math.sin(elapsed * 12)) * 0.15);
    else if (emote === 'think') pivot.rotation.z = 0.25;
    else if (emote === 'sit') pivot.position.y = 1.2;
    projectToScreen(record);
  });

  updateHud();
  // Keep the third-person camera from clipping through walls and ceilings
  let restoreCamera = null;
  if (viewMode === 'explore') {
    const toCamera = camera.position.clone().sub(controls.target);
    const distance = toCamera.length();
    cameraRay.set(controls.target, toCamera.normalize());
    cameraRay.far = distance;
    // Only real walls and ceilings pull the camera in; small props, trees and
    // benches behind the cursor are ignored, so the view never jumps onto it
    const hit = cameraRay.intersectObjects(City.collidablesAt(controls.target.x, controls.target.z), true).find((candidate) => isSolidHit(candidate) && cameraBlocker(candidate.object));
    if (hit && hit.distance > 0.5) {
      restoreCamera = camera.position.clone();
      camera.position.copy(controls.target).addScaledVector(toCamera, Math.max(hit.distance - 0.3, 1.2));
    }
    // Never look from under the ground (temporary, like the wall correction)
    const cameraGround = groundHeightAt(camera.position.x, camera.position.z, camera.position.y + 1);
    if (camera.position.y < cameraGround + 0.6) {
      if (!restoreCamera) restoreCamera = camera.position.clone();
      camera.position.y = cameraGround + 0.6;
    }
  }
  renderer.render(scene, camera);
  VideoScreens.update(camera, avatar.position, () => City.collidablesAt(avatar.position.x, avatar.position.z));
  if (restoreCamera) camera.position.copy(restoreCamera);
}

// ============================================================================
// EMOTES, COMMITS, INVITES AND PRIVATE LOBBIES
// ============================================================================
function applyEmote(record, type) {
  if (!record) return;
  record.emote = type ? { type, until: performance.now() + (type === 'sit' ? 600000 : 4000) } : null;
  if (type && Interactions.EMOTES[type]) showChatBubble(record, Interactions.EMOTES[type]);
}

function playLocalEmote(type) {
  applyEmote(localCursor, type);
  if (socket && socket.connected) socket.emit('emote', type);
}

function updateCommitBoards(leaderboard) {
  (window.commitBoards || []).forEach((draw) => draw(leaderboard));
}

function inviteLink() {
  const url = new URL(location.href);
  url.hash = '';
  const district = City.districtAt(avatar.position.x, avatar.position.z);
  if (district) url.hash = district.world.key;
  return url.toString();
}

async function copyInviteLink() {
  const link = inviteLink();
  try {
    await navigator.clipboard.writeText(link);
    appendSystemMessage(`Invite link copied: ${link}`);
  } catch (error) {
    appendSystemMessage(`Share this invite link: ${link}`);
  }
}

function createPrivateLobby() {
  const id = Math.random().toString(36).slice(2, 8);
  const url = new URL(location.href);
  url.searchParams.set('lobby', id);
  url.hash = 'plaza';
  location.href = url.toString();
}

// Optional MVC token on a testnet: the wallet bundle is loaded only when the
// server has it configured, after the world is running (never blocks loading)
let web3Enabled = false;
async function initWeb3() {
  if (!socket) return;
  try {
    const config = await (await fetch('/api/web3/config')).json();
    if (!config.enabled) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/web3.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('wallet bundle missing (run npm run build:web3)'));
      document.head.appendChild(script);
    });
    web3Enabled = await window.MultiverseWeb3.init(config, {
      socket,
      system: appendSystemMessage,
      wallet: () => wallet,
      releaseKeys: () => keysPressed.clear()
    });
  } catch (error) {
    web3Enabled = false;
    console.warn('[WEB3] disabled in this browser:', error.message);
  }
}

function interactionHooks() {
  return {
    system: appendSystemMessage,
    buff: (name, seconds) => LootSystem.addBuff(name, seconds),
    emote: (type) => (type ? playLocalEmote(type) : applyEmote(localCursor, null)),
    setAvatarPosition: (position) => { avatar.position.copy(position); avatar.velocityY = 0; flying = false; },
    sleep: (bed) => {
      const spot = bed.getWorldPosition(new THREE.Vector3());
      avatar.position.set(spot.x, spot.y + 0.6, spot.z);
      avatar.velocityY = 0;
      flying = false;
      playLocalEmote('sit');
      try { localStorage.setItem('multiverse-bed', JSON.stringify({ x: spot.x, y: spot.y + 0.6, z: spot.z })); } catch (error) { /* storage blocked */ }
      sleepingLocal = true;
      document.body.classList.add('sleeping');
      appendSystemMessage('Good night! Your spawn point is now this bed (/bed). Move to get up.');
      if (socket && socket.connected) socket.emit('sleep', true);
      else if (currentTicks() > 12500 && currentTicks() < 23500) requestWorldState({ ticks: 0 });
    },
    buyLand: (parcel) => {
      const owner = City.landOwner(parcel);
      if (owner) { appendSystemMessage(`Parcel ${parcel} belongs to ${owner}.`); return; }
      if (!socket || !socket.connected) { appendSystemMessage('Land can only be bought when connected to the server.'); return; }
      // With the MVC token configured, land is paid on-chain from the player's wallet
      if (web3Enabled && window.MultiverseWeb3) { MultiverseWeb3.buyLand(parcel); return; }
      if (window.confirm(`Buy parcel ${parcel} for 250 MVC (in-game coins, not real money)? You have ${wallet} MVC.`)) socket.emit('buy_land', { parcel });
    },
    inspect: (title, info) => { ui.infoTitle.textContent = title; ui.infoType.textContent = info; ui.infoCard.style.display = 'block'; },
    jumpTo: (key) => { const place = findPlace(key); if (place) teleportToPlace(place); },
    commitCount: () => localCommits,
    launch: (velocity) => { avatar.velocityY = velocity; avatar.grounded = false; flying = false; },
    openMetro: () => Metro.open(),
    claimReward: () => {
      if (socket && socket.connected) socket.emit('tower_reward');
      else appendSystemMessage('You conquered the Gravity Flip tower! (Rewards are saved on the multiplayer server.)');
    },
    commit: (lines) => {
      localCommits++;
      if (socket && socket.connected) socket.emit('commit', { lines });
      else { appendSystemMessage(`Commit #${localCommits} pushed (${lines} lines).`); updateCommitBoards([[localDeveloperData.devTag, localCommits]]); }
    },
    broadcast: (text) => {
      if (socket && socket.connected) socket.emit('chat_message', `/me ${text}`);
      else displayChatMessage({ id: localDeveloperData.id, devTag: localDeveloperData.devTag, color: localDeveloperData.color, text: `/me ${text}` });
    }
  };
}

// ============================================================================
// LOOT HOOKS
// ============================================================================
function lootHooks() {
  return {
    socket,
    scene,
    system: appendSystemMessage,
    localTag: () => (localDeveloperData ? localDeveloperData.devTag : 'you'),
    groundHeightAt,
    avatarPosition: () => avatar.position,
    equipHammer: () => GameSystems.equipHammer(),
    toggleWearable: (item) => {
      const next = localWearable === item ? null : item;
      localWearable = next;
      setCursorWearable(localCursor, next);
      if (!(socket && socket.connected)) return;
      // Online, the server already broadcast the change to everyone else
    },
    teleportRandom: () => {
      const place = places[Math.floor(Math.random() * places.length)];
      teleportToPlace(place);
    },
    revertTeleport: () => {
      if (!lastPositionBeforeTeleport) { appendSystemMessage('Nothing to revert: you have not teleported yet.'); return; }
      flyTo(lastPositionBeforeTeleport.clone(), null, 'git revert: back to where you were.');
    },
    confetti: launchConfetti
  };
}

function launchConfetti() {
  for (let i = 0; i < 60; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti';
    piece.style.left = `${50 + (Math.random() - 0.5) * 30}vw`;
    piece.style.background = ['#2da44e', '#ffd166', '#3a86ff', '#ff006e', '#8338ec'][i % 5];
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}vw`);
    piece.style.animationDelay = `${Math.random() * 0.3}s`;
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 2200);
  }
}

// ============================================================================
// BOOT: the world renders behind the welcome screen while the dev signs in
// ============================================================================
initEngine();
loadUniverse()
  .then(() => {
    // A deep link (#apple) to a place built later: go there once everything is loaded
    const hash = location.hash.slice(1);
    if (hash && hash !== 'plaza' && findPlace(hash)) flyTo(placeLanding(findPlace(hash)), null);
  })
  .catch((error) => {
    console.error('Could not load the universe:', error);
    appendSystemMessage('Could not load maps/worlds.json.');
  });
const universeReady = plazaReady.then(() => {
  const plaza = findPlace('plaza') || places[0];
  if (plaza) flyTo(placeLanding(plaza), null);
});

// After login the launcher (auth.js) opens; LAUNCH GAME or a card's play
// button enters the world at the chosen spot once it has finished loading
const launched = Auth.signIn().then((session) => Launcher.open(session, universeReady));

// Where the launcher's play buttons drop the dev
function enterFromLauncher(entry) {
  let quality = null;
  let sound = null;
  try { quality = localStorage.getItem('multiverse-quality'); sound = localStorage.getItem('multiverse-sound'); } catch (error) { quality = null; }
  if (quality) Quality.choose(quality);
  if (sound) Sound.setEnabled(sound !== 'off');
  if (entry === 'underground') {
    interactionHooks().setAvatarPosition(new THREE.Vector3(-62, -59.6, 30));
    appendSystemMessage('Welcome to the Underground Cafe, below Genesis Plaza. E at the menu to order.');
  } else if (entry && entry !== 'plaza' && findPlace(entry)) teleportToPlace(findPlace(entry));
}

Promise.all([launched, universeReady]).then(([launch]) => {
  const session = launch.session;
  if (Auth.hasServer) socket = io({ auth: { token: session.token, lobby: lobbyId } });
  setupNetwork(session);
  enterFromLauncher(launch.entry);
  // First time only: customize the cursor before entering (Decentraland-style).
  // A look saved in this browser or in the account (server) skips it.
  let customized = false;
  try { customized = !!localStorage.getItem('multiverse-look'); } catch (error) { customized = false; }
  if (!customized && !socket) openAvatarCustomizer();
  else if (!customized) {
    let decided = false;
    socket.once('local_registration_success', (identity) => { decided = true; if (!identity.avatar) openAvatarCustomizer(); });
    setTimeout(() => { if (!decided) openAvatarCustomizer(); }, 8000);
  }
  LootSystem.init(lootHooks());
  Interactions.init(interactionHooks());
  CityMap.init({
    position: () => avatar.position,
    peers: () => Object.values(remoteMeshPointers).map((record) => ({ x: record.target.x, z: record.target.z, color: record.metadata.color })),
    jumpTo: (x, z) => flyTo(new THREE.Vector3(x, 0, z), null, 'Jumped in.'),
    buy: (parcel) => interactionHooks().buyLand(parcel),
    overheadView: () => setViewMode('map'),
    releaseKeys: () => keysPressed.clear()
  });
  TechSquare.init(socket, scene, appendSystemMessage);
  SceneBuilder.init({
    socket,
    system: appendSystemMessage,
    username: () => session.username,
    flyTo: (target, message) => flyTo(target, null, message),
    jumpTo: (key) => { const place = findPlace(key); if (place) teleportToPlace(place); return Boolean(place); }
  });
  initWeb3();
  plazaReady.then(() => CommunityEvents.init({
    scene,
    socket,
    system: appendSystemMessage,
    flyTo: (target, message) => flyTo(target, null, message),
    releaseKeys: () => keysPressed.clear(),
    avatarPosition: () => avatar.position
  })).catch((error) => console.warn('[EVENTS] disabled:', error));
  Cafe.init({
    scene,
    socket,
    system: appendSystemMessage,
    wallet: () => wallet,
    buff: (name, seconds) => LootSystem.addBuff(name, seconds),
    emote: (type) => playLocalEmote(type),
    releaseKeys: () => keysPressed.clear(),
    spotInFront: (distance) => {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      return avatar.position.clone().add(forward.multiplyScalar(distance));
    }
  });
  Codify.init({
    scene,
    socket,
    system: appendSystemMessage,
    localTag: () => (localDeveloperData ? localDeveloperData.devTag : session.username),
    emit: (event, data) => { if (socket && socket.connected) socket.emit(event, data); },
    avatarPosition: () => avatar.position,
    releaseKeys: () => keysPressed.clear(),
    spotInFront: (distance) => {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const spot = avatar.position.clone().add(forward.multiplyScalar(distance));
      spot.y = groundHeightAt(spot.x, spot.z, avatar.position.y + 2);
      return spot;
    }
  });
  Vehicles.init({
    scene,
    system: appendSystemMessage,
    avatarPosition: () => avatar.position,
    setVehicle: (key) => { if (socket && socket.connected) socket.emit('set_vehicle', key); }
  });
  Metro.init({
    scene,
    system: appendSystemMessage,
    findPlace,
    placeLanding,
    avatarPosition: () => avatar.position,
    arrive: (place) => flyTo(placeLanding(place), null, `Arrived at ${place.name}.`)
  });
  document.getElementById('invite-button').addEventListener('click', copyInviteLink);
  document.getElementById('lobby-button').addEventListener('click', createPrivateLobby);
  if (lobbyId) {
    document.getElementById('lobby-badge').textContent = `Private lobby ${lobbyId}`;
    document.getElementById('lobby-badge').style.display = 'inline-block';
    appendSystemMessage(`You are in private lobby "${lobbyId}". Only devs with your invite link can see you here.`);
  }
  document.getElementById('logout-button').addEventListener('click', () => Auth.signOut());
  appendSystemMessage(`Welcome to GitHub Multiverse, ${session.username}! Walk with W A S D, jump with Space, run with Shift, drag to look around, M for the map.`);
  appendSystemMessage('Open chests with E: each one gives a real code file that is downloaded to your computer. Press Enter (or T, or /) to chat. Type /help for every command.');
});

// ============================================================================
// THEATER MODE: ESC SHRINKS THE GAME INTO A WINDOW (EAGLERCRAFT PLAYER STYLE)
// ============================================================================
// Esc with nothing open steps out of the game: it keeps running in a smaller
// frame in the middle of the page, with a bar below it (version, fullscreen,
// controls, reload, more, exit to the launcher). Esc again, the fullscreen
// button or a click on the game goes back in. Keys do nothing while outside.
const Theater = (() => {
  const ICONS = {
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    keys: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>',
    reload: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    power: '<path d="M12 3v9M6.3 7.3a8 8 0 1 0 11.4 0"/>'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  let bar = null;
  let active = false;

  function css() {
    const style = document.createElement('style');
    style.textContent = `
      body.theater { background: radial-gradient(900px 260px at 50% -60px, rgba(46, 160, 67, 0.22), transparent 70%), #0f1115; }
      body.theater > *:not(canvas):not(#theater) { visibility: hidden !important; }
      body.theater > canvas { position: fixed !important; left: 50% !important; top: 32px !important; inset: auto; transform: translateX(-50%);
        width: min(960px, calc(100vw - 32px), calc((100vh - 150px) * 16 / 9)) !important; height: auto !important; aspect-ratio: 16 / 9; object-fit: cover;
        border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55); cursor: pointer !important; filter: none !important; }
      #theater { display: none; position: fixed; left: 50%; transform: translateX(-50%); z-index: 2147483000; align-items: center; gap: 12px; padding: 10px 12px 10px 14px; border-radius: 18px;
        background: #1c1f26; border: 1px solid rgba(255, 255, 255, 0.08); color: #fff; font: 600 14px Inter, "Segoe UI", Arial, sans-serif; box-sizing: border-box; }
      body.theater #theater { display: flex; }
      #theater .th-logo { width: 32px; height: 32px; border-radius: 8px; background: #2ea043 url(assets/icon.png) center / 72% no-repeat; flex: none; }
      #theater .th-name { font: 13px "Press Start 2P", monospace; letter-spacing: 0.02em; white-space: nowrap; }
      #theater .th-place { color: #8b949e; font-weight: 500; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #theater .th-gap { flex: 1; }
      #theater button { width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.12); background: #262a32; color: #e9ecef; cursor: pointer; display: grid; place-items: center; flex: none; }
      #theater button:hover { background: #30363d; }
      #theater button.th-power { background: #5c1f24; border-color: #7d2a31; color: #ff8a8a; }
      #theater .th-pop { display: none; position: absolute; right: 0; bottom: 58px; min-width: 240px; padding: 12px 14px; border-radius: 14px; background: #1c1f26; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5); font-weight: 500; font-size: 13px; line-height: 1.8; color: #ced4da; }
      #theater .th-pop.open { display: block; }
      #theater .th-pop b { color: #fff; }
      #theater .th-pop a { display: block; color: #e9ecef; text-decoration: none; cursor: pointer; padding: 2px 0; }
      #theater .th-pop a:hover { color: #3fb950; }
      @media (max-width: 560px) { #theater .th-place { display: none; } #theater button { width: 36px; height: 36px; } }
    `;
    document.head.appendChild(style);
  }

  function build() {
    css();
    bar = document.createElement('div');
    bar.id = 'theater';
    bar.innerHTML = `<span class="th-logo"></span><span class="th-name"></span><span class="th-place"></span><span class="th-gap"></span>
      <button type="button" data-act="full" title="Back to the game (Esc)">${icon('full')}</button>
      <button type="button" data-act="keys" title="Controls">${icon('keys')}</button>
      <button type="button" data-act="reload" title="Reload">${icon('reload')}</button>
      <button type="button" data-act="more" title="More">${icon('more')}</button>
      <button type="button" class="th-power" data-act="power" title="Exit to the launcher">${icon('power')}</button>
      <div class="th-pop" data-pop="keys"><b>Controls</b><br>W A S D walk · Shift run · Space jump<br>Drag look around · Wheel zoom<br>E interact · G gather · F fly or fry your code<br>C Codify · M map · N metro · B builder<br>Enter chat · /help commands · Esc this screen</div>
      <div class="th-pop" data-pop="more"><a data-go="map">Genesis City map</a><a data-go="metro">Multiverse Metro</a><a data-go="invite">Copy the invite link</a><a data-go="shot">Screenshot mode (Shift+U)</a></div>`;
    document.body.appendChild(bar);
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-act]');
      const go = event.target.closest('[data-go]');
      if (go) {
        const what = go.dataset.go;
        exit();
        if (what === 'map') CityMap.toggle();
        else if (what === 'metro') Metro.open();
        else if (what === 'shot') document.body.classList.add('hide-ui');
        else if (what === 'invite') navigator.clipboard?.writeText(location.href).then(() => appendSystemMessage('Invite link copied.')).catch(() => appendSystemMessage(location.href));
        return;
      }
      if (!button) return;
      const act = button.dataset.act;
      if (act === 'full') exit();
      else if (act === 'reload') location.reload();
      else if (act === 'power') location.href = location.pathname + (lobbyId ? `?lobby=${lobbyId}` : '');
      else {
        const pop = bar.querySelector(`[data-pop="${act}"]`);
        const open = !pop.classList.contains('open');
        bar.querySelectorAll('.th-pop').forEach((other) => other.classList.remove('open'));
        pop.classList.toggle('open', open);
      }
    });
    renderer.domElement.addEventListener('pointerdown', (event) => { if (active) { event.stopImmediatePropagation(); exit(); } }, true);
    window.addEventListener('resize', place);
  }

  // The bar sits right under the shrunken game
  function place() {
    if (!active) return;
    const rect = renderer.domElement.getBoundingClientRect();
    bar.style.top = `${Math.round(rect.bottom + 12)}px`;
    bar.style.width = `${Math.round(rect.width)}px`;
  }

  function enter() {
    if (!bar) build();
    active = true;
    keysPressed.clear();
    const here = (document.getElementById('hud-world') || {}).textContent || '';
    bar.querySelector('.th-name').textContent = `GITHUB MULTIVERSE ${window.Launcher && Launcher.currentVersion ? Launcher.currentVersion() : ''}`.trim();
    bar.querySelector('.th-place').textContent = here;
    bar.querySelectorAll('.th-pop').forEach((pop) => pop.classList.remove('open'));
    document.body.classList.add('theater');
    requestAnimationFrame(place);
  }

  function exit() {
    active = false;
    document.body.classList.remove('theater');
  }

  // Is anything open that Esc should close first (a panel, a dialog, a field)?
  function somethingOpen() {
    const focused = document.activeElement;
    if (focused && (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement || focused.isContentEditable)) return true;
    if (document.getElementById('launcher') || document.body.classList.contains('hide-ui')) return true;
    if (Interactions.isBusy() || Codify.isOpen() || Metro.isOpen() || Metro.isRiding() || viewMode === 'map') return true;
    const big = window.innerWidth * window.innerHeight * 0.18;
    return [...document.body.querySelectorAll('body > *:not(canvas):not(script):not(style), body > * > *')].some((element) => {
      if (element === bar || element === renderer.domElement || element.contains(renderer.domElement)) return false;
      const style = getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'absolute') return false;
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || style.pointerEvents === 'none') return false;
      const rect = element.getBoundingClientRect();
      return rect.width * rect.height > big && (Number(style.zIndex) || 0) >= 20;
    });
  }

  function init() {
    // Capture phase: decided before any panel closes itself on the same Esc
    window.addEventListener('keydown', (event) => {
      if (active) {
        if (event.key === 'Escape') exit();
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape' && !event.repeat && worldEntered && !somethingOpen()) {
        event.stopImmediatePropagation();
        enter();
      }
    }, true);
  }

  return { init, enter, exit, isActive: () => active };
})();
let worldEntered = false;
Theater.init();
launched.then(() => { worldEntered = true; });
