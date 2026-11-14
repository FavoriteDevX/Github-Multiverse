// ============================================================================
// LANDMARKS: SILICON VALLEY HEADQUARTERS, CITY ZONES, HIGHWAYS AND BILLBOARDS
// ============================================================================
// Stylized low-poly recreations. Company names appear as text wordmarks in
// brand colors; no trademarked logo artwork is reproduced.
(() => {
  const {
    material, glow, shade, mesh, box, cylinder, sphere, facedBox, animate, orientation, textSprite,
    labelTexture, windowsTexture, repeated, canvasTexture
  } = PropKit.kit;

  const tint = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scaleVector = new THREE.Vector3();
  const positionVector = new THREE.Vector3();

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

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return hash >>> 0;
  }

  function wordmark(text, color, background = '#ffffff') {
    return new THREE.MeshBasicMaterial({ map: labelTexture(text, { bg: background, fg: color, font: 'bold 64px Segoe UI, Helvetica, Arial, sans-serif' }) });
  }

  function glassMaterial(color = '#7fb3d5', opacity = 0.75) {
    return material(color, { transparent: opacity < 1, opacity, roughness: 0.08, metalness: 0.6 });
  }

  // Instanced low-poly trees scattered inside a rectangle (skips optional holes)
  // Campus trees: the same realistic leafy trees as Genesis City (bark, layered
  // crowns and leaf cards), instanced; coast live oaks in green, a share of
  // blossoming trees where the palette asks for pink (the Apple Park orchards)
  function scatterTrees(group, count, width, depth, seed, { y = 0, avoid = null, palette = ['#2e7d32', '#388e3c', '#43a047', '#558b2f'], scale = 1 } = {}) {
    const random = seededRandom(seed);
    const blossoms = palette.some((color) => /^#f[0-9a-f]8/i.test(color) || /f48fb1|f8bbd0|ec407a/i.test(color));
    const geometry = PropKit.kit.realisticTreeGeometry('broadleaf');
    const green = new THREE.InstancedMesh(geometry, PropKit.kit.treeMaterial('green'), count);
    const pink = blossoms ? new THREE.InstancedMesh(geometry, PropKit.kit.treeMaterial('blossom'), count) : null;
    let greens = 0;
    let pinks = 0;
    let placed = 0;
    for (let attempt = 0; attempt < count * 4 && placed < count; attempt++) {
      const x = (random() - 0.5) * width;
      const z = (random() - 0.5) * depth;
      if (avoid && avoid(x, z)) continue;
      const size = (0.75 + random() * 0.55) * scale;
      quaternion.setFromAxisAngle(positionVector.set(0, 1, 0), random() * Math.PI * 2);
      matrix.compose(positionVector.set(x, y, z), quaternion, scaleVector.set(size, size * (0.9 + random() * 0.25), size));
      if (pink && random() < 0.3) pink.setMatrixAt(pinks++, matrix);
      else green.setMatrixAt(greens++, matrix);
      placed++;
    }
    green.count = greens;
    [green, pink].filter(Boolean).forEach((instanced) => { if (instanced === pink) instanced.count = pinks; instanced.castShadow = true; instanced.receiveShadow = true; group.add(instanced); });
  }

  // Parking lot full of instanced cars
  function parkingLot(group, width, depth, x, z, seed, palette = ['#ecf0f1', '#2c3e50', '#c0392b', '#7f8c8d', '#2980b9', '#111111']) {
    group.add(box(width, 0.06, depth, material('#4a4f55', { roughness: 1 }), x, 0.03, z));
    const random = seededRandom(seed);
    const rows = Math.max(1, Math.floor(depth / 6));
    const perRow = Math.max(1, Math.floor(width / 2.8));
    const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.2, 4).translate(0, 0.6, 0), material('#ffffff', { roughness: 0.3, metalness: 0.4 }), rows * perRow);
    let index = 0;
    for (let row = 0; row < rows; row++) {
      for (let slot = 0; slot < perRow; slot++) {
        if (random() < 0.25) continue;
        matrix.makeTranslation(x - width / 2 + 1.4 + slot * 2.8, 0.06, z - depth / 2 + 3 + row * 6);
        cars.setMatrixAt(index, matrix);
        cars.setColorAt(index, tint.set(palette[Math.floor(random() * palette.length)]));
        index++;
      }
    }
    cars.count = index;
    cars.castShadow = true;
    group.add(cars);
  }

  function monumentSign(group, text, color, x, z, rotationY = 0, background = '#ffffff') {
    const sign = new THREE.Group();
    sign.add(box(7, 0.6, 1.4, material('#bdc3c7'), 0, 0.3, 0));
    sign.add(facedBox(6.4, 1.8, 0.8, material(background), new THREE.MeshBasicMaterial({ map: BrandLogos.billboardTexture(text, { background, foreground: color, width: 1024, height: 288, layout: 'sign' }) }), 0, 1.5, 0));
    sign.position.set(x, 0, z);
    sign.rotation.y = rotationY;
    group.add(sign);
  }

  function rooftopSign(group, text, color, y, width, z, background = 'rgba(0,0,0,0)') {
    const texture = labelTexture(text, { bg: background === 'rgba(0,0,0,0)' ? '#0b0b0b' : background, fg: color, font: 'bold 70px Segoe UI, Helvetica, Arial, sans-serif' });
    const sign = box(width, width / 4, 0.3, new THREE.MeshBasicMaterial({ map: texture }), 0, y + width / 8, z);
    group.add(sign);
    group.add(box(width * 0.9, 0.2, 0.2, material('#555'), 0, y + 0.1, z - 0.2));
  }

  function officeBlock(group, w, h, d, x, y, z, wallColor, glassColor) {
    const side = new THREE.MeshStandardMaterial({ map: repeated(windowsTexture(wallColor, glassColor), Math.max(1, Math.round((w + d) / 5)), Math.max(1, Math.round(h / 4))), roughness: 0.25, metalness: 0.45 });
    const body = PropKit.kit.roundedSlab(w, h, d, Math.min(w, d) * 0.12, side);
    body.position.set(x, y, z);
    group.add(body);
    const cornice = PropKit.kit.roundedSlab(w + 0.6, 0.5, d + 0.6, Math.min(w, d) * 0.14, material(shade(wallColor, -0.12), { roughness: 0.4, metalness: 0.3 }));
    cornice.position.set(x, y + h, z);
    group.add(cornice);
    const lobby = PropKit.kit.roundedSlab(w + 0.1, 3, d + 0.1, Math.min(w, d) * 0.12, material('#9fc3e6', { roughness: 0.05, metalness: 0.6, emissive: '#ffe9a8', emissiveIntensity: 0.12 }));
    lobby.position.set(x, y, z);
    group.add(lobby);
  }

  const builders = {
    // A tinted ground area with a "Welcome to <city>" sign
    cityZone(group, { w, h, d, color, label }) {
      const ground = box(w, h, d, material(color, { roughness: 1 }));
      ground.castShadow = false;
      group.add(ground);
      const sign = new THREE.Group();
      sign.add(box(0.3, 4, 0.3, material('#7f8c8d'), -3, 2, 0));
      sign.add(box(0.3, 4, 0.3, material('#7f8c8d'), 3, 2, 0));
      sign.add(facedBox(8, 2.6, 0.2, material('#1e5631'), new THREE.MeshBasicMaterial({ map: labelTexture(`Welcome to ${label}`, { bg: '#1e5631', fg: '#ffffff', border: '#ffffff', font: 'bold 44px Segoe UI, Arial, sans-serif' }) }), 0, 4.3, 0));
      sign.position.set(-w / 2 + 6, h / 2, -d / 2 + 4);
      group.add(sign);
      const name = textSprite(label, { width: 30, color: '#ffffff', background: 'rgba(30, 86, 49, 0.85)' });
      name.position.set(0, 40, 0);
      name.userData.isPlaceName = true;
      group.add(name);
    },

    hills(group, { w, h, d, color }) {
      const random = seededRandom(hashString(`hills${w}${d}`));
      for (let i = 0; i < Math.floor(d / 18); i++) {
        const radius = 12 + random() * 14;
        const hill = mesh(new THREE.ConeGeometry(radius, h * (0.5 + random() * 0.5), 7), material(i % 2 ? color : shade(color, -0.06), { flatShading: true, roughness: 1 }));
        hill.position.set((random() - 0.5) * w * 0.7, -h / 2 + hill.geometry.parameters.height / 2, -d / 2 + (i + 0.5) * (d / Math.floor(d / 18)));
        group.add(hill);
      }
      scatterTrees(group, 90, w, d, hashString('hillTrees'), { y: -h / 2, palette: ['#2e5d34', '#3b6e3b', '#4a7c3f'] });
    },

    treeCluster(group, { w, h, d }) {
      scatterTrees(group, Math.min(160, Math.floor((w * d) / 60)), w, d, hashString(`trees${w}${d}`), { y: -h / 2 });
    },

    highwayTraffic(group, { w, d }) {
      const lanes = [-w * 0.36, -w * 0.12, w * 0.12, w * 0.36];
      const perLane = Math.floor(d / 28);
      const palette = ['#ecf0f1', '#c0392b', '#2c3e50', '#f1c40f', '#2980b9', '#7f8c8d', '#111111'];
      const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 1.3, 4.2).translate(0, 0.65, 0), material('#ffffff', { roughness: 0.3, metalness: 0.4 }), lanes.length * perLane);
      const random = seededRandom(101);
      const offsets = [];
      for (let i = 0; i < lanes.length * perLane; i++) {
        offsets.push(random() * d);
        cars.setColorAt(i, tint.set(palette[i % palette.length]));
      }
      cars.castShadow = true;
      group.add(cars);
      animate(cars, (time) => {
        for (let i = 0; i < lanes.length * perLane; i++) {
          const lane = i % lanes.length;
          const direction = lane < 2 ? 1 : -1;
          const speed = 14 + (i % 5) * 2;
          const travel = (offsets[i] + time * speed) % d;
          const z = direction > 0 ? -d / 2 + travel : d / 2 - travel;
          matrix.makeRotationY(direction > 0 ? 0 : Math.PI);
          matrix.setPosition(lanes[lane], 0, z);
          cars.setMatrixAt(i, matrix);
        }
        cars.instanceMatrix.needsUpdate = true;
      });
      // "101" shields along the freeway
      for (let z = -d / 2 + 40; z < d / 2; z += 120) {
        const shield = new THREE.Group();
        shield.add(box(0.25, 5, 0.25, material('#7f8c8d'), 0, 2.5, 0));
        shield.add(facedBox(2.6, 2.6, 0.15, material('#ffffff'), new THREE.MeshBasicMaterial({ map: labelTexture('101', { bg: '#ffffff', fg: '#111111', border: '#111111', width: 256, height: 256, font: 'bold 110px Arial, sans-serif' }) }), 0, 5.6, 0));
        shield.position.set(w / 2 + 1.5, 0, z);
        group.add(shield);
      }
    },

    rails(group, { w, d, label }) {
      const steel = material('#95a5a6', { metalness: 0.8, roughness: 0.3 });
      group.add(box(w, 0.1, d, material('#7f6a55', { roughness: 1 }), 0, 0, 0));
      group.add(box(0.12, 0.15, d, steel, -w * 0.2, 0.12, 0));
      group.add(box(0.12, 0.15, d, steel, w * 0.2, 0.12, 0));
      const sleepers = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 0.7, 0.08, 0.3), material('#4e342e'), Math.floor(d / 1.5));
      for (let i = 0; i < sleepers.count; i++) {
        matrix.makeTranslation(0, 0.06, -d / 2 + i * 1.5);
        sleepers.setMatrixAt(i, matrix);
      }
      group.add(sleepers);
      // A double-decker commuter train running back and forth
      const train = new THREE.Group();
      for (let car = 0; car < 5; car++) {
        const carriage = new THREE.Group();
        carriage.add(box(3, 3.6, 18, material('#d5d8dc', { metalness: 0.5, roughness: 0.3 }), 0, 2, 0));
        carriage.add(box(3.05, 0.5, 18.05, material('#c0392b'), 0, 0.8, 0));
        carriage.add(box(3.06, 0.6, 16, glassMaterial('#2c3e50', 0.9), 0, 2.4, 0));
        carriage.add(box(3.06, 0.6, 16, glassMaterial('#2c3e50', 0.9), 0, 3.3, 0));
        carriage.position.z = car * 18.6;
        train.add(carriage);
      }
      group.add(train);
      animate(train, (time) => {
        const cycle = (time * 22) % (d * 2);
        const forward = cycle < d;
        train.position.z = (forward ? cycle : d * 2 - cycle) - d / 2 - 46;
        train.position.z = Math.max(-d / 2, Math.min(d / 2 - 93, train.position.z));
      });
      if (label) group.userData.label = label;
    },

    billboard(group, { w, h, d, color, label, block }) {
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const steel = material('#7f8c8d', { metalness: 0.6 });
      inner.add(box(0.5, h * 0.6, 0.5, steel, -o.w * 0.25, -h * 0.2, 0));
      inner.add(box(0.5, h * 0.6, 0.5, steel, o.w * 0.25, -h * 0.2, 0));
      const texture = canvasTexture(`billboard|${label}|${color}`, 1024, 340, (ctx, cw, ch) => {
        const gradient = ctx.createLinearGradient(0, 0, cw, ch);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, shade(color, -0.2));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 74px Segoe UI, Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const words = String(label).split(' ');
        const lines = [];
        let line = '';
        words.forEach((word) => {
          const candidate = line ? `${line} ${word}` : word;
          if (ctx.measureText(candidate).width > cw - 80 && line) { lines.push(line); line = word; } else { line = candidate; }
        });
        lines.push(line);
        lines.slice(0, 3).forEach((text, index) => ctx.fillText(text, cw / 2, ch / 2 + (index - (Math.min(lines.length, 3) - 1) / 2) * 84));
      });
      inner.add(facedBox(o.w, h * 0.4, 0.4, material('#2d3436'), new THREE.MeshBasicMaterial({ map: texture }), 0, h * 0.3, 0));
      inner.add(box(o.w, 0.2, 1.2, steel, 0, h * 0.08, 0.4));
      [-0.35, 0, 0.35].forEach((offset) => inner.add(box(0.2, 0.2, 0.8, glow('#fff3c4', 1.2), o.w * offset, h * 0.52, 0.6)));
      group.add(inner);
    },

    goldenGate(group, { w, h, d }) {
      const red = material('#c0362c', { roughness: 0.5 });
      const deckY = 4;
      const towerZ = d * 0.3;
      group.add(box(w, 0.8, d, red, 0, deckY, 0));
      group.add(box(w * 0.8, 0.1, d, material('#3d3d3d'), 0, deckY + 0.45, 0));
      // Art Deco towers: two legs joined by stacked portal braces
      [-towerZ, towerZ].forEach((z) => {
        [-1, 1].forEach((side) => group.add(box(1, h, 1.2, red, side * (w / 2 - 0.5), h / 2, z)));
        [0.32, 0.55, 0.75, 0.95].forEach((t) => group.add(box(w, 1.1, 1, red, 0, h * t, z)));
        group.add(box(w + 1, 2, 2.2, material('#9e9e9e'), 0, 1, z));
      });
      // Main cables: catenary between the towers, straight back-stays to the anchorages
      const cableHeight = (z) => {
        const abs = Math.abs(z);
        if (abs <= towerZ) return deckY + 1.5 + (h - deckY - 1.5) * (abs / towerZ) ** 2;
        return h - ((abs - towerZ) / (d / 2 - towerZ)) * (h - deckY - 1);
      };
      [-w / 2 + 0.5, w / 2 - 0.5].forEach((x) => {
        const points = [];
        for (let i = 0; i <= 48; i++) {
          const z = -d / 2 + (i / 48) * d;
          points.push(new THREE.Vector3(x, cableHeight(z), z));
        }
        const cable = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 64, 0.18, 6), red);
        group.add(cable);
        // Vertical suspender ropes down to the deck
        for (let z = -d / 2 + 2; z < d / 2 - 1; z += 2) {
          const top = cableHeight(z);
          if (top - deckY < 1) continue;
          group.add(box(0.06, top - deckY, 0.06, red, x, deckY + (top - deckY) / 2, z));
        }
      });
      const caption = textSprite('Golden Gate Bridge', { width: 14 });
      caption.position.y = h + 5;
      group.add(caption);
    },

    taperedTower(group, { w, h, d, color, label }) {
      // Rounded tapered skyscraper with a lit crown
      const body = mesh(new THREE.CylinderGeometry(w * 0.32, w * 0.5, h, 24), new THREE.MeshStandardMaterial({ map: repeated(windowsTexture(color, '#dfe9f5'), 8, Math.round(h / 4)), roughness: 0.3, metalness: 0.4 }), 0, 0, 0);
      group.add(body);
      const crown = cylinder(w * 0.3, w * 0.32, h * 0.08, glow('#f7f1e3', 0.9, { transparent: true, opacity: 0.85 }), 0, h / 2 + h * 0.04, 0, 24);
      group.add(crown);
      if (label) {
        const caption = textSprite(label, { width: 14 });
        caption.position.y = h / 2 + 6;
        group.add(caption);
      }
    },

    pyramidTower(group, { w, h, color, label }) {
      const pyramid = mesh(new THREE.ConeGeometry(w * 0.7, h, 4), new THREE.MeshStandardMaterial({ map: repeated(windowsTexture(color, '#fff7d6'), 6, Math.round(h / 3)), roughness: 0.5, flatShading: true }));
      pyramid.rotation.y = Math.PI / 4;
      group.add(pyramid);
      [-1, 1].forEach((side) => group.add(box(w * 0.2, h * 0.25, w * 0.3, material(color), side * w * 0.42, -h * 0.2, 0)));
      if (label) {
        const caption = textSprite(label, { width: 14 });
        caption.position.y = h / 2 + 4;
        group.add(caption);
      }
    },

    // Enterable headquarters: glass-and-concrete shell with a real door, a lobby
    // with the company logo, stairs to every floor and the rooftop, open-plan
    // offices with laptops (E to work), a glass meeting room and a coffee corner
    hqOffice(group, { w, h, d, color, label, type }) {
      const name = (label || 'HQ').split(/ — | - /)[0].replace(/\s+HQ$/i, '');
      const isWarm = /anthropic/.test(type);
      const wallColor = isWarm ? '#e8dccb' : /github/.test(type) ? '#2f363d' : /netflix/.test(type) ? '#1a1a1a' : '#dfe4ea';
      const brandColor = color;
      const bw = w * 0.7;
      const bd = d * 0.55;
      const bz = -d * 0.12;
      const base = -h / 2;
      const floors = Math.max(2, Math.round(h / 4.5));
      const floorHeight = h / floors;
      const wallThickness = 0.3;
      const doorWidth = 4;
      const doorHeight = 3.6;
      const stairWidth = 2.6;
      const rise = 0.36;
      const steps = Math.ceil(floorHeight / rise);
      const stairLength = steps * 0.5;
      const stairX = -bw / 2 + wallThickness + stairWidth / 2 + 0.1;
      const holeStartZ = bz - bd / 2 + 1.4;

      group.add(box(w, 0.1, d, material('#cfd8dc', { roughness: 0.9 }), 0, base + 0.05, 0));
      const shell = new THREE.Group();
      // GitHub (88 Colin P. Kelly Jr. St) and OpenAI (the Pioneer Building in the
      // Mission) are brick buildings in San Francisco: brick walls, tall windows
      const brick = /github|openai/.test(type) && PropKit.kit.brickTexture;
      const outside = brick
        ? new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.brickTexture(/github/.test(type) ? '#8e3b2b' : '#b07a55'), Math.max(1, Math.round(bw / 3)), Math.max(1, Math.round(h / 3))), roughness: 0.85 })
        : new THREE.MeshStandardMaterial({ map: repeated(windowsTexture(wallColor, isWarm ? '#f4e3cf' : '#cfe8ff'), Math.max(1, Math.round(bw / 5)), floors), roughness: 0.5, metalness: 0.2 });
      const sideWall = brick ? outside : new THREE.MeshStandardMaterial({ map: repeated(windowsTexture(wallColor, isWarm ? '#f4e3cf' : '#cfe8ff'), Math.max(1, Math.round(bd / 5)), floors), roughness: 0.5, metalness: 0.2 });
      // Back and side walls
      shell.add(box(bw, h, wallThickness, outside, 0, base + h / 2, bz - bd / 2));
      [-1, 1].forEach((side) => shell.add(box(wallThickness, h, bd, sideWall, side * bw / 2, base + h / 2, bz)));
      // Front wall with a glass entrance
      const frontZ = bz + bd / 2;
      [-1, 1].forEach((side) => shell.add(box(bw / 2 - doorWidth / 2, h, wallThickness, outside, side * (bw / 4 + doorWidth / 4), base + h / 2, frontZ)));
      shell.add(box(doorWidth, h - doorHeight, wallThickness, outside, 0, base + doorHeight + (h - doorHeight) / 2, frontZ));
      shell.add(box(doorWidth + 0.6, 0.4, 1.6, material(brandColor), 0, base + doorHeight + 0.2, frontZ + 0.8));
      group.add(shell);
      if (brick) {
        // Tall steel-framed windows on the brick, a stone cornice on top
        const panes = new THREE.Group();
        const glass = material('#1d2a33', { roughness: 0.1, metalness: 0.6 });
        const frame = material('#1a1a1a', { metalness: 0.5 });
        for (let f = 0; f < floors; f++) {
          const y = base + f * floorHeight + floorHeight * 0.55;
          for (let x = -bw / 2 + 2.5; x <= bw / 2 - 2.5; x += 3.2) {
            if (f === 0 && Math.abs(x) < doorWidth) continue;
            panes.add(box(1.8, floorHeight * 0.62, 0.08, glass, x, y, frontZ + 0.2));
            panes.add(box(2, 0.12, 0.14, frame, x, y + floorHeight * 0.31, frontZ + 0.22));
            panes.add(box(0.1, floorHeight * 0.62, 0.12, frame, x, y, frontZ + 0.22));
          }
          [-1, 1].forEach((side) => {
            for (let z = bz - bd / 2 + 2.5; z <= bz + bd / 2 - 2.5; z += 3.2) panes.add(box(0.08, floorHeight * 0.62, 1.8, glass, side * (bw / 2 + 0.2), y, z));
          });
        }
        panes.add(box(bw + 0.8, 0.6, bd + 0.8, material('#d9d2c3', { roughness: 0.8 }), 0, base + h + 0.1, bz));
        group.add(PropKit.kit.mergeByMaterial(panes));
      }
      if (/github/.test(type)) {
        // The lobby of the real GitHub HQ is a replica of the Oval Office:
        // an oval blue rug, a heavy wooden desk and two flags behind it
        const oval = cylinder(1, 1, 0.04, material('#1f3a68', { roughness: 1 }), 0, base + 0.22, bz - bd * 0.18, 40);
        oval.scale.set(5, 1, 3.4);
        group.add(oval);
        group.add(box(3.4, 1.05, 1.6, material('#5b3a21', { roughness: 0.6 }), 0, base + 0.75, bz - bd * 0.3));
        [-1.6, 1.6].forEach((x, i) => {
          group.add(cylinder(0.04, 0.04, 2.6, material('#c9a64b', { metalness: 0.8 }), x, base + 1.5, bz - bd / 2 + 1, 6));
          group.add(box(0.05, 1, 1.4, material(i ? '#24292f' : '#1f6feb'), x, base + 2.3, bz - bd / 2 + 1.7));
        });
        [-1, 1].forEach((side) => group.add(box(2.6, 0.7, 1, material('#e8dcc2'), side * 3, base + 0.55, bz - bd * 0.12)));
      }

      // Floor slabs with a stair opening, plus the roof (also opened for rooftop access)
      const slabMaterial = material(isWarm ? '#d9c6ad' : '#c9ced6', { roughness: 0.7 });
      const interiorFloor = new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.plankTexture(isWarm ? '#c49a6c' : '#b0b7c3'), bw / 4, bd / 4), roughness: 0.7 });
      group.add(box(bw - wallThickness * 2, 0.1, bd - wallThickness * 2, interiorFloor, 0, base + 0.15, bz));
      for (let level = 1; level <= floors; level++) {
        const y = base + level * floorHeight;
        const holeEndZ = holeStartZ + stairLength;
        const mainWidth = bw - (stairWidth + 0.4) - wallThickness;
        group.add(box(mainWidth, 0.3, bd, level === floors ? material(shade(wallColor, -0.1)) : slabMaterial, bw / 2 - mainWidth / 2, y, bz));
        group.add(box(stairWidth + 0.4, 0.3, holeStartZ - (bz - bd / 2), slabMaterial, stairX, y, (bz - bd / 2 + holeStartZ) / 2));
        group.add(box(stairWidth + 0.4, 0.3, bz + bd / 2 - holeEndZ, slabMaterial, stairX, y, (holeEndZ + bz + bd / 2) / 2));
        if (level < floors) group.add(box(bw - wallThickness * 2, 0.1, bd - wallThickness * 2, interiorFloor, 0, y + 0.2, bz));
        // Stairs from the floor below: climbing toward the back wall
        const stairs = new THREE.Group();
        for (let i = 0; i < steps; i++) {
          const stepTop = (i + 1) * (floorHeight / steps);
          stairs.add(box(stairWidth, stepTop, 0.5, slabMaterial, stairX, base + (level - 1) * floorHeight + stepTop / 2, holeEndZ - (i + 0.5) * 0.5));
        }
        group.add(PropKit.kit.mergeByMaterial(stairs));
      }
      // Rooftop railing and brand sign
      const roofY = base + h;
      const glassRail = material('#cfe8ff', { transparent: true, opacity: 0.4 });
      group.add(box(bw, 1.1, 0.08, glassRail, 0, roofY + 0.7, bz + bd / 2));
      group.add(box(bw, 1.1, 0.08, glassRail, 0, roofY + 0.7, bz - bd / 2));
      const signWidth = Math.min(bw * 0.8, 22);
      const brandSign = BrandLogos.billboardTexture(name, { background: wallColor, foreground: brandColor, width: 1024, height: 256, layout: 'sign' });
      // Rooftop sign facing the avenue: the company's real logo and name, whole
      group.add(facedBox(signWidth, signWidth / 4, 0.3, material(shade(wallColor, -0.15)), new THREE.MeshBasicMaterial({ map: brandSign }), 0, roofY + signWidth / 8 + 1.4, bz + bd / 2 - 0.6));

      // ---- Interior furniture (merged per material to keep it light) ----
      const furniture = new THREE.Group();
      const desk = material('#f1f3f5', { roughness: 0.5 });
      const chair = material('#343a40');
      const fabric = material(shade(brandColor, 0.15), { roughness: 1 });
      // Lobby: reception desk, logo wall, sofas, plants
      furniture.add(box(5, 1.1, 1.2, material(brandColor), 0, base + 0.75, bz + bd * 0.1));
      furniture.add(box(5.2, 0.08, 1.4, desk, 0, base + 1.34, bz + bd * 0.1));
      [-1, 1].forEach((side) => {
        furniture.add(box(3.2, 0.6, 1.2, fabric, side * bw * 0.3, base + 0.5, bz + bd * 0.32));
        furniture.add(box(3.2, 0.8, 0.3, fabric, side * bw * 0.3, base + 0.9, bz + bd * 0.32 - 0.5));
        group.add(PropKit.kit.seat(side * bw * 0.3, base + 0.8, bz + bd * 0.32, 'Lobby sofa'));
        furniture.add(cylinder(0.5, 0.4, 0.8, material('#e9ecef'), side * (bw / 2 - 1.2), base + 0.6, frontZ - 1.2, 10));
        furniture.add(sphere(0.8, material('#2f9e44'), side * (bw / 2 - 1.2), base + 1.6, frontZ - 1.2, 10));
      });
      // Office floors: desk clusters, meeting room, coffee corner, ceiling lights
      const furnishedFloors = Math.min(floors - 1, 2);
      for (let level = 1; level <= furnishedFloors; level++) {
        const y = base + level * floorHeight + 0.25;
        [-1, 1].forEach((side) => {
          const x = side * bw * 0.18 + bw * 0.08;
          furniture.add(box(4, 0.08, 1.6, desk, x, y + 0.75, bz + bd * 0.12));
          [-1.6, 1.6].forEach((dx) => furniture.add(box(0.08, 0.75, 1.4, chair, x + dx, y + 0.37, bz + bd * 0.12)));
          [-1, 1].forEach((seat) => {
            furniture.add(box(0.6, 0.5, 0.6, chair, x + seat, y + 0.25, bz + bd * 0.12 + 1.3));
            group.add(PropKit.kit.seat(x + seat, y + 0.5, bz + bd * 0.12 + 1.3, 'Office chair'));
          });
          group.add(PropKit.kit.laptop(x - 1, y + 0.79, bz + bd * 0.12 + 0.3, 0));
          group.add(PropKit.kit.laptop(x + 1, y + 0.79, bz + bd * 0.12 + 0.3, 0));
        });
        // Glass meeting room in the back right corner
        const roomX = bw / 2 - 3.5;
        const roomZ = bz - bd / 2 + 3;
        furniture.add(box(5, 2.8, 0.06, material('#cfe8ff', { transparent: true, opacity: 0.3 }), roomX, y + 1.4, roomZ + 2.3));
        furniture.add(box(3, 0.08, 1.4, desk, roomX, y + 0.75, roomZ));
        furniture.add(box(2, 1.2, 0.05, material('#212529'), roomX, y + 1.8, bz - bd / 2 + 0.25));
        // Coffee corner
        group.add(PropKit.kit.interactive(box(0.5, 0.6, 0.5, material('#495057', { metalness: 0.6 }), bw / 2 - 1, y + 1.3, bz + bd / 2 - 1.5), 'coffee', `${name} coffee machine`));
        furniture.add(box(1.2, 1, 3, desk, bw / 2 - 1, y + 0.5, bz + bd / 2 - 2));
        for (let i = 0; i < 3; i++) furniture.add(box(bw * 0.25, 0.06, 0.8, glow('#ffffff', 0.7), -bw * 0.2 + i * bw * 0.25, base + (level + 1) * floorHeight - 0.2, bz));
      }
      group.add(PropKit.kit.mergeByMaterial(furniture));
      // Logo wall in the lobby, facing the entrance
      const logoWall = facedBox(Math.min(bw * 0.5, 8), 2.2, 0.15, material('#ffffff'), new THREE.MeshBasicMaterial({ map: BrandLogos.billboardTexture(name, { background: '#ffffff', foreground: brandColor, width: 1024, height: 256, layout: 'sign' }) }), 0, base + 2.6, bz - bd / 2 + wallThickness + 0.1);
      group.add(logoWall);
      group.add(PropKit.kit.laptop(1.2, base + 1.38, bz + bd * 0.1, Math.PI));

      // Outside: monument sign, plaza planters, flag poles
      monumentSign(group, name, brandColor, -w * 0.25, d * 0.38, 0, isWarm ? '#f5ede1' : '#ffffff');
      [-1, 1].forEach((side) => {
        group.add(cylinder(1.2, 1.2, 0.6, material('#b0bec5'), side * w * 0.3, base + 0.3, d * 0.3, 12));
        group.add(mesh(new THREE.IcosahedronGeometry(1.1, 0), material('#43a047', { flatShading: true }), side * w * 0.3, base + 1.4, d * 0.3));
      });
      for (let i = 0; i < 3; i++) group.add(cylinder(0.06, 0.06, 7, material('#eceff1'), w * 0.15 + i * 1.4, base + 3.5, d * 0.4, 6));
      if (/tesla/.test(type)) {
        for (let i = 0; i < 6; i++) {
          group.add(box(0.5, 1.8, 0.4, material('#e74c3c'), -w * 0.4 + i * 2.2, base + 0.9, d * 0.46));
          group.add(box(1.9, 1.3, 4.3, material(['#c0392b', '#ecf0f1', '#111111'][i % 3], { metalness: 0.5, roughness: 0.3 }), -w * 0.4 + i * 2.2, base + 0.75, d * 0.46 - 3));
        }
      }
    },

    applePark(group, { w, h, color }) {
      const outer = w * 0.42;
      const inner = w * 0.3;
      const ringShape = new THREE.Shape();
      ringShape.absarc(0, 0, outer, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
      ringShape.holes.push(hole);
      // The Ring as it is: four floors behind floor-to-ceiling glass, a white
      // canopy fin sticking out at every floor on both sides, and open offices
      // (desks, pods, wood floors) you can see through the glass
      const ringSlab = (r1, r2, depth) => {
        const shape = new THREE.Shape();
        shape.absarc(0, 0, r2, 0, Math.PI * 2, false);
        const cut = new THREE.Path();
        cut.absarc(0, 0, r1, 0, Math.PI * 2, true);
        shape.holes.push(cut);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 96 });
        geometry.rotateX(-Math.PI / 2);
        return geometry;
      };
      const floorsCount = 4;
      const storey = (h * 0.6) / floorsCount;
      const finMaterial = material('#f7f7f5', { roughness: 0.35 });
      const woodFloor = new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.plankTexture('#c8a27a'), 40, 2), roughness: 0.6 });
      for (let f = 0; f <= floorsCount; f++) {
        const y = -h / 2 + f * storey;
        if (f < floorsCount) group.add(mesh(ringSlab(inner, outer, 0.35), woodFloor, 0, y, 0));
        if (f > 0) {
          group.add(mesh(ringSlab(outer, outer + 2.4, 0.22), finMaterial, 0, y - 0.1, 0));
          group.add(mesh(ringSlab(inner - 2.4, inner, 0.22), finMaterial, 0, y - 0.1, 0));
        }
      }
      // Office floors: rows of white desks with dark chairs around the whole ring
      const perFloor = 72;
      const desks = new THREE.InstancedMesh(new THREE.BoxGeometry(3.4, 0.08, 1.4).translate(0, 0.75, 0), material('#fafafa', { roughness: 0.4 }), perFloor * floorsCount);
      const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(3.2, 0.72, 0.08).translate(0, 0.36, 0), material('#b0b0b0', { metalness: 0.6, roughness: 0.3 }), perFloor * floorsCount);
      const chairs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 1, 0.6).translate(0, 0.5, 0), material('#2b2b2b'), perFloor * floorsCount * 2);
      const middle = (inner + outer) / 2;
      let deskIndex = 0;
      for (let f = 0; f < floorsCount; f++) {
        for (let i = 0; i < perFloor; i++) {
          const angle = (i / perFloor) * Math.PI * 2;
          const y = -h / 2 + f * storey + 0.35;
          matrix.makeRotationY(-angle).setPosition(Math.cos(angle) * middle, y, Math.sin(angle) * middle);
          desks.setMatrixAt(deskIndex, matrix);
          legs.setMatrixAt(deskIndex, matrix);
          [-1, 1].forEach((side, k) => {
            const r = middle + side * 1.1;
            matrix.makeRotationY(-angle).setPosition(Math.cos(angle) * r, y, Math.sin(angle) * r);
            chairs.setMatrixAt(deskIndex * 2 + k, matrix);
          });
          deskIndex += 1;
        }
      }
      group.add(desks, legs, chairs);
      // Stone cores between the office bays (stairs and elevators)
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const core = box(4, h * 0.6, (outer - inner) * 0.6, material('#e6e0d4', { roughness: 0.8 }), Math.cos(angle) * middle, -h / 2 + h * 0.3, Math.sin(angle) * middle);
        core.rotation.y = -angle;
        group.add(core);
      }
      // Curved glass facades and the solar roof
      [outer + 0.05, inner - 0.05].forEach((radius) => {
        const facade = mesh(new THREE.CylinderGeometry(radius, radius, h * 0.6, 96, 1, true), material('#9fc5e8', { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.7, side: THREE.DoubleSide }), 0, -h / 2 + h * 0.32, 0);
        facade.castShadow = false;
        group.add(facade);
      });
      const roofShape = new THREE.Shape();
      roofShape.absarc(0, 0, outer + 1.5, 0, Math.PI * 2, false);
      const roofHole = new THREE.Path();
      roofHole.absarc(0, 0, inner - 1.5, 0, Math.PI * 2, true);
      roofShape.holes.push(roofHole);
      const roof = new THREE.ExtrudeGeometry(roofShape, { depth: 0.4, bevelEnabled: false, curveSegments: 64 });
      roof.rotateX(-Math.PI / 2);
      group.add(mesh(roof, material('#1f2a36', { roughness: 0.25, metalness: 0.7 }), 0, -h / 2 + h * 0.6 + 0.2, 0));
      // Inner park: meadow, pond and orchards
      group.add(cylinder(inner - 2, inner - 2, 0.2, material('#7cb342', { roughness: 1 }), 0, -h / 2 + 0.1, 0, 64));
      group.add(cylinder(inner * 0.3, inner * 0.3, 0.25, material('#4fc3f7', { roughness: 0.1, metalness: 0.2 }), inner * 0.2, -h / 2 + 0.15, -inner * 0.2, 32));
      scatterTrees(group, 120, inner * 1.9, inner * 1.9, 77, { y: -h / 2, avoid: (x, z) => Math.hypot(x, z) > inner - 4 || Math.hypot(x - inner * 0.2, z + inner * 0.2) < inner * 0.32, palette: ['#558b2f', '#7cb342', '#689f38', '#f48fb1'] });
      scatterTrees(group, 140, w, w, 78, { y: -h / 2, avoid: (x, z) => Math.hypot(x, z) < outer + 5 || Math.abs(x) > w / 2 - 2 || Math.abs(z) > w / 2 - 2 });
      // Steve Jobs Theater: glass cylinder with a floating disc roof
      const theater = new THREE.Group();
      theater.add(cylinder(7, 7, 4, material('#d6eaf8', { transparent: true, opacity: 0.45, roughness: 0.02, metalness: 0.6 }), 0, 2, 0, 48));
      theater.add(cylinder(7.6, 7.6, 0.6, material('#e5e7e9', { roughness: 0.3, metalness: 0.5 }), 0, 4.3, 0, 48));
      // Inside: a pale stone floor and the two curved staircases down to the auditorium
      theater.add(cylinder(6.8, 6.8, 0.1, material('#ece6da', { roughness: 0.6 }), 0, 0.06, 0, 48));
      [0, Math.PI].forEach((start) => {
        const stair = mesh(new THREE.TorusGeometry(4.6, 0.55, 6, 32, Math.PI * 0.8), material('#d8cfc0', { roughness: 0.7 }), 0, 0.3, 0);
        stair.rotation.set(Math.PI / 2, 0, start);
        theater.add(stair);
      });
      theater.add(cylinder(1.2, 1.2, 4, material('#d6eaf8', { transparent: true, opacity: 0.35, roughness: 0.02 }), 0, 2, 0, 24));
      const caption = textSprite('Steve Jobs Theater', { width: 10 });
      caption.position.y = 8;
      theater.add(caption);
      theater.position.set(w * 0.36, -h / 2, w * 0.36);
      group.add(theater);
      // Visitor Center with wordmark
      const visitor = new THREE.Group();
      visitor.add(box(14, 4, 8, material('#d6eaf8', { transparent: true, opacity: 0.5, roughness: 0.02 }), 0, 2, 0));
      visitor.add(box(15, 0.4, 9, material('#d7ccc8'), 0, 4.2, 0));
      visitor.add(facedBox(8, 2, 0.2, material('#ffffff'), wordmark('Apple Park', '#1d1d1f'), 0, 5.5, 0));
      visitor.position.set(-w * 0.33, -h / 2, w * 0.42);
      group.add(visitor);
      parkingLot(group, 30, 14, -w * 0.33, w * 0.3, 5);
    },

    googleplex(group, { w, h, d }) {
      const brand = ['#4285f4', '#ea4335', '#fbbc05', '#34a853'];
      group.add(box(w, 0.1, d, material('#a5d6a7', { roughness: 1 }), 0, -h / 2 + 0.05, 0));
      // Classic Googleplex buildings with colorful accents
      [[-w * 0.3, -d * 0.25], [-w * 0.3, d * 0.12], [w * 0.02, -d * 0.3]].forEach(([x, z], index) => {
        officeBlock(group, 18, 9, 12, x, -h / 2, z, '#eceff1', '#bbdefb');
        group.add(box(18.2, 0.8, 12.2, material(brand[index]), x, -h / 2 + 9, z));
        group.add(box(3, 9.02, 0.3, material(brand[(index + 1) % 4]), x - 6, -h / 2 + 4.5, z + 6.05));
      });
      // Bay View: low glass halls under a roof of tent-like peaks covered in
      // silver "dragonscale" solar panels, with clerestory windows between peaks
      const scale = new THREE.MeshStandardMaterial({ map: repeated(windowsTexture('#9aa7b3', '#cfd8dc'), 3, 2), roughness: 0.25, metalness: 0.75, flatShading: true });
      for (let i = 0; i < 3; i++) {
        const cx = w * 0.22 + (i % 2) * 6;
        const cz = -d * 0.05 + i * 13 - 8;
        group.add(box(22, 4.6, 11, material('#e9f4fb', { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3 }), cx, -h / 2 + 2.3, cz));
        group.add(box(22.4, 0.3, 11.4, material('#d7ccc8'), cx, -h / 2 + 4.7, cz));
        for (let px = -1; px <= 1; px++) {
          for (let pz = -0.5; pz <= 0.5; pz += 1) {
            const peak = mesh(new THREE.ConeGeometry(4.6, 3.2, 4, 1), scale, cx + px * 7.2, -h / 2 + 6.4, cz + pz * 5.4);
            peak.rotation.y = Math.PI / 4;
            peak.scale.set(1.1, 1, 0.82);
            group.add(peak);
          }
        }
      }
      // Stan, the T. rex skeleton by the old campus, in bone white
      const bone = material('#efe6d2', { roughness: 0.8 });
      const rex = new THREE.Group();
      for (let i = 0; i < 16; i++) {
        const t = i / 15;
        rex.add(sphere(0.32 - t * 0.12, bone, -3.6 + i * 0.55, 3.1 + Math.sin(t * Math.PI) * 0.5 - t * t * 1.4, 0, 6));
      }
      for (let i = 0; i < 7; i++) {
        const rib = mesh(new THREE.TorusGeometry(0.75 - i * 0.05, 0.05, 4, 12, Math.PI), bone, -1.6 + i * 0.36, 3.1, 0);
        rib.rotation.set(0, Math.PI / 2, Math.PI);
        rex.add(rib);
      }
      rex.add(box(1.6, 0.8, 0.6, bone, -4.4, 3.9, 0));
      rex.add(box(1.2, 0.25, 0.5, bone, -4.6, 3.35, 0));
      [-0.45, 0.45].forEach((side) => {
        rex.add(cylinder(0.14, 0.12, 2.4, bone, -0.8, 1.6, side, 6));
        rex.add(box(0.8, 0.15, 0.3, bone, -1.1, 0.25, side));
        rex.add(cylinder(0.05, 0.05, 0.7, bone, -2.6, 2.6, side * 0.6, 4));
      });
      rex.add(box(3, 0.3, 1.6, material('#9e9e9e'), -0.8, 0.15, 0));
      rex.position.set(-w * 0.12, -h / 2, d * 0.32);
      rex.rotation.y = 0.4;
      group.add(rex);
      // The green Android robot statue on the lawn
      const android = new THREE.Group();
      const robot = material('#3ddc84', { roughness: 0.5 });
      android.add(cylinder(1.1, 1.1, 1.8, robot, 0, 1.9, 0, 20));
      const head = mesh(new THREE.SphereGeometry(1.1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), robot, 0, 2.95, 0);
      android.add(head);
      [-0.4, 0.4].forEach((x) => android.add(sphere(0.12, material('#ffffff'), x, 3.45, 0.95, 8)));
      [-0.55, 0.55].forEach((x) => { const antenna = cylinder(0.06, 0.06, 0.6, robot, x, 4.15, 0, 6); antenna.rotation.z = -x * 0.8; android.add(antenna); });
      [-1.45, 1.45].forEach((x) => android.add(cylinder(0.28, 0.28, 1.4, robot, x, 2.1, 0, 10)));
      [-0.45, 0.45].forEach((x) => android.add(cylinder(0.3, 0.3, 1, robot, x, 0.6, 0, 10)));
      android.position.set(w * 0.05, -h / 2, d * 0.36);
      group.add(android);
      // Colorful bikes, volleyball court, wordmark sign
      // Colorful campus bikes: two wheels, a frame and handlebars each
      const bikeCount = 24;
      const wheels = new THREE.InstancedMesh(new THREE.TorusGeometry(0.33, 0.05, 6, 14), material('#222222'), bikeCount * 2);
      const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.08, 1).translate(0, 0.5, 0), material('#ffffff', { metalness: 0.4 }), bikeCount * 2);
      const random = seededRandom(12);
      const bikeMatrix = new THREE.Matrix4();
      const partMatrix = new THREE.Matrix4();
      for (let i = 0; i < bikeCount; i++) {
        bikeMatrix.makeRotationY(random() * Math.PI);
        bikeMatrix.setPosition((random() - 0.5) * w * 0.8, -h / 2 + 0.1, d * 0.3 + (random() - 0.5) * 8);
        [-0.5, 0.5].forEach((offset, wheel) => {
          partMatrix.makeRotationY(Math.PI / 2).setPosition(0, 0.33, offset);
          wheels.setMatrixAt(i * 2 + wheel, bikeMatrix.clone().multiply(partMatrix));
        });
        partMatrix.makeTranslation(0, -0.05, -0.5);
        frames.setMatrixAt(i * 2, bikeMatrix.clone().multiply(partMatrix));
        partMatrix.makeRotationX(Math.PI / 2).setPosition(0, 0.45, 0.35);
        partMatrix.multiply(new THREE.Matrix4().makeScale(1, 0.55, 1));
        frames.setMatrixAt(i * 2 + 1, bikeMatrix.clone().multiply(partMatrix));
        frames.setColorAt(i * 2, tint.set(brand[i % 4]));
        frames.setColorAt(i * 2 + 1, tint.set(brand[i % 4]));
      }
      group.add(wheels, frames);
      group.add(box(10, 0.12, 6, material('#ffe082', { roughness: 1 }), -w * 0.05, -h / 2 + 0.12, d * 0.15));
      group.add(box(0.1, 1.2, 6, material('#ffffff'), -w * 0.05, -h / 2 + 0.7, d * 0.15));
      const letters = 'Google'.split('');
      const colors = ['#4285f4', '#ea4335', '#fbbc05', '#4285f4', '#34a853', '#ea4335'];
      letters.forEach((letter, index) => {
        const tile = facedBox(1.6, 2, 0.4, material(colors[index]), new THREE.MeshBasicMaterial({ map: labelTexture(letter, { bg: '#ffffff', fg: colors[index], width: 128, height: 160, font: 'bold 120px Segoe UI, Arial, sans-serif' }) }), -4 + index * 1.7, -h / 2 + 1.2, d * 0.44);
        group.add(tile);
      });
      scatterTrees(group, 40, w, d, 33, { y: -h / 2, avoid: (x, z) => Math.abs(z - d * 0.3) < 6 || (Math.abs(x + w * 0.3) < 11 && z < d * 0.25) || (Math.abs(x - w * 0.02) < 11 && z < -d * 0.15) || (x > w * 0.08 && Math.abs(z) < d * 0.35) });
      const caption = textSprite('Googleplex', { width: 14 });
      caption.position.y = 18;
      group.add(caption);
    },

    metaCampus(group, { w, h, d, color }) {
      group.add(box(w, 0.1, d, material('#cfd8dc'), 0, -h / 2 + 0.05, 0));
      // MPK 20: one long low building with a green rooftop park
      officeBlock(group, w * 0.85, h * 0.7, d * 0.45, 0, -h / 2, -d * 0.15, '#eceff1', '#b3e5fc');
      group.add(box(w * 0.85, 0.4, d * 0.45, material('#7cb342', { roughness: 1 }), 0, -h / 2 + h * 0.7 + 0.2, -d * 0.15));
      scatterTrees(group, 45, w * 0.8, d * 0.4, 21, { y: -h / 2 + h * 0.7 + 0.4, scale: 0.7 });
      // Entrance sign at 1 Hacker Way
      const sign = new THREE.Group();
      sign.add(box(10, 1, 2, material('#eceff1'), 0, 0.5, 0));
      sign.add(facedBox(9, 3.2, 1, material('#ffffff'), wordmark('Meta', color), 0, 2.6, 0));
      sign.add(facedBox(9, 1, 1.02, material('#ffffff'), new THREE.MeshBasicMaterial({ map: labelTexture('1 Hacker Way', { bg: '#ffffff', fg: '#1c1e21', font: 'bold 56px Segoe UI, Arial, sans-serif' }) }), 0, 0.5, 0.02));
      sign.position.set(-w * 0.3, -h / 2, d * 0.38);
      group.add(sign);
      parkingLot(group, w * 0.45, d * 0.25, w * 0.2, d * 0.3, 9);
      // Hacker Square: the courtyard of the Classic Campus, with HACK written
      // in giant letters on the pavement, ringed by low "Main Street" buildings
      const square = box(w * 0.32, 0.12, d * 0.22, material('#d7d2c8', { roughness: 0.9 }), -w * 0.18, -h / 2 + 0.12, d * 0.22);
      group.add(square);
      const hack = box(w * 0.28, 0.02, d * 0.12, new THREE.MeshBasicMaterial({ map: labelTexture('HACK', { bg: '#d7d2c8', fg: '#8a8578', width: 1024, height: 360, font: 'bold 300px Segoe UI, Arial, sans-serif' }) }), -w * 0.18, -h / 2 + 0.2, d * 0.22);
      group.add(hack);
      [['#c8b89a', -0.33], ['#9fb3c8', -0.03], ['#d6c4a8', -0.2]].forEach(([wall, x], index) => {
        group.add(box(w * 0.08, 5 + index, 4, new THREE.MeshStandardMaterial({ map: repeated(windowsTexture(wall, '#cfe8ff'), 2, 2), roughness: 0.6 }), w * x, -h / 2 + 2.5 + index / 2, d * 0.22 + (index === 2 ? d * 0.14 : -d * 0.14)));
      });
      const caption = textSprite('Meta — MPK 20', { width: 14 });
      caption.position.y = h + 6;
      group.add(caption);
    },

    nvidiaCampus(group, { w, h, d, color }) {
      group.add(box(w, 0.1, d, material('#cfd8dc'), 0, -h / 2 + 0.05, 0));
      // Endeavor and Voyager: triangular buildings with triangular skylights
      [[-w * 0.22, 0, 14, h * 0.6], [w * 0.2, -d * 0.05, 17, h * 0.75]].forEach(([x, z, radius, height], index) => {
        const building = mesh(new THREE.CylinderGeometry(radius, radius, height, 3), new THREE.MeshStandardMaterial({ map: repeated(windowsTexture('#37474f', '#a5d6a7'), 10, 2), roughness: 0.3, metalness: 0.5 }), x, -h / 2 + height / 2, z);
        building.rotation.y = index ? Math.PI : 0;
        group.add(building);
        const roof = mesh(new THREE.CylinderGeometry(radius + 0.5, radius + 0.5, 0.4, 3), material('#263238'), x, -h / 2 + height + 0.2, z);
        roof.rotation.y = building.rotation.y;
        group.add(roof);
        for (let i = 0; i < 6; i++) {
          const skylight = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.3, 3), glow(color, 0.8), x + Math.cos(i) * radius * 0.4, -h / 2 + height + 0.5, z + Math.sin(i) * radius * 0.4);
          group.add(skylight);
        }
      });
      monumentSign(group, 'NVIDIA', color, 0, d * 0.42, 0, '#000000');
      const caption = textSprite('NVIDIA — Endeavor & Voyager', { width: 16 });
      caption.position.y = h + 6;
      group.add(caption);
    },

    oracleCampus(group, { w, h, d, color }) {
      // Six cylindrical glass towers around a lagoon
      group.add(cylinder(Math.min(w, d) * 0.28, Math.min(w, d) * 0.28, 0.3, material('#4fc3f7', { roughness: 0.1 }), 0, -h / 2 + 0.15, 0, 32));
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const height = h * (0.6 + (i % 3) * 0.2);
        const tower = cylinder(4.5, 4.5, height, new THREE.MeshStandardMaterial({ map: repeated(windowsTexture('#0e6655', '#76d7c4'), 6, Math.round(height / 3)), roughness: 0.1, metalness: 0.7 }), Math.cos(angle) * w * 0.36, -h / 2 + height / 2, Math.sin(angle) * d * 0.36, 20);
        group.add(tower);
      }
      monumentSign(group, 'ORACLE', color, 0, d * 0.45, 0);
    },

    eaCampus(group, { w, h, d, color }) {
      group.add(box(w, 0.1, d, material('#cfd8dc'), 0, -h / 2 + 0.05, 0));
      [[-w * 0.28, -d * 0.15], [w * 0.05, -d * 0.25], [w * 0.32, -d * 0.05]].forEach(([x, z], index) => {
        officeBlock(group, 12, h * (0.7 + index * 0.15), 10, x, -h / 2, z, '#eceff1', '#90caf9');
        group.add(box(12.2, 0.5, 10.2, material(color), x, -h / 2 + h * (0.7 + index * 0.15), z));
      });
      rooftopSign(group, 'EA', color, -h / 2 + h, 8, -d * 0.25 + 5.2, '#ffffff');
      monumentSign(group, 'Electronic Arts', color, -w * 0.15, d * 0.38);
      group.add(box(14, 0.1, 6, material('#66bb6a'), w * 0.2, -h / 2 + 0.1, d * 0.3));
      const caption = textSprite('Electronic Arts — Redwood Shores', { width: 16 });
      caption.position.y = h + 6;
      group.add(caption);
    },

    // The Bay Area around the campus: golden-green foothills of the Santa Cruz
    // Mountains to the west and south, the San Francisco Bay to the north with
    // its colored salt ponds along the shore, and US-101 with traffic between
    bayArea(group, { w, d }) {
      const random = seededRandom(1849);
      // Foothills: a displaced strip, green in the folds and golden on the crests
      const hills = (length, depthOut, x, z, rotation) => {
        const geometry = new THREE.PlaneGeometry(length, depthOut, 90, 24);
        geometry.rotateX(-Math.PI / 2);
        const position = geometry.attributes.position;
        const colors = [];
        const low = new THREE.Color('#5f7f3c');
        const high = new THREE.Color('#c9a75c');
        const oak = new THREE.Color('#3f5a2a');
        for (let i = 0; i < position.count; i++) {
          const px = position.getX(i);
          const pz = position.getZ(i);
          const away = (pz + depthOut / 2) / depthOut; // 0 at the campus edge, 1 far away
          const ridge = Math.sin(px * 0.018 + 1.3) * 0.5 + Math.sin(px * 0.047 + pz * 0.02) * 0.3 + Math.sin(px * 0.11 - pz * 0.07) * 0.12;
          const height = Math.max(0, away * away * (48 + ridge * 30) + ridge * 6 * away);
          position.setY(i, height - 0.4);
          const t = Math.min(1, height / 55);
          const c = low.clone().lerp(high, t * 0.85);
          if (Math.sin(px * 0.3 + pz * 0.21) > 0.55 && t < 0.7) c.lerp(oak, 0.6); // oak groves in the folds
          colors.push(c.r, c.g, c.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        const strip = mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), x, 0, z);
        strip.rotation.y = rotation;
        strip.receiveShadow = true;
        strip.userData.alwaysVisible = true;
        group.add(strip);
      };
      hills(w + 420, 260, 0, d / 2 + 130, Math.PI);          // south
      hills(d + 420, 260, -w / 2 - 130, 0, -Math.PI / 2);   // west
      // San Francisco Bay to the north, with salt ponds in their real colors
      const bay = box(w + 600, 0.2, 320, material('#4f86a8', { roughness: 0.15, metalness: 0.3 }), 0, -0.35, -d / 2 - 175);
      bay.userData.alwaysVisible = true;
      group.add(bay);
      const pondColors = ['#c0504d', '#d9826b', '#b5713a', '#7fa98a', '#c98aa6', '#8f6a4a', '#5f9e9b'];
      let px = -w / 2 - 60;
      while (px < w / 2 + 60) {
        const pw = 28 + random() * 40;
        const pd = 22 + random() * 26;
        group.add(box(pw, 0.12, pd, material(pondColors[Math.floor(random() * pondColors.length)], { roughness: 0.4 }), px + pw / 2, -0.2, -d / 2 - 40 - pd / 2 - random() * 10));
        group.add(box(pw + 1.2, 0.3, 1.2, material('#a89f8a'), px + pw / 2, -0.15, -d / 2 - 38));
        px += pw + 2;
      }
      // US-101: six lanes with traffic, between the campus and the bay
      const roadZ = -d / 2 - 18;
      const road = box(w + 260, 0.1, 22, new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.asphaltTexture ? PropKit.kit.asphaltTexture() : windowsTexture('#3a3d42', '#3a3d42'), 40, 2), roughness: 0.9 }), 0, 0.02, roadZ);
      group.add(road);
      group.add(box(w + 260, 0.6, 0.6, material('#c9c9c9'), 0, 0.3, roadZ));
      const lanes = [-8, -4.5, -1.5, 1.5, 4.5, 8];
      const length = w + 240;
      const perLane = 14;
      const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.3, 1.4, 1.9).translate(0, 0.75, 0), material('#ffffff', { roughness: 0.25, metalness: 0.5 }), lanes.length * perLane);
      const carColors = ['#f2f2f2', '#1b1b1b', '#9aa1a8', '#b3261e', '#22446e', '#c7c9cc', '#3c3c3c'];
      const starts = [];
      for (let i = 0; i < cars.count; i++) { starts.push(random() * length); cars.setColorAt(i, tint.set(carColors[i % carColors.length])); }
      cars.castShadow = true;
      group.add(cars);
      animate(cars, (time) => {
        for (let i = 0; i < cars.count; i++) {
          const lane = i % lanes.length;
          const direction = lane < 3 ? 1 : -1;
          const travel = (starts[i] + time * (16 + (i % 4) * 3)) % length;
          matrix.makeRotationY(direction > 0 ? 0 : Math.PI).setPosition(direction > 0 ? -length / 2 + travel : length / 2 - travel, 0, roadZ + lanes[lane]);
          cars.setMatrixAt(i, matrix);
        }
        cars.instanceMatrix.needsUpdate = true;
      });
      for (let x = -w / 2; x <= w / 2; x += 110) {
        const shield = new THREE.Group();
        shield.add(box(0.25, 5, 0.25, material('#7f8c8d'), 0, 2.5, 0));
        shield.add(facedBox(2.6, 2.6, 0.15, material('#ffffff'), new THREE.MeshBasicMaterial({ map: labelTexture('101', { bg: '#ffffff', fg: '#111111', border: '#111111', width: 256, height: 256, font: 'bold 110px Arial, sans-serif' }) }), 0, 5.6, 0));
        shield.position.set(x, 0, roadZ + 12.5);
        group.add(shield);
      }
      // Rows of palms and oaks along the boulevards beside the freeway
      const palms = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 9, 6).translate(0, 4.5, 0), material('#8d7a5f'), 40);
      const fronds = new THREE.InstancedMesh(new THREE.ConeGeometry(2.6, 1.6, 8, 1, true).translate(0, 9.2, 0), material('#4f7a35', { side: THREE.DoubleSide, flatShading: true }), 40);
      for (let i = 0; i < 40; i++) {
        matrix.makeRotationY(i).setPosition(-w / 2 + 10 + i * (w - 20) / 39, 0, roadZ + 15.5);
        palms.setMatrixAt(i, matrix);
        fronds.setMatrixAt(i, matrix);
      }
      group.add(palms, fronds);
      const caption = textSprite('San Francisco Bay', { width: 18 });
      caption.position.set(0, 14, -d / 2 - 120);
      group.add(caption);
    },

    stanfordCampus(group, { w, h, d }) {
      const sandstone = material('#e0c9a6', { roughness: 0.9 });
      const tile = material('#b7472a', { flatShading: true });
      group.add(box(w, 0.1, d, material('#9ccc65', { roughness: 1 }), 0, -h / 2 + 0.05, 0));
      // Main Quad: arcades with red tile roofs around a courtyard
      const quadW = w * 0.45;
      const quadD = d * 0.5;
      [[0, -quadD / 2, quadW, 4], [0, quadD / 2, quadW, 4], [-quadW / 2, 0, 4, quadD], [quadW / 2, 0, 4, quadD]].forEach(([x, z, bw, bd]) => {
        group.add(box(bw, 5, bd, sandstone, x - w * 0.12, -h / 2 + 2.5, z));
        group.add(box(bw + 0.8, 0.5, bd + 0.8, tile, x - w * 0.12, -h / 2 + 5.25, z));
        group.add(box(bw * (bw > bd ? 0.98 : 0.6), 0.6, bd * (bd > bw ? 0.98 : 0.6), tile, x - w * 0.12, -h / 2 + 5.8, z));
      });
      // Memorial Church facade and Hoover Tower
      group.add(box(10, 9, 3, sandstone, -w * 0.12, -h / 2 + 4.5, -quadD / 2 - 3));
      group.add(box(8, 3, 0.2, new THREE.MeshBasicMaterial({ map: PropKit.kit.artTexture(21) }), -w * 0.12, -h / 2 + 7, -quadD / 2 - 1.4));
      const hoover = new THREE.Group();
      hoover.add(box(6, h * 0.85, 6, sandstone, 0, h * 0.425, 0));
      hoover.add(box(6.4, 3, 6.4, material('#d7c19c'), 0, h * 0.85 + 1.5, 0));
      hoover.add(sphere(3.4, tile, 0, h * 0.85 + 3.4, 0, 12));
      hoover.position.set(w * 0.28, -h / 2, -d * 0.1);
      group.add(hoover);
      const caption = textSprite('Stanford University', { width: 16 });
      caption.position.y = h + 4;
      group.add(caption);
      scatterTrees(group, 70, w, d, 44, { y: -h / 2, avoid: (x, z) => (Math.abs(x + w * 0.12) < quadW / 2 + 4 && Math.abs(z) < quadD / 2 + 7) || Math.hypot(x - w * 0.28, z + d * 0.1) < 6, palette: ['#33691e', '#558b2f', '#827717'] });
    },

    hpGarage(group, { w, h, d, label }) {
      group.add(box(w, h * 0.65, d, material('#f5f5dc'), 0, -h * 0.175, 0));
      const roof = mesh(new THREE.ConeGeometry(w * 0.8, h * 0.4, 4), material('#6d4c41', { flatShading: true }), 0, h * 0.35, 0);
      roof.rotation.y = Math.PI / 4;
      group.add(roof);
      group.add(box(w * 0.7, h * 0.5, 0.1, material('#8d6e63'), 0, -h * 0.2, d / 2 + 0.05));
      const plaque = textSprite(label || 'HP Garage', { width: 12 });
      plaque.position.y = h + 2;
      group.add(plaque);
    },

    vcRow(group, { w, h, d }) {
      const firms = ['Ventures I', 'Capital II', 'Partners III', 'Seed Fund IV', 'Growth V', 'Angels VI'];
      firms.forEach((firm, index) => {
        const x = -w / 2 + (index + 0.5) * (w / firms.length);
        officeBlock(group, 12, h, d * 0.7, x, -h / 2, 0, '#d7ccc8', '#ffe0b2');
        group.add(facedBox(8, 1.4, 0.2, material('#3e2723'), new THREE.MeshBasicMaterial({ map: labelTexture(`Sand Hill ${firm}`, { bg: '#3e2723', fg: '#ffcc80', font: 'bold 40px Georgia, serif' }) }), x, -h / 2 + h * 0.75, d * 0.35 + 0.1));
      });
    },

    hangar(group, { w, h, d, label }) {
      const shell = mesh(new THREE.CylinderGeometry(h, h, w, 24, 1, false, 0, Math.PI), material('#b0bec5', { side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
      shell.rotation.z = Math.PI / 2;
      shell.rotation.y = 0;
      shell.scale.set(1, 1, d / (2 * h));
      shell.position.y = -h / 2;
      group.add(shell);
      const caption = textSprite(label || 'Hangar One', { width: 16 });
      caption.position.y = h / 2 + 6;
      group.add(caption);
    },

    stadium(group, { w, h, d, color, label }) {
      group.add(box(w * 0.7, 0.2, d * 0.6, material('#43a047', { roughness: 1 }), 0, -h / 2 + 0.1, 0));
      for (let i = 0; i < 8; i++) group.add(box(0.15, 0.22, d * 0.6, material('#ffffff'), -w * 0.35 + (i + 0.5) * (w * 0.7 / 8), -h / 2 + 0.11, 0));
      for (let tier = 0; tier < 4; tier++) {
        const inset = tier * 2.5;
        const y = -h / 2 + 1.5 + tier * (h / 5);
        const seats = material(tier % 2 ? color : shade(color, -0.1));
        group.add(box(w - inset * 0 , h / 5, 3, seats, 0, y, -d / 2 + 1.5 + inset));
        group.add(box(w, h / 5, 3, seats, 0, y, d / 2 - 1.5 - inset));
        group.add(box(3, h / 5, d - 6, seats, -w / 2 + 1.5 + inset, y, 0));
        group.add(box(3, h / 5, d - 6, seats, w / 2 - 1.5 - inset, y, 0));
      }
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        group.add(box(0.6, h * 1.6, 0.6, material('#9e9e9e'), (sx * w) / 2, -h / 2 + h * 0.8, (sz * d) / 2));
        group.add(box(3, 1.5, 0.4, glow('#fffde7', 1.5), (sx * w) / 2, h * 1.1, (sz * d) / 2));
      });
      const caption = textSprite(label || 'Stadium', { width: 16 });
      caption.position.y = h + 8;
      group.add(caption);
    },

    adobeTowers(group, { w, h, d, color }) {
      [[-w * 0.3, h * 0.75], [0, h], [w * 0.3, h * 0.85]].forEach(([x, height]) => {
        officeBlock(group, 11, height, 11, x, -h / 2, 0, '#cfd8dc', '#b3e5fc');
        group.add(box(11.2, 0.6, 11.2, material(color), x, -h / 2 + height, 0));
      });
      rooftopSign(group, 'Adobe', color, -h / 2 + h, 9, 5.8, '#ffffff');
      monumentSign(group, 'Adobe', color, 0, d * 0.42);
    },

    skyline(group, { w, h, d }) {
      const random = seededRandom(hashString(`skyline${w}${d}`));
      const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const towers = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ map: repeated(windowsTexture('#90a4ae', '#fff3c4'), 2, 6), roughness: 0.4, metalness: 0.3 }), 24);
      for (let i = 0; i < 24; i++) {
        const tw = 6 + random() * 6;
        const th = h * (0.3 + random() * 0.7);
        matrix.compose(positionVector.set((random() - 0.5) * (w - tw), -h / 2, (random() - 0.5) * (d - tw)), quaternion.identity(), scaleVector.set(tw, th, tw));
        towers.setMatrixAt(i, matrix);
        towers.setColorAt(i, tint.setHSL(0.58, 0.1, 0.55 + random() * 0.35));
      }
      towers.castShadow = true;
      towers.receiveShadow = true;
      group.add(towers);
    },

    teslaFactory(group, { w, h, d, color }) {
      group.add(box(w, h, d, material('#f4f6f7', { roughness: 0.6 })));
      group.add(box(w + 0.2, 0.6, d + 0.2, material('#d5dbdb'), 0, h / 2, 0));
      // Giant wordmark painted on the long facade facing the bay
      const facadeSign = facedBox(0.3, h * 0.45, d * 0.5, material('#f4f6f7'), material('#f4f6f7'), -w / 2 - 0.15, h * 0.1, 0);
      facadeSign.material = [new THREE.MeshBasicMaterial({ color: '#f4f6f7' }), new THREE.MeshBasicMaterial({ map: labelTexture('TESLA', { bg: '#f4f6f7', fg: color, width: 1024, height: 220, font: 'bold 190px Segoe UI, Helvetica, Arial, sans-serif' }) }), material('#f4f6f7'), material('#f4f6f7'), material('#f4f6f7'), material('#f4f6f7')];
      group.add(facadeSign);
      for (let i = 0; i < 8; i++) group.add(box(1.2, 4, 1.2, material('#bdc3c7'), w * 0.3, h / 2 + 2, -d / 2 + 8 + i * (d / 8)));
      parkingLot(group, w * 0.8, 24, 0, d / 2 + 14, 17, ['#c0392b', '#ecf0f1', '#111111', '#2c3e50', '#7f8c8d']);
      const caption = textSprite('Tesla Fremont Factory', { width: 18 });
      caption.position.y = h / 2 + 10;
      group.add(caption);
    }
  };

  const rules = [
    [/city_zone/, 'cityZone'],
    [/^hills/, 'hills'],
    [/tree_cluster/, 'treeCluster'],
    [/highway_traffic/, 'highwayTraffic'],
    [/rail/, 'rails'],
    [/billboard/, 'billboard'],
    [/golden_gate/, 'goldenGate'],
    [/tapered_tower/, 'taperedTower'],
    [/pyramid_tower/, 'pyramidTower'],
    [/^hq_/, 'hqOffice'],
    [/apple_park/, 'applePark'],
    [/googleplex/, 'googleplex'],
    [/meta_campus/, 'metaCampus'],
    [/nvidia_campus/, 'nvidiaCampus'],
    [/oracle_campus/, 'oracleCampus'],
    [/ea_campus/, 'eaCampus'],
    [/stanford_campus/, 'stanfordCampus'],
    [/bay_area/, 'bayArea'],
    [/hp_garage/, 'hpGarage'],
    [/vc_row/, 'vcRow'],
    [/hangar/, 'hangar'],
    [/stadium|arena/, 'stadium'],
    [/adobe_towers/, 'adobeTowers'],
    [/skyline/, 'skyline'],
    [/tesla_factory/, 'teslaFactory']
  ];

  // Registered in reverse so the first rule above keeps the highest priority
  rules.slice().reverse().forEach(([pattern, name]) => PropKit.registerBuilder(pattern, name, builders[name]));
})();
