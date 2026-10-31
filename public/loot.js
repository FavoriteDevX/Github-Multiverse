// ============================================================================
// LOOT: FORTNITE-STYLE CHESTS AND SUPPLY DROPS WITH REAL CODE FILES
// ============================================================================
// Chests sit on street corners all over Genesis City and Silicon Valley and
// respawn two minutes after being opened. Every three minutes a supply drop
// falls from the sky with Rare-to-Legendary loot. Every item is a real,
// working file (a .gitignore, a Makefile, a GitHub Actions workflow, an Nginx
// config...) listed in maps/loot.json, and it is downloaded to your computer
// the moment you open the chest. There is no in-game inventory.
const LootSystem = (() => {
  const OPEN_DISTANCE = 4.5;
  let catalog = null;
  let hooks = null;
  const loots = {};
  const buffs = { speed: 0, jump: 0, jetpack: 0, lens: 0 };
  let nearestLoot = null;
  const ui = {
    prompt: document.getElementById('loot-prompt'),
    toast: document.getElementById('loot-toast'),
    buffs: document.getElementById('buff-bar')
  };

  // --------------------------------------------------------------------------
  // 3D models
  // --------------------------------------------------------------------------
  function buildChest() {
    const { material, glow, box, sphere } = PropKit.kit;
    const chest = new THREE.Group();
    const wood = material('#8d5524', { roughness: 0.8 });
    const gold = material('#ffd166', { metalness: 0.8, roughness: 0.3, emissive: '#ffb703', emissiveIntensity: 0.35 });
    chest.add(box(1.6, 0.9, 1, wood, 0, 0.45, 0));
    [-0.6, 0, 0.6].forEach((x) => chest.add(box(0.12, 0.92, 1.02, gold, x, 0.45, 0)));
    const lid = new THREE.Group();
    lid.add(box(1.64, 0.35, 1.04, wood, 0, 0.17, 0.52));
    lid.add(box(1.66, 0.08, 1.06, gold, 0, 0.36, 0.52));
    lid.add(box(0.25, 0.3, 0.1, gold, 0, 0.05, 1.06));
    lid.position.set(0, 0.9, -0.52);
    chest.add(lid);
    const light = sphere(0.9, glow('#ffd166', 1.2, { transparent: true, opacity: 0.25, depthWrite: false }), 0, 0.9, 0, 12);
    light.castShadow = false;
    chest.add(light);
    chest.userData = { lid, light };
    return chest;
  }

  function buildSupplyDrop() {
    const { material, glow, box, mesh, cylinder } = PropKit.kit;
    const drop = new THREE.Group();
    drop.add(box(2, 2, 2, material('#3a86ff', { roughness: 0.5 }), 0, 1, 0));
    drop.add(box(2.05, 0.3, 2.05, material('#ffbe0b'), 0, 1, 0));
    drop.add(box(0.3, 2.05, 2.05, material('#ffbe0b'), 0, 1, 0));
    const balloon = mesh(new THREE.SphereGeometry(2.2, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), material('#ff006e', { side: THREE.DoubleSide }), 0, 6, 0);
    drop.add(balloon);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const rope = cylinder(0.03, 0.03, 4.4, material('#ffffff'), sx * 0.9, 4, sz * 0.9, 4);
      rope.rotation.set(sz * 0.2, 0, -sx * 0.2);
      drop.add(rope);
    });
    // Tall beam of light so everyone can see where it is falling
    const beam = cylinder(1.2, 1.2, 160, glow('#3a86ff', 1, { transparent: true, opacity: 0.18, depthWrite: false }), 0, 80, 0, 16);
    beam.castShadow = false;
    drop.add(beam);
    drop.userData = { balloon, beam };
    return drop;
  }

  // --------------------------------------------------------------------------
  // Loot state
  // --------------------------------------------------------------------------
  function upsertLoot(data) {
    let loot = loots[data.id];
    if (!loot) {
      const model = data.kind === 'drop' ? buildSupplyDrop() : buildChest();
      model.traverse((node) => { node.raycast = () => {}; });
      const ground = hooks.groundHeightAt(data.x, data.z, 120);
      model.position.set(data.x, ground, data.z);
      hooks.scene.add(model);
      loot = loots[data.id] = { ...data, model, ground };
    }
    Object.assign(loot, data);
    loot.landsAtLocal = data.landsAt ? performance.now() + Math.max(0, data.landsAt - Date.now()) : 0;
    applyLootVisual(loot);
  }

  function applyLootVisual(loot) {
    if (loot.kind !== 'chest') return;
    loot.model.userData.lid.rotation.x = loot.open ? -1.9 : 0;
    loot.model.userData.light.visible = !loot.open;
    loot.model.visible = true;
  }

  function removeLoot(id) {
    const loot = loots[id];
    if (!loot) return;
    hooks.scene.remove(loot.model);
    delete loots[id];
  }

  function itemDefinition(id) {
    return catalog.items.find((item) => item.id === id);
  }

  // --------------------------------------------------------------------------
  // Opening loot: the item is a real code file, downloaded to your computer
  // --------------------------------------------------------------------------
  function download(item) {
    const blob = new Blob([item.content], { type: 'application/octet-stream' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = item.filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 1000);
  }

  function received(item, from) {
    if (!item) return;
    download(item);
    showToast(item, from);
    hooks.system(`Downloaded ${item.filename}: ${item.name} (${catalog.rarities[item.rarity].name}). ${item.description}${item.saveAs ? ` Rename it to ${item.saveAs} in your project (browsers do not save files starting with a dot).` : ''}`);
  }

  function showToast(item, from) {
    const rarity = catalog.rarities[item.rarity];
    ui.toast.innerHTML = '<span class="file"></span><div><small></small><b></b></div>';
    ui.toast.querySelector('.file').textContent = item.filename;
    ui.toast.querySelector('small').textContent = `${rarity.name.toUpperCase()} · from a ${from === 'drop' ? 'supply drop' : 'chest'} · downloaded`;
    ui.toast.querySelector('b').textContent = item.name;
    ui.toast.style.borderColor = rarity.color;
    ui.toast.style.boxShadow = `0 0 30px ${rarity.color}aa`;
    ui.toast.classList.remove('show');
    void ui.toast.offsetWidth;
    ui.toast.classList.add('show');
  }

  function renderBuffs() {
    const now = performance.now();
    const active = Object.entries(buffs).filter(([, until]) => until > now);
    ui.buffs.textContent = active.map(([name, until]) => `${{ speed: 'Speed', jump: 'Jump', jetpack: 'Jetpack', lens: 'Lens' }[name]} ${Math.ceil((until - now) / 1000)}s`).join('   ');
  }

  function rollLocal(kind) {
    const weightKey = kind === 'drop' ? 'dropWeight' : 'chestWeight';
    const rarities = Object.entries(catalog.rarities).filter(([, rarity]) => rarity[weightKey] > 0);
    let roll = Math.random() * rarities.reduce((sum, [, rarity]) => sum + rarity[weightKey], 0);
    const [rarityKey] = rarities.find(([, rarity]) => (roll -= rarity[weightKey]) < 0) || rarities[0];
    const options = catalog.items.filter((item) => item.rarity === rarityKey);
    return options[Math.floor(Math.random() * options.length)];
  }

  // Solo mode (no server): the chest is opened locally
  function openLocal(loot) {
    received(rollLocal(loot.kind), loot.kind);
    if (loot.kind === 'drop') removeLoot(loot.id);
    else { upsertLoot({ id: loot.id, open: true }); setTimeout(() => upsertLoot({ id: loot.id, open: false }), 120000); }
  }

  function online() {
    return hooks.socket && hooks.socket.connected;
  }

  function tryOpen() {
    if (!nearestLoot) return tryPickup();
    if (nearestLoot.landsAtLocal > performance.now()) { hooks.system('The supply drop is still falling!'); return true; }
    if (online()) hooks.socket.emit('loot_open', { id: nearestLoot.id });
    else openLocal(nearestLoot);
    return true;
  }

  // --------------------------------------------------------------------------
  // Per-frame update: falling drops, glow and the "Press E" prompt
  // --------------------------------------------------------------------------
  function update(time, deltaSeconds) {
    if (!catalog) return;
    const avatar = hooks.avatarPosition();
    nearestLoot = null;
    let nearestDistance = OPEN_DISTANCE;
    Object.values(loots).forEach((loot) => {
      if (loot.kind === 'drop') {
        const remaining = Math.max(0, loot.landsAtLocal - performance.now());
        loot.model.position.y = loot.ground + remaining / 1000 * 7;
        loot.model.rotation.y = time * 0.3;
        loot.model.userData.balloon.visible = remaining > 0;
      } else if (!loot.open) {
        loot.model.userData.light.scale.setScalar(1 + Math.sin(time * 3 + loot.x) * 0.15);
      }
      const distance = Math.hypot(avatar.x - loot.x, avatar.z - loot.z);
      if (!loot.open && distance < nearestDistance && Math.abs(avatar.y - loot.model.position.y) < 4) {
        nearestLoot = loot;
        nearestDistance = distance;
      }
    });
    updateResources(time, deltaSeconds);
    ui.prompt.style.display = nearestLoot || nearestResource ? 'block' : 'none';
    if (nearestLoot) ui.prompt.textContent = nearestLoot.kind === 'drop' ? 'Press E to open the SUPPLY DROP' : 'Press E to open the chest';
    else if (nearestResource) ui.prompt.textContent = `Press E or G to pick up the ${nearestResource.type.name} · hold G to gather everything nearby`;

    if (Math.floor(time * 4) !== Math.floor((time - deltaSeconds) * 4)) renderBuffs();
  }

  // Movement multipliers used by the avatar physics in main.js
  function modifiers() {
    const now = performance.now();
    return { speed: buffs.speed > now ? 1.6 : 1, jump: buffs.jump > now ? 1.6 : 1, jetpack: buffs.jetpack > now, lens: buffs.lens > now };
  }

  function command(name) {
    switch (name) {
      case 'bag':
        hooks.system(bagReport());
        return true;
      case 'loot': {
        const avatar = hooks.avatarPosition();
        const available = Object.values(loots).filter((loot) => !loot.open).map((loot) => ({ loot, distance: Math.hypot(avatar.x - loot.x, avatar.z - loot.z) })).sort((a, b) => a.distance - b.distance);
        if (!available.length) { hooks.system('No loot around right now.'); return true; }
        const { loot, distance } = available[0];
        hooks.system(`Nearest ${loot.kind === 'drop' ? 'SUPPLY DROP' : 'chest'}: ${Math.round(distance)}m away at x=${Math.round(loot.x)} z=${Math.round(loot.z)} (${loot.area}). Use /tp ${Math.round(loot.x)} ${Math.round(loot.z)} to get there.`);
        return true;
      }
      default:
        return false;
    }
  }

  async function init(options) {
    hooks = options;
    catalog = await (await fetch('maps/loot.json')).json();
    if (hooks.socket) {
      hooks.socket.on('loot_spawns', (list) => list.forEach(upsertLoot));
      hooks.socket.on('loot_spawned', upsertLoot);
      hooks.socket.on('loot_state', ({ id, open }) => { if (loots[id]) upsertLoot({ ...loots[id], id, open, landsAt: null }); });
      hooks.socket.on('loot_removed', removeLoot);
      hooks.socket.on('loot_result', ({ item, from }) => received(itemDefinition(item), from));
      hooks.socket.on('connect', () => hooks.socket.emit('loot_sync'));
      hooks.socket.emit('loot_sync');
    } else {
      catalog.spawns.forEach((spawn, index) => upsertLoot({ id: `chest${index}`, kind: 'chest', x: spawn.x, z: spawn.z, area: spawn.area, open: false }));
      // Solo supply drops every three minutes too
      setInterval(() => {
        const spot = catalog.spawns[Math.floor(Math.random() * catalog.spawns.length)];
        upsertLoot({ id: `drop${Date.now()}`, kind: 'drop', x: spot.x, z: spot.z, area: spot.area, open: false, landsAt: Date.now() + 20000 });
        hooks.system(`A SUPPLY DROP is falling over ${spot.area}!`);
      }, 180000);
    }
  }


  // --------------------------------------------------------------------------
  // Resources to gather: small items scattered along the paths and lawns of
  // Genesis City. Walk up to one and press E or G to pick it up (it flies into
  // your cursor); hold G to pull in everything within a few meters. They
  // respawn after a while and are counted in your bag (/bag), kept in this
  // browser.
  // --------------------------------------------------------------------------
  const RESOURCE_TYPES = [
    { key: 'crystal', name: 'Code Crystal', color: '#4dd4ff', weight: 3 },
    { key: 'coffee', name: 'Coffee Beans', color: '#8d5524', weight: 3 },
    { key: 'ram', name: 'RAM Stick', color: '#2fb344', weight: 2 },
    { key: 'gem', name: 'Git Gem', color: '#f05033', weight: 2 },
    { key: 'bug', name: 'Bug Fragment', color: '#9c36b5', weight: 2 },
    { key: 'token', name: 'API Token', color: '#ffd43b', weight: 1 }
  ];
  const PICK_DISTANCE = 3.2;
  const PULL_DISTANCE = 9;
  const RESPAWN_MS = 120000;
  const resources = [];
  let nearestResource = null;
  let resourcesBuilt = false;
  let pulling = false;
  const flying = [];
  let bag = {};
  try { bag = JSON.parse(localStorage.getItem('multiverse-bag') || '{}') || {}; } catch (error) { bag = {}; }
  const saveBag = () => { try { localStorage.setItem('multiverse-bag', JSON.stringify(bag)); } catch (error) { /* storage blocked */ } };

  function resourceModel(type) {
    const { material, glow, box } = PropKit.kit;
    const group = new THREE.Group();
    const shine = glow(type.color, 0.9);
    if (type.key === 'crystal') {
      [[0, 0.55, 0, 0.5], [0.28, 0.4, 0.12, 0.32], [-0.25, 0.38, -0.1, 0.28]].forEach(([x, y, z, r]) => { const c = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), shine); c.position.set(x, y, z); c.scale.y = 1.8; group.add(c); });
    } else if (type.key === 'coffee') {
      group.add(box(0.7, 0.55, 0.45, material('#c9a27a', { roughness: 1 }), 0, 0.28, 0));
      for (let i = 0; i < 6; i++) { const bean = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), material('#4a2b16')); bean.scale.set(1, 0.7, 1.3); bean.position.set((i % 3 - 1) * 0.16, 0.6, (i < 3 ? -1 : 1) * 0.08); group.add(bean); }
    } else if (type.key === 'ram') {
      group.add(box(0.95, 0.3, 0.06, shine, 0, 0.35, 0));
      for (let i = 0; i < 4; i++) group.add(box(0.16, 0.16, 0.04, material('#1d1d1f'), -0.33 + i * 0.22, 0.38, 0.04));
    } else if (type.key === 'gem') {
      const gem = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.16, 8), shine); gem.rotation.x = Math.PI / 2; gem.position.y = 0.5; group.add(gem);
    } else if (type.key === 'bug') {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), shine); shell.scale.set(1, 0.7, 1.3); shell.position.y = 0.2; group.add(shell);
      group.add(box(0.03, 0.02, 0.6, material('#1d1d1f'), 0, 0.42, 0));
    } else {
      group.add(box(0.75, 0.42, 0.04, shine, 0, 0.5, 0));
      group.add(box(0.5, 0.06, 0.05, material('#1d1d1f'), 0, 0.5, 0.01));
    }
    // A soft halo on the ground makes them easy to spot
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 24), new THREE.MeshBasicMaterial({ color: type.color, transparent: true, opacity: 0.55, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.04; group.add(halo);
    group.traverse((node) => { node.castShadow = false; node.raycast = () => {}; });
    return group;
  }

  function buildResources() {
    const paths = (typeof City !== 'undefined' && City.paths) || [];
    if (!paths.length) return;
    resourcesBuilt = true;
    let seed = 20261031;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const total = RESOURCE_TYPES.reduce((sum, type) => sum + type.weight, 0);
    const pickType = () => { let roll = random() * total; return RESOURCE_TYPES.find((type) => (roll -= type.weight) < 0) || RESOURCE_TYPES[0]; };
    for (let i = 0; i < 140; i++) {
      const path = paths[Math.floor(random() * paths.length)];
      const [px, pz] = path[Math.floor(random() * path.length)];
      const angle = random() * Math.PI * 2;
      const x = px + Math.cos(angle) * (3 + random() * 6);
      const z = pz + Math.sin(angle) * (3 + random() * 6);
      if (Math.abs(x) > 395 || Math.abs(z) > 395) continue;
      if (City.districtAt && City.districtAt(x, z)) continue;
      if (City.seaAt && City.seaAt(x, z)) continue;
      const type = pickType();
      const model = resourceModel(type);
      const y = hooks.groundHeightAt ? hooks.groundHeightAt(x, z, 20) : 0;
      model.position.set(x, (Number.isFinite(y) ? y : 0) + 0.02, z);
      model.userData.spin = random() * 6;
      hooks.scene.add(model);
      resources.push({ type, model, x, z, readyAt: 0 });
    }
  }

  function collect(resource) {
    resource.readyAt = performance.now() + RESPAWN_MS;
    bag[resource.type.key] = (bag[resource.type.key] || 0) + 1;
    saveBag();
    flying.push({ model: resource.model, start: resource.model.position.clone(), t: 0, resource });
    if (window.Sound) Sound.play('coin');
    showPickup(resource.type);
  }

  function showPickup(type) {
    ui.toast.innerHTML = '<span class="file"></span><div><small></small><b></b></div>';
    ui.toast.querySelector('.file').textContent = `+1`;
    ui.toast.querySelector('small').textContent = `RESOURCE · ${bag[type.key]} in your bag (/bag)`;
    ui.toast.querySelector('b').textContent = type.name;
    ui.toast.style.borderColor = type.color;
    ui.toast.style.boxShadow = `0 0 30px ${type.color}aa`;
    ui.toast.classList.remove('show');
    void ui.toast.offsetWidth;
    ui.toast.classList.add('show');
  }

  function tryPickup() {
    if (!nearestResource) return false;
    collect(nearestResource);
    nearestResource = null;
    return true;
  }

  function updateResources(time, deltaSeconds) {
    if (!resourcesBuilt) { if (hooks && hooks.scene && Math.floor(time) % 2 === 0) buildResources(); return; }
    const avatar = hooks.avatarPosition();
    const now = performance.now();
    nearestResource = null;
    let best = PICK_DISTANCE;
    resources.forEach((resource) => {
      if (resource.readyAt > now) return;
      const model = resource.model;
      if (!model.visible) { model.visible = true; model.scale.setScalar(1); model.position.set(resource.x, model.position.y, resource.z); }
      const distance = Math.hypot(avatar.x - resource.x, avatar.z - resource.z);
      if (distance > 60) return;
      model.rotation.y = time * 1.2 + model.userData.spin;
      model.children[0].position.y = (model.children[0].userData.baseY ?? (model.children[0].userData.baseY = model.children[0].position.y)) + Math.sin(time * 2 + model.userData.spin) * 0.06;
      if (Math.abs(avatar.y - model.position.y) > 3) return;
      if (pulling && distance < PULL_DISTANCE) { collect(resource); return; }
      if (distance < best) { best = distance; nearestResource = resource; }
    });
    // Picked items fly into the cursor, shrink and vanish
    for (let i = flying.length - 1; i >= 0; i--) {
      const item = flying[i];
      item.t += deltaSeconds * 2.6;
      const target = avatar.clone().add(new THREE.Vector3(0, 1.4, 0));
      item.model.position.lerpVectors(item.start, target, Math.min(1, item.t));
      item.model.position.y += Math.sin(Math.min(1, item.t) * Math.PI) * 1.2;
      item.model.scale.setScalar(Math.max(0.05, 1 - item.t * 0.9));
      if (item.t >= 1) { item.model.visible = false; item.model.position.set(item.resource.x, item.start.y, item.resource.z); flying.splice(i, 1); }
    }
  }

  function bagReport() {
    const lines = RESOURCE_TYPES.map((type) => `${type.name}: ${bag[type.key] || 0}`);
    return `Your bag · ${lines.join(' · ')}`;
  }

  function addBuff(name, seconds) {
    buffs[name] = performance.now() + seconds * 1000;
  }

  // G picks up (pressed) or gathers everything nearby (held)
  function setPulling(value) { pulling = value; }

  return { init, update, tryOpen, tryPickup, setPulling, command, modifiers, addBuff, resourceCount: () => resources.length, resourceSpots: () => resources.map((r) => [r.x, r.model.position.y, r.z, r.type.name]) };
})();
