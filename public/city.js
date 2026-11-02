// ============================================================================
// GENESIS CITY: CONTINUOUS LAND, ROADS, GENERATED NEIGHBORHOODS, SKY & WEATHER
// ============================================================================
// Every map from worlds.json becomes a district on one continuous parcel grid
// (like Decentraland's Genesis City). Cells that hold no district are filled
// with deterministic low-poly neighborhoods so the world feels endless.
const City = (() => {
  const PARCEL_SIZE = 16;
  const CELL_SIZE = 64; // 4x4 parcels per city block
  const DISTRICT_GROWTH = 1.5; // grid districts (not the plaza) are built 1.5x bigger
  const ROAD_WIDTH = 8;
  const WORLD_LIMIT = 960; // last walkable coordinate of Genesis City (meters)
  // Like Decentraland, the whole city is one grid of 16 m parcels: districts
  // sit on it as estates, roads one parcel wide run between them at irregular
  // spacing (maps/land.json), and the rest are small community scenes or
  // empty parcels for sale. The center (where the generated neighborhoods,
  // paths and gardens are) is the "commons": parcels there are not for sale.
  const CORE_HALF = 400;
  let landLayout = { roadsX: [], roadsZ: [], sceneChance: 0.24 };
  const CITY_RADIUS = 4; // cells -4..4 => 576m x 576m city
  const GROUND_LEVEL = -0.3;
  const { material, glow, repeated, windowsTexture, roadTexture, textSprite } = PropKit.kit;

  const districts = [];
  const pickables = [];
  const sharedCollidables = []; // ground, roads and generated buildings
  const animatedCity = [];
  let scene;
  let sky;
  let sun;
  let hemisphere;
  let stars;
  let moon;
  let rain;
  let snow;
  let streetLampHeads;
  let nightWindowMaterials = [];
  let lampHalos = null;
  let grassMaterialForLawns = null;
  const glowStones = [];

  function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --------------------------------------------------------------------------
  // Land parcels (shared rules with server.js: same hash, same roads)
  // --------------------------------------------------------------------------
  const parcelOf = (x, z) => [Math.floor(x / PARCEL_SIZE), Math.floor(-z / PARCEL_SIZE)];
  const parcelCenter = (px, pz) => [px * PARCEL_SIZE + PARCEL_SIZE / 2, -(pz * PARCEL_SIZE + PARCEL_SIZE / 2)];
  function parcelHash(px, pz) {
    let h = Math.imul((px * 374761393 + pz * 668265263) | 0, 1274126177);
    h ^= h >>> 13;
    return ((h >>> 0) % 1000) / 1000;
  }
  function inCore(x, z) {
    return Math.abs(x) < CORE_HALF && Math.abs(z) < CORE_HALF;
  }
  function setLandLayout(layout) {
    if (layout) landLayout = layout;
  }
  function isRoadParcel(px, pz) {
    return landLayout.roadsX.includes(px) || landLayout.roadsZ.includes(pz);
  }
  function isSceneParcel(px, pz) {
    return parcelHash(px, pz) < landLayout.sceneChance;
  }
  // Seas: irregular blobs near the edges (maps/land.json) with islands
  function blobRadius(r, angle, seed) {
    return r * (1 + 0.16 * Math.sin(3 * angle + seed) + 0.08 * Math.sin(5 * angle + seed * 2));
  }
  function insideBlob(x, z, cx, cz, r, seed) {
    const dx = x - cx;
    const dz = z - cz;
    return Math.hypot(dx, dz) < blobRadius(r, Math.atan2(dz, dx), seed);
  }
  function seaAt(x, z) {
    const seas = landLayout.seas || [];
    for (let i = 0; i < seas.length; i++) {
      const sea = seas[i];
      if (!insideBlob(x, z, sea.x, sea.z, sea.r, i + 1)) continue;
      const island = (sea.islands || []).find((candidate, k) => insideBlob(x, z, candidate.x, candidate.z, candidate.r, i * 7 + k + 3));
      return island ? { sea, island } : { sea, island: null };
    }
    return null;
  }

  // What is at a point: 'district', 'sea', 'road', 'commons' (center), 'scene'
  // (a community build, not for sale) or 'land' (empty parcel for sale;
  // island parcels count as land too)
  function landAt(x, z) {
    if (districtAt(x, z)) return 'district';
    const water = seaAt(x, z);
    if (water && !water.island) return 'sea';
    const [px, pz] = parcelOf(x, z);
    if (water) return 'land';
    if (isRoadParcel(px, pz)) return 'road';
    if (inCore(x, z)) return 'commons';
    return isSceneParcel(px, pz) ? 'scene' : 'land';
  }

  // Natural grass for one parcel (from the shared surface library: dense
  // blades, clover, bare soil spots, relief) and stone pavers for the roads
  function parcelTextures() {
    const grass = PropKit.kit.grassTexture('#4d7d2c');
    const road = PropKit.kit.cobbleTexture('#b0a796');
    return { grass, road };
  }

  // The parcel ground (instanced: a few draw calls for the whole city). Empty
  // parcels are just grass, demarcated like in Decentraland by a thin stone
  // edging along every parcel line and a small marker stone at each corner.
  function buildLand() {
    const districtRects = districts.filter((district) => !district.world.world).map(({ layout }) => ({
      minX: layout.center.x - layout.size[0] / 2 - 2, maxX: layout.center.x + layout.size[0] / 2 + 2,
      minZ: layout.center.z - layout.size[1] / 2 - 2, maxZ: layout.center.z + layout.size[1] / 2 + 2
    }));
    const overlapsDistrict = (px, pz) => {
      const x0 = px * PARCEL_SIZE;
      const z1 = -pz * PARCEL_SIZE;
      const z0 = z1 - PARCEL_SIZE;
      return districtRects.some((rect) => x0 < rect.maxX && x0 + PARCEL_SIZE > rect.minX && z0 < rect.maxZ && z1 > rect.minZ);
    };
    const holes = undergroundHoles();
    const overlapsHole = (x, z) => holes.some((hole) => Math.abs(x - hole.x) < hole.size / 2 + PARCEL_SIZE / 2 && Math.abs(z - hole.z) < hole.size / 2 + PARCEL_SIZE / 2);
    const grassSpots = [];
    const roadSpots = [];
    const count = Math.round((WORLD_LIMIT * 2) / PARCEL_SIZE);
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < count; j++) {
        const px = i - count / 2;
        const pz = j - count / 2;
        if (overlapsDistrict(px, pz)) continue;
        const [x, z] = parcelCenter(px, pz);
        if (overlapsHole(x, z)) continue;
        const water = seaAt(x, z);
        if (water && !water.island) continue;
        if (!water && isRoadParcel(px, pz)) roadSpots.push([x, z]);
        // Like Decentraland: stone around Genesis Plaza and on scattered little
        // squares, green parcels everywhere else (lawns, trees and scenes on them)
        else if (water || !inCore(x, z) || (Math.hypot(x, z) > 150 && parcelHash(px * 3 + 7, pz * 5 - 2) > 0.28)) grassSpots.push([x, z, px, pz]);
      }
    }
    const { grass, road } = parcelTextures();
    // The ground lies 1 cm above the paved base; polygon offset keeps it on top
    // even on GPUs with a low-precision depth buffer
    const onTop = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 };
    const plane = new THREE.PlaneGeometry(PARCEL_SIZE, PARCEL_SIZE).rotateX(-Math.PI / 2);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const grassMesh = new THREE.InstancedMesh(plane, new THREE.MeshStandardMaterial({ map: grass, roughness: 1, ...onTop }), grassSpots.length);
    grassSpots.forEach(([x, z, px, pz], index) => {
      // Each parcel is rotated a quarter turn at random so the grass never repeats visibly
      matrix.compose(new THREE.Vector3(x, GROUND_LEVEL + 0.012, z), quaternion.setFromAxisAngle(up, Math.floor(parcelHash(px, pz) * 4) * Math.PI / 2), new THREE.Vector3(1, 1, 1));
      grassMesh.setMatrixAt(index, matrix);
      grassMesh.setColorAt(index, color.setHSL(0, 0, 0.94 + parcelHash(pz, px) * 0.08));
    });
    const roadMesh = new THREE.InstancedMesh(plane, new THREE.MeshStandardMaterial({ map: repeated(road, 2, 2), roughness: 0.95, ...onTop }), roadSpots.length);
    roadSpots.forEach(([x, z], index) => {
      matrix.makeTranslation(x, GROUND_LEVEL + 0.014, z);
      roadMesh.setMatrixAt(index, matrix);
    });
    // Demarcation: low stone edging on the west and south side of each grass
    // parcel (so every shared line gets exactly one), and corner marker stones
    const stone = new THREE.MeshStandardMaterial({ color: '#cfc8b8', roughness: 0.9 });
    const edges = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stone, grassSpots.length * 2);
    const corners = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.28, 0.35, 6).translate(0, 0.175, 0), new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.8 }), grassSpots.length);
    grassSpots.forEach(([x, z], index) => {
      matrix.compose(new THREE.Vector3(x - PARCEL_SIZE / 2, GROUND_LEVEL + 0.03, z), quaternion.identity(), new THREE.Vector3(0.18, 0.06, PARCEL_SIZE));
      edges.setMatrixAt(index * 2, matrix);
      matrix.compose(new THREE.Vector3(x, GROUND_LEVEL + 0.03, z + PARCEL_SIZE / 2), quaternion, new THREE.Vector3(PARCEL_SIZE, 0.06, 0.18));
      edges.setMatrixAt(index * 2 + 1, matrix);
      matrix.makeTranslation(x - PARCEL_SIZE / 2, GROUND_LEVEL, z + PARCEL_SIZE / 2);
      corners.setMatrixAt(index, matrix);
    });
    [grassMesh, roadMesh, edges, corners].forEach((instanced) => {
      instanced.raycast = () => {};
      instanced.receiveShadow = true;
      instanced.castShadow = false;
      instanced.userData.alwaysVisible = true;
      scene.add(instanced);
    });
    edging = { spots: grassSpots, edges, corners, edgeMatrices: edges.instanceMatrix.array.slice(), cornerMatrices: corners.instanceMatrix.array.slice() };
    updateEstateEdging();    buildSeas();
  }

  // Water surfaces, sandy shores and island rims. The water sits 35 cm above
  // the ground so the avatar wades in it; islands are flat and walkable.
  let seaWater = null;
  function blobShape(cx, cz, r, seed, grow = 0) {
    const shape = new THREE.Shape();
    for (let i = 0; i <= 72; i++) {
      const angle = (i / 72) * Math.PI * 2;
      const radius = blobRadius(r, angle, seed) + grow;
      // Shape y maps to -z after the ground rotation
      const x = cx + Math.cos(angle) * radius;
      const y = -(cz + Math.sin(angle) * radius);
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    return shape;
  }
  // Decentraland-style palm: a curved trunk of stacked rings and broad,
  // drooping leaves (one merged geometry, instanced everywhere)
  const palmSpots = [];
  function palmGeometry() {
    const parts = [];
    let x = 0;
    let y = 0;
    for (let i = 0; i < 9; i++) {
      const ring = new THREE.CylinderGeometry(0.26 - i * 0.012, 0.3 - i * 0.012, 0.8, 7);
      ring.rotateZ(-0.035 * i);
      ring.translate(x, y + 0.4, 0);
      parts.push({ geometry: ring, color: i % 2 ? '#9c7a54' : '#8a6a47' });
      x += 0.04 * i;
      y += 0.78;
    }
    const top = new THREE.Vector3(x, y, 0);
    parts.push({ geometry: new THREE.SphereGeometry(0.42, 7, 5).translate(top.x, top.y, top.z), color: '#6b8f3a' });
    for (let f = 0; f < 8; f++) {
      const leaf = new THREE.PlaneGeometry(0.9, 3.6, 1, 4);
      // Bend the leaf down along its length
      const position = leaf.attributes.position;
      for (let v = 0; v < position.count; v++) {
        const along = (position.getY(v) + 1.8) / 3.6;
        position.setZ(v, -along * along * 1.4);
        position.setX(v, position.getX(v) * (1 - along * 0.6));
      }
      leaf.rotateX(-Math.PI / 2 + 0.35);
      leaf.translate(0, 0, 1.8);
      leaf.rotateY((f / 8) * Math.PI * 2);
      leaf.translate(top.x, top.y, top.z);
      parts.push({ geometry: leaf, color: f % 2 ? '#4f9a3c' : '#3d8a35' });
    }
    return mergeGeometries(parts);
  }
  function buildPalms() {
    // A few palm groves on the commons around Genesis Plaza too
    const random = seededRandom(2024);
    for (let g = 0; g < 26; g++) {
      const angle = random() * Math.PI * 2;
      const radius = 105 + random() * 260;
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;
      for (let t = 0; t < 3; t++) {
        const x = cx + (random() - 0.5) * 9;
        const z = cz + (random() - 0.5) * 9;
        if (insideDistrict(x, z, 4) || nearPath(x, z, 4)) continue;
        palmSpots.push({ x, z, y: GROUND_LEVEL, size: 0.9 + random() * 0.4, turn: random() * 6.28 });
      }
    }
    if (!palmSpots.length) return;
    const palms = new THREE.InstancedMesh(palmGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide, flatShading: true }), palmSpots.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    palmSpots.forEach(({ x, y, z, size, turn }, index) => {
      matrix.compose(new THREE.Vector3(x, y, z), quaternion.setFromAxisAngle(up, turn), new THREE.Vector3(size, size, size));
      palms.setMatrixAt(index, matrix);
    });
    palms.castShadow = false;
    palms.receiveShadow = true;
    palms.raycast = () => {};
    palms.userData.alwaysVisible = true;
    scene.add(palms);
  }

  function buildSeas() {
    const seas = landLayout.seas || [];
    if (!seas.length) return;
    // Fractal ripples (tileable normal map from the surface library)
    const normalMap = PropKit.kit.waterNormals().clone();
    normalMap.needsUpdate = true;
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.repeat.set(1 / 14, 1 / 14);
    const onTop = { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 };
    const water = new THREE.MeshStandardMaterial({ color: '#1c7fb5', roughness: 0.06, metalness: 0.25, transparent: true, opacity: 0.88, normalMap, normalScale: new THREE.Vector2(0.7, 0.7), ...onTop });
    const shallowNormals = PropKit.kit.waterNormals().clone();
    shallowNormals.needsUpdate = true;
    shallowNormals.repeat.set(1 / 9, 1 / 9);
    const shallow = new THREE.MeshStandardMaterial({ color: '#3fb6c9', roughness: 0.15, transparent: true, opacity: 0.9, normalMap: shallowNormals, normalScale: new THREE.Vector2(0.4, 0.4), ...onTop });
    // Shape geometries use world meters as UVs: sand every 6 m, grass every 10 m
    const sandMap = repeated(PropKit.kit.sandTexture('#e3cf9f'), 1 / 6, 1 / 6);
    const sand = new THREE.MeshStandardMaterial({ map: sandMap, roughness: 1, ...onTop });
    const islandGrass = new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.grassTexture('#5a8f38'), 1 / 10, 1 / 10), roughness: 1 });
    const group = new THREE.Group();
    seas.forEach((sea, i) => {
      const seed = i + 1;
      const add = (shape, materialToUse, y) => {
        const surface = new THREE.Mesh(new THREE.ShapeGeometry(shape), materialToUse);
        surface.rotation.x = -Math.PI / 2;
        surface.position.y = y;
        surface.raycast = () => {};
        surface.receiveShadow = true;
        group.add(surface);
      };
      add(blobShape(sea.x, sea.z, sea.r, seed, 9), sand, GROUND_LEVEL + 0.02);
      add(blobShape(sea.x, sea.z, sea.r, seed, 3), shallow, GROUND_LEVEL + 0.3);
      add(blobShape(sea.x, sea.z, sea.r, seed, 0), water, GROUND_LEVEL + 0.35);
      (sea.islands || []).forEach((island, k) => {
        const islandSeed = i * 7 + k + 3;
        // Flat walkable island: sandy rim and a grass top 0.5 m above the ground
        const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(blobShape(island.x, island.z, island.r, islandSeed, 3), { depth: 0.45, bevelEnabled: true, bevelSize: 2, bevelThickness: 0.3, bevelSegments: 2, curveSegments: 8 }), sand);
        rim.rotation.x = -Math.PI / 2;
        rim.position.y = GROUND_LEVEL;
        group.add(rim);
        const top = new THREE.Mesh(new THREE.ShapeGeometry(blobShape(island.x, island.z, island.r, islandSeed, -2)), islandGrass);
        top.rotation.x = -Math.PI / 2;
        top.position.y = GROUND_LEVEL + 0.78;
        top.receiveShadow = true;
        group.add(top);
        sharedCollidables.push(rim, top);
        // Palms on the small islands (the big one hosts a district)
        if (island.r < 40) {
          const random = seededRandom(islandSeed * 97);
          const count = Math.max(2, Math.round(island.r / 5));
          for (let t = 0; t < count; t++) {
            const angle = random() * Math.PI * 2;
            const distance = random() * island.r * 0.65;
            palmSpots.push({ x: island.x + Math.cos(angle) * distance, z: island.z + Math.sin(angle) * distance, y: GROUND_LEVEL + 0.78, size: 0.8 + random() * 0.5, turn: random() * 6.28 });
          }
        }
      });
    });
    // Palms along every shore (on dry land just outside the sand)
    seas.forEach((sea, i) => {
      const random = seededRandom(i * 131 + 7);
      for (let t = 0; t < 40; t++) {
        const angle = random() * Math.PI * 2;
        const radius = blobRadius(sea.r, angle, i + 1) + 12 + random() * 10;
        const x = sea.x + Math.cos(angle) * radius;
        const z = sea.z + Math.sin(angle) * radius;
        if (Math.abs(x) > WORLD_LIMIT - 4 || Math.abs(z) > WORLD_LIMIT - 4 || insideDistrict(x, z, 2) || seaAt(x, z)) continue;
        palmSpots.push({ x, z, y: GROUND_LEVEL, size: 0.85 + random() * 0.5, turn: random() * 6.28 });
      }
    });
    group.userData.alwaysVisible = true;
    scene.add(group);
    seaWater = normalMap;
  }

  // Community buildings are instanced (no raycast): the avatar physics asks
  // this instead, so you cannot walk through them
  const sceneSolids = new Map();
  let landScenes = 0;
  function solidAt(x, z, y) {
    const [px, pz] = parcelOf(x, z);
    const solid = sceneSolids.get(`${px},${pz}`);
    return Boolean(solid) && y < solid.top && x > solid.minX && x < solid.maxX && z > solid.minZ && z < solid.maxZ;
  }

  // Estates (like Decentraland): adjacent parcels of the same owner are one
  // piece of land, so the stone edging between them is hidden
  let edging = null;
  const sameOwner = (a, b) => Boolean(landOwners[a] && landOwners[b] && landOwners[a].owner.toLowerCase() === landOwners[b].owner.toLowerCase());
  function updateEstateEdging() {
    if (!edging) return;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0).toArray();
    const write = (target, source, index, hide) => target.set(hide ? hidden : source.subarray(index * 16, index * 16 + 16), index * 16);
    edging.spots.forEach(([, , px, pz], index) => {
      const key = `${px},${pz}`;
      const west = sameOwner(key, `${px - 1},${pz}`);
      const south = sameOwner(key, `${px},${pz - 1}`);
      write(edging.edges.instanceMatrix.array, edging.edgeMatrices, index * 2, west);
      write(edging.edges.instanceMatrix.array, edging.edgeMatrices, index * 2 + 1, south);
      write(edging.corners.instanceMatrix.array, edging.cornerMatrices, index, west && south && sameOwner(key, `${px - 1},${pz - 1}`));
    });
    edging.edges.instanceMatrix.needsUpdate = true;
    edging.corners.instanceMatrix.needsUpdate = true;
  }

  // Owned parcels: a fenced plot with the owner's sign (only these become 3D
  // objects); an estate gets one plot without posts between its parcels
  let ownedGroup = null;
  function buildOwnedParcels() {
    if (!scene) return;
    if (ownedGroup) scene.remove(ownedGroup);
    ownedGroup = new THREE.Group();
    const { box } = PropKit.kit;
    const post = material('#7048e8');
    const plate = new THREE.MeshStandardMaterial({ color: '#9775fa', transparent: true, opacity: 0.35, roughness: 1 });
    Object.entries(landOwners).forEach(([parcel, land]) => {
      if (landSigns.has(parcel)) return;
      const [px, pz] = parcel.split(',').map(Number);
      const x = px * PARCEL_SIZE + PARCEL_SIZE / 2;
      const z = -(pz * PARCEL_SIZE + PARCEL_SIZE / 2);
      if (inCore(x, z)) return;
      const plot = new THREE.Group();
      plot.position.set(x, GROUND_LEVEL, z);
      // Neighbors of the same estate (x grows east, parcel z grows north = -z)
      const joined = { w: sameOwner(parcel, `${px - 1},${pz}`), e: sameOwner(parcel, `${px + 1},${pz}`), s: sameOwner(parcel, `${px},${pz - 1}`), n: sameOwner(parcel, `${px},${pz + 1}`) };
      const inset = (side) => (joined[side] ? 0 : 0.2);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(PARCEL_SIZE - inset('w') - inset('e'), PARCEL_SIZE - inset('n') - inset('s')).rotateX(-Math.PI / 2), plate);
      floor.position.set((inset('w') - inset('e')) / 2, 0.03, (inset('n') - inset('s')) / 2);
      floor.raycast = () => {};
      plot.add(floor);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => {
        if (joined[sx < 0 ? 'w' : 'e'] || joined[sz < 0 ? 'n' : 's']) return;
        plot.add(box(0.3, 1.4, 0.3, post, sx * 7.6, 0.7, sz * 7.6));
      });
      // A published scene replaces the owner sign (its title shows in the location chip)
      const hasScene = window.SceneBuilder && SceneBuilder.sceneAt(parcel);
      if (!joined.w && !joined.s && !hasScene) {
        const sign = textSprite(`${land.owner} · ${joined.e || joined.n ? 'estate' : 'parcel'} ${parcel}`, { width: 6, background: 'rgba(80, 50, 160, 0.9)' });
        sign.position.y = 3;
        plot.add(sign);
      }
      ownedGroup.add(plot);
    });
    scene.add(ownedGroup);
  }

  // --------------------------------------------------------------------------
  // District layout
  // --------------------------------------------------------------------------
  function layoutFor(world) {
    if (world.region) {
      const [cx, cz] = world.region.center;
      const [sx, sz] = world.region.size;
      return { center: new THREE.Vector3(cx, world.elevation || 0, cz), size: [sx, sz] };
    }
    const [cellX, cellZ] = world.cell;
    const [spanX, spanZ] = world.span || [1, 1];
    // Districts around the plaza are 50% bigger than the original grid cell
    // (more realistic scale); Genesis Plaza keeps its own size
    const cellSize = world.key === 'plaza' ? CELL_SIZE : CELL_SIZE * DISTRICT_GROWTH;
    // Scenes are nudged off the grid so Genesis City feels like one organic place
    const jitter = world.key === 'plaza' ? [0, 0] : (() => { const random = seededRandom(world.key.split('').reduce((sum, c) => sum * 31 + c.charCodeAt(0), 7)); return [(random() - 0.5) * 18, (random() - 0.5) * 18]; })();
    const spread = 1.25; // extra room between scenes for paths and gardens
    return {
      center: new THREE.Vector3((cellX + (spanX - 1) / 2) * cellSize * (world.key === 'plaza' ? 1 : spread) + jitter[0], world.elevation || 0, (cellZ + (spanZ - 1) / 2) * cellSize * (world.key === 'plaza' ? 1 : spread) + jitter[1]),
      size: [spanX * cellSize - ROAD_WIDTH, spanZ * cellSize - ROAD_WIDTH],
      cells: { minX: cellX, maxX: cellX + spanX - 1, minZ: cellZ, maxZ: cellZ + spanZ - 1 }
    };
  }

  function districtOwningCell(cellX, cellZ) {
    return districts.find((district) => district.layout.cells &&
      cellX >= district.layout.cells.minX && cellX <= district.layout.cells.maxX &&
      cellZ >= district.layout.cells.minZ && cellZ <= district.layout.cells.maxZ);
  }

  function districtAt(x, z) {
    for (const district of districts) {
      const { center, size } = district.layout;
      if (Math.abs(x - center.x) <= size[0] / 2 + ROAD_WIDTH / 2 && Math.abs(z - center.z) <= size[1] / 2 + ROAD_WIDTH / 2) return district;
    }
    return null;
  }

  // Builds one district from its map JSON on top of a tinted lot
  function addDistrict(world, mapData) {
    const layout = layoutFor(world);
    const root = new THREE.Group();
    root.position.copy(layout.center);
    root.userData.districtKey = world.key;

    // Separate Worlds (big maps) float on their own island of land, far from Genesis City
    if (world.world) root.add(buildWorldIsland(layout.size, world.key, world.island));

    // Some scenes from the original maps were built small: "scale" in worlds.json
    // enlarges the whole scene (positions and sizes) to human scale
    const sceneScale = (world.scale || 1) * (world.cell && world.key !== 'plaza' ? DISTRICT_GROWTH : 1);
    const scaled = (value) => (Array.isArray(value) ? value.map((v) => v * sceneScale) : typeof value === 'number' ? value * sceneScale : value);
    mapData.blocks.forEach((blockData) => root.add(PropKit.buildBlock(sceneScale === 1 ? blockData : { ...blockData, position: scaled(blockData.position), scale: scaled(blockData.scale) })));

    // District name floating above it, like Decentraland's scene titles
    const title = textSprite(world.name, { width: world.region ? 60 : 22, color: '#ffffff', background: hexToRgba(world.color, 0.85) });
    title.position.set(0, world.region ? 90 : 30, 0);
    title.material.transparent = true;
    title.userData.isDistrictTitle = true;
    root.add(title);

    scene.add(root);
    pickables.push(root);
    const district = { world, layout, root, mapData, title };
    districts.push(district);
    return district;
  }

  // style "bare" (worlds.json "island"): an empty concrete yard with no trees,
  // like the closed compound of a game show
  function buildWorldIsland(size, key, style) {
    const island = new THREE.Group();
    const radius = Math.max(size[0], size[1]) * 0.75 + 120;
    const bare = style === 'bare';
    const groundMap = bare ? repeated(PropKit.kit.concreteTexture('#9a9a96'), radius / 8, radius / 8) : repeated(PropKit.kit.grassTexture('#558a33'), radius / 5, radius / 5);
    const grass = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshStandardMaterial({ map: groundMap, roughness: 1 }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = GROUND_LEVEL;
    grass.receiveShadow = true;
    island.add(grass);
    if (bare) return island;
    // A ring of trees frames the World
    const random = seededRandom(key.length * 977);
    const count = 120;
    // Realistic leafy trees (one instanced mesh: bark, foliage and leaf cards)
    const trees = new THREE.InstancedMesh(PropKit.kit.realisticTreeGeometry(), PropKit.kit.treeMaterial(), count);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const distance = Math.max(size[0], size[1]) * 0.62 + 10 + random() * (radius - Math.max(size[0], size[1]) * 0.62 - 20);
      const treeScale = 0.8 + random() * 0.8;
      matrix.compose(new THREE.Vector3(Math.cos(angle) * distance, GROUND_LEVEL, Math.sin(angle) * distance), quaternion.setFromAxisAngle(up, random() * 6.28), new THREE.Vector3(treeScale, treeScale * (0.9 + random() * 0.3), treeScale));
      trees.setMatrixAt(i, matrix);
    }
    trees.castShadow = false;
    trees.raycast = () => {};
    island.add(trees);
    return island;
  }

  function hexToRgba(hex, alpha) {
    const color = new THREE.Color(hex);
    return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
  }

  // --------------------------------------------------------------------------
  // Ground, roads, street lamps and generated neighborhoods
  // --------------------------------------------------------------------------
  // --------------------------------------------------------------------------
  // Ground (with holes for underground entrances), winding paths and organic
  // scattered points of interest: no street grid, no square blocks
  // --------------------------------------------------------------------------
  const paths = []; // polylines [[x, z], ...] used by the minimap
  const PATH_WIDTH = 5;

  function undergroundHoles() {
    const holes = [];
    // Square pools and blocks with a "hole" (stair shafts going underground)
    districts.forEach((district) => district.mapData.blocks.filter((block) => block.type === 'square_pool' || block.hole).forEach((block) => {
      holes.push({ x: district.layout.center.x + block.position[0], z: district.layout.center.z + block.position[2], size: block.hole || block.scale[0] });
    }));
    return holes;
  }

  function buildGround() {
    // Lawn: the shared realistic grass, tiled every 10 m
    const grassTexture = PropKit.kit.grassTexture('#558a33');
    // Lawn up to the edge of Genesis City; beyond it a flat grey void
    const edge = WORLD_LIMIT + 40;
    const shape = new THREE.Shape();
    shape.moveTo(-edge, -edge);
    shape.lineTo(edge, -edge);
    shape.lineTo(edge, edge);
    shape.lineTo(-edge, edge);
    shape.closePath();
    const voidGround = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshStandardMaterial({ color: '#8e9196', roughness: 1 }));
    voidGround.rotation.x = -Math.PI / 2;
    voidGround.position.y = GROUND_LEVEL - 0.08;
    voidGround.receiveShadow = false;
    scene.add(voidGround);
    // Square holes where an underground entrance (square pool) opens
    undergroundHoles().forEach(({ x, z, size }) => {
      const half = size / 2;
      const hole = new THREE.Path();
      hole.moveTo(x - half, -(z - half));
      hole.lineTo(x - half, -(z + half));
      hole.lineTo(x + half, -(z + half));
      hole.lineTo(x + half, -(z - half));
      hole.closePath();
      shape.holes.push(hole);
    });
    // Like Decentraland, Genesis City is mostly stone pavements; lawns are patches
    const pavers = repeated(PropKit.kit.cobbleTexture('#cfc6b8'), 1, 1);
    pavers.repeat.set(1 / 8, 1 / 8);
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ map: pavers, roughness: 0.95 }));
    // Real grass for lawns (the parcel grid is built in finalize, once every district exists)
    // (lawns are unit circles scaled per instance: about two grass tiles across)
    const texture = repeated(grassTexture, 2, 2);
    grassMaterialForLawns = new THREE.MeshStandardMaterial({ map: texture, roughness: 1 });
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = GROUND_LEVEL;
    ground.receiveShadow = true;
    scene.add(ground);
    pickables.push(ground);
    sharedCollidables.push(ground);
  }

  // A flat ribbon following a curve: warm paved walkway like Decentraland's paths
  function ribbon(points, width, ribbonMaterial, y) {
    const positions = [];
    const uvs = [];
    const indices = [];
    let distance = 0;
    points.forEach((point, index) => {
      const next = points[Math.min(index + 1, points.length - 1)];
      const previous = points[Math.max(index - 1, 0)];
      const dx = next.x - previous.x;
      const dz = next.z - previous.z;
      const length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length * width / 2;
      const nz = dx / length * width / 2;
      if (index > 0) distance += Math.hypot(point.x - points[index - 1].x, point.z - points[index - 1].z);
      positions.push(point.x + nx, y, point.z + nz, point.x - nx, y, point.z - nz);
      uvs.push(0, distance / width, 1, distance / width);
      if (index > 0) {
        const base = index * 2;
        indices.push(base - 2, base, base - 1, base - 1, base, base + 1);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const result = new THREE.Mesh(geometry, ribbonMaterial);
    result.receiveShadow = true;
    return result;
  }

  // Workspaces/coworks that get a mini plaza with a fountain at their entrance
  const COWORK_KEYS = ['workspace', 'lobby', 'agile', 'pavilion', 'social', 'districts'];
  const coworkSpots = [];

  function buildPaths() {
    const random = seededRandom(31337);
    const paverTexture = repeated(PropKit.kit.cobbleTexture('#d9a877'), 1, 1);
    const paver = new THREE.MeshStandardMaterial({ map: paverTexture, roughness: 0.9 });
    let lampPositions = [];
    const group = new THREE.Group();
    const plaza = districts.find((district) => district.world.key === 'plaza');
    const plazaRadius = plaza ? Math.min(plaza.layout.size[0], plaza.layout.size[1]) / 2 : 40;

    // Ring promenade around the plaza
    const ring = [];
    for (let i = 0; i <= 96; i++) {
      const angle = (i / 96) * Math.PI * 2;
      const radius = plazaRadius + 14 + Math.sin(angle * 5) * 3;
      ring.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
    }
    group.add(ribbon(ring, PATH_WIDTH + 1, paver, GROUND_LEVEL + 0.05));
    paths.push(ring.map((point) => [point.x, point.z]));
    ring.forEach((point, index) => { if (index % 6 === 0) lampPositions.push([point.x * 1.04, point.z * 1.04]); });

    // Spawn plaza (square pool, Events Explorer) -> promenade: every path starts there
    const spawnPlaza = new THREE.Vector3(-62, 0, 22);
    const spawnDirection = spawnPlaza.clone().normalize();
    const spawnPath = new THREE.CatmullRomCurve3([
      spawnPlaza.clone().add(spawnDirection.clone().multiplyScalar(18)),
      spawnDirection.clone().multiplyScalar(plazaRadius - 6).add(new THREE.Vector3(0, 0, 4)),
      spawnDirection.clone().multiplyScalar(plazaRadius + 14)
    ]).getPoints(16);
    group.add(ribbon(spawnPath, PATH_WIDTH + 1, paver, 0.03));

    // Winding paths from the promenade to every scene of Genesis City
    const entrances = [];
    districts.filter((district) => !district.world.world && district !== plaza).forEach((district) => {
      const center = district.layout.center;
      const direction = new THREE.Vector3(center.x, 0, center.z).normalize();
      const start = direction.clone().multiplyScalar(plazaRadius + 14);
      const end = new THREE.Vector3(center.x, 0, center.z).sub(direction.clone().multiplyScalar(Math.min(district.layout.size[0], district.layout.size[1]) / 2 - 2));
      const side = new THREE.Vector3(-direction.z, 0, direction.x);
      const wiggle = (random() - 0.5) * 24;
      const curve = new THREE.CatmullRomCurve3([
        start,
        start.clone().lerp(end, 0.33).add(side.clone().multiplyScalar(wiggle)),
        start.clone().lerp(end, 0.66).add(side.clone().multiplyScalar(-wiggle * 0.7)),
        end
      ]);
      const points = curve.getPoints(Math.max(8, Math.round(start.distanceTo(end) / 3)));
      entrances.push({ point: end, angle: Math.atan2(end.z, end.x), district });
      if (COWORK_KEYS.includes(district.world.key)) {
        const spot = new THREE.Vector3(center.x, 0, center.z).sub(direction.clone().multiplyScalar(Math.min(district.layout.size[0], district.layout.size[1]) / 2 + 12));
        coworkSpots.push({ x: spot.x, z: spot.z, seed: coworkSpots.length * 2 });
      }
      group.add(ribbon(points, PATH_WIDTH, paver, GROUND_LEVEL + 0.04));
      paths.push(points.map((point) => [point.x, point.z]));
      points.forEach((point, index) => {
        if (index % 5 !== 2) return;
        const next = points[Math.min(index + 1, points.length - 1)];
        const tangent = new THREE.Vector3(next.x - point.x, 0, next.z - point.z).normalize();
        const offset = (index % 10 < 5 ? 1 : -1) * (PATH_WIDTH / 2 + 0.8);
        lampPositions.push([point.x - tangent.z * offset, point.z + tangent.x * offset]);
      });
    });
    // Scenes also link to their neighbours, so the paths form one organic web
    // (no blocks or street grid): each entrance joins the next one around
    entrances.sort((a, b) => a.angle - b.angle);
    entrances.forEach((entrance, index) => {
      const next = entrances[(index + 1) % entrances.length];
      const from = entrance.point;
      const to = next.point;
      if (from.distanceTo(to) > 200) return;
      const middle = from.clone().lerp(to, 0.5);
      const outward = middle.clone().setY(0).normalize().multiplyScalar(-14 + (random() - 0.5) * 10);
      const points = new THREE.CatmullRomCurve3([from, middle.clone().add(outward), to]).getPoints(Math.max(8, Math.round(from.distanceTo(to) / 3)));
      if (points.some((point) => districts.some((district) => district !== entrance.district && district !== next.district && !district.world.world && Math.abs(point.x - district.layout.center.x) < district.layout.size[0] / 2 && Math.abs(point.z - district.layout.center.z) < district.layout.size[1] / 2))) return;
      group.add(ribbon(points, PATH_WIDTH - 0.6, paver, GROUND_LEVEL + 0.035));
      paths.push(points.map((point) => [point.x, point.z]));
    });
    // Mini plazas with a fountain and a message cube at the entrance of every cowork
    coworkSpots.forEach(({ x, z, seed }) => {
      const coworkPlaza = PropKit.buildBlock({ type: 'cowork_plaza', position: [x, GROUND_LEVEL + 0.02, z], scale: [20, 1, 20], seed });
      group.add(coworkPlaza);
    });
    scene.add(group);
    pickables.push(group);
    sharedCollidables.push(group);

    // Every fourth lamp spot is a pedestal with a glowing stone floating above
    // it (they shine at night, like Decentraland's night paths)
    const stoneSpots = lampPositions.filter((spot, index) => index % 4 === 3);
    lampPositions = lampPositions.filter((spot, index) => index % 4 !== 3);
    const stoneColors = ['#66d9e8', '#da77f2', '#ffd43b', '#69db7c'];
    stoneSpots.forEach(([x, z], index) => {
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 1.1, 8), material('#d6cfc4', { roughness: 0.8 }));
      pedestal.position.set(x, GROUND_LEVEL + 0.55, z);
      pedestal.castShadow = true;
      scene.add(pedestal);
      const color = stoneColors[index % stoneColors.length];
      const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3, roughness: 0.2, flatShading: true }));
      stone.position.set(x, GROUND_LEVEL + 1.9, z);
      stone.raycast = () => {};
      scene.add(stone);
      glowStones.push(stone);
      animatedCity.push((time) => {
        stone.position.y = GROUND_LEVEL + 1.9 + Math.sin(time * 1.5 + index) * 0.15;
        stone.rotation.y = time * 0.8 + index;
      });
    });

    // Classic lamp posts with colored banners along the paths
    const matrix = new THREE.Matrix4();
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 5, 6).translate(0, 2.5, 0), material('#263238', { metalness: 0.6 }), lampPositions.length);
    streetLampHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.38, 10, 8), new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffd27a', emissiveIntensity: 0.2 }), lampPositions.length);
    const bannerColors = ['#1877f2', '#2da44e', '#4dabf7', '#ffbe0b', '#0b4fa8', '#fb5607'];
    const banners = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 2.2), new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 0.8 }), lampPositions.length);
    const bannerColor = new THREE.Color();
    lampPositions.forEach(([x, z], index) => {
      matrix.makeTranslation(x, GROUND_LEVEL, z);
      posts.setMatrixAt(index, matrix);
      matrix.makeTranslation(x, GROUND_LEVEL + 5.1, z);
      streetLampHeads.setMatrixAt(index, matrix);
      matrix.makeRotationY(Math.atan2(x, z));
      matrix.setPosition(x, GROUND_LEVEL + 3.4, z);
      banners.setMatrixAt(index, matrix);
      banners.setColorAt(index, bannerColor.set(bannerColors[index % bannerColors.length]));
    });
    banners.raycast = () => {};
    // Soft halo around each lamp that only shows at night
    lampHalos = new THREE.InstancedMesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }), lampPositions.length);
    lampPositions.forEach(([x, z], index) => { matrix.makeTranslation(x, GROUND_LEVEL + 5.1, z); lampHalos.setMatrixAt(index, matrix); });
    lampHalos.raycast = () => {};
    scene.add(posts, streetLampHeads, banners, lampHalos);
  }

  // Land parcels sold for in-game coins (MVC): signs update with the owner
  const landSigns = new Map();
  let landOwners = {};
  function landSignTexture(parcel, owner) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 236;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = owner ? '#e7f5ff' : '#fff3e0';
    ctx.fillRect(0, 0, 512, 236);
    ctx.strokeStyle = owner ? '#1877f2' : '#e65100';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 502, 226);
    ctx.textAlign = 'center';
    ctx.fillStyle = owner ? '#0b4fa8' : '#e65100';
    ctx.font = 'bold 52px Segoe UI, Arial, sans-serif';
    ctx.fillText(owner ? `OWNED BY ${owner}`.slice(0, 22) : 'PARCEL FOR SALE', 256, 92);
    ctx.font = '36px Segoe UI, Arial, sans-serif';
    ctx.fillText(owner ? `Parcel ${parcel}` : `${parcel} · 250 MVC · press E`, 256, 168);
    const texture = new THREE.CanvasTexture(canvas);
    return texture;
  }

  function setLandOwners(lands) {
    landOwners = lands || {};
    landSigns.forEach(({ material: signMaterial }, parcel) => {
      const owner = landOwners[parcel] ? landOwners[parcel].owner : null;
      signMaterial.map = landSignTexture(parcel, owner);
      signMaterial.needsUpdate = true;
    });
    buildOwnedParcels();
    updateEstateEdging();
  }

  // Outskirts: past the neighborhoods the land fades out gradually (sparse
  // trees, rocks and grass tufts), then a dark treeline at the edge of the map
  // and rolling hills on the horizon beyond the last walkable coordinate
  function buildOutskirts() {
    const random = seededRandom(777);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const sparse = [];
    for (let i = 0; i < 2200; i++) {
      const x = (random() * 2 - 1) * (WORLD_LIMIT - 20);
      const z = (random() * 2 - 1) * (WORLD_LIMIT - 20);
      const radius = Math.max(Math.abs(x), Math.abs(z));
      // A few trees, rocks and grass tufts on the empty parcels (never on roads)
      if (radius < CORE_HALF + 4 || random() > 0.45) continue;
      if (landAt(x, z) !== 'land' || landAt(x + 3, z + 3) !== 'land' || landAt(x - 3, z - 3) !== 'land' || random() > 0.5) continue;
      sparse.push({ x, z, kind: random(), size: 0.6 + random() * 0.9 });
    }
    const trees = sparse.filter((spot) => spot.kind < 0.45);
    const rocks = sparse.filter((spot) => spot.kind >= 0.45 && spot.kind < 0.6);
    const tufts = sparse.filter((spot) => spot.kind >= 0.6);
    const trunk = new THREE.InstancedMesh(PropKit.kit.realisticTreeGeometry(), PropKit.kit.treeMaterial(), trees.length);
    trees.forEach(({ x, z, size }, index) => {
      matrix.compose(new THREE.Vector3(x, GROUND_LEVEL, z), quaternion.setFromAxisAngle(up, x * 7), new THREE.Vector3(size * 0.85, size * 0.9, size * 0.85));
      trunk.setMatrixAt(index, matrix);
    });
    const crown = new THREE.Group(); // (the realistic tree mesh includes its crown)
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), material('#8a8f94', { flatShading: true, roughness: 1 }), rocks.length);
    rocks.forEach(({ x, z, size }, index) => {
      matrix.compose(new THREE.Vector3(x, GROUND_LEVEL + 0.3, z), quaternion.setFromAxisAngle(up, z), new THREE.Vector3(size * 1.4, size * 0.7, size));
      rock.setMatrixAt(index, matrix);
    });
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 5), material('#6a9f3d', { flatShading: true }), tufts.length);
    tufts.forEach(({ x, z, size }, index) => {
      matrix.compose(new THREE.Vector3(x, GROUND_LEVEL + 0.4 * size, z), quaternion, new THREE.Vector3(size, size * 0.8, size));
      tuft.setMatrixAt(index, matrix);
    });
    // Dense treeline of dark pines along the edge of the map
    const line = [];
    for (let side = 0; side < 4; side++) {
      for (let t = -WORLD_LIMIT - 60; t <= WORLD_LIMIT + 60; t += 7) {
        for (let row = 0; row < 3; row++) {
          const depth = WORLD_LIMIT + 12 + row * 9 + random() * 6;
          const along = t + (random() - 0.5) * 6;
          const [x, z] = side === 0 ? [along, -depth] : side === 1 ? [depth, along] : side === 2 ? [along, depth] : [-depth, along];
          line.push({ x, z, size: 1.2 + random() * 1.3 });
        }
      }
    }
    const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 9, 7).translate(0, 4.5, 0), material('#24402c', { flatShading: true, roughness: 1 }), line.length);
    line.forEach(({ x, z, size }, index) => {
      matrix.compose(new THREE.Vector3(x, GROUND_LEVEL, z), quaternion, new THREE.Vector3(size, size, size));
      pines.setMatrixAt(index, matrix);
    });
    // Rolling hills on the horizon
    const hills = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), material('#2f4a3a', { flatShading: true, roughness: 1 }), 48);
    for (let i = 0; i < 48; i++) {
      const angle = (i / 48) * Math.PI * 2 + random() * 0.1;
      const distance = WORLD_LIMIT + 110 + random() * 150;
      const width = 140 + random() * 160;
      matrix.compose(new THREE.Vector3(Math.cos(angle) * distance, GROUND_LEVEL - 2, Math.sin(angle) * distance), quaternion.setFromAxisAngle(up, -angle), new THREE.Vector3(width * 0.7, 40 + random() * 70, width));
      hills.setMatrixAt(i, matrix);
    }
    [trunk, crown, rock, tuft, pines, hills].forEach((instanced) => {
      instanced.raycast = () => {};
      instanced.castShadow = instanced !== hills && instanced !== pines && instanced !== trunk; // thousands of trees: no shadow pass
      instanced.receiveShadow = true;
      scene.add(instanced);
    });
  }

  // Community links shown on digital art frames (press E to open)
  const COMMUNITY_LINKS = [
    ['GitHub Community', 'https://github.com/orgs/community/discussions'],
    ['Stack Overflow', 'https://stackoverflow.com'],
    ['MDN Web Docs', 'https://developer.mozilla.org'],
    ['freeCodeCamp', 'https://www.freecodecamp.org'],
    ['DEV Community', 'https://dev.to'],
    ['The Odin Project', 'https://www.theodinproject.com'],
    ['Hacker News', 'https://news.ycombinator.com'],
    ['GitHub Explore', 'https://github.com/explore']
  ];

  function nearPath(x, z, margin) {
    return paths.some((path) => path.some(([px, pz]) => Math.abs(px - x) < margin && Math.abs(pz - z) < margin && Math.hypot(px - x, pz - z) < margin));
  }

  function insideDistrict(x, z, margin) {
    return districts.some((district) => {
      if (district.world.world) return false;
      const { center, size } = district.layout;
      return Math.abs(x - center.x) < size[0] / 2 + margin && Math.abs(z - center.z) < size[1] / 2 + margin;
    });
  }

  // Merges simple non-indexed geometries into one (for instanced trees)
  function mergeGeometries(parts) {
    const positions = [];
    const normals = [];
    const colors = [];
    parts.forEach(({ geometry, color }) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      flat.computeVertexNormals();
      positions.push(...flat.attributes.position.array);
      normals.push(...flat.attributes.normal.array);
      const c = new THREE.Color(color);
      for (let i = 0; i < flat.attributes.position.count; i++) colors.push(c.r, c.g, c.b);
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    merged.computeBoundingSphere();
    return merged;
  }

  // Privacy: belts of Roblox-style layered pines (and a few round trees)
  // around every district, so each one feels like its own place. Entrances
  // stay open because no tree grows on a path.
  function buildDistrictTreeBelts() {
    const random = seededRandom(31337);
    const pine = PropKit.kit.realisticTreeGeometry('pine');
    const round = PropKit.kit.realisticTreeGeometry('broadleaf');
    const pines = [];
    const rounds = [];
    districts.forEach((district) => {
      // The plaza, the beach (it looks out to the sea) and the Glass Cube (a
      // store on an open square of the city) stay open
      if (district.world.world || ['plaza', 'beach', 'glasscube'].includes(district.world.key)) return;
      const { center, size } = district.layout;
      [5, 10].forEach((offset, row) => {
        const halfX = size[0] / 2 + offset;
        const halfZ = size[1] / 2 + offset;
        const perimeter = 4 * (halfX + halfZ);
        const steps = Math.floor(perimeter / (row ? 6.5 : 4.8));
        for (let i = 0; i < steps; i++) {
          let t = (i / steps) * perimeter;
          let x;
          let z;
          if (t < 2 * halfX) { x = -halfX + t; z = -halfZ; } else if ((t -= 2 * halfX) < 2 * halfZ) { x = halfX; z = -halfZ + t; } else if ((t -= 2 * halfZ) < 2 * halfX) { x = halfX - t; z = halfZ; } else { t -= 2 * halfX; x = -halfX; z = halfZ - t; }
          x += center.x + (random() - 0.5) * 2.4;
          z += center.z + (random() - 0.5) * 2.4;
          if (random() < 0.12) continue; // natural gaps
          if (nearPath(x, z, 5.5) || insideDistrict(x, z, 2) || Math.abs(x) > WORLD_LIMIT - 5 || Math.abs(z) > WORLD_LIMIT - 5) continue;
          const [px, pz] = parcelOf(x, z);
          if (isRoadParcel(px, pz)) continue;
          (random() < 0.8 ? pines : rounds).push({ x, z, size: 0.75 + random() * 0.55, turn: random() * Math.PI * 2 });
        }
      });
    });
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    [[pine, pines], [round, rounds]].forEach(([geometry, spots]) => {
      if (!spots.length) return;
      const trees = new THREE.InstancedMesh(geometry, PropKit.kit.treeMaterial(), spots.length);
      spots.forEach(({ x, z, size, turn }, index) => {
        matrix.compose(new THREE.Vector3(x, GROUND_LEVEL, z), quaternion.setFromAxisAngle(up, turn), new THREE.Vector3(size, size * (0.9 + (index % 5) * 0.06), size));
        trees.setMatrixAt(index, matrix);
      });
      trees.castShadow = false; // thousands of instances: the shadow pass would draw them all again
      trees.receiveShadow = true;
      trees.raycast = () => {};
      trees.userData.alwaysVisible = true;
      scene.add(trees);
    });
  }

  // Organic scatter of points of interest around the scenes
  function buildNeighborhoods() {
    const { box, cylinder, sphere, mesh, glow: glowMaterial, interactive, labelTexture } = PropKit.kit;
    const random = seededRandom(2024);
    const trees = [];
    const shrubs = [];
    const houses = [];
    const sculptures = [];
    const kiosks = [];
    const midrises = [];
    const spots = [];
    const lawns = [];
    const STEP = 21;
    // Landmarks scattered around Genesis Plaza (like Decentraland's art and ad
    // installations): each finds a free spot away from scenes and paths
    const LANDMARKS = [
      { type: 'column_hall', scale: [26, 12, 16], color: '#e8b4b8', label: 'Hall of Builders', radius: 135, angle: 0.6, face: true },
      { type: 'supertree', scale: [9, 22, 9], radius: 118, angle: 0.35 },
      { type: 'supertree', scale: [8, 17, 8], radius: 122, angle: 0.85 },
      { type: 'marble_statue', scale: [3, 8, 3], radius: 125, angle: 0.95 },
      { type: 'kinetic_sculpture', scale: [9, 8, 9], radius: 130, angle: 2.4 },
      { type: 'ad_cube_stack', scale: [7, 21, 7], color: '#b2f22c', radius: 150, angle: 3.3, seed: 3 },
      { type: 'led_cube_kiosk', scale: [10, 18, 10], radius: 160, angle: 4.4, seed: 7 },
      { type: 'ad_cube_stack', scale: [6, 18, 6], color: '#ff6bd6', radius: 175, angle: 5.5, seed: 9 },
      { type: 'supertree', scale: [8, 19, 8], radius: 145, angle: 4.0 },
      { type: 'supertree', scale: [8, 16, 8], radius: 150, angle: 5.0 },
      { type: 'column_hall', scale: [20, 10, 14], color: '#cdb4db', label: 'Gallery of Open Source', radius: 190, angle: 2.0, face: true },
      { type: 'light_pavilion', scale: [24, 16, 24], label: 'Pavilion of Light', radius: 140, angle: 1.55, face: true },
      { type: 'mini_hotel', scale: [15, 9, 15], label: 'Genesis Capsule Inn', radius: 128, angle: 2.9, face: true },
      { type: 'forest_garden', scale: [30, 1, 30], label: 'Multiverse Forest', radius: 175, angle: 1.05, face: true },
      { type: 'forest_garden', scale: [26, 1, 26], label: 'Multiverse Forest II', radius: 240, angle: 4.75, face: true },
      { type: 'mini_hotel', scale: [14, 12, 14], label: 'Neon Cube Hotel', radius: 170, angle: 6.0, face: true, variant: 'cube' },
      { type: 'promenade', scale: [14, 1, 54], color: '#b9b4d6', radius: 150, angle: 3.9, face: true },
      { type: 'promenade', scale: [14, 1, 54], color: '#d6c7b4', radius: 165, angle: 0.15, face: true },
      { type: 'promenade', scale: [12, 1, 46], color: '#c5d6e0', radius: 180, angle: 5.2, face: true },
      // Open squares near the spawn (squares.js)
      { type: 'round_pavilion', scale: [30, 8, 30], label: 'The Round Pavilion', radius: 118, angle: 2.55, face: true },
      { type: 'wave_cube', scale: [16, 16, 16], label: 'The Wave Cube', radius: 122, angle: 1.95, face: true },
      { type: 'retro_arcade', scale: [26, 9, 16], label: 'Retro Arcade', radius: 128, angle: 3.75, face: true },
      { type: 'screen_amphitheater', scale: [34, 12, 34], label: 'Open Stage', radius: 135, angle: 1.25, face: true },
      { type: 'ring_colosseum', scale: [26, 12, 26], label: 'The Ring', radius: 150, angle: 4.35, face: true },
      // More firepits with benches and "Fry your Code" around the commons
      { type: 'firepit', scale: [16, 1, 16], radius: 112, angle: 3.1 },
      { type: 'firepit', scale: [16, 1, 16], radius: 140, angle: 0.95 },
      { type: 'firepit', scale: [16, 1, 16], radius: 160, angle: 5.75 },
      { type: 'firepit', scale: [16, 1, 16], radius: 200, angle: 2.25 },
      { type: 'firepit', scale: [16, 1, 16], radius: 230, angle: 4.0 },
      { type: 'firepit', scale: [16, 1, 16], radius: 260, angle: 0.4 }
    ];
    const placedLandmarks = coworkSpots.map(({ x, z }) => ({ x, z, size: 13, landmark: null }));
    LANDMARKS.forEach((landmark) => {
      const size = landmark.reserve || Math.max(landmark.scale[0], landmark.scale[2]) / 2 + 3;
      for (let attempt = 0; attempt < 160; attempt++) {
        const angle = landmark.angle + attempt * 0.11;
        const radius = landmark.radius + (attempt % 8) * 13;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (insideDistrict(x, z, size) || nearPath(x, z, size) || placedLandmarks.some((other) => Math.hypot(other.x - x, other.z - z) < other.size + size)) continue;
        placedLandmarks.push({ x, z, size, landmark });
        break;
      }
    });
    // The whole commons is filled (up to its corners), so it never looks empty
    for (let gx = -CORE_HALF + 10; gx <= CORE_HALF - 10; gx += STEP) {
      for (let gz = -CORE_HALF + 10; gz <= CORE_HALF - 10; gz += STEP) {
        const x = gx + (random() - 0.5) * STEP * 0.8;
        const z = gz + (random() - 0.5) * STEP * 0.8;
        const radius = Math.hypot(x, z);
        if (radius < 110 || seaAt(x, z) || insideDistrict(x, z, 6) || nearPath(x, z, 5) || placedLandmarks.some((spot) => Math.hypot(spot.x - x, spot.z - z) < spot.size + 7)) { random(); continue; }
        const roll = random();
        if (roll < 0.42) {
          lawns.push({ x, z, size: 7 + random() * 4 });
          const count = 5 + Math.floor(random() * 6);
          for (let t = 0; t < count; t++) trees.push({ x: x + (random() - 0.5) * 16, z: z + (random() - 0.5) * 16, size: 0.8 + random() * 0.8, shade: random() });
          for (let t = 0; t < 4; t++) shrubs.push({ x: x + (random() - 0.5) * 14, z: z + (random() - 0.5) * 14, size: 0.6 + random() * 0.6, turn: random() * Math.PI });
        } else if (roll < 0.56) houses.push({ x, z, width: 9 + random() * 4, depth: 9 + random() * 4, height: 6 + random() * 3, hue: random(), roof: random(), turn: random() * Math.PI });
        else if (roll < 0.65) sculptures.push({ x, z, hue: random(), kind: Math.floor(random() * 3), size: 1.5 + random() * 1.5 });
        else if (roll < 0.72) kiosks.push({ x, z, hue: random(), turn: random() * Math.PI });
        else if (roll < 0.79) spots.push({ type: 'campfire', x, z });
        else if (roll < 0.85) spots.push({ type: 'art', x, z, link: COMMUNITY_LINKS[Math.floor(random() * COMMUNITY_LINKS.length)], seed: Math.floor(random() * 1000), turn: random() * Math.PI * 2 });
        else if (roll < 0.9) spots.push({ type: 'picnic', x, z, turn: random() * Math.PI });
        else if (roll < 0.94) spots.push({ type: 'sale', x, z });
        else midrises.push({ x, z, width: 11 + random() * 6, depth: 11 + random() * 6, height: 14 + random() * 18, hue: random() });
      }
    }

    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const color = new THREE.Color();
    const pastel = ['#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#a0c4ff', '#bdb2ff', '#ffc6ff', '#ffadad', '#f1faee'];
    const addInstanced = (instanced, solid = true) => {
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      scene.add(instanced);
      if (solid) { sharedCollidables.push(instanced); pickables.push(instanced); }
    };

    // Realistic leafy trees (green, blossom and autumn broadleaf, some pines) with low leafy shrubs
    const treeGroups = { broadleaf_green: [], broadleaf_blossom: [], broadleaf_autumn: [], pine_green: [] };
    trees.forEach((tree) => {
      const key = tree.shade > 0.86 ? 'broadleaf_blossom' : tree.shade > 0.7 ? 'broadleaf_autumn' : tree.shade < 0.22 ? 'pine_green' : 'broadleaf_green';
      treeGroups[key].push(tree);
    });
    Object.entries(treeGroups).forEach(([key, list]) => {
      if (!list.length) return;
      const [kind, variant] = key.split('_');
      const mesh = new THREE.InstancedMesh(PropKit.kit.realisticTreeGeometry(kind), PropKit.kit.treeMaterial(variant), list.length);
      list.forEach((tree, index) => {
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.x * 3.1 + tree.z);
        matrix.compose(position.set(tree.x, GROUND_LEVEL, tree.z), quaternion, scale.set(tree.size * 0.8, tree.size * (0.75 + tree.shade * 0.2), tree.size * 0.8));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.receiveShadow = true;
      scene.add(mesh);
      sharedCollidables.push(mesh);
      pickables.push(mesh);
    });
    if (shrubs.length) {
      const shrubMesh = new THREE.InstancedMesh(PropKit.kit.realisticTreeGeometry('broadleaf'), PropKit.kit.treeMaterial('green'), shrubs.length);
      shrubs.forEach((shrub, index) => {
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), shrub.turn);
        // A squashed leafy crown sunk into the ground reads as a bush
        matrix.compose(position.set(shrub.x, GROUND_LEVEL - 1.7 * shrub.size, shrub.z), quaternion, scale.set(shrub.size * 0.55, shrub.size * 0.5, shrub.size * 0.55));
        shrubMesh.setMatrixAt(index, matrix);
      });
      shrubMesh.receiveShadow = true;
      scene.add(shrubMesh);
    }

    // Cottages with rounded walls and pyramid roofs, turned in every direction
    const houseMap = repeated(windowsTexture('#ffffff', '#ffe9a8'), 2, 1);
    const houseMaterial = new THREE.MeshStandardMaterial({ map: houseMap, emissiveMap: houseMap, emissive: '#000000', roughness: 0.8 });
    nightWindowMaterials.push(houseMaterial);
    const houseMesh = new THREE.InstancedMesh(PropKit.kit.roundedUnitBox(), houseMaterial, Math.max(1, houses.length));
    const roofMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.75, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), material('#ffffff', { flatShading: true }), Math.max(1, houses.length));
    houseMesh.count = roofMesh.count = houses.length;
    const roofColors = ['#c0392b', '#2c3e50', '#16a085', '#8e44ad', '#d35400'];
    houses.forEach((house, index) => {
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), house.turn);
      matrix.compose(position.set(house.x, GROUND_LEVEL, house.z), quaternion, scale.set(house.width, house.height, house.depth));
      houseMesh.setMatrixAt(index, matrix);
      houseMesh.setColorAt(index, color.set(pastel[Math.floor(house.hue * pastel.length)]));
      matrix.compose(position.set(house.x, GROUND_LEVEL + house.height, house.z), quaternion, scale.set(house.width * 1.15, house.height * 0.7, house.depth * 1.15));
      roofMesh.setMatrixAt(index, matrix);
      roofMesh.setColorAt(index, color.set(roofColors[Math.floor(house.roof * roofColors.length)]));
    });
    addInstanced(houseMesh);
    addInstanced(roofMesh);

    // A few mid-rise scenes with lit windows
    const windowMap = repeated(windowsTexture('#ffffff', '#ffe9a8'), 2, 3);
    const buildingMaterial = new THREE.MeshStandardMaterial({ map: windowMap, emissiveMap: windowMap, emissive: '#000000', roughness: 0.4, metalness: 0.2 });
    nightWindowMaterials.push(buildingMaterial);
    const buildingMesh = new THREE.InstancedMesh(PropKit.kit.roundedUnitBox(), buildingMaterial, Math.max(1, midrises.length));
    buildingMesh.count = midrises.length;
    midrises.forEach((building, index) => {
      matrix.compose(position.set(building.x, GROUND_LEVEL, building.z), quaternion.identity(), scale.set(building.width, building.height, building.depth));
      buildingMesh.setMatrixAt(index, matrix);
      buildingMesh.setColorAt(index, color.set(pastel[Math.floor(building.hue * pastel.length)]));
    });
    addInstanced(buildingMesh);

    // Spinning community sculptures on pedestals
    const pedestalMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.1, 1.3, 1.2, 16).translate(0, 0.6, 0), material('#f5f5f5'), Math.max(1, sculptures.length));
    pedestalMesh.count = sculptures.length;
    const artGeometries = [new THREE.IcosahedronGeometry(1, 0), new THREE.TorusKnotGeometry(0.7, 0.22, 48, 8), new THREE.OctahedronGeometry(1, 0)];
    const artMeshes = artGeometries.map((geometry) => new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0.4, flatShading: true }), Math.max(1, sculptures.length)));
    artMeshes.forEach((artMesh) => { artMesh.count = 0; });
    sculptures.forEach((sculpture, index) => {
      matrix.makeTranslation(sculpture.x, GROUND_LEVEL, sculpture.z);
      pedestalMesh.setMatrixAt(index, matrix);
      const artMesh = artMeshes[sculpture.kind];
      sculpture.slot = artMesh.count++;
      artMesh.setColorAt(sculpture.slot, color.setHSL(sculpture.hue, 0.75, 0.55));
    });
    addInstanced(pedestalMesh);
    artMeshes.forEach((artMesh) => { artMesh.castShadow = true; scene.add(artMesh); });
    const spin = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    animatedCity.push((time) => {
      sculptures.forEach((sculpture) => {
        spin.setFromAxisAngle(yAxis, time * 0.5 + sculpture.hue * 6);
        matrix.compose(position.set(sculpture.x, GROUND_LEVEL + 2.4 + sculpture.size * 0.6 + Math.sin(time + sculpture.hue * 9) * 0.2, sculpture.z), spin, scale.setScalar(sculpture.size * 0.6));
        artMeshes[sculpture.kind].setMatrixAt(sculpture.slot, matrix);
      });
      artMeshes.forEach((artMesh) => { artMesh.instanceMatrix.needsUpdate = true; });
    });

    // Market kiosks with striped awnings
    const kioskBody = new THREE.InstancedMesh(PropKit.kit.roundedUnitBox(), material('#fafafa'), Math.max(1, kiosks.length));
    const kioskAwning = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 0.25, 4.2).translate(0, 3, 0.4), material('#ffffff'), Math.max(1, kiosks.length));
    kioskBody.count = kioskAwning.count = kiosks.length;
    kiosks.forEach((kiosk, index) => {
      quaternion.setFromAxisAngle(yAxis, kiosk.turn);
      matrix.compose(position.set(kiosk.x, GROUND_LEVEL, kiosk.z), quaternion, scale.set(4, 2.4, 3));
      kioskBody.setMatrixAt(index, matrix);
      matrix.compose(position.set(kiosk.x, GROUND_LEVEL, kiosk.z), quaternion, scale.set(1, 1, 1));
      kioskAwning.setMatrixAt(index, matrix);
      kioskAwning.setColorAt(index, color.setHSL(kiosk.hue, 0.8, 0.55));
    });
    addInstanced(kioskBody);
    addInstanced(kioskAwning);

    // Hand-built social spots: campfires with benches, digital art with community links, picnics
    const pois = new THREE.Group();
    spots.forEach((spot) => {
      const spotGroup = new THREE.Group();
      spotGroup.position.set(spot.x, GROUND_LEVEL, spot.z);
      if (spot.type === 'campfire') {
        spotGroup.add(cylinder(1.4, 1.5, 0.3, material('#8d8d8d', { roughness: 1 }), 0, 0.15, 0, 10));
        for (let i = 0; i < 4; i++) {
          const log = cylinder(0.15, 0.15, 1.6, material('#6d4c41'), 0, 0.4, 0, 6);
          log.rotation.set(Math.PI / 2, 0, (i / 4) * Math.PI);
          spotGroup.add(log);
        }
        const flame = mesh(new THREE.ConeGeometry(0.6, 1.6, 7), glowMaterial('#ff9f1c', 2, { transparent: true, opacity: 0.9 }), 0, 1.2, 0);
        const core = mesh(new THREE.ConeGeometry(0.32, 1.1, 7), glowMaterial('#ffe8a3', 3, { transparent: true, opacity: 0.95 }), 0, 0.95, 0);
        [flame, core].forEach((part) => { part.castShadow = false; spotGroup.add(part); });
        animatedCity.push((time) => {
          flame.scale.set(1 + Math.sin(time * 9 + spot.z) * 0.06, 0.8 + Math.sin(time * 14 + spot.x) * 0.25, 1);
          core.scale.set(1, 0.85 + Math.sin(time * 19 + spot.z) * 0.2, 1);
        });
        // Flickering firelight on the ground and benches (stronger at night)
        FireLights.register(spotGroup, { radius: 8, height: 1.3, strength: 0.9 });
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 + 0.4;
          const bench = new THREE.Group();
          bench.add(box(2.2, 0.14, 0.6, material('#a8743f'), 0, 0.55, 0));
          bench.add(box(0.12, 0.55, 0.5, material('#5d4037'), -0.9, 0.27, 0));
          bench.add(box(0.12, 0.55, 0.5, material('#5d4037'), 0.9, 0.27, 0));
          bench.position.set(Math.cos(angle) * 3.6, 0, Math.sin(angle) * 3.6);
          bench.rotation.y = -angle + Math.PI / 2;
          spotGroup.add(interactive(bench, 'sit', 'Campfire bench'));
        }
        spotGroup.userData.label = 'Campfire: sit down and chat';
      } else if (spot.type === 'art') {
        const [name, url] = spot.link;
        const frame = new THREE.Group();
        frame.add(box(0.15, 3, 0.15, material('#3e2723'), -1.3, 1.5, 0));
        frame.add(box(0.15, 3, 0.15, material('#3e2723'), 1.3, 1.5, 0));
        frame.add(box(3, 2.2, 0.12, material('#2b2d42'), 0, 2.6, 0));
        frame.add(box(2.7, 1.9, 0.05, new THREE.MeshBasicMaterial({ map: PropKit.kit.artTexture(spot.seed) }), 0, 2.6, 0.09));
        frame.add(box(2.7, 0.45, 0.06, new THREE.MeshBasicMaterial({ map: labelTexture(`${name} ↗`, { bg: '#1877f2', fg: '#ffffff', width: 512, height: 90, font: 'bold 40px Segoe UI, Arial' }) }), 0, 1.25, 0.1));
        frame.rotation.y = spot.turn;
        frame.userData.label = `Digital art · ${name} (E to open)`;
        frame.userData.url = url;
        spotGroup.add(interactive(frame, 'link', name));
      } else if (spot.type === 'picnic') {
        const table = new THREE.Group();
        table.add(box(2.6, 0.12, 1.2, material('#c8956d'), 0, 0.8, 0));
        [-1, 1].forEach((side) => {
          table.add(box(2.6, 0.1, 0.4, material('#c8956d'), 0, 0.45, side * 0.9));
          table.add(box(0.12, 0.8, 1, material('#8d5a2b'), side * 1, 0.4, 0));
        });
        table.add(box(1.4, 0.05, 1, material('#e63946'), 0, 0.87, 0));
        table.rotation.y = spot.turn;
        spotGroup.add(interactive(table, 'sit', 'Picnic table'));
        spotGroup.add(sphere(1.4, material('#2f9e44'), 3.4, 2.6, 0, 10));
        spotGroup.add(cylinder(0.2, 0.25, 2, material('#6d4c41'), 3.4, 1, 0, 6));
      } else if (spot.type === 'sale') {
        // Land parcel for sale (in-game coins): E to buy, the sign shows the owner
        const parcel = `${Math.floor(spot.x / PARCEL_SIZE)},${Math.floor(-spot.z / PARCEL_SIZE)}`;
        spotGroup.add(box(0.15, 2, 0.15, material('#795548'), 0, 1, 0));
        const signMaterial = new THREE.MeshBasicMaterial({ map: landSignTexture(parcel, null) });
        const sign = box(2.6, 1.2, 0.08, signMaterial, 0, 2.3, 0);
        spotGroup.add(sign);
        // Corner stakes with a rope outline the 16 m parcel
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) => spotGroup.add(box(0.12, 0.8, 0.12, material('#ffb703'), sx * 7.5, 0.4, sz * 7.5)));
        spotGroup.userData.parcel = parcel;
        landSigns.set(parcel, { material: signMaterial });
        interactive(sign, 'land', `Parcel ${parcel}`);
        sign.userData.parcel = parcel;
      }
      pois.add(spotGroup);
    });
    // Round lawns under the tree groups (the rest of the city is paved)
    if (lawns.length && grassMaterialForLawns) {
      const lawnMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), grassMaterialForLawns, lawns.length);
      const lawnMatrix = new THREE.Matrix4();
      lawns.forEach(({ x, z, size }, index) => {
        lawnMatrix.compose(new THREE.Vector3(x, GROUND_LEVEL + 0.015, z), new THREE.Quaternion(), new THREE.Vector3(size, 1, size));
        lawnMesh.setMatrixAt(index, lawnMatrix);
      });
      lawnMesh.receiveShadow = true;
      lawnMesh.raycast = () => {};
      scene.add(lawnMesh);
    }
    placedLandmarks.forEach(({ x, z, landmark }) => {
      if (!landmark) return;
      const block = PropKit.buildBlock({ type: landmark.type, position: [x, GROUND_LEVEL, z], scale: landmark.scale, color: landmark.color, label: landmark.label, seed: landmark.seed, variant: landmark.variant, name: landmark.label });
      if (landmark.face) block.rotation.y = Math.atan2(-x, -z);
      pois.add(block);
    });
    scene.add(pois);
    pickables.push(pois);
    sharedCollidables.push(pois);

    // A lake under the floating Zen temple
    const zen = districts.find((district) => district.world.elevation);
    if (zen) {
      const lakeNormals = repeated(PropKit.kit.waterNormals(), 3, 3);
      const lake = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 0.2, 40), new THREE.MeshStandardMaterial({ color: '#4fc3f7', roughness: 0.06, metalness: 0.25, normalMap: lakeNormals, normalScale: new THREE.Vector2(0.5, 0.5) }));
      lake.position.set(zen.layout.center.x, GROUND_LEVEL + 0.1, zen.layout.center.z);
      scene.add(lake);
    }
  }

  // --------------------------------------------------------------------------
  // Sky dome, sun, stars, clouds and weather
  // --------------------------------------------------------------------------
  // Minecraft-style cloud layer: flat blocky clouds at a fixed height that you
  // can fly up to and through. The layer follows the camera on a grid, and the
  // cloud pattern comes from world coordinates, so it never repeats visibly.
  const CLOUD_LAYER_Y = 150;
  const CLOUD_CELL = 12;
  const CLOUD_RADIUS_CELLS = 36;
  let cloudLayer = null;
  let cloudLayerCell = null;

  function cloudNoise(x, z) {
    const hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
    const smooth = (cx, cz, size) => {
      const gx = Math.floor(cx / size);
      const gz = Math.floor(cz / size);
      const fx = cx / size - gx;
      const fz = cz / size - gz;
      const top = hash(gx, gz) * (1 - fx) + hash(gx + 1, gz) * fx;
      const bottom = hash(gx, gz + 1) * (1 - fx) + hash(gx + 1, gz + 1) * fx;
      return top * (1 - fz) + bottom * fz;
    };
    return smooth(x, z, 6) * 0.65 + smooth(x, z, 2) * 0.35;
  }

  function buildCloudLayer() {
    const capacity = (CLOUD_RADIUS_CELLS * 2 + 1) ** 2;
    cloudLayer = new THREE.InstancedMesh(new THREE.BoxGeometry(CLOUD_CELL, 4, CLOUD_CELL), new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 1, transparent: true, opacity: 0.82, depthWrite: false }), capacity);
    cloudLayer.castShadow = false;
    cloudLayer.raycast = () => {};
    cloudLayer.frustumCulled = false;
    cloudLayer.renderOrder = 2;
    scene.add(cloudLayer);
  }

  function updateCloudLayer(camera, time) {
    const drift = time * 1.5; // clouds drift slowly east, like Minecraft
    const cx = Math.floor((camera.position.x - drift) / CLOUD_CELL);
    const cz = Math.floor(camera.position.z / CLOUD_CELL);
    cloudLayer.position.x = drift;
    const key = `${cx},${cz}`;
    if (key === cloudLayerCell) return;
    cloudLayerCell = key;
    const matrix = new THREE.Matrix4();
    let count = 0;
    for (let i = -CLOUD_RADIUS_CELLS; i <= CLOUD_RADIUS_CELLS; i++) {
      for (let j = -CLOUD_RADIUS_CELLS; j <= CLOUD_RADIUS_CELLS; j++) {
        if (i * i + j * j > CLOUD_RADIUS_CELLS * CLOUD_RADIUS_CELLS) continue;
        if (cloudNoise(cx + i, cz + j) < 0.56) continue;
        matrix.makeTranslation((cx + i + 0.5) * CLOUD_CELL, CLOUD_LAYER_Y, (cz + j + 0.5) * CLOUD_CELL);
        cloudLayer.setMatrixAt(count++, matrix);
      }
    }
    cloudLayer.count = count;
    cloudLayer.instanceMatrix.needsUpdate = true;
  }

  function buildSky() {
    sky = new THREE.Mesh(
      new THREE.SphereGeometry(1400, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { topColor: { value: new THREE.Color('#3d8bfd') }, bottomColor: { value: new THREE.Color('#dff1ff') } },
        vertexShader: 'varying vec3 vWorld; void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vWorld; void main() { float h = normalize(vWorld - cameraPosition).y; gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), 0.55)), 1.0); }'
      })
    );
    scene.add(sky);

    hemisphere = new THREE.HemisphereLight('#dff1ff', '#5d7a4a', 0.75);
    scene.add(hemisphere);

    sun = new THREE.DirectionalLight('#fff4e0', 0.95);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 400 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.06;
    scene.add(sun, sun.target);

    const starPositions = [];
    const random = seededRandom(7);
    for (let i = 0; i < 1500; i++) {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(random() * 0.95);
      starPositions.push(Math.sin(phi) * Math.cos(theta) * 1200, Math.cos(phi) * 1200, Math.sin(phi) * Math.sin(theta) * 1200);
    }
    moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16), new THREE.MeshBasicMaterial({ color: '#f1f3ff', fog: false }));
    moon.add(new THREE.Mesh(new THREE.SphereGeometry(40, 24, 16), new THREE.MeshBasicMaterial({ color: '#9fb4ff', transparent: true, opacity: 0.12, fog: false, depthWrite: false })));
    scene.add(moon);
    stars = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    scene.add(stars);


    rain = createPrecipitation(4000, '#a5c8ff', 0.35, true);
    snow = createPrecipitation(2500, '#ffffff', 1.4, false);
  }

  function createPrecipitation(count, color, size, isRain) {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 160;
      positions[i * 3 + 1] = Math.random() * 80;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 160;
    }
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, transparent: true, opacity: isRain ? 0.6 : 0.9, depthWrite: false }));
    points.visible = false;
    points.userData = { speed: isRain ? 60 : 6, isRain };
    scene.add(points);
    return points;
  }

  // Minecraft-style ticks: 0 = sunrise (06:00), 6000 = noon, 12000 = sunset, 18000 = midnight
  const skyKeys = [
    { tick: 0, top: '#5b7fcf', bottom: '#ffb38a', light: 0.55 },
    { tick: 2000, top: '#3d8bfd', bottom: '#dff1ff', light: 1 },
    { tick: 10000, top: '#3d8bfd', bottom: '#dff1ff', light: 1 },
    { tick: 12000, top: '#4b4a8f', bottom: '#ff8c5a', light: 0.5 },
    { tick: 13500, top: '#0b1430', bottom: '#2a2160', light: 0.14 },
    { tick: 22500, top: '#0b1430', bottom: '#2a2160', light: 0.14 },
    { tick: 24000, top: '#5b7fcf', bottom: '#ffb38a', light: 0.55 }
  ];

  function skyAt(ticks) {
    const t = ((ticks % 24000) + 24000) % 24000;
    for (let i = 0; i < skyKeys.length - 1; i++) {
      const a = skyKeys[i];
      const b = skyKeys[i + 1];
      if (t >= a.tick && t <= b.tick) {
        const k = (t - a.tick) / (b.tick - a.tick);
        return {
          top: new THREE.Color(a.top).lerp(new THREE.Color(b.top), k),
          bottom: new THREE.Color(a.bottom).lerp(new THREE.Color(b.bottom), k),
          light: a.light + (b.light - a.light) * k
        };
      }
    }
    return { top: new THREE.Color(skyKeys[0].top), bottom: new THREE.Color(skyKeys[0].bottom), light: 0.5 };
  }

  function updateEnvironment({ ticks, weather, camera, focus, deltaSeconds, time }) {
    if (seaWater) seaWater.offset.set(time * 0.012, time * 0.008);
    const colors = skyAt(ticks);
    const stormFactor = weather === 'clear' ? 1 : weather === 'thunder' ? 0.45 : 0.65;
    const gray = new THREE.Color('#7b8794');
    if (weather !== 'clear') {
      colors.top.lerp(gray, 0.55);
      colors.bottom.lerp(gray, 0.45);
    }
    sky.material.uniforms.topColor.value.copy(colors.top);
    sky.material.uniforms.bottomColor.value.copy(colors.bottom);
    sky.position.copy(camera.position);
    scene.fog.color.copy(colors.bottom);
    scene.fog.near = weather === 'clear' ? 140 : 60;
    scene.fog.far = weather === 'clear' ? 900 : 380;
    // The higher you fly, the hazier the view; inside the cloud layer it turns white
    if (!cloudLayer) buildCloudLayer();
    updateCloudLayer(camera, time);
    const altitude = camera.position.y;
    const haze = Math.min(1, Math.max(0, (altitude - 40) / 200));
    scene.fog.near *= 1 - haze * 0.85;
    scene.fog.far *= 1 - haze * 0.6;
    let inCloud = 0;
    if (Math.abs(altitude - CLOUD_LAYER_Y) < 2.5) {
      const local = Math.floor((camera.position.x - cloudLayer.position.x) / CLOUD_CELL);
      inCloud = cloudNoise(local, Math.floor(camera.position.z / CLOUD_CELL)) >= 0.56 ? 1 : 0.35;
    }
    if (inCloud) {
      scene.fog.color.lerp(new THREE.Color('#f4f7fb'), inCloud);
      scene.fog.near = 0;
      scene.fog.far = inCloud === 1 ? 18 : 120;
    }
    cloudLayer.material.color.set(weather === 'clear' ? '#ffffff' : '#aab4c0');

    const daylight = colors.light * stormFactor;
    hemisphere.intensity = 0.15 + daylight * 0.5;
    hemisphere.color.copy(colors.bottom).lerp(new THREE.Color('#ffffff'), 0.5);
    const sunAngle = ((ticks % 24000) / 24000) * Math.PI * 2;
    const isDay = (ticks % 24000) < 12500 || (ticks % 24000) > 23500;
    sun.intensity = isDay ? daylight * 0.85 : 0.12;
    sun.color.set(isDay ? '#fff4e0' : '#9db4ff');
    const lightDirection = new THREE.Vector3(Math.cos(sunAngle) * 120, Math.abs(Math.sin(sunAngle)) * 160 + 30, 60);
    sun.position.copy(focus).add(lightDirection);
    sun.target.position.copy(focus);

    const night = 1 - Math.min(1, colors.light / 0.5);
    stars.material.opacity = weather === 'clear' ? Math.max(0, night) : 0;
    // The moon rises opposite the sun
    moon.position.set(camera.position.x - Math.cos(sunAngle) * 900, Math.max(-200, -Math.sin(sunAngle) * 700 + 150), camera.position.z - 500);
    moon.visible = night > 0.1 && weather === 'clear';
    stars.position.copy(camera.position);
    nightWindowMaterials.forEach((windowMaterial) => { windowMaterial.emissive.setScalar(night * 0.9); });
    if (streetLampHeads) streetLampHeads.material.emissiveIntensity = 0.2 + night * 2.2;
    if (lampHalos) lampHalos.material.opacity = night * 0.22;
    glowStones.forEach((stone) => { stone.material.emissiveIntensity = 0.3 + night * 2.4; });

    rain.visible = weather === 'rain' || weather === 'thunder';
    snow.visible = weather === 'snow';
    [rain, snow].forEach((points) => {
      if (!points.visible) return;
      points.position.set(camera.position.x, 0, camera.position.z);
      const positions = points.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) - points.userData.speed * deltaSeconds;
        if (y < 0) y += 80;
        positions.setY(i, y);
        if (!points.userData.isRain) positions.setX(i, positions.getX(i) + Math.sin(time + i) * 0.02);
      }
      positions.needsUpdate = true;
    });
    animatedCity.forEach((update) => update(time));
    return { flash: weather === 'thunder' && Math.random() < 0.004, haze, inCloud };
  }

  function init(targetScene) {
    scene = targetScene;
    scene.fog = new THREE.Fog('#dff1ff', 140, 900);
    buildSky();
  }

  // --------------------------------------------------------------------------
  // Skyline ring: giant towers with LED billboards of big tech and dev tools,
  // plus blimps carrying banners over Genesis City
  // --------------------------------------------------------------------------
  const BRANDS = [
    ['GitHub', 'Where the world builds software', '#24292f', '#ffffff'],
    ['VS Code', 'Code editor', '#007acc', '#ffffff'],
    ['Docker', 'Containers', '#1d63ed', '#ffffff'],
    ['Kubernetes', 'Container orchestration', '#326ce5', '#ffffff'],
    ['Node.js', 'JavaScript runtime', '#3c873a', '#ffffff'],
    ['Python', 'Programming language', '#306998', '#ffd43b'],
    ['TypeScript', 'Typed JavaScript', '#3178c6', '#ffffff'],
    ['Rust', 'Systems programming', '#b7410e', '#ffffff'],
    ['React', 'UI library', '#20232a', '#61dafb'],
    ['Linux', 'Open source kernel', '#111111', '#fcc624'],
    ['Git', 'Version control', '#f05032', '#ffffff'],
    ['npm', 'Package registry', '#cb3837', '#ffffff'],
    ['Stack Overflow', 'Developer Q&A', '#f48024', '#ffffff'],
    ['Claude', 'AI assistant by Anthropic', '#d97757', '#ffffff'],
    ['OpenAI', 'AI research', '#10a37f', '#ffffff'],
    ['NVIDIA', 'GPUs & accelerated computing', '#76b900', '#000000'],
    ['AWS', 'Cloud computing', '#232f3e', '#ff9900'],
    ['Google Cloud', 'Cloud computing', '#4285f4', '#ffffff'],
    ['Microsoft Azure', 'Cloud computing', '#0078d4', '#ffffff'],
    ['Apple', 'WWDC & developer tools', '#1d1d1f', '#ffffff'],
    ['Meta', 'Open source AI & React', '#0866ff', '#ffffff'],
    ['Vercel', 'Frontend cloud', '#000000', '#ffffff'],
    ['Figma', 'Interface design', '#a259ff', '#ffffff'],
    ['Postman', 'API platform', '#ff6c37', '#ffffff']
  ];

  function brandTexture(name, tagline, background, foreground) {
    return PropKit.kit.canvasTexture(`brand|${name}`, 1024, 512, (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, background);
      gradient.addColorStop(1, new THREE.Color(background).offsetHSL(0, 0, 0.12).getStyle());
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = foreground;
      ctx.globalAlpha = 0.25;
      ctx.lineWidth = 6;
      ctx.strokeRect(24, 24, w - 48, h - 48);
      ctx.globalAlpha = 1;
      ctx.fillStyle = foreground;
      ctx.textAlign = 'center';
      ctx.font = `bold ${name.length > 10 ? 120 : 160}px Segoe UI, Helvetica, Arial, sans-serif`;
      ctx.fillText(name, w / 2, h / 2 + 20);
      ctx.font = '48px Segoe UI, Helvetica, Arial, sans-serif';
      ctx.globalAlpha = 0.85;
      ctx.fillText(tagline, w / 2, h / 2 + 110);
      ctx.globalAlpha = 1;
    });
  }

  function buildSkyline() {
    const ringRadius = 600; // brand towers stand on the land around the bigger districts
    const random = seededRandom(4242);
    const towerTexture = repeated(windowsTexture('#2b2f3a', '#ffe9a8'), 3, 10);
    const towerMaterial = new THREE.MeshStandardMaterial({ map: towerTexture, emissiveMap: towerTexture, emissive: '#000000', roughness: 0.4, metalness: 0.4 });
    nightWindowMaterials.push(towerMaterial);
    BRANDS.forEach(([name, tagline, background, foreground], index) => {
      const angle = (index / BRANDS.length) * Math.PI * 2 + 0.07;
      const distance = ringRadius + random() * 70;
      const height = 70 + random() * 70;
      const width = 26 + random() * 10;
      const tower = new THREE.Group();
      tower.add(new THREE.Mesh(new THREE.BoxGeometry(width, height, width), towerMaterial));
      tower.children[0].position.y = height / 2;
      // Giant LED billboard facing the city center, lit at night
      // Real logos (Simple Icons) when available, the brand wordmark otherwise
      const screenMaterial = new THREE.MeshBasicMaterial({ map: BrandLogos.billboardTexture(name, { tagline, background, foreground }) });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.6, width * 0.8), screenMaterial);
      screen.position.set(0, height * 0.72, width / 2 + 0.6);
      tower.add(screen);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width * 1.66, width * 0.86, 0.8), material('#111111', { metalness: 0.6 }));
      frame.position.set(0, height * 0.72, width / 2 + 0.1);
      tower.add(frame);
      // Rooftop antenna with a blinking aviation light
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 18, 6), material('#9e9e9e'));
      antenna.position.y = height + 9;
      tower.add(antenna);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), glow('#ff3b30', 2));
      beacon.position.y = height + 18.5;
      tower.add(beacon);
      animatedCity.push((time) => { beacon.visible = Math.sin(time * 3 + index) > 0; });
      tower.position.set(Math.cos(angle) * distance, GROUND_LEVEL, Math.sin(angle) * distance);
      tower.rotation.y = Math.atan2(-tower.position.x, -tower.position.z);
      tower.traverse((node) => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; } });
      scene.add(tower);
    });

    // Blimps with banners circling above the city
    [['GitHub Multiverse', '#1877f2'], ['Ship it with Git', '#2da44e'], ['Join the Multiverse', '#0b4fa8']].forEach(([text, color], index) => {
      const blimp = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material('#eceff1', { roughness: 0.4 }));
      body.scale.set(26, 8, 8);
      blimp.add(body);
      const gondola = new THREE.Mesh(new THREE.BoxGeometry(8, 2.5, 3), material('#37474f'));
      gondola.position.y = -8.5;
      blimp.add(gondola);
      [-1, 1].forEach((side) => {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 6), material(color));
        fin.position.set(-24, 0, side * 3);
        fin.rotation.x = side * 0.6;
        blimp.add(fin);
      });
      const bannerTexture = PropKit.kit.labelTexture(text, { bg: color, fg: '#ffffff', width: 1024, height: 200, font: 'bold 110px Segoe UI, Helvetica, Arial, sans-serif' });
      [-1, 1].forEach((side) => {
        const banner = new THREE.Mesh(new THREE.PlaneGeometry(36, 7), new THREE.MeshBasicMaterial({ map: bannerTexture, side: THREE.DoubleSide }));
        banner.position.set(0, -15, side * 0.2);
        blimp.add(banner);
      });
      const ropeMaterial = material('#90a4ae');
      [-14, 14].forEach((x) => {
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 9, 4), ropeMaterial);
        rope.position.set(x, -9, 0);
        blimp.add(rope);
      });
      blimp.traverse((node) => { node.raycast = () => {}; });
      scene.add(blimp);
      const radius = 160 + index * 70;
      const height = 75 + index * 15;
      animatedCity.push((time) => {
        const angle = time * (0.02 + index * 0.006) + index * 2.1;
        blimp.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
        blimp.rotation.y = -angle - Math.PI / 2 * (index % 2 ? -1 : 1);
      });
    });
  }

  // --------------------------------------------------------------------------
  // Horizon: red low-poly mesas with autumn trees and a sweeping arch landmark,
  // so the sky around Genesis City never feels empty (clouds: the Minecraft layer)
  // --------------------------------------------------------------------------
  function buildHorizon() {
    const random = seededRandom(9001);
    const rock = new THREE.MeshStandardMaterial({ color: '#d9603b', roughness: 1, flatShading: true });
    const rockTop = new THREE.MeshStandardMaterial({ color: '#f08a5d', roughness: 1, flatShading: true });
    const autumn = ['#ff7f50', '#ff4d6d', '#ffb347', '#f78fb3', '#e84a5f', '#fdcb6e'];
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true }), 220);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let crownIndex = 0;
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2 + random() * 0.15;
      const distance = WORLD_LIMIT + 130 + random() * 220;
      const radius = 35 + random() * 50;
      const height = 30 + random() * 70;
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.75, radius, height, 7), rock);
      mesa.position.set(Math.cos(angle) * distance, GROUND_LEVEL + height / 2, Math.sin(angle) * distance);
      mesa.rotation.y = random() * Math.PI;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.78, radius * 0.75, 3, 7), rockTop);
      cap.position.y = height / 2 + 1.5;
      mesa.add(cap);
      scene.add(mesa);
      for (let t = 0; t < 8 && crownIndex < 220; t++) {
        const treeAngle = random() * Math.PI * 2;
        const treeDistance = random() * radius * 0.6;
        const size = 5 + random() * 6;
        matrix.compose(new THREE.Vector3(mesa.position.x + Math.cos(treeAngle) * treeDistance, GROUND_LEVEL + height + 3 + size, mesa.position.z + Math.sin(treeAngle) * treeDistance), new THREE.Quaternion(), new THREE.Vector3(size, size * 1.2, size));
        crowns.setMatrixAt(crownIndex, matrix);
        crowns.setColorAt(crownIndex, color.set(autumn[Math.floor(random() * autumn.length)]));
        crownIndex++;
      }
    }
    crowns.count = crownIndex;
    scene.add(crowns);

    // Sweeping arch landmark on the northern horizon
    const arch = new THREE.Mesh(new THREE.TorusGeometry(160, 9, 12, 64, Math.PI), new THREE.MeshStandardMaterial({ color: '#e8d5c4', roughness: 0.6 }));
    arch.position.set(-120, GROUND_LEVEL, -760);
    arch.rotation.y = 0.3;
    scene.add(arch);
    for (let i = 0; i < 18; i++) {
      const t = (i + 0.5) / 18;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(9.5, 1, 6, 16), glow('#ffb703', 0.6));
      ring.position.set(Math.cos(Math.PI * t) * 160, Math.sin(Math.PI * t) * 160, 0);
      ring.rotation.y = Math.PI / 2;
      arch.add(ring);
    }

  }

  // Called once every district is loaded
  let groundBuilt = false;
  // The ground can be laid as soon as Genesis Plaza exists (it needs the pool hole)
  function prepareGround() {
    if (groundBuilt) return;
    groundBuilt = true;
    buildGround();
  }

  function finalize() {
    prepareGround();
    buildLand();
    buildPaths();
    buildDistrictTreeBelts();
    buildNeighborhoods();
    buildPalms();
    buildOutskirts();
    buildSkyline();
    buildHorizon();
    // Grain, relief and roughness maps for everything built outside PropKit
    // builders (ground, neighborhoods, skyline...) and for materials district
    // files created directly; idempotent, so already-upgraded ones are skipped
    PropKit.kit.enhanceSurfaces(scene);
  }

  return {
    PARCEL_SIZE, CELL_SIZE, CITY_RADIUS, GROUND_LEVEL, WORLD_LIMIT, CORE_HALF, seaAt, paths, setLandOwners, prepareGround, landAt, isRoadParcel, isSceneParcel, setLandLayout, solidAt,
    landOwner: (parcel) => (landOwners[parcel] ? landOwners[parcel].owner : null),
    refreshOwnedParcels: buildOwnedParcels,
    get landOwners() { return landOwners; },
    init, addDistrict, finalize, districtAt, updateEnvironment, layoutFor,
    // Objects the walking avatar can stand on or bump into around a point
    // Objects added at runtime (event stages...) that the avatar can stand on
    addCollidable(object) { sharedCollidables.push(object); },
    collidablesAt(x, z) {
      const district = districtAt(x, z);
      return district ? [district.root, ...sharedCollidables] : sharedCollidables;
    },
    get districts() { return districts; },
    get pickables() { return pickables; }
  };
})();
