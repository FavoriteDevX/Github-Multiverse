// ============================================================================
// GENESIS CITY SCENES: HOLO WORKSPACE, PARKOUR PARK AND WELCOME HALL DETAILS
// ============================================================================
(() => {
  const { material, glow, shade, mesh, box, cylinder, sphere, facedBox, animate, textSprite, labelTexture, repeated, plankTexture, roundedSlab, laptop, interactive, canvasTexture } = PropKit.kit;

  function acrylic(color, opacity = 0.55) {
    return material(color, { transparent: true, opacity, roughness: 0.05, metalness: 0.1, emissive: color, emissiveIntensity: 0.25 });
  }

  const builders = {
    // Pastel gradient floor for the futuristic workspace
    gradientFloor(group, { w, h, d }) {
      const texture = canvasTexture('gradientFloor', 512, 512, (ctx, cw, ch) => {
        const gradient = ctx.createLinearGradient(0, 0, cw, ch);
        gradient.addColorStop(0, '#f6c6ea');
        gradient.addColorStop(0.5, '#c4d7ff');
        gradient.addColorStop(1, '#ffd6a5');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, cw, ch);
      });
      group.add(box(w, h, d, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.25, metalness: 0.2 })));
    },

    glassWall(group, { w, h, d, color }) {
      const pane = box(w, h, d, acrylic(color || '#a5d8ff', 0.25));
      pane.castShadow = false;
      group.add(pane);
      group.add(box(w + 0.1, 0.2, d + 0.1, material('#dee2e6', { metalness: 0.7 }), 0, h / 2, 0));
    },

    // Translucent long table with acrylic chairs and laptops (simulated work)
    glassTable(group, { w, h, d, color }) {
      const along = w > d;
      group.add(box(w, 0.12, d, acrylic(color || '#74c0fc', 0.6), 0, h / 2, 0));
      [-1, 1].forEach((side) => group.add(box(along ? 0.15 : w * 0.9, h, along ? d * 0.9 : 0.15, acrylic(color || '#74c0fc', 0.45), along ? side * (w / 2 - 0.3) : 0, 0, along ? 0 : side * (d / 2 - 0.3))));
      const length = Math.max(w, d);
      const seats = Math.floor(length / 1.8);
      for (let i = 0; i < seats; i++) {
        const t = -length / 2 + (length / seats) * (i + 0.5);
        [-1, 1].forEach((side) => {
          const chair = new THREE.Group();
          chair.add(box(0.75, 0.1, 0.75, acrylic('#ff922b', 0.6), 0, 0.55, 0));
          chair.add(box(0.75, 0.9, 0.1, acrylic('#ff922b', 0.6), 0, 1, -0.35));
          [-0.3, 0.3].forEach((x) => chair.add(box(0.08, 0.55, 0.7, acrylic('#ff922b', 0.5), x, 0.27, 0)));
          const offset = (along ? d : w) / 2 + 0.7;
          if (along) chair.position.set(t, -h / 2, side * offset); else chair.position.set(side * offset, -h / 2, t);
          chair.rotation.y = along ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
          group.add(interactive(chair, 'sit', 'Acrylic chair'));
          const inset = (along ? d : w) / 2 - 0.4;
          const facing = along ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
          group.add(along ? laptop(t, h / 2 + 0.06, side * inset, facing) : laptop(side * inset, h / 2 + 0.06, t, facing));
        });
      }
    },

    roundSofa(group, { w, h, color }) {
      const radius = w / 2;
      const seat = mesh(new THREE.CylinderGeometry(radius, radius, h * 0.4, 48, 1, false, Math.PI * 0.2, Math.PI * 1.3), acrylic(color || '#1c7ed6', 0.8), 0, -h * 0.3, 0);
      group.add(interactive(seat, 'sit', 'Lounge sofa'));
      const back = mesh(new THREE.CylinderGeometry(radius + 0.2, radius + 0.2, h, 48, 1, true, Math.PI * 0.2, Math.PI * 1.3), acrylic(shade(color || '#1c7ed6', -0.1), 0.8), 0, 0, 0);
      back.material.side = THREE.DoubleSide;
      group.add(back);
      group.add(cylinder(radius * 0.45, radius * 0.45, h * 0.3, acrylic('#22b8cf', 0.7), radius * 0.9, -h * 0.35, radius * 0.4, 32));
    },

    // Live leaderboard of laptop commits (updated by main.js through window.updateCommitBoard)
    commitBoard(group, { w, h, d }) {
      const canvas = document.createElement('canvas');
      canvas.width = 768;
      canvas.height = 432;
      const texture = new THREE.CanvasTexture(canvas);
      const draw = (entries) => {
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 768, 432);
        gradient.addColorStop(0, '#0d1b3e');
        gradient.addColorStop(1, '#1877f2');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 768, 432);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px Segoe UI, Arial';
        ctx.fillText('Commit Leaderboard', 30, 60);
        ctx.font = '28px Consolas, monospace';
        const list = (entries || []).slice(0, 7);
        if (!list.length) ctx.fillText('Sit at a laptop (E) and ship some code!', 30, 140);
        list.forEach(([name, commits], index) => ctx.fillText(`${index + 1}. ${name.padEnd(16, ' ')} ${commits} commits`, 30, 120 + index * 42));
        texture.needsUpdate = true;
      };
      draw([]);
      window.commitBoards = window.commitBoards || [];
      window.commitBoards.push(draw);
      group.add(box(w, h, d, material('#212529')));
      group.add(box(w * 0.95, h * 0.9, 0.05, new THREE.MeshBasicMaterial({ map: texture }), 0, 0, d / 2 + 0.03));
      [-1, 1].forEach((side) => group.add(box(0.3, h, 0.3, material('#adb5bd', { metalness: 0.7 }), side * w * 0.4, -h, 0)));
    },

    // Parkour Park (Toki Land style): red platforms, spinning coins, start/finish pads
    parkourPlatform(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color || '#e03131', { roughness: 0.5 })));
      group.add(box(w + 0.05, 0.08, d + 0.05, material(shade(color || '#e03131', 0.15)), 0, h / 2, 0));
    },

    coin(group, { data }) {
      const coin = cylinder(0.45, 0.45, 0.1, material('#fcc419', { metalness: 0.8, roughness: 0.25, emissive: '#f59f00', emissiveIntensity: 0.4 }), 0, 0, 0, 20);
      coin.rotation.x = Math.PI / 2;
      group.add(coin);
      animate(group, (time) => { coin.rotation.z = time * 3; coin.position.y = Math.sin(time * 2 + group.position.x) * 0.15; });
      group.userData.collectible = { id: data.id || `${data.position}` };
      window.parkourCoins = window.parkourCoins || [];
      window.parkourCoins.push(group);
    },

    parkourPad(group, { w, h, label, type }) {
      const isStart = /start/.test(type);
      group.add(cylinder(w / 2, w / 2, h, glow(isStart ? '#40c057' : '#fab005', 0.7), 0, 0, 0, 24));
      const flag = new THREE.Group();
      flag.add(cylinder(0.06, 0.06, 4, material('#dee2e6'), 0, 2, 0, 6));
      const cloth = box(1.6, 1, 0.05, material(isStart ? '#40c057' : '#212529'), 0.8, 3.5, 0);
      flag.add(cloth);
      flag.position.set(w / 2 - 0.4, h / 2, 0);
      group.add(flag);
      animate(cloth, (time) => { cloth.rotation.y = Math.sin(time * 3) * 0.3; });
      const caption = textSprite(label || (isStart ? 'START' : 'FINISH'), { width: 6, background: isStart ? 'rgba(64, 192, 87, 0.9)' : 'rgba(250, 176, 5, 0.9)' });
      caption.position.y = 5;
      group.add(caption);
      group.userData.parkourPad = isStart ? 'start' : 'finish';
      window.parkourPads = window.parkourPads || [];
      window.parkourPads.push(group);
    },

    purpleRocks(group, { w, h, d }) {
      // Faceted amethyst rocks with orange moss, a pool on top and a waterfall
      const rock = material('#7048e8', { flatShading: true, roughness: 0.75 });
      const dark = material('#5f3dc4', { flatShading: true, roughness: 0.8 });
      const moss = material('#f59f00', { flatShading: true, roughness: 1 });
      for (let i = 0; i < 9; i++) {
        const size = w * (0.16 + (i % 3) * 0.06);
        const peak = mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? rock : dark, ((i * 37) % 10 / 10 - 0.5) * w * 0.75, -h / 2 + size * (0.8 + (i % 4) * 0.35), ((i * 53) % 10 / 10 - 0.5) * d * 0.75);
        peak.scale.y = 1.4 + (i % 3) * 0.4;
        peak.rotation.set(i, i * 2, 0);
        group.add(peak);
        const cap = mesh(new THREE.DodecahedronGeometry(size * 0.55, 0), moss, peak.position.x, peak.position.y + size * peak.scale.y * 0.75, peak.position.z);
        cap.scale.y = 0.3;
        group.add(cap);
      }
      const pool = cylinder(w * 0.2, w * 0.2, 0.2, material('#66d9e8', { roughness: 0.1, emissive: '#3bc9db', emissiveIntensity: 0.25 }), 0, h * 0.3, d * 0.15, 20);
      group.add(pool);
      const fallTexture = PropKit.kit.canvasTexture('tokiFall', 64, 256, (ctx, cw, ch) => {
        ctx.fillStyle = '#99e9f2';
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        for (let i = 0; i < 30; i++) ctx.fillRect((i * 13) % cw, (i * 37) % ch, 3, 18);
      });
      const fallMap = repeated(fallTexture, 1, 2);
      const fall = box(w * 0.22, h * 0.8, 0.2, new THREE.MeshStandardMaterial({ map: fallMap, transparent: true, opacity: 0.85, emissive: '#99e9f2', emissiveIntensity: 0.35 }), 0, -h * 0.1, d / 2);
      fall.castShadow = false;
      group.add(fall);
      animate(fall, (time) => { fallMap.offset.y = time * 1.2; });
    },

    // Waterfall pouring from a floating island all the way down to a plaza on
    // the ground, with a splash pond and an elevator back up to the island
    skyWaterfall(group, { w, h, data }) {
      const waterTexture = PropKit.kit.canvasTexture('skyFall', 64, 256, (ctx, cw, ch) => {
        ctx.fillStyle = '#74c0fc';
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        for (let i = 0; i < 40; i++) ctx.fillRect((i * 11) % cw, (i * 47) % ch, 2 + (i % 3), 24);
      });
      const map = repeated(waterTexture, 1, h / 6);
      const stream = mesh(new THREE.CylinderGeometry(w * 0.35, w * 0.55, h, 16, 1, true), new THREE.MeshStandardMaterial({ map, transparent: true, opacity: 0.8, emissive: '#74c0fc', emissiveIntensity: 0.3, side: THREE.DoubleSide, depthWrite: false }), 0, -h / 2, 0);
      stream.castShadow = false;
      stream.raycast = () => {};
      group.add(stream);
      // Mist where the water lands
      const mist = [];
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#e7f5ff', transparent: true, opacity: 0.35, depthWrite: false }));
        puff.raycast = () => {};
        puff.userData.phase = i / 6;
        group.add(puff);
        mist.push(puff);
      }
      // Plaza below: pavers, a round splash pond, benches and the elevator
      const plaza = new THREE.Group();
      plaza.position.y = -h;
      plaza.add(cylinder(w * 4, w * 4, 0.3, new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.cobbleTexture('#d8c3a5'), 4, 4), roughness: 0.9 }), 0, 0.15, 0, 48));
      plaza.add(cylinder(w * 1.6, w * 1.7, 0.6, material('#f1ece4'), 0, 0.3, 0, 32));
      const pond = cylinder(w * 1.45, w * 1.45, 0.1, material('#4dabf7', { roughness: 0.05, metalness: 0.3, emissive: '#1c7ed6', emissiveIntensity: 0.2 }), 0, 0.62, 0, 32);
      pond.raycast = () => {};
      plaza.add(pond);
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const bench = new THREE.Group();
        bench.add(box(2.2, 0.12, 0.6, material('#c9a27a'), 0, 0.55, 0));
        [-0.9, 0.9].forEach((dx) => bench.add(box(0.1, 0.55, 0.5, material('#495057'), dx, 0.27, 0)));
        bench.position.set(Math.cos(angle) * w * 2.6, 0.3, Math.sin(angle) * w * 2.6);
        bench.rotation.y = -angle + Math.PI / 2;
        plaza.add(interactive(bench, 'sit', 'Waterfall plaza bench'));
      }
      const elevator = new THREE.Group();
      elevator.add(cylinder(1.4, 1.4, 0.3, glow('#2ed573', 0.8), 0, 0.45, 0, 24));
      elevator.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 4, 24, 1, true), material('#cfe8ff', { transparent: true, opacity: 0.25, side: THREE.DoubleSide }), 0, 2.4, 0));
      const beam = mesh(new THREE.CylinderGeometry(0.6, 0.6, h, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#b2f2bb', transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }), 0, h / 2, 0);
      beam.raycast = () => {};
      elevator.add(beam);
      const caption = textSprite('Elevator · up to the floating island (E)', { width: 8, background: 'rgba(46, 213, 115, 0.9)' });
      caption.position.y = 5.2;
      elevator.add(caption);
      elevator.position.set(w * 3, 0.3, 0);
      // data.top: landing spot on the island, relative to the top of the waterfall
      const target = (data && data.top) || [0, 2.5, 0];
      elevator.userData.destination = new THREE.Vector3(target[0], target[1] + h, target[2]);
      plaza.add(interactive(elevator, 'warp', 'Up to the floating island'));
      group.add(plaza);
      animate(stream, (time) => {
        map.offset.y = time * 1.6;
        mist.forEach((puff, i) => {
          const t = (time * 0.4 + puff.userData.phase) % 1;
          puff.position.set(Math.sin(i * 2.1) * w * t * 1.5, -h + 0.8 + t * 3, Math.cos(i * 2.1) * w * t * 1.5);
          puff.scale.setScalar(1.5 + t * 4);
          puff.material.opacity = 0.35 * (1 - t);
        });
      });
      group.userData.label = 'Sky waterfall';
    },

    // Tropical beach arena (Decentraland style): sandy island in the sea, a
    // curved stone wall with red and yellow banners and torches, curved palm
    // trees, glowing teal paths, a portal arch, a statue, a boardwalk pier,
    // beach chairs and umbrellas
    beachArena(group, { w, h }) {
      const radius = w / 2;
      const sand = new THREE.MeshStandardMaterial({ map: PropKit.kit.canvasTexture('beachSand', 512, 512, (ctx, cw, ch) => {
        ctx.fillStyle = '#f2dca2'; ctx.fillRect(0, 0, cw, ch);
        let seed = 9;
        const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < 4000; i++) { ctx.fillStyle = ['#e9cf8e', '#f7e6b5', '#dcc07c', '#fff1c9'][i % 4]; ctx.fillRect(random() * cw, random() * ch, 2, 2); }
        for (let i = 0; i < 30; i++) { ctx.strokeStyle = 'rgba(200, 170, 110, 0.35)'; ctx.lineWidth = 3; ctx.beginPath(); const y = random() * ch; ctx.moveTo(0, y); ctx.bezierCurveTo(cw * 0.3, y + 10, cw * 0.6, y - 10, cw, y); ctx.stroke(); }
      }), roughness: 1 });
      sand.map.wrapS = sand.map.wrapT = THREE.RepeatWrapping;
      sand.map.repeat.set(4, 4);
      group.add(cylinder(radius * 0.82, radius * 0.86, 0.6, sand, 0, 0, 0, 64));
      // Sea around the island with moving waves
      const waveMap = PropKit.kit.canvasTexture('seaWaves', 256, 256, (ctx, cw, ch) => {
        ctx.fillStyle = '#2bb3d6'; ctx.fillRect(0, 0, cw, ch);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; ctx.lineWidth = 3;
        for (let y = 0; y < ch; y += 24) { ctx.beginPath(); for (let x = 0; x <= cw; x += 8) { const yy = y + Math.sin(x / 20) * 4; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke(); }
      });
      const sea = repeated(waveMap, 6, 6);
      const water = mesh(new THREE.RingGeometry(radius * 0.8, radius * 1.15, 64), new THREE.MeshStandardMaterial({ map: sea, transparent: true, opacity: 0.92, roughness: 0.1, metalness: 0.2 }), 0, -0.05, 0);
      water.rotation.x = -Math.PI / 2;
      water.receiveShadow = true;
      group.add(water);
      // Glowing teal paths: an inner ring and radial lines
      const teal = glow('#63e6be', 1.2);
      const ring = mesh(new THREE.RingGeometry(radius * 0.38, radius * 0.4, 64), teal, 0, 0.32, 0);
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const line = box(0.25, 0.03, radius * 0.4, teal, Math.cos(angle) * radius * 0.6, 0.32, Math.sin(angle) * radius * 0.6);
        line.rotation.y = -angle + Math.PI / 2;
        group.add(line);
      }
      // Curved stone wall (back half) with banners and torches
      const stone = material('#a8a29a', { roughness: 0.9, flatShading: true });
      const wallArc = Math.PI * 1.1;
      group.add(mesh(new THREE.CylinderGeometry(radius * 0.74, radius * 0.74, 3, 48, 1, true, Math.PI - wallArc / 2, wallArc), new THREE.MeshStandardMaterial({ color: '#a8a29a', roughness: 0.9, side: THREE.DoubleSide }), 0, 1.8, 0));
      const torches = [];
      for (let i = 0; i <= 8; i++) {
        const angle = Math.PI - wallArc / 2 + (i / 8) * wallArc;
        const x = Math.sin(angle) * radius * 0.74;
        const z = Math.cos(angle) * radius * 0.74;
        group.add(box(1.2, 4.2, 1.2, stone, x, 2.4, z));
        const flame = mesh(new THREE.ConeGeometry(0.3, 0.8, 6), glow('#ff922b', 2.4, { transparent: true, opacity: 0.9 }), x, 5, z);
        flame.raycast = () => {};
        group.add(flame);
        torches.push(flame);
        if (i < 8) {
          const mid = angle + wallArc / 16;
          const banner = box(1.2, 2.2, 0.08, material(i % 2 ? '#c92a2a' : '#f59f00', { roughness: 0.9 }), Math.sin(mid) * (radius * 0.74 - 0.3), 3.4, Math.cos(mid) * (radius * 0.74 - 0.3));
          banner.rotation.y = mid + Math.PI;
          group.add(banner);
        }
      }
      // Curved palm trees
      const palms = [[radius * 0.5, radius * 0.45], [-radius * 0.55, radius * 0.4], [radius * 0.6, -radius * 0.15], [-radius * 0.35, -radius * 0.55], [radius * 0.15, radius * 0.66]];
      palms.forEach(([x, z], i) => {
        const lean = new THREE.Vector3(i % 2 ? 1.6 : -1.4, 0, 0.8);
        const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.3, z), new THREE.Vector3(x + lean.x * 0.3, 3, z + lean.z * 0.3), new THREE.Vector3(x + lean.x, 6.5, z + lean.z)]);
        group.add(mesh(new THREE.TubeGeometry(curve, 16, 0.22, 8, false), material('#8d6e4f', { roughness: 1 })));
        const top = curve.getPoint(1);
        for (let k = 0; k < 7; k++) {
          const angle = (k / 7) * Math.PI * 2;
          const leaf = mesh(new THREE.ConeGeometry(0.45, 3.2, 4), material(k % 2 ? '#2f9e44' : '#37b24d', { flatShading: true }), top.x + Math.cos(angle) * 1.2, top.y - 0.2, top.z + Math.sin(angle) * 1.2);
          leaf.rotation.set(Math.sin(angle) * 1.2, 0, -Math.cos(angle) * 1.2);
          leaf.scale.z = 0.25;
          group.add(leaf);
        }
        [0.3, -0.3].forEach((dx) => group.add(sphere(0.22, material('#6d4c41'), top.x + dx, top.y - 0.5, top.z, 8)));
      });
      // Portal arch (golden frame with a glowing teal surface): back to Genesis Plaza
      const portal = new THREE.Group();
      portal.add(mesh(new THREE.TorusGeometry(2.2, 0.35, 10, 32, Math.PI), material('#e0b84c', { metalness: 0.6, roughness: 0.3 }), 0, 3, 0));
      [-2.2, 2.2].forEach((x) => portal.add(box(0.7, 3, 0.7, material('#e0b84c', { metalness: 0.6 }), x, 1.5, 0)));
      const surface = mesh(new THREE.CircleGeometry(2, 32, 0, Math.PI), glow('#66d9e8', 1.2, { transparent: true, opacity: 0.75, side: THREE.DoubleSide }), 0, 3, 0);
      portal.add(surface);
      portal.add(box(3.8, 3, 0.05, glow('#66d9e8', 1.2, { transparent: true, opacity: 0.75 }), 0, 1.5, 0));
      portal.userData.label = 'Portal · back to Genesis Plaza';
      portal.position.set(radius * 0.45, 0.3, -radius * 0.42);
      portal.rotation.y = -0.7;
      group.add(interactive(portal, 'jump', 'plaza'));
      // Statue of a diver on a pedestal in the center
      group.add(cylinder(1.4, 1.6, 1.2, stone, 0, 0.9, -radius * 0.2, 12));
      const statue = new THREE.Group();
      statue.add(cylinder(0.45, 0.35, 1.8, material('#5c6b73', { roughness: 0.5 }), 0, 1, 0, 12));
      statue.add(sphere(0.38, material('#5c6b73'), 0, 2.2, 0, 16));
      [-1, 1].forEach((side) => { const arm = cylinder(0.12, 0.1, 1.4, material('#5c6b73'), side * 0.55, 2.2, 0, 8); arm.rotation.z = side * -0.6; statue.add(arm); });
      statue.position.set(0, 1.5, -radius * 0.2);
      group.add(statue);
      // Boardwalk pier into the sea
      for (let i = 0; i < 12; i++) group.add(box(3, 0.15, 0.8, material(i % 2 ? '#a47148' : '#b5835a'), 0, 0.45, radius * 0.6 + i * 0.85));
      [-1.4, 1.4].forEach((x) => { for (let i = 0; i < 4; i++) group.add(cylinder(0.12, 0.12, 1.4, material('#6d4c41'), x, -0.1, radius * 0.62 + i * 3, 6)); });
      // Beach chairs (sit) and umbrellas
      [[-radius * 0.3, radius * 0.2], [-radius * 0.15, radius * 0.3], [radius * 0.25, radius * 0.18]].forEach(([x, z], i) => {
        const chair = new THREE.Group();
        chair.add(box(0.9, 0.15, 1.8, material(['#ff6b6b', '#4dabf7', '#ffd43b'][i]), 0, 0.5, 0));
        const back = box(0.9, 0.12, 1, material(['#ff6b6b', '#4dabf7', '#ffd43b'][i]), 0, 0.85, -0.85);
        back.rotation.x = -0.9;
        chair.add(back);
        chair.position.set(x, 0.3, z);
        group.add(interactive(chair, 'sit', 'Beach chair'));
        group.add(cylinder(0.05, 0.05, 3, material('#f8f9fa'), x + 1.2, 1.8, z, 6));
        group.add(mesh(new THREE.ConeGeometry(1.6, 0.7, 10), material(i % 2 ? '#ff8787' : '#ffffff'), x + 1.2, 3.3, z));
      });
      animate(group, (time) => {
        sea.offset.set(time * 0.02, time * 0.03);
        torches.forEach((flame, i) => { flame.scale.set(1, 0.8 + Math.sin(time * 11 + i) * 0.2, 1); });
        surface.material.emissiveIntensity = 1 + Math.sin(time * 2) * 0.3;
      });
      group.userData.label = 'Tropical Beach';
    },

    // Toki Land ground: lawn with autumn-leaf mats, blue puddles and paths
    tokiGround(group, { w, d }) {
      const texture = PropKit.kit.canvasTexture('tokiGround', 1024, 1024, (ctx, cw, ch) => {
        ctx.fillStyle = '#4e8a3a';
        ctx.fillRect(0, 0, cw, ch);
        let seed = 5;
        const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < 1600; i++) { ctx.fillStyle = ['#5c9a45', '#457c33', '#66a84f'][i % 3]; ctx.fillRect(random() * cw, random() * ch, 4, 6); }
        // Autumn leaf mats (orange/yellow speckled patches)
        for (let i = 0; i < 9; i++) {
          const x = random() * cw;
          const y = random() * ch;
          const r = 60 + random() * 90;
          ctx.fillStyle = '#e8a33a';
          ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, random() * 3, 0, Math.PI * 2); ctx.fill();
          for (let k = 0; k < 140; k++) { ctx.fillStyle = ['#f59f00', '#ffd43b', '#d9480f', '#ffa94d'][k % 4]; ctx.fillRect(x + (random() - 0.5) * r * 1.6, y + (random() - 0.5) * r, 5, 4); }
        }
        // Blue puddles
        for (let i = 0; i < 5; i++) {
          const x = random() * cw;
          const y = random() * ch;
          ctx.fillStyle = '#74c0fc';
          ctx.beginPath(); ctx.ellipse(x, y, 40 + random() * 40, 20 + random() * 25, random() * 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.beginPath(); ctx.ellipse(x - 10, y - 6, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
        }
        // Paver path around the edge
        ctx.strokeStyle = '#d8c3a5';
        ctx.lineWidth = 60;
        ctx.strokeRect(40, 40, cw - 80, ch - 80);
      });
      const ground = box(w, 0.4, d, new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }));
      ground.castShadow = false;
      group.add(ground);
      // Low white walls with cones, mushroom-pink trees and a floating golden key
      const white = material('#f1ece4', { roughness: 0.7 });
      [[-w / 2 + 6, -d / 2 + 10, 0.6, 12], [w / 2 - 10, d / 2 - 6, 10, 0.6]].forEach(([x, z, ww, dd]) => group.add(box(ww, 1.6, dd, white, x, 0.8, z)));
      for (let i = 0; i < 10; i++) {
        const cone = mesh(new THREE.ConeGeometry(0.4, 1.6, 8), material(i % 2 ? '#ff8787' : '#f8f9fa', { roughness: 0.6 }), -w / 2 + 4 + (i * 5.3) % (w - 8), 1, -d / 2 + 3 + ((i * 7.1) % 6));
        group.add(cone);
      }
      [[-18, -16], [20, -18], [-22, 2], [8, 20]].forEach(([x, z], i) => {
        group.add(cylinder(0.25, 0.35, 3, material('#6d4c41'), x, 1.5, z, 8));
        const crown = sphere(1.8, material(['#f783ac', '#e64980', '#ffa8a8', '#da77f2'][i], { flatShading: true }), x, 3.8, z, 8);
        crown.scale.y = 0.75;
        group.add(crown);
      });
      const key = new THREE.Group();
      const gold = glow('#fcc419', 0.8);
      { const ring = mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 20), gold); key.add(ring); }
      key.add(box(1.6, 0.18, 0.18, gold, 1.2, 0, 0));
      key.add(box(0.18, 0.4, 0.18, gold, 1.8, -0.25, 0));
      key.add(box(0.18, 0.3, 0.18, gold, 1.5, -0.2, 0));
      key.position.set(-17, 16.5, -4);
      group.add(key);
      animate(key, (time) => { key.rotation.y = time; key.position.y = 16.5 + Math.sin(time * 2) * 0.3; });
    },
    // Welcome Hall extras: round bar with stools, floating crystals, wall TV
    barCounter(group, { w, h }) {
      const radius = w / 2;
      const counter = mesh(new THREE.CylinderGeometry(radius, radius, h, 40, 1, true, 0, Math.PI * 1.4), new THREE.MeshStandardMaterial({ map: repeated(plankTexture('#6b3f22'), 6, 1), side: THREE.DoubleSide }), 0, 0, 0);
      group.add(counter);
      const top = mesh(new THREE.RingGeometry(radius - 0.6, radius + 0.2, 40, 1, 0, Math.PI * 1.4), material('#2b2d42', { side: THREE.DoubleSide, roughness: 0.3 }), 0, h / 2, 0);
      top.rotation.x = -Math.PI / 2;
      top.rotation.z = Math.PI;
      group.add(top);
      group.add(interactive(box(0.6, 0.7, 0.5, material('#495057', { metalness: 0.7 }), 0, h / 2 + 0.35, -radius + 0.3), 'coffee', 'Espresso bar'));
      for (let i = 0; i < 7; i++) {
        const angle = -Math.PI / 2 - 0.2 - i * 0.18 * Math.PI;
        const stool = new THREE.Group();
        stool.add(cylinder(0.35, 0.35, 0.12, material('#212529'), 0, 0.85, 0, 16));
        stool.add(cylinder(0.05, 0.05, 0.8, material('#868e96', { metalness: 0.8 }), 0, 0.4, 0, 6));
        stool.add(cylinder(0.3, 0.3, 0.04, material('#868e96'), 0, 0.02, 0, 12));
        stool.position.set(Math.cos(angle) * (radius + 1), -h / 2, Math.sin(angle) * (radius + 1));
        group.add(interactive(stool, 'sit', 'Bar stool'));
      }
      // Bottles shelf in the middle
      group.add(cylinder(0.8, 0.8, h * 2.2, material('#3a2416'), 0, h * 0.6, 0, 16));
      for (let i = 0; i < 10; i++) group.add(cylinder(0.08, 0.1, 0.4, material(['#e03131', '#fab005', '#2f9e44', '#1c7ed6'][i % 4], { transparent: true, opacity: 0.85 }), Math.cos(i) * 0.9, h * 1.2, Math.sin(i) * 0.9, 8));
    },

    floatingCrystal(group, { w, h, color }) {
      group.add(cylinder(w * 0.7, w * 0.85, h * 0.25, material('#2b2238', { roughness: 0.6 }), 0, -h / 2 + h * 0.125, 0, 7));
      group.add(cylinder(w * 0.62, w * 0.62, 0.06, glow('#d0bfff', 1.4), 0, -h / 2 + h * 0.25 + 0.03, 0, 7));
      const crystal = mesh(new THREE.OctahedronGeometry(w * 0.45, 0), material(color || '#7048e8', { roughness: 0.15, metalness: 0.3, emissive: color || '#7048e8', emissiveIntensity: 0.35, flatShading: true }), 0, h * 0.2, 0);
      crystal.scale.y = 1.6;
      group.add(crystal);
      animate(crystal, (time) => { crystal.rotation.y = time * 0.8; crystal.position.y = h * 0.2 + Math.sin(time * 1.5) * 0.3; });
    },

    wallTv(group, { w, h, d }) {
      group.add(box(w, h, d, material('#111111')));
      group.add(box(w * 0.94, h * 0.88, 0.04, new THREE.MeshBasicMaterial({ map: BrandLogos.billboardTexture('GitHub', { tagline: 'Live from the Multiverse', background: '#0d1117', foreground: '#ffffff' }) }), 0, 0, d / 2 + 0.03));
    }
  };

  // Small low-poly models for showcase items
  function showcaseModel(kind) {
    const item = new THREE.Group();
    const beige = material('#e8dcc4');
    const dark = material('#2b2d42');
    switch (kind) {
      case 'computer':
        item.add(box(1.1, 0.25, 0.8, material('#a8743f'), 0, 0.12, 0));
        item.add(box(0.9, 0.7, 0.7, beige, 0, 0.6, -0.05));
        item.add(box(0.7, 0.5, 0.02, glow('#40c057', 0.6), 0, 0.62, 0.31));
        break;
      case 'handheld':
        item.add(box(0.6, 1, 0.15, material('#c9c9c1'), 0, 0.5, 0));
        item.add(box(0.45, 0.38, 0.02, material('#8bac0f'), 0, 0.72, 0.08));
        item.add(sphere(0.06, material('#9c1d48'), 0.15, 0.3, 0.08, 8));
        break;
      case 'mouse':
        item.add(box(0.5, 0.25, 0.75, material('#d7ccc8'), 0, 0.12, 0));
        { const added = cylinder(0.02, 0.02, 0.9, dark, 0, 0.1, -0.7, 4); added.rotation.x = Math.PI / 2; item.add(added); }
        break;
      case 'phone':
        item.add(box(0.35, 1, 0.2, material('#37474f'), 0, 0.5, 0));
        item.add(box(0.26, 0.28, 0.02, glow('#94d82d', 0.5), 0, 0.72, 0.11));
        break;
      case 'floppy':
        item.add(box(0.8, 0.8, 0.06, material('#1c7ed6'), 0, 0.4, 0));
        item.add(box(0.4, 0.25, 0.07, material('#ced4da', { metalness: 0.8 }), 0, 0.66, 0));
        break;
      case 'globe':
        item.add(sphere(0.45, material('#4dabf7', { wireframe: true }), 0, 0.55, 0, 12));
        item.add(sphere(0.4, material('#d0ebff', { transparent: true, opacity: 0.5 }), 0, 0.55, 0, 12));
        break;
      case 'envelope':
        item.add(box(0.9, 0.6, 0.06, material('#fff9db'), 0, 0.35, 0));
        item.add(facedBox(0.5, 0.5, 0.02, material('#fff9db'), new THREE.MeshBasicMaterial({ map: labelTexture('@', { bg: '#fff9db', fg: '#1877f2', width: 128, height: 128, font: 'bold 100px Arial' }) }), 0, 0.35, 0.04));
        break;
      case 'terminal':
        item.add(box(1, 0.7, 0.08, dark, 0, 0.4, 0));
        item.add(box(0.92, 0.6, 0.02, new THREE.MeshBasicMaterial({ map: labelTexture('$ hello, world_', { bg: '#0b0f14', fg: '#40c057', width: 256, height: 160, font: 'bold 26px Consolas, monospace' }) }), 0, 0.4, 0.05));
        break;
      case 'commit':
        item.add(cylinder(0.05, 0.05, 1, material('#f05032'), 0, 0.5, 0, 8));
        item.add(sphere(0.18, glow('#f05032', 0.6), 0, 0.5, 0, 12));
        break;
      case 'bug':
        item.add(sphere(0.35, material('#e03131'), 0, 0.4, 0, 12));
        item.add(facedBox(0.6, 0.3, 0.02, material('#e03131'), new THREE.MeshBasicMaterial({ map: labelTexture('Y2K', { bg: '#212529', fg: '#ffd43b', width: 128, height: 64, font: 'bold 44px Arial' }) }), 0, 0.85, 0));
        break;
      case 'duck':
        item.add(sphere(0.32, material('#ffd43b'), 0, 0.32, 0, 12));
        item.add(sphere(0.2, material('#ffd43b'), 0, 0.68, 0.15, 12));
        item.add(box(0.15, 0.06, 0.15, material('#ff922b'), 0, 0.66, 0.36));
        break;
      case 'trophy':
        item.add(cylinder(0.3, 0.12, 0.45, material('#fcc419', { metalness: 0.9, roughness: 0.2 }), 0, 0.6, 0, 16));
        item.add(cylinder(0.08, 0.08, 0.2, material('#fcc419', { metalness: 0.9 }), 0, 0.3, 0, 8));
        item.add(box(0.4, 0.15, 0.4, dark, 0, 0.1, 0));
        break;
      case 'keyboard':
        item.add(box(1.2, 0.1, 0.45, beige, 0, 0.1, 0));
        for (let i = 0; i < 12; i++) item.add(box(0.08, 0.06, 0.08, material('#f8f9fa'), -0.5 + (i % 12) * 0.09, 0.18, -0.1 + Math.floor(i / 12) * 0.1));
        break;
      case 'browser':
        item.add(box(1, 0.75, 0.06, material('#c0c0c0'), 0, 0.42, 0));
        item.add(box(0.9, 0.08, 0.02, material('#000080'), 0, 0.72, 0.04));
        item.add(box(0.9, 0.55, 0.02, material('#ffffff'), 0, 0.36, 0.04));
        break;
      default:
        item.add(box(0.6, 0.6, 0.6, material('#adb5bd'), 0, 0.3, 0));
    }
    return item;
  }

  Object.assign(builders, {
    // Classical column frame with a curved title and wooden shelves of rare items
    showcaseShelf(group, { w, h, d, label, data, block }) {
      const facingAngle = Math.atan2(-block.position[0], -block.position[2]);
      const inner = new THREE.Group();
      inner.rotation.y = facingAngle;
      const marble = material('#efe6d6', { roughness: 0.6 });
      [-1, 1].forEach((side) => {
        inner.add(cylinder(0.6, 0.7, h, marble, side * (w / 2 - 0.6), 0, 0, 16));
        inner.add(box(1.8, 0.5, 1.8, marble, side * (w / 2 - 0.6), -h / 2 + 0.25, 0));
        inner.add(box(1.6, 0.4, 1.6, marble, side * (w / 2 - 0.6), h / 2 - 0.2, 0));
      });
      inner.add(box(w + 0.6, 0.8, d + 0.4, marble, 0, h / 2 + 0.2, 0));
      // Curved title arch above the shelf
      const titleTexture = labelTexture(label || 'Showcase', { bg: '#efe6d6', fg: '#6b4f2a', width: 1024, height: 220, font: 'bold 150px Georgia, serif' });
      const title = mesh(new THREE.CylinderGeometry(w * 0.9, w * 0.9, 2.6, 32, 1, true, -0.55, 1.1), new THREE.MeshBasicMaterial({ map: titleTexture, side: THREE.DoubleSide }), 0, h / 2 + 2.2, -w * 0.9 + d);
      title.rotation.y = Math.PI;
      inner.add(title);
      // Wooden back and shelves with a light strip
      const wood = new THREE.MeshStandardMaterial({ map: repeated(plankTexture('#7a4a26'), 2, 4), roughness: 0.8 });
      inner.add(box(w - 2.2, h - 1, 0.3, wood, 0, 0, -d / 2 + 0.15));
      inner.add(box(w - 2.6, 0.12, 0.4, glow('#ffffff', 1.2), 0, h / 2 - 0.9, -d / 2 + 0.6));
      const items = (data && data.items) || [];
      const shelves = Math.max(1, Math.ceil(items.length / 2));
      for (let s = 0; s < shelves; s++) {
        const y = -h / 2 + 1.6 + s * ((h - 2.4) / shelves);
        inner.add(box(w - 2.2, 0.2, d - 0.3, wood, 0, y, 0));
        items.slice(s * 2, s * 2 + 2).forEach(([name, kind, fact], index) => {
          const x = (index === 0 ? -1 : 1) * (w - 2.2) / 4;
          const model = showcaseModel(kind);
          model.position.set(x, y + 0.1, 0.1);
          model.scale.setScalar(1.3);
          model.userData = { label: name, info: fact };
          inner.add(interactive(model, 'inspect', name));
          animate(model, (time) => { model.rotation.y = Math.sin(time * 0.6 + x) * 0.5; });
          const plaque = facedBox(1.6, 0.35, 0.05, material('#3e2723'), new THREE.MeshBasicMaterial({ map: labelTexture(name, { bg: '#3e2723', fg: '#ffe8a3', width: 512, height: 110, font: 'bold 40px Georgia, serif' }) }), x, y + 0.02, d / 2 - 0.1);
          inner.add(plaque);
        });
      }
      // Puffy cloud cushions at the base like the reference
      for (let i = 0; i < 6; i++) inner.add(sphere(0.9 + (i % 3) * 0.3, material('#f1ede6', { roughness: 1 }), -w / 2 + i * (w / 5), -h / 2 + 0.3, d / 2 + 0.8, 10));
      group.add(inner);
    }
  });

  // Apple-logo textures through BrandLogos (Simple Icons) on product boards
  // Ad banners dropped by the owner in public/assets/ads/ (listed in ads.json)
  // Owner images can be .png, .jpg, .jpeg or .webp: the server lists what
  // exists in the folder and only that file is requested
  function loadTextureAnyFormat(folder, file) {
    return BrandLogos.findOwnerAsset(folder, file).then((url) => new Promise((resolve, reject) => new THREE.TextureLoader().load(url, (texture) => {
      texture.encoding = THREE.sRGBEncoding;
      texture.anisotropy = 4;
      resolve(texture);
    }, undefined, reject)));
  }

  const adCache = new Map();
  function loadAd(file, onLoad) {
    if (!adCache.has(file)) adCache.set(file, loadTextureAnyFormat('ads', file));
    adCache.get(file).then(onLoad).catch(() => { /* banner not added yet: keep the generated board */ });
  }

  function loadStoreImage(file, onLoad) {
    loadTextureAnyFormat('store', file).then(onLoad).catch(() => { /* not added yet: keep the fallback */ });
  }

  // Fallback Genius Bar sign: three orbits around a nucleus with the name
  function geniusBarTexture() {
    return canvasTexture('geniusBar', 640, 500, (ctx, cw, ch) => {
      ctx.clearRect(0, 0, cw, ch);
      ctx.strokeStyle = '#6e6e73';
      ctx.fillStyle = '#6e6e73';
      ctx.lineWidth = 12;
      [0, Math.PI / 3, -Math.PI / 3].forEach((angle, index) => {
        ctx.save();
        ctx.translate(cw / 2, ch / 2);
        ctx.rotate(angle + Math.PI / 2);
        ctx.beginPath(); ctx.ellipse(0, 0, 220, 80, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(index === 1 ? -150 : 150, index ? 58 : -58, 26, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      ctx.fillStyle = '#f5f5f7';
      ctx.fillRect(40, ch / 2 - 38, cw - 80, 76);
      ctx.fillStyle = '#1d1d1f';
      ctx.font = '300 64px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('G E N I U S   B A R', cw / 2, ch / 2 + 2);
    });
  }

  const GENIUS_TIPS = [
    'Mac running slow? Open Activity Monitor (Cmd+Space, "Activity Monitor") and sort by % CPU to find the app eating your processor.',
    'Xcode taking all your disk? Delete ~/Library/Developer/Xcode/DerivedData and unused simulators with "xcrun simctl delete unavailable".',
    'Homebrew acting weird? Run "brew doctor" and follow its advice, then "brew update && brew upgrade".',
    'Lost a file? Time Machine: enter it from the menu bar and scroll back in time to the folder where it lived.',
    'Need a screenshot of a window? Cmd+Shift+4, then Space, then click the window.',
    'Spotlight is your launcher: Cmd+Space and type any app, file, calculation or unit conversion.',
    'Git says "xcrun: error: invalid active developer path"? Run "xcode-select --install" after a macOS update.',
    'Battery draining fast? System Settings > Battery shows which apps used the most energy in the last 24 hours.',
    'Wi-Fi flaky? Hold Option and click the Wi-Fi icon in the menu bar for detailed diagnostics.',
    'Port already in use while coding? "lsof -i :3000" finds the process, "kill <PID>" frees the port.'
  ];

  function adList() {
    return fetch('assets/ads/ads.json').then((response) => (response.ok ? response.json() : [])).catch(() => []);
  }

  function productBoard(name, tagline, background, foreground) {
    // Each ad shows the product's own official logo (Simple Icons), the Apple logo otherwise
    return BrandLogos.billboardTexture(name, { tagline, background, foreground, logoSlug: BrandLogos.slugFor(name) || 'apple' });
  }

  Object.assign(builders, {
    // Apple Store: glass box with the real Apple logo, Avenue tables with
    // MacBooks/iPhones/iPads to try (E), a Genius Bar and a Today at Apple video wall
    appleStore(group, { w, h, d }) {
      const glass = material('#e9f2fb', { transparent: true, opacity: 0.28, roughness: 0.02, metalness: 0.4, side: THREE.DoubleSide });
      const steel = material('#d0d4d9', { metalness: 0.85, roughness: 0.25 });
      const stone = material('#ece7df', { roughness: 0.5 });
      group.add(box(w, 0.2, d, stone, 0, 0.1, 0));
      // Glass walls with an open sliding-door entrance at the front (+z)
      const back = box(w, h, 0.15, glass, 0, h / 2, -d / 2);
      back.castShadow = false;
      group.add(back);
      [-1, 1].forEach((side) => {
        const wall = box(0.15, h, d, glass, side * w / 2, h / 2, 0);
        wall.castShadow = false;
        group.add(wall);
        const front = box(w / 2 - 3, h, 0.15, glass, side * (w / 4 + 1.5), h / 2, d / 2);
        front.castShadow = false;
        group.add(front);
      });
      group.add(box(6, h - 4.5, 0.15, glass, 0, 4.5 + (h - 4.5) / 2, d / 2));
      // Steel frame and white ceiling with light panels
      for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 6) group.add(box(0.12, h, 0.12, steel, x, h / 2, d / 2));
      group.add(box(w + 0.4, 0.5, d + 0.4, material('#f5f5f7'), 0, h + 0.25, 0));
      for (let i = 0; i < 4; i++) group.add(box(w * 0.8, 0.05, 1.2, glow('#ffffff', 0.9), 0, h - 0.05, -d / 2 + (i + 0.5) * (d / 4)));
      // Indoor billboard behind the Genius Bar: a silent reel of clips from three
      // official videos, played back to back (reel.html; the sound stays off)
      const adScreen = box(w * 0.32, w * 0.18, 0.1, material('#000000'), w * 0.3, h * 0.55, -d / 2 + 0.4);
      group.add(adScreen);
      const STORE_REEL = [['bJKTjCk7KV4', 127, 156], ['bJKTjCk7KV4', 159, 187], ['tBjgG1Sj86g', 202, 217], ['tR8O3pE1Ypk', 38, 68]];
      VideoScreens.register(adScreen, w * 0.32, w * 0.18, `reel.html?s=${encodeURIComponent(STORE_REEL.map(([id, start, end]) => `${id}:${start}-${end}`).join(','))}&silent=1`);
      // Ad carousel on the right wall: cycles through every banner in assets/ads/ads.json
      const carouselFace = new THREE.MeshBasicMaterial({ map: productBoard('Mac', 'Add your banners to assets/ads', '#000000', '#ffffff') });
      const carousel = box(0.15, w * 0.22, d * 0.6, [material('#1d1d1f'), carouselFace, material('#1d1d1f'), material('#1d1d1f'), material('#1d1d1f'), material('#1d1d1f')], w / 2 - 0.4, h * 0.5, 0);
      carouselFace.map.wrapS = THREE.ClampToEdgeWrapping;
      group.add(carousel);
      adList().then((ads) => {
        const files = ads.map((ad) => ad.file).filter(Boolean);
        if (!files.length) return;
        let index = 0;
        const show = () => loadAd(files[index++ % files.length], (texture) => {
          carouselFace.map = texture;
          carouselFace.needsUpdate = true;
          const aspect = texture.image.width / texture.image.height;
          carousel.scale.y = Math.min(1, (d * 0.6) / aspect / (w * 0.22));
        });
        show();
        setInterval(show, 6000);
      });
      // App wall: the official icons of Apple's apps and developer tools
      const APPLE_APPS = [['xcode', '#1575F9'], ['swift', '#F05138'], ['appstore', '#0D96F6'], ['safari', '#006CFF'], ['macos', '#1d1d1f'], ['icloud', '#3693F3'], ['applemusic', '#FA243C'], ['appletv', '#1d1d1f'], ['applearcade', '#E01E5A'], ['applepay', '#1d1d1f'], ['imessage', '#34C759'], ['applepodcasts', '#9933CC'], ['applenews', '#FD415E'], ['ios', '#1d1d1f'], ['apple', '#86868b']];
      APPLE_APPS.forEach(([slug, color], index) => {
        const icon = box(1.5, 1.5, 0.08, new THREE.MeshBasicMaterial({ map: BrandLogos.appIconTexture(slug, color), transparent: true }), -w / 2 + 2.2 + (index % 5) * 1.9, h * 0.75 - Math.floor(index / 5) * 1.9, -d / 2 + 0.3);
        group.add(icon);
      });
      // Mac Finder logo above the glass entrance: the owner's file
      // (assets/store/finder.png), or the macOS logo until it is added
      const finderSign = new THREE.MeshBasicMaterial({ map: BrandLogos.appIconTexture('macos', '#1877f2'), transparent: true });
      group.add(box(3.4, 3.4, 0.05, finderSign, 0, h - 2.6, d / 2 + 0.12));
      loadStoreImage('finder.png', (texture) => { finderSign.map = texture; finderSign.needsUpdate = true; });
      // The real Apple logo on the front glass, both sides of the entrance
      const appleLogo = new THREE.MeshBasicMaterial({ map: BrandLogos.billboardTexture('Apple', { tagline: '', background: '#f5f5f7', foreground: '#1d1d1f', width: 512, height: 512, layout: 'logo' }), transparent: true });
      [-1, 1].forEach((side) => group.add(box(2.6, 2.6, 0.05, appleLogo, side * w * 0.3, h - 2.6, d / 2 + 0.1)));
      // Avenue tables (light wood) with devices on display
      const tableWood = new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.plankTexture('#d4b48c'), 4, 1), roughness: 0.6 });
      [[-w * 0.22, 0], [w * 0.22, 0], [-w * 0.22, -d * 0.28], [w * 0.22, -d * 0.28]].forEach(([x, z]) => {
        group.add(box(8, 0.12, 1.8, tableWood, x, 1.05, z));
        [-3.2, 3.2].forEach((dx) => group.add(box(0.5, 1, 1.4, tableWood, x + dx, 0.5, z)));
        // MacBooks to try: E opens a working macOS-style demo (MacDemo below)
        [[x - 2.4, 0, 'MacBook Pro'], [x - 0.8, Math.PI, 'MacBook Air']].forEach(([lx, turn, name]) => {
          const mac = laptop(lx, 1.11, z, turn);
          mac.userData.interactable = { type: 'action', label: `${name} on display` };
          mac.userData.prompt = `Press E to try the ${name}`;
          mac.userData.label = `${name} · try it (E)`;
          mac.userData.onInteract = () => { MacDemo.open(name); return null; };
          group.add(mac);
        });
        // iPhones and iPads on stands
        [0.9, 2.4].forEach((dx, index) => {
          const device = new THREE.Group();
          device.add(box(index ? 0.55 : 0.28, index ? 0.75 : 0.56, 0.03, material('#1d1d1f', { metalness: 0.6 }), 0, 0.3, 0));
          device.add(box(index ? 0.5 : 0.24, index ? 0.7 : 0.5, 0.01, new THREE.MeshBasicMaterial({ map: PropKit.kit.artTexture(31 + index + Math.round(x)) }), 0, 0.3, 0.02));
          device.add(box(0.1, 0.2, 0.1, steel, 0, 0.05, -0.05));
          device.rotation.x = -0.2;
          device.position.set(x + dx, 1.11, z);
          group.add(interactive(device, 'inspect', index ? 'iPad on display' : 'iPhone on display'));
          device.userData.info = index ? 'Try the iPad: drawing, coding with Swift Playgrounds and more.' : 'Try the latest iPhone right here at the Apple Store.';
        });
      });
      // Genius Bar along the back wall
      group.add(box(w * 0.5, 1.1, 1, material('#f5f5f7'), 0, 0.55, -d / 2 + 2));
      group.add(box(w * 0.5, 0.06, 1.1, tableWood, 0, 1.13, -d / 2 + 2));
      // Genius Bar sign on the wall behind the counter: the owner's logo file
      // (assets/store/genius-bar.png) or a drawn atom sign until it is added
      const geniusSign = new THREE.MeshBasicMaterial({ map: geniusBarTexture(), transparent: true });
      group.add(box(4.6, 3.6, 0.05, geniusSign, 0, h * 0.58, -d / 2 + 0.2));
      loadStoreImage('genius-bar.png', (texture) => { geniusSign.map = texture; geniusSign.needsUpdate = true; });
      // Talk to a Genius: an iPad on the counter answers with Mac/dev support tips
      const genius = new THREE.Group();
      genius.add(box(0.9, 0.65, 0.05, material('#1d1d1f'), 0, 0, 0));
      genius.add(box(0.82, 0.57, 0.02, glow('#4dabf7', 0.8), 0, 0, 0.03));
      genius.add(box(0.06, 0.4, 0.06, steel, 0, -0.4, -0.05));
      genius.position.set(0, 1.62, -d / 2 + 2.2);
      genius.rotation.x = -0.25;
      Object.defineProperty(genius.userData, 'info', { get: () => GENIUS_TIPS[Math.floor(Math.random() * GENIUS_TIPS.length)] });
      genius.userData.label = 'Genius Bar · tech support';
      group.add(interactive(genius, 'inspect', 'Ask a Genius'));
      const askSign = textSprite('Genius Bar · Ask a Genius (E)', { width: 6, background: 'rgba(29, 29, 31, 0.9)' });
      askSign.position.set(0, 3, -d / 2 + 2.2);
      group.add(askSign);
      for (let i = 0; i < 5; i++) {
        const stool = new THREE.Group();
        stool.add(cylinder(0.3, 0.3, 0.08, tableWood, 0, 0.9, 0, 16));
        stool.add(cylinder(0.04, 0.04, 0.9, steel, 0, 0.45, 0, 6));
        stool.position.set(-w * 0.2 + i * (w * 0.1), 0, -d / 2 + 3.2);
        group.add(interactive(stool, 'sit', 'Genius Bar stool'));
      }
      // Today at Apple video wall: click to watch the official keynotes
      const wall = box(w * 0.45, h * 0.45, 0.2, new THREE.MeshBasicMaterial({ map: productBoard('Today at Apple', 'Click to watch the WWDC keynotes', '#1d1d1f', '#ffffff') }), -w / 2 + 0.3, h * 0.42, d * 0.15);
      wall.rotation.y = Math.PI / 2;
      wall.userData.isKeynoteScreen = true;
      VideoScreens.register(wall, w * 0.45, h * 0.45, VideoScreens.youtubeEmbed(['0_DjDdfqtUE', 'RXeOiIDNNek', 'GYkq9Rgoj8E', 'q5D55G7Ejs8', '0TD96VTf0Xs', 'GEZhD3J89ZE']));
      wall.userData.label = 'Today at Apple - click to watch';
      group.add(wall);
      for (let i = 0; i < 3; i++) group.add(box(6, 0.4 + i * 0.4, 1.4, tableWood, -w / 2 + 4, 0.2 + i * 0.2, d * 0.15 - 2 + i * 1.4));
      // Trees in planters like real Apple Stores
      [[w * 0.42, -d * 0.4], [-w * 0.1, d * 0.38], [w * 0.1, d * 0.38]].forEach(([x, z]) => {
        group.add(cylinder(0.9, 0.8, 0.8, stone, x, 0.4, z, 16));
        group.add(cylinder(0.1, 0.15, 3, material('#6d4c41'), x, 2, z, 6));
        group.add(sphere(1.4, material('#2f9e44'), x, 4, z, 12));
      });
    },

    // Giant outdoor screen playing Apple's official YouTube channel (ads, product films)
    appleVideoBillboard(group, { w, h, block }) {
      const facing = Math.atan2(-block.position[0], -block.position[2]);
      const inner = new THREE.Group();
      inner.rotation.y = facing;
      const steel = material('#adb5bd', { metalness: 0.8, roughness: 0.3 });
      [-1, 1].forEach((side) => inner.add(box(0.5, h * 0.45, 0.5, steel, side * w * 0.3, -h * 0.28, 0)));
      inner.add(box(w + 0.4, h * 0.55 + 0.4, 0.5, material('#1d1d1f'), 0, h * 0.22, -0.1));
      // Until the video loads (or when it is blocked or far away) the screen
      // shows the Mac ad banners in rotation instead of a black panel
      const posterFace = new THREE.MeshBasicMaterial({ map: productBoard('Mac', 'Apple on YouTube', '#000000', '#ffffff') });
      const screen = box(w, h * 0.55, 0.05, [material('#000000'), material('#000000'), material('#000000'), material('#000000'), posterFace, material('#000000')], 0, h * 0.22, 0.2);
      inner.add(screen);
      group.add(inner);
      adList().then((ads) => {
        const files = ads.map((ad) => ad.file).filter(Boolean);
        if (!files.length) return;
        let index = Math.floor(Math.random() * files.length);
        const show = () => loadAd(files[index++ % files.length], (texture) => { posterFace.map = texture; posterFace.needsUpdate = true; });
        show();
        setInterval(show, 7000);
      });
      VideoScreens.register(screen, w, h * 0.55, VideoScreens.channelUploadsEmbed('UCE_M8A5yxnLfW0KghEeajjw'));
    },

    // House of MAC flagship (like the corner stores of Decentraland's fashion
    // street): a two-story stone base with LED shop windows showing the Mac ads
    // (assets/ads), neon signs, and on top an open black steel frame with giant
    // glowing logos; a dark reflective sidewalk with neon lines in front
    macFlagship(group, { w, h, d }) {
      const baseH = 11;
      const stoneFacade = new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.brickTexture('#d8c7ad'), w / 4, baseH / 3), roughness: 0.85 });
      const dark = material('#15161b', { roughness: 0.4, metalness: 0.5 });
      // Base walls with openings: big LED windows and the glass entrance (front, +z)
      const windowMaterials = [];
      const ads = ['macbook-air.jpg', 'macbook-neo.jpg', 'm1.jpg', 'macos.jpg', 'mac-apps.jpg', 'macbook-air.jpg'];
      const fallback = [['Mac', 'Apple personal computers'], ['MacBook Neo', 'Big value for small business.'], ['Apple M1', 'Small chip. Giant leap.'], ['macOS', 'Apple desktop operating system'], ['Xcode', 'Apple developer tools'], ['Swift', 'Programming language by Apple']];
      const adWindow = (index, ww, wh, x, y, z, rotation) => {
        const [title, tagline] = fallback[index % fallback.length];
        const face = new THREE.MeshBasicMaterial({ map: productBoard(title, tagline, '#000000', '#ffffff') });
        windowMaterials.push(face);
        const panel = box(ww, wh, 0.2, [dark, dark, dark, dark, face, dark], x, y, z);
        panel.rotation.y = rotation;
        group.add(panel);
        loadAd(ads[index % ads.length], (texture) => { face.map = texture; face.needsUpdate = true; });
        const frame = box(ww + 0.3, wh + 0.3, 0.1, glow('#b197fc', 1.1), x - Math.sin(rotation) * 0.12, y, z - Math.cos(rotation) * 0.12);
        frame.rotation.y = rotation;
        group.add(frame);
      };
      // Front wall pieces around the entrance and two LED windows
      group.add(box(w, baseH - 8.5, 0.6, stoneFacade, 0, 8.5 + (baseH - 8.5) / 2, d / 2));
      [-1, 1].forEach((side) => {
        group.add(box(1.2, 8.5, 0.6, stoneFacade, side * (w / 2 - 0.6), 4.25, d / 2));
        group.add(box(1.2, 8.5, 0.6, stoneFacade, side * 4.2, 4.25, d / 2));
        adWindow(side < 0 ? 0 : 1, w / 2 - 6.6, 6.5, side * (w / 4 + 1.8), 4.4, d / 2 + 0.35, 0);
      });
      // Side and back walls with LED windows
      [-1, 1].forEach((side) => {
        group.add(box(0.6, baseH, d, stoneFacade, side * w / 2, baseH / 2, 0));
        for (let i = 0; i < 2; i++) adWindow(2 + i + (side > 0 ? 2 : 0), d * 0.36, 5.5, side * (w / 2 + 0.35), 4.6, -d / 2 + d * 0.28 + i * d * 0.45, side * Math.PI / 2);
      });
      group.add(box(w, baseH, 0.6, stoneFacade, 0, baseH / 2, -d / 2));
      // Dark cornice band with a white light strip and the roof slab
      group.add(box(w + 1, 1.2, d + 1, dark, 0, baseH - 0.6, 0));
      group.add(box(w + 1.05, 0.12, d + 1.05, glow('#f8f9fa', 1.2), 0, baseH - 1.25, 0));
      // Neon signs on the cornice
      const neon = (text, color) => PropKit.kit.canvasTexture(`neon|${text}|${color}`, 1024, 256, (ctx, cw, ch) => {
        ctx.clearRect(0, 0, cw, ch);
        ctx.font = 'bold 150px Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = color;
        ctx.shadowBlur = 30;
        ctx.lineWidth = 8;
        ctx.strokeStyle = color;
        ctx.strokeText(text, cw / 2, ch / 2);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.strokeText(text, cw / 2, ch / 2);
      });
      [['House of MAC', '#da77f2', -w * 0.22], ['Mac', '#74c0fc', w * 0.28]].forEach(([text, color, x]) => {
        const sign = mesh(new THREE.PlaneGeometry(text.length > 4 ? 12 : 6, 3), new THREE.MeshBasicMaterial({ map: neon(text, color), transparent: true, depthWrite: false }), x, baseH + 1.4, d / 2 + 0.7);
        sign.raycast = () => {};
        group.add(sign);
      });
      // Open steel frame on top with floors and giant glowing logos
      const steel = material('#101114', { metalness: 0.7, roughness: 0.4 });
      const frameH = h - baseH;
      const floors = 3;
      const columnsX = 5;
      const columnsZ = 4;
      for (let i = 0; i < columnsX; i++) {
        for (let j = 0; j < columnsZ; j++) {
          if (i > 0 && i < columnsX - 1 && j > 0 && j < columnsZ - 1) continue;
          group.add(box(0.6, frameH, 0.6, steel, -w / 2 + (i / (columnsX - 1)) * w, baseH + frameH / 2, -d / 2 + (j / (columnsZ - 1)) * d));
        }
      }
      for (let f = 1; f <= floors; f++) {
        const y = baseH + (f / floors) * frameH;
        [-1, 1].forEach((side) => {
          group.add(box(w + 0.6, 0.5, 0.5, steel, 0, y, side * d / 2));
          group.add(box(0.5, 0.5, d + 0.6, steel, side * w / 2, y, 0));
        });
        if (f < floors) group.add(box(w - 0.6, 0.3, d - 0.6, material('#2a2b31', { roughness: 0.8 }), 0, y - 0.1, 0));
      }
      // Giant glowing logos inside the frame, one per floor, facing the street
      const logoPanel = (name, slug, y) => {
        const texture = BrandLogos.billboardTexture(name, { background: '#000000', foreground: '#ffffff', width: 512, height: 512, layout: 'logo', logoSlug: slug });
        const panel = mesh(new THREE.PlaneGeometry(frameH / floors - 1, frameH / floors - 1), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 0, y, d / 2 - 1.5);
        panel.raycast = () => {};
        group.add(panel);
        return panel;
      };
      const logos = [logoPanel('Apple', 'apple', baseH + frameH * (2.5 / floors)), logoPanel('macOS', 'macos', baseH + frameH * (1.5 / floors)), logoPanel('Xcode', 'xcode', baseH + frameH * (0.5 / floors))];
      // Dark reflective sidewalk with neon lines in front of the store
      const sidewalk = box(w + 8, 0.1, 10, material('#1b1c22', { metalness: 0.7, roughness: 0.08 }), 0, 0.05, d / 2 + 5.5);
      sidewalk.castShadow = false;
      group.add(sidewalk);
      [[0, 0.12, d / 2 + 1, w + 8, 0.12], [0, 0.12, d / 2 + 10.4, w + 8, 0.12]].forEach(([x, y, z, lw, ld]) => group.add(box(lw, 0.05, ld, glow('#f06595', 2), x, y, z)));
      const diagonal = box(0.15, 0.05, 12, glow('#f06595', 2), w * 0.3, 0.12, d / 2 + 5.5);
      diagonal.rotation.y = 0.7;
      group.add(diagonal);
      animate(group, (time) => { logos.forEach((logo, i) => { logo.material.opacity = 0.75 + Math.sin(time * 1.5 + i) * 0.25; }); });
      group.userData.label = 'House of MAC';
    },

    // macOS section: an arc of lit banner panels (the macOS ads in
    // public/assets/ads, listed in the block's "images") on an aluminum deck,
    // under a big "macOS" sign; E on a panel shows its title
    macosSection(group, { w, h, d, data }) {
      const banners = (data && data.banners) || [];
      const aluminum = material('#c9ccd1', { metalness: 0.7, roughness: 0.35 });
      group.add(box(w, 0.2, d, aluminum, 0, 0.1, 0));
      group.add(box(w + 0.3, 0.06, d + 0.3, glow('#4dabf7', 1.2), 0, 0.03, 0));
      // The sign: macOS in light letters on a dark gradient bar
      const signTexture = canvasTexture('macosSectionSign', 1024, 256, (ctx, cw, ch) => {
        const gradient = ctx.createLinearGradient(0, 0, cw, 0);
        gradient.addColorStop(0, '#1c1c2e'); gradient.addColorStop(0.5, '#23233f'); gradient.addColorStop(1, '#1c1c2e');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, cw, ch);
        const text = ctx.createLinearGradient(cw * 0.3, 0, cw * 0.7, 0);
        text.addColorStop(0, '#7dd3fc'); text.addColorStop(0.5, '#c4b5fd'); text.addColorStop(1, '#f9a8d4');
        ctx.fillStyle = text; ctx.font = '600 150px -apple-system, "Segoe UI", Helvetica, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('macOS', cw / 2, ch / 2 + 6);
      });
      const sign = box(w * 0.45, w * 0.45 / 4, 0.2, [material('#1c1c2e'), material('#1c1c2e'), material('#1c1c2e'), material('#1c1c2e'), new THREE.MeshBasicMaterial({ map: signTexture }), new THREE.MeshBasicMaterial({ map: signTexture })], 0, h - 0.4, 0);
      group.add(sign);
      [-1, 1].forEach((side) => group.add(box(0.18, h - 0.4, 0.18, aluminum, side * w * 0.2, (h - 0.4) / 2, 0)));
      // Banner panels on an arc facing the visitors (+z of the block)
      const count = Math.max(1, banners.length);
      const radius = w * 0.62;
      const panelWidth = Math.min(4.6, (Math.PI * 0.62 * radius) / count - 0.4);
      banners.forEach((banner, index) => {
        const angle = (index - (count - 1) / 2) * (Math.PI * 0.62 / count);
        const panel = new THREE.Group();
        panel.position.set(Math.sin(angle) * radius, 0, -Math.cos(angle) * radius + radius - d * 0.15);
        panel.rotation.y = -angle;
        const face = new THREE.MeshBasicMaterial({ color: '#111111' });
        const frameHeight = panelWidth * 0.62;
        const board = box(panelWidth, frameHeight, 0.08, [material('#0d0d0f'), material('#0d0d0f'), material('#0d0d0f'), material('#0d0d0f'), face, material('#0d0d0f')], 0, 1.4 + frameHeight / 2, 0);
        panel.add(board);
        panel.add(box(panelWidth + 0.24, frameHeight + 0.24, 0.06, material('#2b2d33', { metalness: 0.8, roughness: 0.3 }), 0, 1.4 + frameHeight / 2, -0.06));
        panel.add(box(0.12, 1.4, 0.12, aluminum, 0, 0.7, -0.05));
        panel.add(box(1.2, 0.08, 0.6, aluminum, 0, 0.24, 0));
        loadAd(banner.file, (texture) => {
          face.map = texture; face.color.set('#ffffff'); face.needsUpdate = true;
          const aspect = texture.image.width / texture.image.height;
          board.scale.y = (panelWidth / aspect) / frameHeight;
          board.position.y = 1.4 + (panelWidth / aspect) / 2;
        });
        panel.userData.label = 'macOS';
        panel.userData.info = banner.title || 'macOS';
        group.add(interactive(panel, 'inspect', banner.title || 'macOS'));
      });
      group.userData.label = 'macOS section';
    },

    // Freestanding ad boards (official product logo + name). When the ad banner
    // image exists in public/assets/ads/ (block "image"), the board shows it,
    // resized to the banner's aspect ratio.
    appleBillboard(group, { w, h, label, data }) {
      const [title, tagline] = (label || 'Mac|').split('|');
      const dark = (data && data.dark) !== false;
      group.add(box(0.3, h * 0.4, 0.3, material('#adb5bd', { metalness: 0.8 }), 0, -h * 0.3, 0));
      const face = new THREE.MeshBasicMaterial({ map: productBoard(title, tagline || '', dark ? '#000000' : '#f5f5f7', dark ? '#ffffff' : '#1d1d1f') });
      const board = mesh(new THREE.BoxGeometry(w, h * 0.6, 0.3), [material('#1d1d1f'), material('#1d1d1f'), material('#1d1d1f'), material('#1d1d1f'), face, face]);
      board.position.y = h * 0.2;
      group.add(board);
      if (data && data.image) {
        loadAd(data.image, (texture) => {
          face.map = texture;
          face.needsUpdate = true;
          const height = w / (texture.image.width / texture.image.height);
          board.scale.y = height / (h * 0.6);
          board.position.y = -h * 0.1 + height / 2;
        });
      }
    }
  });

  Object.assign(builders, {
    // Gravity Flip tower: a translucent skyscraper climbed with trampolines that
    // launch you through each floor; some floors have low gravity; a floating
    // lounge on top rewards the climb with a rare wearable
    gravityTower(group, { w, h, color }) {
      const floors = 6;
      const floorHeight = h / floors;
      const half = w / 2;
      const glass = material(color || '#9775fa', { transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide });
      const slabMaterial = material('#e5dbff', { transparent: true, opacity: 0.85, roughness: 0.2 });
      const hole = 3.4;
      for (let level = 0; level < floors; level++) {
        const y = level * floorHeight;
        // Slab with a square opening, alternating corners so the climb zigzags
        const hx = (level % 2 ? 1 : -1) * (half - hole);
        const parts = [
          [w, (w - hole) / 2 - hx * 0, 0, -(hole + (w - hole) / 2) / 2],
        ];
        const slab = new THREE.Group();
        // Four pieces around the hole at (hx, 0)
        const left = hx - hole / 2 + half;
        const right = half - (hx + hole / 2);
        if (left > 0.1) slab.add(box(left, 0.4, w, slabMaterial, -half + left / 2, 0, 0));
        if (right > 0.1) slab.add(box(right, 0.4, w, slabMaterial, half - right / 2, 0, 0));
        slab.add(box(hole, 0.4, half - hole / 2, slabMaterial, hx, 0, -(hole / 2 + (half - hole / 2) / 2)));
        slab.add(box(hole, 0.4, half - hole / 2, slabMaterial, hx, 0, hole / 2 + (half - hole / 2) / 2));
        slab.position.y = y + 0.2;
        if (level > 0) group.add(slab);
        else group.add(box(w, 0.4, w, slabMaterial, 0, 0.2, 0));
        // Trampoline under the next hole
        const nextX = ((level + 1) % 2 ? 1 : -1) * (half - hole);
        if (level < floors - 1) {
          const pad = cylinder(1.3, 1.3, 0.3, glow(level % 2 ? '#ff6b6b' : '#40c057', 1.2), nextX, y + 0.55, 0, 20);
          group.add(pad);
          window.jumpPads = window.jumpPads || [];
          window.jumpPads.push(pad);
          animate(pad, (time) => { pad.scale.y = 1 + Math.abs(Math.sin(time * 6 + level)) * 0.4; });
        }
        // Every other floor has low gravity: you float like on the Moon
        if (level % 2 === 1) {
          window.lowGravityZones = window.lowGravityZones || [];
          window.lowGravityZones.push({ group, half, minY: y, maxY: y + floorHeight });
          const label = textSprite('LOW GRAVITY', { width: 5, background: 'rgba(151, 117, 250, 0.9)' });
          label.position.set(0, y + floorHeight - 1.5, 0);
          group.add(label);
        }
        // Neon floor numbers
        const number = textSprite(`${level + 1}F`, { width: 2.4, background: 'rgba(0, 0, 0, 0.6)' });
        number.position.set(-half + 1.5, y + 2.5, -half + 0.8);
        group.add(number);
      }
      // Translucent walls with neon edges and an entrance
      [[0, -half, w, 0.2], [half, 0, 0.2, w], [-half, 0, 0.2, w]].forEach(([x, z, ww, dd]) => {
        const wall = box(ww, h, dd, glass, x, h / 2, z);
        wall.castShadow = false;
        group.add(wall);
      });
      [-1, 1].forEach((side) => {
        const front = box(half - 2, h, 0.2, glass, side * (half / 2 + 1), h / 2, half);
        front.castShadow = false;
        group.add(front);
      });
      group.add(box(4, h - 4, 0.2, glass, 0, 4 + (h - 4) / 2, half));
      [[-half, -half], [half, -half], [-half, half], [half, half]].forEach(([x, z]) => group.add(box(0.3, h, 0.3, glow(color || '#9775fa', 1.5), x, h / 2, z)));
      // Floating lounge on top with the reward pedestal
      const lounge = new THREE.Group();
      lounge.add(cylinder(half + 2, half, 0.6, material('#f3f0ff'), 0, 0, 0, 32));
      { const added = mesh(new THREE.TorusGeometry(half + 2, 0.15, 6, 48), glow('#da77f2', 1.6), 0, 0.35, 0); added.rotation.x = Math.PI / 2; lounge.add(added); }
      const pedestal = new THREE.Group();
      pedestal.add(cylinder(0.8, 1, 1.2, material('#212529'), 0, 0.9, 0, 16));
      const trophy = mesh(new THREE.OctahedronGeometry(0.6, 0), glow('#ffd43b', 1.2), 0, 2.2, 0);
      pedestal.add(trophy);
      animate(trophy, (time) => { trophy.rotation.y = time * 2; });
      lounge.add(PropKit.kit.interactive(pedestal, 'reward', 'Gravity Flip reward'));
      [-1, 1].forEach((side) => lounge.add(box(3, 0.6, 1.2, material('#7048e8'), side * (half - 2), 0.6, 0)));
      lounge.position.y = h + 0.5;
      group.add(lounge);
      animate(lounge, (time) => { lounge.position.y = h + 0.5 + Math.sin(time) * 0.15; });
      const sign = textSprite('GRAVITY FLIP · climb with the trampolines', { width: 16, background: 'rgba(119, 76, 255, 0.9)' });
      sign.position.y = h + 6;
      group.add(sign);
    }
  });

  Object.assign(builders, {
    // Aero-Glass villa: smart glass + floating white concrete over a water
    // mirror, held up by neon light beams; wall panels cycle the glass mode;
    // the infinity pool has low gravity so you can float up to the sunroom
    glassVilla(group, { w, h, d, color, label }) {
      const lift = 3;
      const concrete = material('#f8f9fa', { roughness: 0.35 });
      const modes = [
        { name: 'transparent', color: '#d0ebff', opacity: 0.22, metalness: 0.2, emissive: 0 },
        { name: 'mirrored', color: '#adb5bd', opacity: 0.9, metalness: 1, emissive: 0 },
        { name: 'frosted glow', color: '#91a7ff', opacity: 0.65, metalness: 0.1, emissive: 0.6 }
      ];
      const glass = new THREE.MeshStandardMaterial({ color: modes[0].color, transparent: true, opacity: modes[0].opacity, roughness: 0.05, metalness: modes[0].metalness, side: THREE.DoubleSide, emissive: '#748ffc', emissiveIntensity: 0 });
      let mode = 0;
      // Neon light beams holding the house above the water
      [[-w / 2 + 1, -d / 2 + 1], [w / 2 - 1, -d / 2 + 1], [-w / 2 + 1, d / 2 - 1], [w / 2 - 1, d / 2 - 1]].forEach(([x, z]) => {
        const beam = cylinder(0.25, 0.25, lift, glow('#4dabf7', 1.8, { transparent: true, opacity: 0.8 }), x, lift / 2, z, 10);
        beam.castShadow = false;
        group.add(beam);
      });
      // Ground floor slab, walls of glass, second floor (sunroom) and flat roofs
      group.add(box(w, 0.5, d, concrete, 0, lift, 0));
      const floorHeight = h / 2;
      [[0, -d / 2, w, 0.12], [-w / 2, 0, 0.12, d], [w / 2, 0, 0.12, d]].forEach(([x, z, gw, gd]) => {
        const pane = box(gw, floorHeight, gd, glass, x, lift + 0.25 + floorHeight / 2, z);
        pane.castShadow = false;
        group.add(pane);
      });
      [-1, 1].forEach((side) => {
        const pane = box(w / 2 - 1.6, floorHeight, 0.12, glass, side * (w / 4 + 0.8), lift + 0.25 + floorHeight / 2, d / 2);
        pane.castShadow = false;
        group.add(pane);
      });
      group.add(box(w + 1, 0.5, d + 1, concrete, 0, lift + floorHeight + 0.5, 0));
      // Sunroom on the second floor, set back like modern villas
      const sunW = w * 0.55;
      const sunD = d * 0.6;
      [[0, -sunD / 2, sunW, 0.12], [-sunW / 2, 0, 0.12, sunD], [sunW / 2, 0, 0.12, sunD]].forEach(([x, z, gw, gd]) => {
        const pane = box(gw, floorHeight * 0.9, gd, glass, x - w * 0.18, lift + floorHeight + 0.75 + floorHeight * 0.45, z - d * 0.15);
        pane.castShadow = false;
        group.add(pane);
      });
      group.add(box(sunW + 0.8, 0.4, sunD + 0.8, concrete, -w * 0.18, lift + floorHeight * 1.9 + 0.8, -d * 0.15));
      // Interior: sofa, dining table with laptops, plant
      group.add(box(4, 0.6, 1.4, material(color || '#1c7ed6', { roughness: 1 }), -w * 0.2, lift + 0.55, d * 0.15));
      group.add(box(3, 0.1, 1.4, material('#f1f3f5'), w * 0.2, lift + 1.1, -d * 0.1));
      group.add(PropKit.kit.laptop(w * 0.2 - 0.6, lift + 1.16, -d * 0.1, 0));
      group.add(PropKit.kit.laptop(w * 0.2 + 0.6, lift + 1.16, -d * 0.1, Math.PI));
      // Smart-glass control panel: cycles transparent / mirrored / frosted glow
      const panel = box(0.6, 0.9, 0.08, glow('#4dabf7', 1), -w / 2 + 0.2, lift + 1.6, d * 0.3);
      panel.userData.cycle = () => {
        mode = (mode + 1) % modes.length;
        const next = modes[mode];
        glass.color.set(next.color);
        glass.opacity = next.opacity;
        glass.metalness = next.metalness;
        glass.emissiveIntensity = next.emissive;
        return next.name;
      };
      group.add(interactive(panel, 'glass', 'Smart glass panel'));
      // Infinity pool: overflowing edge and low gravity up to the sunroom
      const poolX = w / 2 + 3;
      const pool = box(5, 0.8, d * 0.8, material('#3bc9db', { transparent: true, opacity: 0.75, roughness: 0.05, emissive: '#1098ad', emissiveIntensity: 0.3 }), poolX, lift + 0.1, 0);
      group.add(pool);
      group.add(box(5.4, 0.5, d * 0.8 + 0.4, concrete, poolX, lift - 0.45, 0));
      const spill = box(0.1, lift, d * 0.8, material('#99e9f2', { transparent: true, opacity: 0.5, emissive: '#99e9f2', emissiveIntensity: 0.4 }), poolX + 2.6, lift / 2, 0);
      spill.raycast = () => {};
      group.add(spill);
      window.lowGravityZones = window.lowGravityZones || [];
      window.lowGravityZones.push({ group, half: Math.max(3, d * 0.4), offset: new THREE.Vector3(poolX, 0, 0), minY: lift - 1, maxY: lift + h + 2 });
      const caption = textSprite(label || 'Glass Villa', { width: 8, background: 'rgba(77, 171, 247, 0.85)' });
      caption.position.y = lift + h + 3;
      group.add(caption);
    },

    // Mirror-water ground for the villas
    waterMirror(group, { w, h, d }) {
      const water = box(w, h, d, material('#74c0fc', { roughness: 0.02, metalness: 0.9 }));
      water.receiveShadow = true;
      group.add(water);
    }
  });

  const rules = [
    [/gradient_floor/, 'gradientFloor'], [/glass_wall_panel/, 'glassWall'], [/glass_table/, 'glassTable'], [/round_sofa/, 'roundSofa'],
    [/commit_board/, 'commitBoard'], [/parkour_platform/, 'parkourPlatform'], [/^coin/, 'coin'], [/parkour_(start|finish)/, 'parkourPad'],
    [/purple_rocks/, 'purpleRocks'], [/toki_ground/, 'tokiGround'], [/beach_arena/, 'beachArena'], [/sky_waterfall/, 'skyWaterfall'], [/bar_counter/, 'barCounter'], [/floating_crystal/, 'floatingCrystal'], [/wall_tv/, 'wallTv'],
    [/showcase_shelf/, 'showcaseShelf'], [/apple_store/, 'appleStore'], [/mac_flagship/, 'macFlagship'], [/gravity_tower/, 'gravityTower'], [/glass_villa/, 'glassVilla'], [/water_mirror/, 'waterMirror'], [/apple_video_billboard/, 'appleVideoBillboard'], [/macos_section/, 'macosSection'], [/apple_billboard/, 'appleBillboard']
  ];
  rules.slice().reverse().forEach(([pattern, name]) => PropKit.registerBuilder(pattern, name, builders[name]));
})();

// ============================================================================
// MAC DEMO: TRY A MAC AT THE HOUSE OF MAC AVENUE TABLES
// ============================================================================
// E on a MacBook on display opens a working macOS-style desktop: menu bar
// with a live clock, Dock, draggable windows, Spotlight (Ctrl/Cmd+Space),
// Finder, Safari (opens real sites in a new tab), Terminal (a small shell),
// Notes (saved in this browser), Calculator, System Settings (wallpaper and
// dark mode) and About This Mac. Esc or "Leave demo" returns to the store.
const MacDemo = (() => {
  let overlay = null;
  let model = 'MacBook Pro';
  const appleIcon = (size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" style="vertical-align:-2px"><path d="${APPLE_PATH}"/></svg>`;
  const APPLE_PATH = 'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';
  let zTop = 10;
  const WALLPAPERS = {
    Tahoe: 'linear-gradient(160deg, #0b3d91 0%, #1e6fd9 35%, #8ec5ff 60%, #f7b2d9 100%)',
    Sequoia: 'linear-gradient(200deg, #1b2a49 0%, #3a5a8c 40%, #e07a5f 85%, #f2cc8f 100%)',
    Graphite: 'linear-gradient(180deg, #2b2d33 0%, #4a4e57 100%)',
    Aurora: 'linear-gradient(140deg, #0f2027 0%, #2c5364 40%, #43c6ac 75%, #f8ffae 100%)'
  };
  const FILES = {
    '/Users/dev': ['Desktop', 'Documents', 'Downloads', 'Projects', 'README.txt'],
    '/Users/dev/Desktop': ['Screenshot 2026-10-28.png', 'todo.txt'],
    '/Users/dev/Documents': ['Resume.pdf', 'Notes.txt', 'Budget.numbers'],
    '/Users/dev/Downloads': ['node-v22.pkg', 'Xcode.xip', 'wallpaper.heic'],
    '/Users/dev/Projects': ['github-multiverse', 'hello-swift', 'dotfiles']
  };
  const TEXT = {
    '/Users/dev/README.txt': 'Welcome to the House of MAC demo Mac. Everything here is a simulation running in your browser.',
    '/Users/dev/Desktop/todo.txt': '- ship it\n- fix the bug\n- write tests (really)',
    '/Users/dev/Documents/Notes.txt': 'Remember: it works on my machine.'
  };
  const store = (action, key, value) => { try { if (action === 'get') return localStorage.getItem(key); localStorage.setItem(key, value); } catch (error) { return null; } return null; };
  const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function css() {
    if (document.getElementById('macdemo-style')) return;
    const style = document.createElement('style');
    style.id = 'macdemo-style';
    style.textContent = `
      #macdemo { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.75); font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
      #macdemo .md-screen { position: relative; width: min(1180px, 96vw); height: min(720px, 88vh); border-radius: 14px; overflow: hidden; border: 10px solid #111; box-shadow: 0 30px 80px rgba(0,0,0,0.6); color: #1d1d1f; }
      #macdemo.dark .md-screen { color: #f5f5f7; }
      #macdemo .md-wall { position: absolute; inset: 0; }
      #macdemo .md-menubar { position: absolute; top: 0; left: 0; right: 0; height: 26px; display: flex; align-items: center; gap: 16px; padding: 0 12px; background: rgba(255,255,255,0.55); backdrop-filter: blur(20px); z-index: 1000; font-weight: 500; }
      #macdemo.dark .md-menubar { background: rgba(30,30,32,0.6); }
      #macdemo .md-menubar .md-right { margin-left: auto; display: flex; gap: 14px; align-items: center; }
      #macdemo .md-menubar button { background: none; border: 0; color: inherit; font: inherit; cursor: pointer; padding: 2px 4px; border-radius: 4px; }
      #macdemo .md-menubar button:hover { background: rgba(0,0,0,0.12); }
      #macdemo .md-applemenu { position: absolute; top: 26px; left: 8px; min-width: 200px; background: rgba(246,246,246,0.96); color: #1d1d1f; border-radius: 8px; padding: 5px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); z-index: 1001; display: none; }
      #macdemo .md-applemenu div { padding: 5px 10px; border-radius: 5px; cursor: pointer; }
      #macdemo .md-applemenu div:hover { background: #0a64d8; color: #fff; }
      #macdemo .md-dock { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; padding: 7px 10px; border-radius: 18px; background: rgba(255,255,255,0.35); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.4); z-index: 1000; }
      #macdemo .md-dock button { width: 48px; height: 48px; border-radius: 12px; border: 0; cursor: pointer; font-size: 11px; font-weight: 700; color: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.25); transition: transform 0.12s; position: relative; }
      #macdemo .md-dock button:hover { transform: translateY(-6px) scale(1.12); }
      #macdemo .md-dock button.open::after { content: ''; position: absolute; bottom: -6px; left: 50%; width: 4px; height: 4px; margin-left: -2px; border-radius: 50%; background: #1d1d1f; }
      #macdemo .md-win { position: absolute; min-width: 320px; min-height: 200px; background: #fff; color: #1d1d1f; border-radius: 10px; box-shadow: 0 18px 50px rgba(0,0,0,0.35); display: flex; flex-direction: column; overflow: hidden; resize: both; }
      #macdemo.dark .md-win { background: #1e1e20; color: #f5f5f7; }
      #macdemo .md-title { height: 30px; display: flex; align-items: center; gap: 8px; padding: 0 10px; background: rgba(0,0,0,0.04); cursor: grab; user-select: none; font-weight: 600; }
      #macdemo.dark .md-title { background: rgba(255,255,255,0.06); }
      #macdemo .md-title span.md-dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; cursor: pointer; }
      #macdemo .md-title .md-name { flex: 1; text-align: center; margin-right: 50px; }
      #macdemo .md-body { flex: 1; overflow: auto; padding: 10px; }
      #macdemo .md-term { background: #1e1e1e; color: #d4d4d4; font: 13px Menlo, Consolas, monospace; white-space: pre-wrap; padding: 10px; height: 100%; box-sizing: border-box; overflow: auto; }
      #macdemo .md-term input { background: none; border: 0; outline: none; color: #d4d4d4; font: inherit; width: 70%; }
      #macdemo .md-finder { display: flex; height: 100%; }
      #macdemo .md-finder aside { width: 140px; padding-right: 8px; border-right: 1px solid rgba(128,128,128,0.25); }
      #macdemo .md-finder aside div, #macdemo .md-finder .md-files div { padding: 4px 8px; border-radius: 5px; cursor: pointer; }
      #macdemo .md-finder aside div:hover, #macdemo .md-finder .md-files div:hover { background: rgba(10,100,216,0.15); }
      #macdemo .md-finder .md-files { flex: 1; padding-left: 10px; }
      #macdemo .md-safari input { width: 100%; box-sizing: border-box; padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(128,128,128,0.4); background: rgba(128,128,128,0.08); color: inherit; }
      #macdemo .md-favs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-top: 18px; }
      #macdemo .md-favs a { display: flex; flex-direction: column; align-items: center; gap: 6px; text-decoration: none; color: inherit; }
      #macdemo .md-favs a b { width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 20px; }
      #macdemo .md-calc { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
      #macdemo .md-calc .md-display { grid-column: span 4; text-align: right; font-size: 32px; padding: 8px; background: #2b2b2d; color: #fff; border-radius: 6px; overflow: hidden; }
      #macdemo .md-calc button { height: 44px; border-radius: 22px; border: 0; font-size: 18px; cursor: pointer; background: #d4d4d2; }
      #macdemo .md-calc button.op { background: #ff9f0a; color: #fff; }
      #macdemo textarea { width: 100%; height: 100%; box-sizing: border-box; border: 0; outline: none; resize: none; background: transparent; color: inherit; font: 14px -apple-system, "Segoe UI", sans-serif; }
      #macdemo .md-spot { position: absolute; top: 22%; left: 50%; transform: translateX(-50%); width: 540px; background: rgba(240,240,240,0.92); color: #1d1d1f; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.35); z-index: 1002; display: none; padding: 6px; }
      #macdemo .md-spot input { width: 100%; box-sizing: border-box; font-size: 22px; padding: 10px; border: 0; outline: none; background: transparent; }
      #macdemo .md-spot div { padding: 6px 12px; border-radius: 6px; cursor: pointer; }
      #macdemo .md-spot div.sel, #macdemo .md-spot div:hover { background: #0a64d8; color: #fff; }
      #macdemo .md-leave { position: absolute; top: 14px; right: 18px; z-index: 95; background: #fff; border: 0; border-radius: 18px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
      #macdemo .md-swatch { display: inline-block; width: 70px; height: 46px; border-radius: 8px; margin: 4px; cursor: pointer; border: 2px solid transparent; }
      #macdemo .md-swatch.sel { border-color: #0a64d8; }
    `;
    document.head.appendChild(style);
  }

  const APPS = {
    finder: { name: 'Finder', color: 'linear-gradient(180deg,#5ac8fa,#007aff)', label: 'Fn', w: 560, h: 340, render: finder },
    safari: { name: 'Safari', color: 'linear-gradient(180deg,#34c3ff,#0a64d8)', label: 'Sf', w: 640, h: 420, render: safari },
    terminal: { name: 'Terminal', color: '#2b2b2d', label: '>_', w: 600, h: 360, render: terminal },
    notes: { name: 'Notes', color: 'linear-gradient(180deg,#ffd60a,#ffb800)', label: 'Nt', w: 420, h: 360, render: notes },
    calculator: { name: 'Calculator', color: '#505050', label: '±', w: 260, h: 380, render: calculator },
    settings: { name: 'System Settings', color: 'linear-gradient(180deg,#8e8e93,#636366)', label: 'St', w: 480, h: 340, render: settings },
    about: { name: 'About This Mac', color: '#1d1d1f', label: 'i', w: 360, h: 300, render: about, hidden: true }
  };

  function open(which) {
    model = which || 'MacBook Pro';
    css();
    if (overlay) overlay.remove();
    overlay = document.createElement('div');
    overlay.id = 'macdemo';
    if (store('get', 'macdemo-dark') === '1') overlay.classList.add('dark');
    overlay.innerHTML = `
      <button class="md-leave" type="button">Leave demo (Esc)</button>
      <div class="md-screen">
        <div class="md-wall"></div>
        <div class="md-menubar"><button data-act="apple">${appleIcon(14)}</button><b class="md-app">Finder</b><span>File</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span>
          <div class="md-right"><button data-act="spot">Search</button><span class="md-clock"></span></div></div>
        <div class="md-applemenu"><div data-menu="about">About This Mac</div><div data-menu="settings">System Settings...</div><div data-menu="spot">Spotlight</div><div data-menu="leave">Leave demo</div></div>
        <div class="md-spot"><input placeholder="Spotlight Search" /><section></section></div>
        <div class="md-dock">${Object.entries(APPS).filter(([, app]) => !app.hidden).map(([key, app]) => `<button data-app="${key}" title="${app.name}" style="background:${app.color}">${esc(app.label)}</button>`).join('')}</div>
      </div>`;
    document.body.appendChild(overlay);
    applyWallpaper();
    // Keys typed in the demo never reach the game (no walking, no shortcuts)
    ['keydown', 'keyup', 'keypress'].forEach((type) => overlay.addEventListener(type, (event) => {
      event.stopPropagation();
      if (type !== 'keydown') return;
      if (event.key === 'Escape') { if (spotOpen()) toggleSpot(false); else close(); }
      if (event.key === ' ' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); toggleSpot(); }
    }));
    overlay.tabIndex = -1;
    overlay.focus();
    overlay.querySelector('.md-leave').addEventListener('click', close);
    overlay.querySelector('[data-act="apple"]').addEventListener('click', () => { const menu = overlay.querySelector('.md-applemenu'); menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; });
    overlay.querySelector('[data-act="spot"]').addEventListener('click', () => toggleSpot());
    overlay.querySelectorAll('[data-menu]').forEach((item) => item.addEventListener('click', () => {
      overlay.querySelector('.md-applemenu').style.display = 'none';
      const act = item.dataset.menu;
      if (act === 'leave') close(); else if (act === 'spot') toggleSpot(); else launch(act);
    }));
    overlay.querySelectorAll('.md-dock button').forEach((button) => button.addEventListener('click', () => launch(button.dataset.app)));
    const spotInput = overlay.querySelector('.md-spot input');
    spotInput.addEventListener('input', renderSpot);
    spotInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') { const first = overlay.querySelector('.md-spot section div'); if (first) first.click(); } });
    tick();
    launch('finder');
  }

  function close() {
    if (overlay) overlay.remove();
    overlay = null;
  }

  function tick() {
    if (!overlay) return;
    const now = new Date();
    overlay.querySelector('.md-clock').textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + '  ' + now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setTimeout(tick, 15000);
  }

  function applyWallpaper() {
    const name = store('get', 'macdemo-wallpaper') || 'Tahoe';
    overlay.querySelector('.md-wall').style.background = WALLPAPERS[name] || WALLPAPERS.Tahoe;
  }

  const spotOpen = () => overlay && overlay.querySelector('.md-spot').style.display === 'block';
  function toggleSpot(force) {
    const spot = overlay.querySelector('.md-spot');
    const show = force === undefined ? spot.style.display !== 'block' : force;
    spot.style.display = show ? 'block' : 'none';
    if (show) { const input = spot.querySelector('input'); input.value = ''; renderSpot(); input.focus(); }
  }
  function renderSpot() {
    const query = overlay.querySelector('.md-spot input').value.trim().toLowerCase();
    const section = overlay.querySelector('.md-spot section');
    const results = Object.entries(APPS).filter(([, app]) => !query || app.name.toLowerCase().includes(query));
    let math = null;
    if (/^[\d\s+\-*/().%]+$/.test(query) && /\d/.test(query)) { try { math = Function(`"use strict"; return (${query})`)(); } catch (error) { math = null; } }
    section.innerHTML = (typeof math === 'number' && isFinite(math) ? `<div data-math="1">= ${esc(math)}</div>` : '') + results.map(([key, app]) => `<div data-app="${key}">${esc(app.name)}</div>`).join('') + (query ? `<div data-web="1">Search the web for "${esc(query)}"</div>` : '');
    section.querySelectorAll('div').forEach((row, index) => {
      if (!index) row.classList.add('sel');
      row.addEventListener('click', () => {
        toggleSpot(false);
        if (row.dataset.app) launch(row.dataset.app);
        if (row.dataset.web) window.open(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, '_blank', 'noopener');
      });
    });
  }

  function launch(key) {
    const app = APPS[key];
    if (!app) return;
    const existing = overlay.querySelector(`.md-win[data-app="${key}"]`);
    if (existing) { existing.style.display = 'flex'; existing.style.zIndex = ++zTop; return; }
    const screen = overlay.querySelector('.md-screen');
    const count = overlay.querySelectorAll('.md-win').length;
    const win = document.createElement('div');
    win.className = 'md-win';
    win.dataset.app = key;
    win.style.width = `${app.w}px`;
    win.style.height = `${app.h}px`;
    win.style.left = `${60 + count * 36}px`;
    win.style.top = `${50 + count * 30}px`;
    win.style.zIndex = ++zTop;
    win.innerHTML = `<div class="md-title"><span class="md-dot" data-act="close" style="background:#ff5f57"></span><span class="md-dot" data-act="min" style="background:#febc2e"></span><span class="md-dot" data-act="max" style="background:#28c840"></span><span class="md-name">${esc(app.name)}</span></div><div class="md-body"></div>`;
    screen.appendChild(win);
    app.render(win.querySelector('.md-body'));
    overlay.querySelector('.md-app').textContent = app.name;
    const dockButton = overlay.querySelector(`.md-dock [data-app="${key}"]`);
    if (dockButton) dockButton.classList.add('open');
    win.addEventListener('pointerdown', () => { win.style.zIndex = ++zTop; overlay.querySelector('.md-app').textContent = app.name; });
    win.querySelector('[data-act="close"]').addEventListener('click', () => { win.remove(); if (dockButton) dockButton.classList.remove('open'); });
    win.querySelector('[data-act="min"]').addEventListener('click', () => { win.style.display = 'none'; });
    win.querySelector('[data-act="max"]').addEventListener('click', () => {
      const max = win.dataset.max !== '1';
      win.dataset.max = max ? '1' : '0';
      Object.assign(win.style, max ? { left: '0px', top: '26px', width: '100%', height: 'calc(100% - 26px - 72px)' } : { left: '80px', top: '60px', width: `${app.w}px`, height: `${app.h}px` });
    });
    // Drag by the title bar
    const title = win.querySelector('.md-title');
    title.addEventListener('pointerdown', (event) => {
      if (event.target.classList.contains('md-dot')) return;
      const start = { x: event.clientX, y: event.clientY, left: win.offsetLeft, top: win.offsetTop };
      const move = (e) => { win.style.left = `${start.left + e.clientX - start.x}px`; win.style.top = `${Math.max(26, start.top + e.clientY - start.y)}px`; };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  function finder(body) {
    let path = '/Users/dev';
    body.innerHTML = '<div class="md-finder"><aside><div data-go="/Users/dev">dev</div><div data-go="/Users/dev/Desktop">Desktop</div><div data-go="/Users/dev/Documents">Documents</div><div data-go="/Users/dev/Downloads">Downloads</div><div data-go="/Users/dev/Projects">Projects</div><div data-go="apps">Applications</div></aside><div class="md-files"></div></div>';
    const files = body.querySelector('.md-files');
    const show = () => {
      if (path === 'apps') {
        files.innerHTML = Object.entries(APPS).map(([key, app]) => `<div data-app="${key}">${esc(app.name)}.app</div>`).join('');
      } else {
        files.innerHTML = `<p style="opacity:.6;margin:0 0 6px">${esc(path)}</p>` + (FILES[path] || []).map((name) => `<div data-name="${esc(name)}">${FILES[`${path}/${name}`] ? '[folder] ' : ''}${esc(name)}</div>`).join('');
      }
      files.querySelectorAll('[data-app]').forEach((row) => row.addEventListener('dblclick', () => launch(row.dataset.app)));
      files.querySelectorAll('[data-name]').forEach((row) => row.addEventListener('dblclick', () => {
        const next = `${path}/${row.dataset.name}`;
        if (FILES[next]) { path = next; show(); }
        else if (TEXT[next]) { launch('notes'); const area = overlay.querySelector('.md-win[data-app="notes"] textarea'); if (area) area.value = TEXT[next]; }
      }));
    };
    body.querySelectorAll('[data-go]').forEach((item) => item.addEventListener('click', () => { path = item.dataset.go; show(); }));
    show();
  }

  function safari(body) {
    const favorites = [['GitHub', 'https://github.com', '#24292f'], ['Apple', 'https://www.apple.com', '#1d1d1f'], ['MDN', 'https://developer.mozilla.org', '#0b4fa8'], ['Wikipedia', 'https://www.wikipedia.org', '#555'], ['Stack Overflow', 'https://stackoverflow.com', '#f48024'], ['Hacker News', 'https://news.ycombinator.com', '#ff6600'], ['YouTube', 'https://www.youtube.com', '#e62117'], ['Swift', 'https://www.swift.org', '#f05138']];
    body.innerHTML = `<div class="md-safari"><input placeholder="Search or enter website name" /><h3 style="margin:16px 0 0">Favorites</h3><div class="md-favs">${favorites.map(([name, url, color]) => `<a href="${url}" target="_blank" rel="noopener"><b style="background:${color}">${esc(name[0])}</b>${esc(name)}</a>`).join('')}</div><p style="opacity:.6">Sites open in a new browser tab.</p></div>`;
    const input = body.querySelector('input');
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !input.value.trim()) return;
      const value = input.value.trim();
      const url = /^https?:\/\//.test(value) ? value : /\.[a-z]{2,}(\/|$)/i.test(value) ? `https://${value}` : `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
      window.open(url, '_blank', 'noopener');
    });
  }

  function terminal(body) {
    let cwd = '/Users/dev';
    body.style.padding = '0';
    body.innerHTML = '<div class="md-term"></div>';
    const term = body.querySelector('.md-term');
    let history = `Last login: ${new Date().toDateString()} on ttys001\n`;
    const prompt = () => `dev@${model.replace(/\s+/g, '-')} ${cwd === '/Users/dev' ? '~' : cwd.split('/').pop()} % `;
    const commands = {
      help: () => 'Commands: ls, cd, pwd, cat, echo, whoami, date, uname, sw_vers, neofetch, open, brew, git, node, python3, clear, exit',
      ls: () => (FILES[cwd] || []).join('   '),
      pwd: () => cwd,
      whoami: () => 'dev',
      date: () => new Date().toString(),
      uname: (args) => (args[0] === '-a' ? `Darwin ${model} 26.0.0 Darwin Kernel arm64` : 'Darwin'),
      sw_vers: () => 'ProductName:    macOS\nProductVersion: 26.0 (Tahoe)\nBuildVersion:   26A100',
      echo: (args) => args.join(' '),
      cat: (args) => TEXT[`${cwd}/${args[0]}`] || `cat: ${args[0] || ''}: No such file or directory`,
      cd: (args) => {
        const target = !args[0] || args[0] === '~' ? '/Users/dev' : args[0] === '..' ? cwd.split('/').slice(0, -1).join('/') || '/Users/dev' : `${cwd}/${args[0]}`;
        if (FILES[target]) { cwd = target; return ''; }
        return `cd: no such file or directory: ${args[0]}`;
      },
      neofetch: () => `                    dev@${model}\n        .:'         -----------\n    __ :'__         OS: macOS 26 Tahoe arm64\n .'\`  \`-'  \`\`.     Host: ${model}\n:          .-'      Chip: Apple M6\n:         :         Memory: 24 GB\n :         \`-;      Shell: zsh 5.9\n  \`.__.-.__.'       Terminal: Terminal.app`,
      open: (args) => { const app = Object.keys(APPS).find((key) => APPS[key].name.toLowerCase().replace(/\s+/g, '') === (args[args.indexOf('-a') + 1] || args[0] || '').toLowerCase()); if (app) { launch(app); return ''; } return 'Usage: open -a <Finder|Safari|Notes|Calculator>'; },
      brew: (args) => (args[0] === 'install' && args[1] ? `==> Downloading ${args[1]}\n==> Pouring ${args[1]}--latest.arm64_tahoe.bottle.tar.gz\n🍺  ${args[1]} was successfully installed!`.replace('🍺  ', '') : 'Example usage:\n  brew install FORMULA'),
      git: (args) => (args[0] === 'status' ? 'On branch main\nYour branch is up to date with \'origin/main\'.\n\nnothing to commit, working tree clean' : args[0] === 'log' ? 'commit 1a0289d (HEAD -> main)\n    GitHub Multiverse v8' : `git version 2.47.0`),
      node: () => 'v22.11.0',
      python3: () => 'Python 3.13.0',
      clear: () => { history = ''; return null; },
      exit: () => { setTimeout(() => { const win = body.closest('.md-win'); if (win) win.remove(); }, 50); return '[Process completed]'; }
    };
    const render = () => {
      term.innerHTML = `${esc(history)}${esc(prompt())}<input spellcheck="false" />`;
      const input = term.querySelector('input');
      input.focus();
      term.scrollTop = term.scrollHeight;
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        const line = input.value;
        const [name, ...args] = line.trim().split(/\s+/);
        history += `${prompt()}${line}\n`;
        if (name) {
          const result = commands[name] ? commands[name](args) : `zsh: command not found: ${name}`;
          if (result) history += `${result}\n`;
        }
        render();
      });
    };
    term.addEventListener('click', () => { const input = term.querySelector('input'); if (input) input.focus(); });
    render();
  }

  function notes(body) {
    body.innerHTML = '<textarea placeholder="Start typing..."></textarea>';
    const area = body.querySelector('textarea');
    area.value = store('get', 'macdemo-notes') || '';
    area.addEventListener('input', () => store('set', 'macdemo-notes', area.value));
    area.focus();
  }

  function calculator(body) {
    body.style.background = '#1c1c1e';
    body.innerHTML = `<div class="md-calc"><div class="md-display">0</div>${['AC', '+/-', '%', '/', '7', '8', '9', '*', '4', '5', '6', '-', '1', '2', '3', '+', '0', '.', '=', '<'].map((key) => `<button class="${/[/*\-+=]/.test(key) ? 'op' : ''}">${key}</button>`).join('')}</div>`;
    const display = body.querySelector('.md-display');
    let expression = '';
    const show = (value) => { display.textContent = value || '0'; };
    body.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      const key = button.textContent;
      if (key === 'AC') expression = '';
      else if (key === '<') expression = expression.slice(0, -1);
      else if (key === '+/-') expression = expression.startsWith('-') ? expression.slice(1) : `-${expression}`;
      else if (key === '=') {
        try { const value = Function(`"use strict"; return (${expression.replace(/%/g, '/100')})`)(); expression = isFinite(value) ? String(Math.round(value * 1e10) / 1e10) : 'Error'; } catch (error) { expression = 'Error'; }
      } else expression = (expression === 'Error' ? '' : expression) + key;
      show(expression);
    }));
  }

  function settings(body) {
    const current = store('get', 'macdemo-wallpaper') || 'Tahoe';
    body.innerHTML = `<h3 style="margin-top:0">Wallpaper</h3>${Object.entries(WALLPAPERS).map(([name, value]) => `<span class="md-swatch${name === current ? ' sel' : ''}" data-wall="${name}" title="${name}" style="background:${value}"></span>`).join('')}<h3>Appearance</h3><label><input type="checkbox" class="md-darkmode" ${overlay.classList.contains('dark') ? 'checked' : ''}/> Dark mode</label>`;
    body.querySelectorAll('[data-wall]').forEach((swatch) => swatch.addEventListener('click', () => {
      store('set', 'macdemo-wallpaper', swatch.dataset.wall);
      body.querySelectorAll('[data-wall]').forEach((other) => other.classList.toggle('sel', other === swatch));
      applyWallpaper();
    }));
    body.querySelector('.md-darkmode').addEventListener('change', (event) => {
      overlay.classList.toggle('dark', event.target.checked);
      store('set', 'macdemo-dark', event.target.checked ? '1' : '0');
    });
  }

  function about(body) {
    body.innerHTML = `<div style="text-align:center"><div>${appleIcon(54)}</div><h2 style="margin:6px 0">${esc(model)}</h2><p style="opacity:.7;margin:0">16-inch, 2026</p><p>Chip: Apple M6<br>Memory: 24 GB<br>Startup disk: Macintosh HD<br>macOS Tahoe 26.0</p><p style="opacity:.5;font-size:11px">Demo unit at the House of MAC. Simulated in your browser.</p></div>`;
  }

  return { open, close, isOpen: () => Boolean(overlay) };
})();
