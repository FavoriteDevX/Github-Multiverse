// ============================================================================
// INTERACTIVE DISTRICTS: DEBUG DUNGEON, OPEN SOURCE HQ, KEYNOTE ARENA, GREEN-TECH
// ============================================================================
// Builders for the interactive maps plus the shared game state that is synced
// through server.js (or simulated locally in solo mode).
const GameSystems = (() => {
  const { material, glow, shade, mesh, box, cylinder, sphere, facedBox, animate, orientation, textSprite, labelTexture, windowsTexture, repeated, gridTexture, canvasTexture, seat } = PropKit.kit;

  const DECOR_ITEMS = ['tree', 'lamp', 'banner', 'fountain', 'duck', 'flag', 'neon', 'bench'];
  const WEARABLES = ['hoodie', 'mug', 'cap', 'headphones', 'none'];
  // Keynote recordings played through YouTube's embed player: Apple's WWDCs,
  // OpenAI DevDays and GitHub Universe opening keynotes (newest first)
  const KEYNOTE_PLAYLIST = [
    { videoId: 'Fls_onRviPM', title: 'OpenAI DevDay 2026 Keynote', subtitle: 'OpenAI - Sept 29, 2026' },
    { videoId: 'P6Va0_KILi4', title: 'GitHub Universe 2025 Keynote', subtitle: 'GitHub - Oct 28, 2025' },
    { videoId: 'hS1YqcewH0c', title: 'OpenAI DevDay 2025 Keynote', subtitle: 'OpenAI - Oct 6, 2025' },
    { videoId: '0_DjDdfqtUE', title: 'WWDC 2025 Keynote', subtitle: 'Apple - June 9, 2025' },
    { videoId: 'dSf8QOjazrQ', title: 'GitHub Universe 2024 Keynote', subtitle: 'GitHub - Oct 29, 2024' },
    { videoId: 'RXeOiIDNNek', title: 'WWDC 2024 Keynote', subtitle: 'Apple - June 10, 2024' },
    { videoId: 'NrQkdDVupQE', title: 'GitHub Universe 2023 Keynote', subtitle: 'GitHub - Nov 8, 2023' },
    { videoId: 'U9mJuUkhUzk', title: 'OpenAI DevDay 2023 Keynote', subtitle: 'OpenAI - Nov 6, 2023' },
    { videoId: 'GYkq9Rgoj8E', title: 'WWDC 2023 Keynote', subtitle: 'Apple - June 5, 2023' },
    { videoId: 'q5D55G7Ejs8', title: 'WWDC 2022 Keynote', subtitle: 'Apple - June 6, 2022' },
    { videoId: '0TD96VTf0Xs', title: 'WWDC 2021 Keynote', subtitle: 'Apple - June 7, 2021' },
    { videoId: 'GEZhD3J89ZE', title: 'WWDC 2020 Keynote', subtitle: 'Apple - June 22, 2020' }
  ];
  let keynoteVideo = null;
  const thumbnails = {};
  let playlistIndex = 0;
  const SCRIPT_DAMAGE = { weak: 40, normal: 15 };
  const HAMMER_DAMAGE = 10;

  const monsters = {};
  const murals = {};
  const decorationSlots = {};
  const plantedTreeGroups = [];
  let prBoard = null;
  let scoreboard = null;
  let keynoteScreen = null;
  let energyMeter = null;
  let greenTechGroup = null;

  const DEFAULT_DECORATIONS = { slot1: { item: 'tree' }, slot2: { item: 'lamp' }, slot3: { item: 'banner', color: '#8250df' }, slot4: { item: 'duck' }, slot5: { item: 'tree' }, slot6: { item: 'lamp' }, slot7: { item: 'flag', color: '#2da44e' }, slot8: { item: 'bench' } };
  const state = { monsters: {}, scores: {}, murals: {}, decorations: { ...DEFAULT_DECORATIONS }, pullRequests: [], stream: null, trees: [] };
  let hooks = null;
  let localToolEquipped = false;
  let lastScriptTime = 0;

  // --------------------------------------------------------------------------
  // Dynamic canvas helper: a texture redrawn whenever state changes
  // --------------------------------------------------------------------------
  function dynamicCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return { canvas, ctx: canvas.getContext('2d'), texture, redraw(draw) { draw(this.ctx, width, height); texture.needsUpdate = true; } };
  }

  function stoneTexture(color) {
    return canvasTexture(`stone|${color}`, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 4; col++) {
          const x = col * 64 + (row % 2) * 32;
          ctx.fillStyle = shade(color, ((row * 7 + col * 3) % 5 - 2) * 0.025);
          ctx.fillRect(x + 2, row * 32 + 2, 60, 28);
        }
      }
    });
  }

  // --------------------------------------------------------------------------
  // Debug Dungeon builders
  // --------------------------------------------------------------------------
  const builders = {
    dungeonFloor(group, { w, h, d, color }) {
      group.add(box(w, h, d, new THREE.MeshStandardMaterial({ map: repeated(gridTexture(color, shade(color, -0.08), 4), w / 6, d / 6), roughness: 1 })));
      // Scattered bones and rubble
      for (let i = 0; i < 30; i++) {
        const rubble = box(0.6 + (i % 3) * 0.3, 0.3, 0.5, material(shade(color, 0.1)), ((i * 37) % w) - w / 2, h / 2 + 0.15, ((i * 53) % d) - d / 2);
        rubble.rotation.y = i;
        group.add(rubble);
      }
    },

    dungeonWall(group, { w, h, d, color }) {
      const texture = repeated(stoneTexture(shade(color, 0.12)), Math.max(w, d) / 6, h / 3);
      group.add(box(w, h, d, new THREE.MeshStandardMaterial({ map: texture, roughness: 1 })));
      const longX = w > d;
      const length = Math.max(w, d);
      for (let t = -length / 2 + 1; t < length / 2; t += 3) {
        const merlon = box(longX ? 1.4 : w + 0.2, 0.8, longX ? d + 0.2 : 1.4, material(shade(color, -0.05)), longX ? t : 0, h / 2 + 0.4, longX ? 0 : t);
        group.add(merlon);
      }
    },

    dungeonGate(group, { w, h, d, color, label }) {
      const stone = new THREE.MeshStandardMaterial({ map: repeated(stoneTexture(color), 2, 2), roughness: 1 });
      group.add(box(3, h, d, stone, -w / 2 + 1.5, 0, 0));
      group.add(box(3, h, d, stone, w / 2 - 1.5, 0, 0));
      group.add(box(w, 2, d, stone, 0, h / 2 - 1, 0));
      group.add(facedBox(w * 0.8, 1.6, 0.2, stone, new THREE.MeshBasicMaterial({ map: labelTexture(label || 'Dungeon', { bg: '#1a1520', fg: '#ff5252', font: 'bold 38px Georgia, serif' }) }), 0, h / 2 - 1, d / 2 + 0.1));
      [-1, 1].forEach((side) => {
        const flame = sphere(0.4, glow('#ff9800', 2), side * (w / 2 - 1.5), h / 2 - 3, d / 2 + 0.6, 8);
        group.add(flame);
        animate(flame, (time) => flame.scale.setScalar(0.8 + Math.sin(time * 12 + side) * 0.2));
      });
    },

    dungeonTorch(group, { h, color }) {
      group.add(cylinder(0.12, 0.18, h, material('#4e342e'), 0, 0, 0, 6));
      group.add(cylinder(0.35, 0.2, 0.4, material('#424242', { metalness: 0.7 }), 0, h / 2, 0, 8));
      const flame = mesh(new THREE.ConeGeometry(0.3, 0.9, 6), glow(color, 2.2, { transparent: true, opacity: 0.9 }), 0, h / 2 + 0.6, 0);
      group.add(flame);
      animate(flame, (time) => { flame.scale.set(1, 0.8 + Math.sin(time * 15 + h) * 0.25, 1); });
    },

    gitHammer(group, { w, h, color }) {
      group.add(cylinder(w * 0.6, w * 0.7, h * 0.5, material('#5d5466'), 0, -h * 0.25, 0, 8));
      const hammer = new THREE.Group();
      hammer.add(cylinder(0.12, 0.12, 2.2, material('#6d4c41'), 0, 0, 0, 8));
      hammer.add(facedBox(1.4, 0.7, 0.7, glow(color, 0.5, { metalness: 0.8 }), new THREE.MeshBasicMaterial({ map: labelTexture('commit', { bg: '#ffd54f', fg: '#3e2723', width: 256, height: 128, font: 'bold 52px Consolas, monospace' }) }), 0, 1.1, 0));
      hammer.position.y = h * 0.5 + 1.2;
      group.add(hammer);
      animate(hammer, (time) => { hammer.rotation.y = time; hammer.position.y = h * 0.5 + 1.2 + Math.sin(time * 2) * 0.2; });
      group.userData.isHammer = true;
    },

    bugMonster(group, { w, h, d, color, type, data }) {
      const kind = type.replace('bug_monster_', '');
      const body = new THREE.Group();
      if (kind === 'memory_leak') {
        const blob = mesh(new THREE.IcosahedronGeometry(w * 0.45, 1), glow(color, 0.35, { flatShading: true, transparent: true, opacity: 0.9 }));
        body.add(blob);
        for (let i = 0; i < 4; i++) {
          const drip = sphere(0.18, glow(color, 0.5), Math.cos(i) * w * 0.3, 0, Math.sin(i) * w * 0.3, 8);
          body.add(drip);
          animate(drip, (time) => { drip.position.y = -((time * 1.5 + i * 0.4) % 1.5); });
        }
        animate(blob, (time) => blob.scale.setScalar(1 + Math.sin(time * 2) * 0.12));
      } else if (kind === 'null_pointer') {
        const ghostMaterial = material(color, { transparent: true, opacity: 0.7, emissive: '#b3e5fc', emissiveIntensity: 0.3 });
        body.add(sphere(w * 0.4, ghostMaterial, 0, h * 0.15, 0, 16));
        body.add(mesh(new THREE.ConeGeometry(w * 0.4, h * 0.6, 16, 1, true), ghostMaterial, 0, -h * 0.2, 0));
        body.add(sphere(0.18, material('#000000'), -0.35, h * 0.25, w * 0.35, 8));
        body.add(sphere(0.18, material('#000000'), 0.35, h * 0.25, w * 0.35, 8));
        const tag = textSprite('null', { width: 2.4, color: '#ff5252', background: 'rgba(0,0,0,0)', font: 'bold 80px Consolas, monospace' });
        tag.position.y = h * 0.62;
        body.add(tag);
        animate(body, (time) => { ghostMaterial.opacity = 0.35 + Math.abs(Math.sin(time * 3)) * 0.5; });
      } else if (kind === 'infinite_loop') {
        const knot = mesh(new THREE.TorusKnotGeometry(w * 0.3, 0.25, 64, 8), glow(color, 0.8));
        body.add(knot);
        animate(knot, (time) => { knot.rotation.x = time * 2; knot.rotation.y = time * 3; });
      } else if (kind === 'race_condition') {
        ['#ff5722', '#ffc107'].forEach((orbColor, index) => {
          const orb = sphere(w * 0.22, glow(orbColor, 1), 0, 0, 0, 12);
          body.add(orb);
          animate(orb, (time) => { const angle = time * 6 + index * Math.PI; orb.position.set(Math.cos(angle) * w * 0.35, Math.sin(time * 9 + index) * 0.4, Math.sin(angle) * w * 0.35); });
        });
      } else if (kind === 'off_by_one') {
        for (let i = 0; i < 3; i++) body.add(box(w * 0.5, h * 0.25, d * 0.5, material(i === 2 ? '#ff5252' : color), i === 2 ? w * 0.2 : 0, -h * 0.3 + i * h * 0.27, 0));
        const tag = textSprite('i <= n', { width: 2.6, color: '#ff5252', background: 'rgba(0,0,0,0.6)', font: 'bold 70px Consolas, monospace' });
        tag.position.y = h * 0.6;
        body.add(tag);
      } else if (kind === 'blue_screen') {
        const screenTexture = canvasTexture('bsod', 512, 384, (ctx, cw, ch) => {
          ctx.fillStyle = '#0a3ea8'; ctx.fillRect(0, 0, cw, ch);
          ctx.fillStyle = '#ffffff'; ctx.font = 'bold 110px Segoe UI, Arial'; ctx.fillText(':(', 40, 140);
          ctx.font = '26px Segoe UI, Arial';
          ['Your PC ran into a problem and needs', 'to restart. We are just collecting', 'some error info... 0% complete', '', 'Stop code: CRITICAL_PROCESS_DIED'].forEach((line, index) => ctx.fillText(line, 40, 200 + index * 34));
        });
        body.add(box(w, h * 0.75, d * 0.2, material('#1c1c1c'), 0, h * 0.1, 0));
        body.add(box(w * 0.94, h * 0.68, 0.1, new THREE.MeshBasicMaterial({ map: screenTexture }), 0, h * 0.1, d * 0.1 + 0.06));
        [-1, 1].forEach((side) => body.add(box(0.8, h * 0.3, 0.8, material('#1c1c1c'), side * w * 0.3, -h * 0.4, 0)));
      }
      body.traverse((node) => { if (node.isMesh) node.userData.monsterPart = true; });
      group.add(body);
      const monster = { id: data.id, name: data.label, maxHp: data.hp, hp: data.hp, weakness: data.weakness, kind, group, body, home: group.position.clone(), alive: true, healthBar: null };
      monster.healthBar = createHealthBar(monster, h);
      group.userData.monsterId = data.id;
      monsters[data.id] = monster;
      animate(group, (time) => {
        if (!monster.alive) return;
        if (kind !== 'blue_screen') {
          const angle = time * 0.4 + monster.home.x;
          group.position.x = monster.home.x + Math.cos(angle) * 4;
          group.position.z = monster.home.z + Math.sin(angle) * 4;
          body.position.y = Math.sin(time * 3 + monster.home.z) * 0.3;
        } else {
          body.rotation.y = Math.sin(time * 0.5) * 0.3;
        }
      });
    },

    scoreboard(group, { w, h, d }) {
      const board = dynamicCanvas(512, 256);
      group.add(box(w, h, d, material('#2d2633')));
      group.add(box(w * 0.94, h * 0.9, 0.05, new THREE.MeshBasicMaterial({ map: board.texture }), 0, 0, d / 2 + 0.03));
      group.add(box(0.3, h, 0.3, material('#4e342e'), -w / 2, -h / 2, 0));
      group.add(box(0.3, h, 0.3, material('#4e342e'), w / 2, -h / 2, 0));
      scoreboard = board;
      drawScoreboard();
    },

    // ------------------------------------------------------------------------
    // Open Source HQ builders
    // ------------------------------------------------------------------------
    ossFloor(group, { w, h, d, color }) {
      group.add(box(w, h, d, new THREE.MeshStandardMaterial({ map: repeated(gridTexture(color, shade(color, -0.08), 4), w / 6, d / 6), roughness: 0.7 })));
      // Contribution-graph paths radiating from the center
      const levels = ['#9be9a8', '#40c463', '#30a14e', '#216e39'];
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2;
        const radius = 30 + (i % 4) * 2.2;
        group.add(box(1.8, 0.08, 1.8, material(levels[i % 4]), Math.cos(angle) * radius, h / 2 + 0.04, Math.sin(angle) * radius + 8));
      }
    },

    ossBuilding(group, { w, h, d, color, label }) {
      const side = new THREE.MeshStandardMaterial({ map: repeated(windowsTexture(color, '#79c0ff'), Math.round(w / 5), Math.round(h / 5)), roughness: 0.4, metalness: 0.3 });
      group.add(mesh(new THREE.BoxGeometry(w, h, d), [side, side, material('#161b22'), material('#161b22'), side, side]));
      group.add(box(w * 0.4, h * 0.45, 1, material('#c9d1d9', { transparent: true, opacity: 0.5, roughness: 0.05 }), 0, -h * 0.27, d / 2 + 0.5));
      group.add(facedBox(w * 0.6, 3.5, 0.3, material('#0d1117'), new THREE.MeshBasicMaterial({ map: labelTexture((label || 'Open Source HQ').toUpperCase(), { bg: '#0d1117', fg: '#3fb950', font: 'bold 54px Segoe UI, Arial, sans-serif' }) }), 0, h / 2 - 2.5, d / 2 + 0.2));
      for (let i = 0; i < 5; i++) group.add(box(w * 0.5, 0.4, 1.2, material('#8b949e'), 0, -h / 2 + 0.2 + i * 0.4, d / 2 + 1.2 + (4 - i) * 1.2));
      // Rooftop rubber duck: every developer's favorite debugger
      const duck = new THREE.Group();
      duck.add(sphere(2.2, material('#ffd43b'), 0, 0, 0, 16));
      duck.add(sphere(1.4, material('#ffd43b'), 0, 2.2, 1.2, 16));
      duck.add(box(1, 0.4, 1, material('#ff922b'), 0, 2, 2.6));
      duck.position.set(w * 0.3, h / 2 + 2, 0);
      group.add(duck);
    },

    repoMural(group, { w, h, d, color, data, block }) {
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const board = dynamicCanvas(768, 512);
      inner.add(box(o.w, h, o.d, material('#30363d')));
      inner.add(box(o.w * 0.96, h * 0.92, 0.05, new THREE.MeshBasicMaterial({ map: board.texture }), 0, 0, o.d / 2 + 0.03));
      group.add(inner);
      murals[data.id] = { board, index: data.id.replace('mural', '') };
      drawMural(data.id);
    },

    floatingRoom(group, { w, h, color, label }) {
      group.add(cylinder(w / 2, w / 2 - 0.6, 1, material('#f6f8fa'), 0, 0, 0, 24));
      group.add(cylinder(w / 2 - 1, w / 2 - 1, 1.04, glow(color, 0.5), 0, 0, 0, 24));
      const dome = mesh(new THREE.SphereGeometry(w / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), material('#c9d1d9', { transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide }), 0, 0.5, 0);
      dome.castShadow = false;
      group.add(dome);
      group.add(cylinder(1.8, 1.8, 0.15, material('#ffffff'), 0, 1.3, 0, 20));
      group.add(cylinder(0.2, 0.2, 0.8, material('#8b949e'), 0, 0.9, 0, 8));
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        group.add(box(0.7, 0.6, 0.7, material(color), Math.cos(angle) * 2.8, 0.8, Math.sin(angle) * 2.8));
      }
      const caption = textSprite(label || 'Meeting Room', { width: 9 });
      caption.position.y = w / 2 + 2;
      group.add(caption);
      const baseY = group.position.y;
      animate(group, (time) => { group.position.y = baseY + Math.sin(time * 0.8 + w) * 0.6; });
    },

    decorationSlot(group, { w, h, d, color, data }) {
      group.add(cylinder(w / 2, w / 2 + 0.2, h, material(color), 0, 0, 0, 16));
      group.add(cylinder(w / 2 - 0.2, w / 2 - 0.2, h + 0.04, material('#d0d7de'), 0, 0, 0, 16));
      const holder = new THREE.Group();
      holder.position.y = h / 2;
      group.add(holder);
      const caption = textSprite(`#${data.id.replace('slot', '')}`, { width: 2.2, font: 'bold 60px Consolas, monospace' });
      caption.position.y = 7;
      group.add(caption);
      decorationSlots[data.id] = { holder, current: null };
      applyDecoration(data.id);
    },

    prBoard(group, { w, h, d }) {
      const board = dynamicCanvas(768, 384);
      group.add(box(w, h, d, material('#21262d')));
      group.add(box(w * 0.96, h * 0.92, 0.05, new THREE.MeshBasicMaterial({ map: board.texture }), 0, 0, d / 2 + 0.03));
      [-1, 1].forEach((side) => group.add(box(0.4, h, 0.4, material('#484f58'), side * w * 0.48, -h / 2, 0)));
      prBoard = board;
      drawPrBoard();
    },

    // ------------------------------------------------------------------------
    // Keynote Amphitheater builders
    // ------------------------------------------------------------------------
    amphitheaterFloor(group, { w, h, d, color }) {
      group.add(box(w, h, d, new THREE.MeshStandardMaterial({ map: repeated(gridTexture(color, shade(color, 0.06), 2), w / 4, d / 4), roughness: 0.6 })));
    },

    amphitheaterSeats(group, { w, h, d, color }) {
      // Semicircular tiers facing the stage at -z
      const tiers = 8;
      for (let tier = 0; tier < tiers; tier++) {
        const inner = 14 + tier * ((w / 2 - 14) / tiers);
        const outer = inner + (w / 2 - 14) / tiers;
        const shape = new THREE.Shape();
        shape.absarc(0, 0, outer, Math.PI * 1.05, Math.PI * 1.95, false);
        shape.absarc(0, 0, inner, Math.PI * 1.95, Math.PI * 1.05, true);
        const geometry = new THREE.ExtrudeGeometry(shape, { depth: (h / tiers) * (tier + 1), bevelEnabled: false, curveSegments: 32 });
        geometry.rotateX(-Math.PI / 2);
        group.add(mesh(geometry, material(tier % 2 ? color : shade(color, 0.06), { roughness: 0.8 }), 0, -h / 2, -d / 2 - 10));
        // Seat backs as glowing strips
        const strip = mesh(new THREE.TorusGeometry(outer - 0.3, 0.08, 4, 48, Math.PI * 0.9), glow(tier % 2 ? '#ef233c' : '#8d99ae', 0.5));
        strip.rotation.x = -Math.PI / 2;
        strip.rotation.z = Math.PI * 1.05;
        strip.position.set(0, -h / 2 + (h / tiers) * (tier + 1) + 0.1, -d / 2 - 10);
        group.add(strip);
      }
      // Theatre chairs on every visible tier, all facing the stage (E to sit)
      const chairs = [];
      for (let tier = 0; tier < tiers; tier++) {
        const top = -h / 2 + (h / tiers) * (tier + 1);
        if (top < 0.2) continue;
        const ringWidth = (w / 2 - 14) / tiers;
        const radius = 14 + tier * ringWidth + ringWidth * 0.55;
        const count = Math.floor((radius * Math.PI * 0.86) / 1.5);
        for (let i = 0; i < count; i++) {
          const angle = Math.PI * 1.07 + (i + 0.5) * ((Math.PI * 0.86) / count);
          chairs.push({ x: Math.cos(angle) * radius, y: top, z: -d / 2 - 10 - Math.sin(angle) * radius, facing: Math.atan2(Math.cos(angle), -Math.sin(angle)) });
        }
      }
      const cushion = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.35, 0.8), material('#c1121f', { roughness: 0.95 }), chairs.length);
      const back = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.15), material('#a4161a', { roughness: 0.95 }), chairs.length);
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      const offset = new THREE.Vector3();
      chairs.forEach((chair, index) => {
        rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), chair.facing);
        matrix.compose(new THREE.Vector3(chair.x, chair.y + 0.45, chair.z), rotation, new THREE.Vector3(1, 1, 1));
        cushion.setMatrixAt(index, matrix);
        offset.set(0, 0, 0.42).applyQuaternion(rotation);
        matrix.compose(new THREE.Vector3(chair.x + offset.x, chair.y + 0.95, chair.z + offset.z), rotation, new THREE.Vector3(1, 1, 1));
        back.setMatrixAt(index, matrix);
        group.add(seat(chair.x, chair.y + 0.6, chair.z, 'Amphitheater seat', chair.facing));
      });
      [cushion, back].forEach((instanced) => { instanced.castShadow = true; instanced.receiveShadow = true; group.add(instanced); });
    },

    keynoteStage(group, { w, h, d, color }) {
      group.add(box(w, h, d, material('#1b1b2f')));
      group.add(box(w + 0.2, 0.15, d + 0.2, glow(color, 1.2), 0, h / 2, 0));
      const podium = new THREE.Group();
      podium.add(box(1.6, 2.2, 1, material('#edf2f4'), 0, 1.1, 0));
      podium.add(box(1.8, 0.1, 1.2, material('#8d99ae'), 0, 2.25, 0));
      podium.position.set(w * 0.3, h / 2, 0);
      group.add(podium);
      for (let i = 0; i < 4; i++) {
        const light = cylinder(0.3, 0.45, 0.8, glow(['#ef233c', '#4cc9f0', '#f72585', '#7209b7'][i], 1.5), -w * 0.4 + i * w * 0.27, h / 2 + 0.4, d / 2 - 0.5, 10);
        group.add(light);
      }
    },

    keynoteScreen(group, { w, h, d }) {
      const screen = dynamicCanvas(1024, 440);
      group.add(box(w + 1, h + 1, d, material('#0b0b12', { metalness: 0.6 })));
      const screenMesh = box(w, h, 0.05, new THREE.MeshBasicMaterial({ map: screen.texture }), 0, 0, d / 2 + 0.03);
      group.add(screenMesh);
      // The keynotes autoplay (muted) right on the big screen when you are close
      keynoteVideo = VideoScreens.register(screenMesh, w, h, VideoScreens.youtubeEmbed(KEYNOTE_PLAYLIST.map((entry) => entry.videoId)), { distance: 230, spatial: { full: 85, fade: 220 } });
      [-1, 1].forEach((side) => group.add(box(1.2, h + 4, 1.2, material('#2b2d42'), side * (w / 2 + 1), -2, 0)));
      keynoteScreen = { screen, group };
      group.userData.isKeynoteScreen = true;
      // Side screens show the other keynotes of the playlist
      [-1, 1].forEach((side, index) => {
        const sideScreen = dynamicCanvas(512, 288);
        const panel = box(w * 0.32, w * 0.18, 0.4, new THREE.MeshBasicMaterial({ map: sideScreen.texture }), side * (w / 2 + w * 0.22), -h * 0.15, 3);
        panel.rotation.y = -side * 0.35;
        panel.userData.isKeynoteScreen = true;
        panel.userData.playlistOffset = index + 1;
        group.add(panel);
        keynoteScreen[`side${index}`] = sideScreen;
      });
      KEYNOTE_PLAYLIST.forEach(loadThumbnail);
      drawKeynoteScreen();
      // Rotate the main screen through the playlist every 15 seconds
      setInterval(() => { playlistIndex = (playlistIndex + 1) % KEYNOTE_PLAYLIST.length; drawKeynoteScreen(); }, 15000);
    },

    merchBooth(group, { w, h, d, color, label }) {
      group.add(box(w, h * 0.5, d * 0.4, material('#f8f9fa'), 0, -h * 0.25, d * 0.2));
      group.add(box(w + 0.6, 0.3, d + 0.6, material(color), 0, h / 2 + 1.5, 0));
      [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => group.add(cylinder(0.12, 0.12, h + 1.5, material('#adb5bd'), (sx * w) / 2, 0.75, (sz * d) / 2, 6))));
      const isCoffee = /coffee/i.test(label || '');
      if (isCoffee) {
        for (let i = 0; i < 5; i++) {
          const mug = new THREE.Group();
          mug.add(cylinder(0.35, 0.3, 0.7, material(['#ffffff', '#212529', '#e63946', '#2a9d8f', '#f4a261'][i]), 0, 0, 0, 12));
          const handle = mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12), material('#ffffff'), 0.38, 0, 0);
          mug.add(handle);
          const steam = sphere(0.15, material('#ffffff', { transparent: true, opacity: 0.5 }), 0, 0.6, 0, 6);
          mug.add(steam);
          animate(steam, (time) => { steam.position.y = 0.5 + ((time * 0.8 + i * 0.3) % 1); });
          mug.position.set(-w * 0.35 + i * w * 0.17, h * 0.05 + 0.35, d * 0.2);
          group.add(mug);
        }
      } else {
        ['#495057', '#e63946', '#1d3557', '#2a9d8f'].forEach((hoodieColor, index) => {
          const hoodie = new THREE.Group();
          hoodie.add(box(1.2, 1.4, 0.5, material(hoodieColor, { roughness: 1 }), 0, 0, 0));
          hoodie.add(sphere(0.45, material(hoodieColor, { roughness: 1 }), 0, 0.85, -0.1, 10));
          [-1, 1].forEach((side) => hoodie.add(box(0.35, 1.2, 0.4, material(hoodieColor, { roughness: 1 }), side * 0.8, -0.05, 0)));
          hoodie.position.set(-w * 0.36 + index * w * 0.24, h * 0.35, -d * 0.2);
          group.add(hoodie);
        });
      }
      const caption = textSprite(isCoffee ? 'Infinite Coffee' : 'Dev Wearables', { width: 8 });
      caption.position.y = h / 2 + 3;
      group.add(caption);
      group.userData.merch = isCoffee ? 'mug' : 'hoodie';
    },

    spotlightTower(group, { w, h, color }) {
      group.add(box(w, h, w, material('#495057', { metalness: 0.7, wireframe: false }), 0, 0, 0));
      const head = new THREE.Group();
      head.add(cylinder(0.8, 1.1, 1.6, material('#212529'), 0, 0, 0, 12));
      const beam = mesh(new THREE.ConeGeometry(5, 26, 24, 1, true), material(color, { transparent: true, opacity: 0.08, emissive: color, emissiveIntensity: 1, side: THREE.DoubleSide, depthWrite: false }), 0, -13, 0);
      beam.castShadow = false;
      head.add(beam);
      head.position.y = h / 2 + 0.8;
      head.rotation.x = 0.6;
      group.add(head);
      animate(head, (time) => { head.rotation.z = Math.sin(time * 0.7 + group.position.x) * 0.5; });
    },

    // ------------------------------------------------------------------------
    // Green-Tech Sandbox builders
    // ------------------------------------------------------------------------
    greenFloor(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color, { roughness: 1 })));
      greenTechGroup = group.parent;
    },

    solarArray(group, { w, h, d }) {
      const panelTexture = canvasTexture('solarPanel', 128, 128, (ctx, cw, ch) => {
        ctx.fillStyle = '#0d2b52'; ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = '#7fa6d6'; ctx.lineWidth = 2;
        for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo((i * cw) / 4, 0); ctx.lineTo((i * cw) / 4, ch); ctx.stroke(); }
        for (let i = 0; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(0, (i * ch) / 6); ctx.lineTo(cw, (i * ch) / 6); ctx.stroke(); }
      });
      const panelMaterial = new THREE.MeshStandardMaterial({ map: panelTexture, roughness: 0.2, metalness: 0.6 });
      const rows = Math.floor(d / 4);
      const cols = Math.floor(w / 3.4);
      const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(3, 0.1, 2), panelMaterial, rows * cols);
      const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 6), material('#9e9e9e', { metalness: 0.8 }), rows * cols);
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0));
      let index = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = -w / 2 + 1.7 + c * 3.4;
          const z = -d / 2 + 2 + r * 4;
          matrix.compose(new THREE.Vector3(x, -h / 2 + 1.3, z), rotation, new THREE.Vector3(1, 1, 1));
          panels.setMatrixAt(index, matrix);
          matrix.makeTranslation(x, -h / 2 + 0.6, z);
          posts.setMatrixAt(index, matrix);
          index++;
        }
      }
      panels.castShadow = true;
      group.add(panels, posts);
    },

    windTurbine(group, { h }) {
      group.add(cylinder(0.5, 1, h, material('#f8f9fa'), 0, 0, 0, 12));
      const nacelle = box(1.2, 1.2, 3, material('#e9ecef'), 0, h / 2 + 0.4, 0);
      group.add(nacelle);
      const rotor = new THREE.Group();
      rotor.position.set(0, h / 2 + 0.4, 1.7);
      rotor.add(sphere(0.6, material('#ffffff'), 0, 0, 0, 10));
      for (let i = 0; i < 3; i++) {
        const blade = box(0.6, h * 0.42, 0.12, material('#ffffff'), 0, h * 0.21, 0);
        const holder = new THREE.Group();
        holder.rotation.z = (i / 3) * Math.PI * 2;
        holder.add(blade);
        rotor.add(holder);
      }
      group.add(rotor);
      animate(rotor, (time) => { rotor.rotation.z = time * 1.4 + h; });
    },

    greenDataCenter(group, { w, h, d, color, label }) {
      const side = new THREE.MeshStandardMaterial({ map: repeated(windowsTexture('#cfd8dc', '#b2f2bb'), Math.round(w / 6), Math.round(h / 5)), roughness: 0.5 });
      group.add(mesh(new THREE.BoxGeometry(w, h, d), [side, side, material('#5c940d'), material('#5c940d'), side, side]));
      group.add(box(w, 0.5, d, material('#74b816', { roughness: 1 }), 0, h / 2 + 0.25, 0));
      for (let i = 0; i < 12; i++) group.add(mesh(new THREE.IcosahedronGeometry(1 + (i % 3) * 0.3, 0), material(['#2b8a3e', '#37b24d', '#40c057'][i % 3], { flatShading: true }), -w / 2 + 2 + (i % 6) * (w / 6), h / 2 + 1.2, -d / 4 + Math.floor(i / 6) * (d / 2)));
      // Liquid cooling towers with rising vapor
      [-1, 1].forEach((sideSign) => {
        group.add(cylinder(2, 2.8, 6, material('#dee2e6'), sideSign * (w / 2 + 3.5), -h / 2 + 3, 0, 16));
        const vapor = sphere(1.6, material('#ffffff', { transparent: true, opacity: 0.4 }), sideSign * (w / 2 + 3.5), -h / 2 + 7, 0, 8);
        group.add(vapor);
        animate(vapor, (time) => { const t = (time * 0.4 + sideSign) % 1; vapor.position.y = -h / 2 + 6.5 + t * 5; vapor.material.opacity = 0.45 * (1 - t); vapor.scale.setScalar(1 + t); });
      });
      group.add(facedBox(w * 0.6, 2.4, 0.2, material('#2b8a3e'), new THREE.MeshBasicMaterial({ map: labelTexture(label || 'Green Data Center', { bg: '#2b8a3e', fg: '#ffffff', font: 'bold 40px Segoe UI, Arial, sans-serif' }) }), 0, h / 2 - 2, d / 2 + 0.1));
    },

    greenhouse(group, { w, h, d, label }) {
      const glass = material('#d3f9d8', { transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide });
      const shell = mesh(new THREE.CylinderGeometry(h, h, d, 20, 1, true, 0, Math.PI), glass);
      shell.rotation.z = Math.PI / 2;
      shell.rotation.y = Math.PI / 2;
      shell.position.y = -h / 2;
      shell.scale.set(1, 1, w / (2 * h));
      shell.castShadow = false;
      group.add(shell);
      // Vertical farm racks inside
      for (let rack = 0; rack < 3; rack++) {
        for (let level = 0; level < 3; level++) {
          group.add(box(w * 0.6, 0.1, 1.4, material('#adb5bd'), 0, -h / 2 + 0.6 + level * 1.4, -d / 3 + rack * (d / 3)));
          for (let plant = 0; plant < 6; plant++) group.add(sphere(0.3, material(['#2f9e44', '#66a80f', '#e03131'][(plant + level) % 3]), -w * 0.27 + plant * w * 0.11, -h / 2 + 0.95 + level * 1.4, -d / 3 + rack * (d / 3), 6));
        }
      }
      const caption = textSprite(label || 'Vertical Farm', { width: 9 });
      caption.position.y = h / 2 + 3;
      group.add(caption);
    },

    energyMeter(group, { w, h, d, label }) {
      const display = dynamicCanvas(256, 512);
      group.add(box(w, h, d, material('#212529')));
      group.add(box(w * 0.86, h * 0.92, 0.05, new THREE.MeshBasicMaterial({ map: display.texture }), 0, 0, d / 2 + 0.03));
      const caption = textSprite(label || 'Renewable Energy', { width: 10 });
      caption.position.y = h / 2 + 2;
      group.add(caption);
      energyMeter = display;
      drawEnergyMeter();
    },

    efficiencyLab(group, { w, h, d, label, block }) {
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const texture = canvasTexture('efficiency', 768, 384, (ctx, cw, ch) => {
        ctx.fillStyle = '#0b1f14'; ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = '#b2f2bb'; ctx.font = 'bold 34px Segoe UI, Arial'; ctx.fillText('Energy per 1M items (Wh)', 30, 50);
        [['O(n²) bubble sort', 0.95, '#fa5252'], ['O(n log n) merge sort', 0.22, '#fab005'], ['O(n) counting sort', 0.08, '#40c057'], ['Cached result', 0.02, '#12b886']].forEach(([name, value, barColor], index) => {
          ctx.fillStyle = '#ffffff'; ctx.font = '24px Consolas, monospace'; ctx.fillText(name, 30, 110 + index * 70);
          ctx.fillStyle = barColor; ctx.fillRect(360, 85 + index * 70, value * 380, 34);
        });
      });
      inner.add(box(o.w, h, o.d, material('#343a40')));
      inner.add(box(o.w * 0.94, h * 0.85, 0.05, new THREE.MeshBasicMaterial({ map: texture }), 0, 0, o.d / 2 + 0.03));
      group.add(inner);
      if (label) group.userData.label = label;
    },

    evChargers(group, { w, d }) {
      const count = Math.floor(w / 3);
      for (let i = 0; i < count; i++) {
        const x = -w / 2 + 1.5 + i * 3;
        group.add(box(0.6, 2, 0.5, material('#f8f9fa'), x, 1, -d / 2 + 0.3));
        group.add(box(0.4, 0.3, 0.05, glow('#40c057', 1.2), x, 1.6, -d / 2 + 0.58));
        group.add(box(1.9, 1.3, 4.3, material(['#e9ecef', '#212529', '#1971c2', '#c92a2a'][i % 4], { metalness: 0.5, roughness: 0.3 }), x, 0.65, 0.3));
      }
      group.add(box(w, 0.05, d, material('#495057'), 0, 0.02, 0));
    },

    batteryBank(group, { w, h, d }) {
      const units = Math.floor(w / 2.6);
      for (let i = 0; i < units; i++) {
        group.add(box(2.2, h, d, material('#f1f3f5'), -w / 2 + 1.3 + i * 2.6, 0, 0));
        const level = box(0.3, h * 0.6, 0.05, glow('#40c057', 1), -w / 2 + 1.3 + i * 2.6, 0, d / 2 + 0.03);
        group.add(level);
        animate(level, (time) => { level.scale.y = 0.4 + Math.abs(Math.sin(time * 0.3 + i)) * 0.6; });
      }
    },

    plantingZone(group, { w, h, d, color, label }) {
      group.add(box(w, h, d, material(color, { roughness: 1 })));
      const caption = textSprite(label || 'Planting Zone', { width: 12 });
      caption.position.y = 5;
      group.add(caption);
      group.userData.isPlantingZone = true;
    }
  };

  const rules = [
    [/dungeon_floor/, 'dungeonFloor'], [/dungeon_wall/, 'dungeonWall'], [/dungeon_gate/, 'dungeonGate'], [/dungeon_torch/, 'dungeonTorch'],
    [/git_commit_hammer/, 'gitHammer'], [/bug_monster/, 'bugMonster'], [/scoreboard/, 'scoreboard'],
    [/oss_plaza_floor/, 'ossFloor'], [/oss_main_building/, 'ossBuilding'], [/repo_mural/, 'repoMural'], [/floating_room/, 'floatingRoom'],
    [/decoration_slot/, 'decorationSlot'], [/pr_board/, 'prBoard'],
    [/amphitheater_floor/, 'amphitheaterFloor'], [/amphitheater_seats/, 'amphitheaterSeats'], [/keynote_stage/, 'keynoteStage'],
    [/keynote_screen/, 'keynoteScreen'], [/merch_booth/, 'merchBooth'], [/spotlight_tower/, 'spotlightTower'],
    [/green_floor/, 'greenFloor'], [/solar_array/, 'solarArray'], [/wind_turbine/, 'windTurbine'], [/green_data_center/, 'greenDataCenter'],
    [/greenhouse/, 'greenhouse'], [/energy_meter/, 'energyMeter'], [/efficiency_lab/, 'efficiencyLab'], [/ev_chargers/, 'evChargers'],
    [/battery_bank/, 'batteryBank'], [/planting_zone/, 'plantingZone']
  ];
  rules.slice().reverse().forEach(([pattern, name]) => PropKit.registerBuilder(pattern, name, builders[name]));

  // --------------------------------------------------------------------------
  // Drawing dynamic boards
  // --------------------------------------------------------------------------
  function createHealthBar(monster, height) {
    const bar = dynamicCanvas(256, 48);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: bar.texture, depthWrite: false }));
    sprite.scale.set(4, 0.75, 1);
    sprite.position.y = height / 2 + 1.6;
    sprite.raycast = () => {};
    monster.group.add(sprite);
    const healthBar = { bar, sprite };
    monster.healthBar = healthBar;
    drawHealthBar(monster);
    return healthBar;
  }

  function drawHealthBar(monster) {
    monster.healthBar.bar.redraw((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fillRect(0, 0, w, h);
      const ratio = Math.max(0, monster.hp / monster.maxHp);
      ctx.fillStyle = ratio > 0.5 ? '#40c057' : ratio > 0.25 ? '#fab005' : '#fa5252';
      ctx.fillRect(4, 26, (w - 8) * ratio, 18);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px Segoe UI, Arial';
      ctx.fillText(`${monster.name.replace(' (Boss)', '')}  ${Math.ceil(monster.hp)}/${monster.maxHp}`, 6, 20);
    });
  }

  function drawScoreboard() {
    if (!scoreboard) return;
    scoreboard.redraw((ctx, w, h) => {
      ctx.fillStyle = '#1a1520'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffd54f'; ctx.font = 'bold 30px Georgia, serif'; ctx.fillText('BUG BOUNTY LEADERBOARD', 24, 40);
      const entries = Object.entries(state.scores).sort((a, b) => b[1] - a[1]).slice(0, 5);
      ctx.font = '26px Consolas, monospace';
      if (!entries.length) { ctx.fillStyle = '#bdbdbd'; ctx.fillText('No bugs squashed yet.', 24, 100); }
      entries.forEach(([devTag, score], index) => {
        ctx.fillStyle = index === 0 ? '#ffd54f' : '#ffffff';
        ctx.fillText(`${index + 1}. ${devTag.padEnd(16, ' ')} ${score} bugs`, 24, 90 + index * 34);
      });
    });
  }

  function drawMural(muralId) {
    const mural = murals[muralId];
    if (!mural) return;
    const lines = state.murals[muralId] || [];
    mural.board.redraw((ctx, w, h) => {
      ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#161b22'; ctx.fillRect(0, 0, w, 50);
      ctx.fillStyle = '#c9d1d9'; ctx.font = 'bold 26px Segoe UI, Arial'; ctx.fillText(`mural-${mural.index}.js  —  /mural ${mural.index} <code>`, 18, 34);
      ctx.font = '22px Consolas, monospace';
      const shown = lines.length ? lines.slice(-14) : [{ devTag: 'GitHub Multiverse', text: '// Post your code snippet here!' }];
      shown.forEach((entry, index) => {
        ctx.fillStyle = '#6e7681'; ctx.fillText(String(index + 1).padStart(2, ' '), 14, 84 + index * 30);
        ctx.fillStyle = '#7ee787'; ctx.fillText(entry.text.slice(0, 48), 60, 84 + index * 30);
        ctx.fillStyle = '#8b949e'; ctx.fillText(`// ${entry.devTag}`, 600, 84 + index * 30);
      });
    });
  }

  function drawPrBoard() {
    if (!prBoard) return;
    prBoard.redraw((ctx, w, h) => {
      ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 30px Segoe UI, Arial'; ctx.fillText('Pull Requests', 20, 40);
      ctx.font = '22px Consolas, monospace';
      const open = state.pullRequests.filter((pr) => pr.status === 'open').slice(-8);
      if (!open.length) { ctx.fillStyle = '#8b949e'; ctx.fillText('No open PRs. Try: /pr 3 fountain', 20, 90); }
      open.forEach((pr, index) => {
        ctx.fillStyle = '#3fb950'; ctx.fillText(`#${pr.id}`, 20, 90 + index * 34);
        ctx.fillStyle = '#c9d1d9'; ctx.fillText(`slot ${pr.slot} -> ${pr.item}${pr.color ? ' ' + pr.color : ''} by ${pr.author}`, 90, 90 + index * 34);
        ctx.fillStyle = pr.approvals.length ? '#3fb950' : '#d29922'; ctx.fillText(pr.approvals.length ? 'approved' : 'review', 640, 90 + index * 34);
      });
    });
  }

  // Official YouTube thumbnails (served with CORS by i.ytimg.com); falls back to a title card offline
  function loadThumbnail(entry) {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => { thumbnails[entry.videoId] = image; drawKeynoteScreen(); };
    image.src = `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`;
  }

  function drawVideoCard(ctx, w, h, entry, isMain) {
    const image = thumbnails[entry.videoId];
    if (image) {
      // hqdefault is letterboxed 4:3; crop the 16:9 area
      ctx.drawImage(image, 0, image.height * 0.125, image.width, image.height * 0.75, 0, 0, w, h);
    } else {
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#0b0b0f'); gradient.addColorStop(1, '#2b2d42');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, h - (isMain ? 120 : 70), w, isMain ? 120 : 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${isMain ? 46 : 28}px Segoe UI, Helvetica, Arial`;
    ctx.fillText(entry.title, 24, h - (isMain ? 66 : 36));
    ctx.font = `${isMain ? 26 : 18}px Segoe UI, Helvetica, Arial`;
    ctx.fillStyle = '#d0d0d0';
    ctx.fillText(isMain ? `${entry.subtitle}  ·  click the screen or /watch to play` : entry.subtitle, 24, h - (isMain ? 26 : 12));
    if (isMain) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath(); ctx.arc(w / 2, h / 2 - 40, 46, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ef233c';
      ctx.beginPath(); ctx.moveTo(w / 2 - 14, h / 2 - 66); ctx.lineTo(w / 2 + 24, h / 2 - 40); ctx.lineTo(w / 2 - 14, h / 2 - 14); ctx.fill();
    }
  }

  function playlistEntry(offset) {
    return KEYNOTE_PLAYLIST[(playlistIndex + offset) % KEYNOTE_PLAYLIST.length];
  }

  function embedFor(entry) {
    return { embedUrl: `https://www.youtube.com/embed/${entry.videoId}?autoplay=1`, title: `${entry.title} (${entry.subtitle})` };
  }

  function drawKeynoteScreen() {
    if (!keynoteScreen) return;
    [0, 1].forEach((index) => {
      const side = keynoteScreen[`side${index}`];
      if (side) side.redraw((ctx, w, h) => drawVideoCard(ctx, w, h, playlistEntry(index + 1), false));
    });
    if (!state.stream) {
      keynoteScreen.screen.redraw((ctx, w, h) => drawVideoCard(ctx, w, h, playlistEntry(0), true));
      return;
    }
    keynoteScreen.screen.redraw((ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, '#1b1b3a'); gradient.addColorStop(1, '#3a0ca3');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = state.stream ? '#ef233c' : '#6c757d';
      ctx.beginPath(); ctx.arc(60, 60, 18, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 36px Segoe UI, Arial'; ctx.fillText(state.stream ? 'LIVE NOW' : 'OFF AIR', 90, 73);
      ctx.font = 'bold 64px Segoe UI, Arial';
      ctx.fillText(state.stream ? (state.stream.title || 'Tech Keynote').slice(0, 26) : 'Keynote Amphitheater', 60, 220);
      ctx.font = '30px Segoe UI, Arial'; ctx.fillStyle = '#e0e0e0';
      ctx.fillText(state.stream ? 'Click the screen or type /watch to tune in' : 'Set a live stream with /stream <YouTube or Twitch URL>', 60, 300);
    });
  }

  function drawEnergyMeter() {
    if (!energyMeter) return;
    const percent = Math.min(100, 40 + state.trees.length * 2);
    energyMeter.redraw((ctx, w, h) => {
      ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(70, 60, 116, 380);
      ctx.fillStyle = percent > 80 ? '#40c057' : percent > 55 ? '#82c91e' : '#fab005';
      ctx.fillRect(70, 60 + 380 * (1 - percent / 100), 116, 380 * (percent / 100));
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 44px Segoe UI, Arial'; ctx.textAlign = 'center';
      ctx.fillText(`${percent}%`, w / 2, 45);
      ctx.font = '22px Segoe UI, Arial';
      ctx.fillText(`${state.trees.length} trees planted`, w / 2, 480);
    });
  }

  // --------------------------------------------------------------------------
  // Decorations changed by merged pull requests
  // --------------------------------------------------------------------------
  function buildDecoration(item, color) {
    const decoration = new THREE.Group();
    const c = color || '#2da44e';
    if (item === 'tree') {
      decoration.add(cylinder(0.3, 0.4, 3, material('#6d4c41'), 0, 1.5, 0, 8));
      decoration.add(mesh(new THREE.IcosahedronGeometry(2, 0), material(c, { flatShading: true }), 0, 4, 0));
    } else if (item === 'lamp') {
      decoration.add(cylinder(0.12, 0.15, 5, material('#30363d'), 0, 2.5, 0, 8));
      decoration.add(sphere(0.6, glow(color || '#ffd43b', 1.6), 0, 5.2, 0, 12));
    } else if (item === 'banner') {
      decoration.add(cylinder(0.1, 0.1, 6, material('#8b949e'), -1, 3, 0, 6));
      decoration.add(box(2, 3, 0.08, material(color || '#8250df'), 0, 4.2, 0));
    } else if (item === 'fountain') {
      decoration.add(cylinder(1.5, 1.7, 0.6, material('#d0d7de'), 0, 0.3, 0, 16));
      decoration.add(cylinder(1.3, 1.3, 0.5, material(color || '#54aeff', { transparent: true, opacity: 0.8 }), 0, 0.5, 0, 16));
      const jet = cylinder(0.15, 0.3, 2.5, glow(color || '#54aeff', 0.5, { transparent: true, opacity: 0.7 }), 0, 1.8, 0, 8);
      decoration.add(jet);
      animate(jet, (time) => jet.scale.set(1, 0.7 + Math.sin(time * 4) * 0.3, 1));
    } else if (item === 'duck') {
      decoration.add(sphere(1.1, material(color || '#ffd43b'), 0, 1.1, 0, 14));
      decoration.add(sphere(0.7, material(color || '#ffd43b'), 0, 2.2, 0.6, 14));
      decoration.add(box(0.5, 0.2, 0.5, material('#ff922b'), 0, 2.1, 1.3));
    } else if (item === 'flag') {
      decoration.add(cylinder(0.08, 0.08, 6, material('#d0d7de'), 0, 3, 0, 6));
      const flag = box(2.4, 1.4, 0.05, material(color || '#cf222e'), 1.2, 5.2, 0);
      decoration.add(flag);
      animate(flag, (time) => { flag.rotation.y = Math.sin(time * 3) * 0.25; });
    } else if (item === 'neon') {
      const ring = mesh(new THREE.TorusGeometry(1.4, 0.15, 8, 32), glow(color || '#f778ba', 1.8), 0, 2.2, 0);
      decoration.add(ring);
      animate(ring, (time) => { ring.rotation.y = time; });
    } else if (item === 'bench') {
      decoration.add(box(3, 0.2, 1, material(color || '#8c6239'), 0, 0.7, 0));
      decoration.add(box(3, 0.8, 0.15, material(color || '#8c6239'), 0, 1.2, -0.45));
      [-1.3, 1.3].forEach((x) => decoration.add(box(0.15, 0.7, 0.9, material('#30363d'), x, 0.35, 0)));
    }
    return decoration;
  }

  function applyDecoration(slotId) {
    const slot = decorationSlots[slotId];
    if (!slot) return;
    const decoration = state.decorations[slotId];
    if (slot.current) slot.holder.remove(slot.current);
    slot.current = decoration ? buildDecoration(decoration.item, decoration.color) : null;
    if (slot.current) slot.holder.add(slot.current);
  }

  // --------------------------------------------------------------------------
  // Planted trees in the Green-Tech Sandbox
  // --------------------------------------------------------------------------
  function renderPlantedTrees() {
    plantedTreeGroups.forEach((tree) => tree.parent && tree.parent.remove(tree));
    plantedTreeGroups.length = 0;
    state.trees.forEach((tree) => {
      const group = new THREE.Group();
      group.add(cylinder(0.2, 0.3, 2, material('#6d4c41'), 0, 1, 0, 6));
      group.add(mesh(new THREE.IcosahedronGeometry(1.3, 0), material(['#2f9e44', '#37b24d', '#51cf66'][tree.x > 0 ? 0 : 1], { flatShading: true }), 0, 2.8, 0));
      const tag = textSprite(tree.devTag, { width: 3, font: 'bold 40px Consolas, monospace' });
      tag.position.y = 4.6;
      group.add(tag);
      group.position.set(tree.x, tree.y, tree.z);
      hooks.scene.add(group);
      plantedTreeGroups.push(group);
    });
    drawEnergyMeter();
  }

  // --------------------------------------------------------------------------
  // State synchronization (server events, or local simulation in solo mode)
  // --------------------------------------------------------------------------
  function applyFullState(fullState) {
    Object.assign(state, fullState);
    Object.values(monsters).forEach((monster) => {
      const remote = state.monsters[monster.id];
      if (remote) setMonsterHp(monster, remote.hp, remote.alive);
    });
    Object.keys(murals).forEach(drawMural);
    Object.keys(decorationSlots).forEach(applyDecoration);
    drawPrBoard();
    drawScoreboard();
    drawKeynoteScreen();
    renderPlantedTrees();
  }

  function setMonsterHp(monster, hp, alive) {
    monster.hp = hp;
    monster.alive = alive;
    monster.group.visible = alive;
    drawHealthBar(monster);
  }

  const receive = {
    monster_update({ id, hp, alive, by, damage }) {
      const monster = monsters[id];
      state.monsters[id] = { hp, alive };
      if (!monster) return;
      const wasAlive = monster.alive;
      setMonsterHp(monster, hp, alive);
      if (damage && alive) {
        monster.body.scale.setScalar(0.8);
        setTimeout(() => monster.body.scale.setScalar(1), 120);
      }
      if (wasAlive && !alive) hooks.system(`${by} squashed ${monster.name}! It will respawn in 30s.`);
      if (!wasAlive && alive) hooks.system(`${monster.name} respawned in the Debug Dungeon.`);
    },
    scores(scores) { state.scores = scores; drawScoreboard(); },
    murals(muralState) { state.murals = muralState; Object.keys(murals).forEach(drawMural); },
    pull_requests({ pullRequests, decorations, message }) {
      state.pullRequests = pullRequests;
      state.decorations = decorations;
      Object.keys(decorationSlots).forEach(applyDecoration);
      drawPrBoard();
      if (message) hooks.system(message);
    },
    stream(stream) {
      state.stream = stream;
      drawKeynoteScreen();
      if (keynoteVideo) {
        const live = stream && stream.embedUrl ? `${stream.embedUrl}${stream.embedUrl.includes('?') ? '&' : '?'}autoplay=1&mute=1` : null;
        keynoteVideo.setSource(live || VideoScreens.youtubeEmbed(KEYNOTE_PLAYLIST.map((entry) => entry.videoId)));
      }
      if (stream) hooks.system(`Live stream set on the Keynote screen: ${stream.title}. Type /watch.`);
    },
    trees(trees) { state.trees = trees; window.multiverseTreeCount = trees.length; renderPlantedTrees(); }
  };

  // Local simulation used only in solo mode (no server)
  const localServer = {
    monster_hit({ id, damage }) {
      const monster = monsters[id];
      if (!monster || !monster.alive) return;
      if (hooks.lensActive && hooks.lensActive()) damage *= 2;
      const hp = Math.max(0, monster.hp - damage);
      const alive = hp > 0;
      receive.monster_update({ id, hp, alive, by: hooks.localTag(), damage });
      if (!alive) {
        state.scores[hooks.localTag()] = (state.scores[hooks.localTag()] || 0) + 1;
        receive.scores(state.scores);
        setTimeout(() => receive.monster_update({ id, hp: monster.maxHp, alive: true }), 30000);
      }
    },
    mural_post({ muralId, text }) {
      state.murals[muralId] = [...(state.murals[muralId] || []), { devTag: hooks.localTag(), text }].slice(-30);
      receive.murals(state.murals);
    },
    pr_open({ slot, item, color }) {
      const id = state.pullRequests.length + 1;
      state.pullRequests.push({ id, slot, item, color, author: hooks.localTag(), approvals: [], status: 'open' });
      receive.pull_requests({ pullRequests: state.pullRequests, decorations: state.decorations, message: `PR #${id} opened. Solo mode: you can /merge ${id} right away.` });
    },
    pr_review({ id, action }) {
      const pr = state.pullRequests.find((candidate) => candidate.id === id);
      if (!pr || pr.status !== 'open') return hooks.system(`PR #${id} is not open.`);
      if (action === 'approve') pr.approvals.push(hooks.localTag());
      if (action === 'close') pr.status = 'closed';
      if (action === 'merge') {
        pr.status = 'merged';
        state.decorations[`slot${pr.slot}`] = { item: pr.item, color: pr.color };
      }
      receive.pull_requests({ pullRequests: state.pullRequests, decorations: state.decorations, message: `PR #${id} ${action === 'approve' ? 'approved' : action === 'close' ? 'closed' : 'merged into the map'}.` });
    },
    stream_set(stream) { receive.stream(stream.url === null ? null : stream); },
    plant_tree(tree) { state.trees = [...state.trees, { ...tree, devTag: hooks.localTag() }].slice(-150); receive.trees(state.trees); }
  };

  function send(event, payload) {
    if (hooks.socket && hooks.socket.connected) hooks.socket.emit(event, payload);
    else if (localServer[event]) localServer[event](payload);
  }

  // --------------------------------------------------------------------------
  // Public API used by main.js
  // --------------------------------------------------------------------------
  function init(options) {
    hooks = options;
    if (hooks.socket) {
      hooks.socket.on('game_state', applyFullState);
      Object.keys(receive).forEach((event) => hooks.socket.on(event, receive[event]));
    }
  }

  function findMonster(object) {
    let node = object;
    while (node) {
      if (node.userData.monsterId) return monsters[node.userData.monsterId];
      node = node.parent;
    }
    return null;
  }

  function nearestMonster(position, maxDistance) {
    let best = null;
    let bestDistance = maxDistance;
    Object.values(monsters).forEach((monster) => {
      if (!monster.alive) return;
      const distance = monster.group.getWorldPosition(new THREE.Vector3()).distanceTo(position);
      if (distance < bestDistance) { best = monster; bestDistance = distance; }
    });
    return best;
  }

  // Returns true when the click was consumed by a game object
  function handleClick(object) {
    let node = object;
    while (node) {
      if (node.userData.monsterId) {
        const monster = monsters[node.userData.monsterId];
        if (!localToolEquipped) {
          hooks.system('You need the Git Commit Hammer! Grab it at the dungeon entrance (or use /script <name>).');
        } else if (monster.alive) {
          send('monster_hit', { id: monster.id, damage: HAMMER_DAMAGE, tool: 'hammer' });
        }
        return true;
      }
      if (node.userData.isHammer) {
        localToolEquipped = true;
        hooks.setWearable('hammer');
        hooks.system('You equipped the Git Commit Hammer. Click bugs to squash them! Scripts: /script gc | try-catch | break | mutex | unit-test | reboot');
        return true;
      }
      if (node.userData.isKeynoteScreen) {
        if (node.userData.playlistOffset) hooks.openStream(embedFor(playlistEntry(node.userData.playlistOffset)));
        else openStream();
        return true;
      }
      if (node.userData.merch) {
        hooks.setWearable(node.userData.merch);
        hooks.system(`You are now wearing: ${node.userData.merch}. Try /wear hoodie | mug | cap | headphones | none`);
        return true;
      }
      node = node.parent;
    }
    return false;
  }

  function openStream() {
    hooks.openStream(state.stream || embedFor(playlistEntry(0)));
  }

  // Converts a YouTube or Twitch URL into an embeddable player URL
  function toEmbedUrl(rawUrl) {
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
      return /^\w{3,25}$/.test(channel || '') ? `https://player.twitch.tv/?channel=${channel}&parent=${location.hostname}` : null;
    }
    return null;
  }

  // Chat commands owned by the interactive districts. Returns true if handled.
  function command(name, args, context) {
    switch (name) {
      case 'script': {
        const scriptName = (args[0] || '').toLowerCase();
        const valid = ['gc', 'try-catch', 'break', 'mutex', 'unit-test', 'reboot'];
        if (!valid.includes(scriptName)) { hooks.system(`Scripts: ${valid.join(', ')}`); return true; }
        const now = performance.now();
        if (now - lastScriptTime < 2500) { hooks.system('Script on cooldown...'); return true; }
        const target = nearestMonster(context.cursorPosition, 18);
        if (!target) { hooks.system('No bug within 18m of your cursor. Move closer!'); return true; }
        lastScriptTime = now;
        const isWeakness = target.weakness === scriptName;
        send('monster_hit', { id: target.id, damage: isWeakness ? SCRIPT_DAMAGE.weak : SCRIPT_DAMAGE.normal, tool: scriptName });
        hooks.system(`Ran ${scriptName} on ${target.name}${isWeakness ? ' — SUPER EFFECTIVE!' : '.'}`);
        return true;
      }
      case 'mural': {
        const index = parseInt(args[0], 10);
        const text = args.slice(1).join(' ').trim();
        if (!(index >= 1 && index <= 4) || !text) { hooks.system('Usage: /mural <1-4> <code>'); return true; }
        send('mural_post', { muralId: `mural${index}`, text: text.slice(0, 80) });
        return true;
      }
      case 'pr': {
        const slot = parseInt(args[0], 10);
        const item = (args[1] || '').toLowerCase();
        const color = /^#?[0-9a-f]{6}$/i.test(args[2] || '') ? `#${args[2].replace('#', '')}` : null;
        if (!(slot >= 1 && slot <= 8) || !DECOR_ITEMS.includes(item)) { hooks.system(`Usage: /pr <1-8> <${DECOR_ITEMS.join('|')}> [hexcolor]`); return true; }
        send('pr_open', { slot, item, color });
        return true;
      }
      case 'prs': {
        const open = state.pullRequests.filter((pr) => pr.status === 'open');
        hooks.system(open.length ? open.map((pr) => `#${pr.id} slot ${pr.slot} -> ${pr.item} by ${pr.author} (${pr.approvals.length} approvals)`).join(' | ') : 'No open pull requests.');
        return true;
      }
      case 'approve':
      case 'merge':
      case 'close': {
        const id = parseInt(args[0], 10);
        if (!id) { hooks.system(`Usage: /${name} <pr number>`); return true; }
        send('pr_review', { id, action: name });
        return true;
      }
      case 'stream': {
        const embedUrl = toEmbedUrl(args[0] || '');
        if (!embedUrl) { hooks.system('Usage: /stream <youtube.com/watch?v=..., youtu.be/..., or twitch.tv/channel URL> [title]'); return true; }
        send('stream_set', { url: args[0], embedUrl, title: args.slice(1).join(' ').slice(0, 40) || 'Tech Keynote' });
        return true;
      }
      case 'watch': {
        const pick = parseInt(args[0], 10);
        if (pick >= 1 && pick <= KEYNOTE_PLAYLIST.length) hooks.openStream(embedFor(KEYNOTE_PLAYLIST[pick - 1]));
        else openStream();
        return true;
      }
      case 'keynotes':
        hooks.system(`Keynote playlist (official Apple YouTube channel): ${KEYNOTE_PLAYLIST.map((entry, index) => `${index + 1}. ${entry.title}`).join(' | ')} — /watch <number>`);
        return true;
      case 'endstream':
        send('stream_set', { url: null });
        return true;
      case 'wear': {
        const item = (args[0] || '').toLowerCase();
        if (!WEARABLES.includes(item)) { hooks.system(`Usage: /wear <${WEARABLES.join('|')}>`); return true; }
        hooks.setWearable(item === 'none' ? null : item);
        localToolEquipped = false;
        return true;
      }
      case 'plant': {
        if (!context.greenTechContains(context.cursorPosition)) { hooks.system('Point your cursor inside the Green-Tech Sandbox to plant a tree (/world greentech).'); return true; }
        send('plant_tree', { x: context.cursorPosition.x, y: context.cursorPosition.y, z: context.cursorPosition.z });
        return true;
      }
      case 'energy': {
        hooks.system(`Green-Tech Sandbox runs on ${Math.min(100, 40 + state.trees.length * 2)}% renewable energy (${state.trees.length} trees planted).`);
        return true;
      }
      case 'bugs': {
        const alive = Object.values(monsters).filter((monster) => monster.alive);
        hooks.system(alive.length ? `Bugs alive: ${alive.map((monster) => `${monster.name} (${Math.ceil(monster.hp)} HP, weak to ${monster.weakness})`).join(', ')}` : 'The dungeon is bug-free... for now.');
        return true;
      }
      default:
        return false;
    }
  }

  function equipHammer() {
    localToolEquipped = true;
    hooks.setWearable('hammer');
    hooks.system('Git Commit Hammer equipped. Click bugs in the Debug Dungeon to squash them!');
  }

  return { init, handleClick, command, toEmbedUrl, findMonster, equipHammer, WEARABLES, DECOR_ITEMS, get greenTechGroup() { return greenTechGroup; } };
})();
