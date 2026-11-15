// ============================================================================
// GENESIS PLAZA SQUARES: OPEN-SPACE SCENES AROUND THE SPAWN
// ============================================================================
// Decentraland-style scenes placed on the commons near the start area:
// - round_pavilion: a round two-storey pavilion with a glowing ring on the
//   roof terrace, wrapped by red planters with pink and orange trees
// - wave_cube: a big white cube of horizontal slats with a carved wave relief
//   and a little forest on top
// - retro_arcade: a curved dark arcade hall with a lit marquee, banners,
//   cabinets inside and a terrace with umbrellas
// - screen_amphitheater: stepped seats facing a giant curved screen, under a
//   curved wooden canopy and strings of light bulbs
// - ring_colosseum: a ring-shaped hall raised on columns with red banners,
//   wide steps, low-poly boulders and big stylized trees
(() => {
  const { material, glow, mesh, box, cylinder, sphere, animate, textSprite, interactive, canvasTexture } = PropKit.kit;

  // Concrete with soft stains and panel seams (shared by several landmarks)
  function concreteTexture(base, key) {
    return canvasTexture(`landmark-concrete|${key}|${base}`, 512, 512, (ctx, w) => {
      let seed = 21;
      const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, w);
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = random() < 0.5 ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.06)';
        ctx.fillRect(random() * w, random() * w, 1 + random() * 3, 1 + random() * 3);
      }
      for (let i = 0; i < 10; i++) {
        const x = random() * w;
        const y = random() * w;
        const r = 40 + random() * 90;
        const stain = ctx.createRadialGradient(x, y, 0, x, y, r);
        stain.addColorStop(0, 'rgba(0, 0, 0, 0.06)');
        stain.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = stain;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, w - 2);
    });
  }

  function concrete(base, key, repeatX = 1, repeatY = 1) {
    const texture = concreteTexture(base, key).clone();
    texture.needsUpdate = true;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
  }

  // Stylized tree with a puffy crown (pink, orange, green...)
  // Realistic leafy tree: pink colors become cherry blossoms, orange/red autumn leaves
  function puffyTree(color, height = 5) {
    const hue = new THREE.Color(color || '#2f9e44').getHSL({}).h;
    const variant = hue > 0.85 || hue < 0.02 ? 'blossom' : hue < 0.15 ? 'autumn' : 'green';
    const group = new THREE.Group();
    group.add(PropKit.kit.realisticTree('broadleaf', height * 1.25, variant));
    return group;
  }

  function bench(length = 2.4) {
    const seatGroup = new THREE.Group();
    seatGroup.add(box(length, 0.12, 0.6, material('#b07d4f', { roughness: 0.8 }), 0, 0.46, 0));
    [-length / 2 + 0.2, length / 2 - 0.2].forEach((x) => seatGroup.add(box(0.12, 0.42, 0.5, material('#3a3f4b', { metalness: 0.5 }), x, 0.21, 0)));
    return interactive(seatGroup, 'sit', 'Bench');
  }

  const builders = {
    // ------------------------------------------------------------------------
    round_pavilion(group, { w, label }) {
      const radius = w / 2;
      // Red planter ring with a paved walkway
      group.add(cylinder(radius, radius, 0.3, material('#d9d4cc', { roughness: 0.9 }), 0, 0.15, 0, 48));
      const planter = mesh(new THREE.RingGeometry(radius * 0.72, radius * 0.97, 48, 1).rotateX(-Math.PI / 2), material('#c92a2a', { roughness: 1 }), 0, 0.32, 0);
      planter.raycast = () => {};
      group.add(planter);
      const path = mesh(new THREE.RingGeometry(radius * 0.58, radius * 0.72, 48, 1).rotateX(-Math.PI / 2), material('#9aa0a6', { roughness: 0.8 }), 0, 0.31, 0);
      path.raycast = () => {};
      group.add(path);
      // Building: two stacked rounded drums with a dark glass band
      const body = radius * 0.52;
      const wall = concrete('#a39382', 'pavilion', 6, 1);
      group.add(mesh(new THREE.CylinderGeometry(body, body, 4.4, 40, 1, true), wall, 0, 2.5, 0));
      group.add(mesh(new THREE.CylinderGeometry(body * 1.02, body * 1.02, 1.4, 40, 1, true), material('#1f2a36', { metalness: 0.6, roughness: 0.15, transparent: true, opacity: 0.85 }), 0, 2.2, 0));
      group.add(cylinder(body * 1.08, body * 1.08, 0.5, material('#6d6259', { roughness: 0.7 }), 0, 4.9, 0, 40));
      const floor = cylinder(body * 1.05, body * 1.05, 0.3, material('#d9cfc1'), 0, 5.2, 0, 40);
      group.add(floor);
      // Rooftop terrace: glowing ring, tables and a small bar
      const ring = mesh(new THREE.TorusGeometry(body * 0.72, 0.18, 8, 64).rotateX(Math.PI / 2), glow('#ffb703', 2.2), 0, 5.5, 0);
      ring.raycast = () => {};
      group.add(ring);
      const innerRing = mesh(new THREE.TorusGeometry(body * 0.3, 0.12, 8, 48).rotateX(Math.PI / 2), glow('#ff8c00', 2), 0, 5.45, 0);
      innerRing.raycast = () => {};
      group.add(innerRing);
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + 0.4;
        group.add(cylinder(0.5, 0.5, 0.06, material('#ffffff'), Math.cos(angle) * body * 0.5, 6.1, Math.sin(angle) * body * 0.5, 16));
        group.add(cylinder(0.06, 0.06, 0.75, material('#333'), Math.cos(angle) * body * 0.5, 5.7, Math.sin(angle) * body * 0.5, 6));
      }
      // Rail around the terrace
      const rail = mesh(new THREE.TorusGeometry(body * 1.03, 0.05, 6, 64).rotateX(Math.PI / 2), material('#dee2e6', { metalness: 0.7 }), 0, 6.3, 0);
      rail.raycast = () => {};
      group.add(rail);
      // Elevator to the terrace
      const lift = new THREE.Group();
      lift.add(box(1.8, 2.6, 1.8, material('#e9ecef', { transparent: true, opacity: 0.4 }), 0, 1.3, 0));
      lift.position.set(0, 0.3, body + 1.6);
      lift.userData.destination = new THREE.Vector3(0, 5.4, body * 0.6);
      group.add(interactive(lift, 'warp', 'Up to the terrace'));
      const down = new THREE.Object3D();
      down.position.set(0, 5.4, body * 0.75);
      down.userData.destination = new THREE.Vector3(0, 0.4, body + 3.2);
      group.add(interactive(down, 'warp', 'Back down'));
      // Pink, orange and red trees in the planters
      const colors = ['#f783ac', '#ff922b', '#e64980', '#ffa94d', '#faa2c1'];
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2 + 0.2;
        if (Math.abs(Math.sin(angle) - 1) < 0.08) continue; // keep the entrance free
        const tree = puffyTree(colors[i % colors.length], 4.5 + (i % 3), 1.3 + (i % 2) * 0.4);
        tree.position.set(Math.cos(angle) * radius * 0.85, 0.3, Math.sin(angle) * radius * 0.85);
        group.add(tree);
      }
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const seatGroup = bench(2);
        seatGroup.position.set(Math.cos(angle) * radius * 0.65, 0.3, Math.sin(angle) * radius * 0.65);
        seatGroup.rotation.y = -angle + Math.PI / 2;
        group.add(seatGroup);
      }
      const sign = textSprite(label || 'The Round Pavilion', { width: 8, background: 'rgba(201, 42, 42, 0.92)' });
      sign.position.set(0, 8, 0);
      group.add(sign);
      animate(group, (time) => {
        ring.material.emissiveIntensity = 1.8 + Math.sin(time * 2) * 0.4;
      });
    },

    // ------------------------------------------------------------------------
    wave_cube(group, { w, label }) {
      const size = w;
      // Horizontal white slats with a carved wave relief (drawn as shading)
      const slats = canvasTexture('wave-cube-slats', 1024, 1024, (ctx, cw) => {
        ctx.fillStyle = '#f1f0f7';
        ctx.fillRect(0, 0, cw, cw);
        for (let y = 0; y < cw; y += 16) {
          ctx.fillStyle = 'rgba(120, 110, 150, 0.35)';
          ctx.fillRect(0, y + 12, cw, 4);
        }
        // Wave relief: concentric curved bands with shadow and highlight
        for (let i = 0; i < 9; i++) {
          ctx.lineWidth = 26;
          ctx.strokeStyle = `rgba(90, 80, 140, ${0.22 - i * 0.015})`;
          ctx.beginPath();
          ctx.ellipse(cw * 0.55, cw * 0.55, 140 + i * 38, 90 + i * 30, -0.35, Math.PI * 0.95, Math.PI * 2.35);
          ctx.stroke();
          ctx.lineWidth = 6;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
          ctx.stroke();
        }
        // Ivy along the relief
        ctx.strokeStyle = '#3f7d3a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        for (let t = 0; t < 1; t += 0.02) ctx.lineTo(cw * (0.2 + t * 0.6), cw * (0.85 - Math.sin(t * Math.PI) * 0.35));
        ctx.stroke();
        for (let i = 0; i < 30; i++) {
          ctx.fillStyle = i % 2 ? '#4c9a43' : '#2f6b2b';
          const t = i / 30;
          ctx.beginPath();
          ctx.ellipse(cw * (0.2 + t * 0.6) + 8, cw * (0.85 - Math.sin(t * Math.PI) * 0.35) - 6, 9, 5, t * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      const faceMaterial = new THREE.MeshStandardMaterial({ map: slats, roughness: 0.6 });
      group.add(box(size, size, size, faceMaterial, 0, size / 2, 0));
      // Doorway glow
      group.add(box(3, 3.4, 0.2, glow('#fff3bf', 1.4), 0, 1.7, size / 2 + 0.05));
      // A little forest on the roof
      for (let i = 0; i < 9; i++) {
        const tree = puffyTree(i % 2 ? '#2f9e44' : '#37b24d', 3 + (i % 3), 1.2);
        tree.position.set((i % 3 - 1) * size * 0.28, size, (Math.floor(i / 3) - 1) * size * 0.28);
        group.add(tree);
      }
      // Flower beds and a digital board in front
      for (let i = -2; i <= 2; i++) {
        group.add(box(3, 0.5, 1.4, material('#495057'), i * 4, 0.25, size / 2 + 5));
        [0, 1, 2].forEach((k) => group.add(sphere(0.3, material(['#f06595', '#ffd43b', '#74c0fc'][k], { flatShading: true }), i * 4 - 0.8 + k * 0.8, 0.75, size / 2 + 5, 6)));
      }
      const board = new THREE.Group();
      board.add(box(2.4, 4, 0.3, glow('#e03131', 0.9), 0, 3, 0));
      board.add(cylinder(0.1, 0.1, 1, material('#222'), 0, 0.5, 0, 6));
      board.position.set(-size / 2 - 3, 0, size / 2 + 2);
      board.userData = { label: label || 'The Wave Cube', info: 'A white slatted cube with a carved wave relief and a rooftop forest. Galleries inside host community exhibitions.' };
      group.add(interactive(board, 'inspect', 'The Wave Cube'));
    },

    // ------------------------------------------------------------------------
    retro_arcade(group, { w, d, label }) {
      const depth = d;
      const height = 9;
      // Curved dark shell: an extruded profile with a rounded top
      const profile = new THREE.Shape();
      profile.moveTo(-depth / 2, 0);
      profile.lineTo(depth / 2, 0);
      profile.lineTo(depth / 2 + 1.5, height * 0.55);
      profile.quadraticCurveTo(depth / 2 + 1.8, height, depth / 2 - 2, height);
      profile.lineTo(-depth / 2 + 1, height);
      profile.quadraticCurveTo(-depth / 2 - 1.5, height, -depth / 2 - 1.2, height * 0.6);
      profile.lineTo(-depth / 2, 0);
      const shellGeometry = new THREE.ExtrudeGeometry(profile, { depth: w, bevelEnabled: true, bevelSize: 0.4, bevelThickness: 0.4, bevelSegments: 3 });
      shellGeometry.translate(0, 0, -w / 2);
      shellGeometry.rotateY(Math.PI / 2);
      const shell = mesh(shellGeometry, material('#1c2541', { roughness: 0.35, metalness: 0.3 }), 0, 0, 0);
      group.add(shell);
      // Open glass ground floor at the front with a glowing ceiling
      group.add(box(w * 0.7, 3.6, 0.15, material('#a5d8ff', { transparent: true, opacity: 0.25, roughness: 0.05 }), 0, 1.8, depth / 2 + 0.6));
      group.add(box(w * 0.72, 0.25, 3, glow('#e7f5ff', 1.6), 0, 3.9, depth / 2 - 0.6));
      // Marquee and round portholes
      const marquee = canvasTexture(`arcade-marquee|${label}`, 1024, 160, (ctx, cw, ch) => {
        ctx.fillStyle = '#0b132b';
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 92px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = '#4dabf7';
        ctx.shadowBlur = 24;
        ctx.fillText((label || 'RETRO ARCADE').toUpperCase(), cw / 2, ch / 2 + 4);
      });
      group.add(box(w * 0.5, 1.4, 0.2, new THREE.MeshBasicMaterial({ map: marquee }), 0, 6.6, depth / 2 + 1.75));
      [-0.3, -0.15, 0.2, 0.32].forEach((t, i) => group.add(cylinder(0.45, 0.45, 0.2, glow(i % 2 ? '#74c0fc' : '#ffffff', 1.2), w * t, 6.4, depth / 2 + 1.7, 16).rotateX(Math.PI / 2)));
      // Red banners on the side
      [-1, 0, 1].forEach((i) => {
        group.add(cylinder(0.06, 0.06, 7, material('#ced4da', { metalness: 0.7 }), -w / 2 - 1.5, 3.5, i * 4, 6));
        group.add(box(0.05, 4.5, 1.4, material('#a61e4d', { roughness: 0.9 }), -w / 2 - 1.5, 4.6, i * 4 + 0.8));
      });
      // Arcade cabinets inside (E to play)
      for (let i = 0; i < 6; i++) {
        const cabinet = new THREE.Group();
        cabinet.add(box(0.9, 1.9, 0.8, material('#212529'), 0, 0.95, 0));
        cabinet.add(box(0.7, 0.55, 0.05, glow(['#51cf66', '#ff6b6b', '#4dabf7', '#ffd43b'][i % 4], 1.3), 0, 1.45, 0.42));
        cabinet.position.set(-w * 0.3 + i * (w * 0.6 / 5), 0, depth / 2 - 4);
        cabinet.rotation.y = Math.PI;
        group.add(interactive(cabinet, 'arcade', `Arcade cabinet ${i + 1}`));
      }
      // Terrace with umbrellas and lamp posts
      for (let i = 0; i < 4; i++) {
        const x = -w * 0.35 + i * (w * 0.7 / 3);
        const z = depth / 2 + 7;
        group.add(cylinder(0.05, 0.05, 2.4, material('#adb5bd'), x, 1.2, z, 6));
        group.add(mesh(new THREE.ConeGeometry(1.8, 0.7, 10), material('#343a40', { side: THREE.DoubleSide }), x, 2.5, z));
        group.add(cylinder(0.7, 0.7, 0.06, material('#f1f3f5'), x, 0.75, z, 14));
        [[-1.1, 0], [1.1, 0]].forEach(([dx]) => group.add(interactive(box(0.5, 0.45, 0.5, material('#8b1e3f'), x + dx, 0.23, z), 'sit', 'Terrace chair')));
      }
      [-w / 2 + 1, w / 2 - 1].forEach((x) => {
        group.add(cylinder(0.08, 0.1, 4.2, material('#1b1b1b'), x, 2.1, depth / 2 + 9, 8));
        group.add(sphere(0.35, glow('#fff9db', 2.5), x, 4.4, depth / 2 + 9, 12));
      });
    },

    // ------------------------------------------------------------------------
    screen_amphitheater(group, { w, label }) {
      const radius = w / 2;
      // Stepped seats in a half circle (walkable steps of 0.45 m)
      const stepMaterial = material('#d8c3a5', { roughness: 0.8 });
      for (let row = 0; row < 5; row++) {
        const inner = radius * 0.35 + row * 2;
        const step = mesh(new THREE.CylinderGeometry(inner + 2, inner + 2, 0.45 * (row + 1), 40, 1, false, Math.PI * 1.65, Math.PI * 0.7), stepMaterial, 0, 0.225 * (row + 1), 0);
        group.add(step);
      }
      for (let row = 0; row < 5; row++) {
        for (let i = 0; i < 5; i++) {
          const angle = -Math.PI * 0.3 + (i / 4) * Math.PI * 0.6;
          const spot = new THREE.Object3D();
          const r = radius * 0.35 + row * 2 + 1;
          spot.position.set(Math.sin(angle) * r, 0.45 * (row + 1) + 0.1, Math.cos(angle) * r);
          group.add(interactive(spot, 'sit', 'Amphitheater seat'));
        }
      }
      // Stage disc
      group.add(cylinder(radius * 0.3, radius * 0.3, 0.3, material('#2b2d42'), 0, 0.15, 0, 40));
      const stageRing = mesh(new THREE.TorusGeometry(radius * 0.3, 0.08, 6, 48).rotateX(Math.PI / 2), glow('#ffffff', 1.4), 0, 0.32, 0);
      stageRing.raycast = () => {};
      group.add(stageRing);
      // Giant curved screen behind the stage (plays the GitHub channel)
      const screenFrame = mesh(new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 9, 32, 1, true, Math.PI * 0.8, Math.PI * 0.4), material('#111318', { side: THREE.DoubleSide }), 0, 6, 0);
      group.add(screenFrame);
      const edge = mesh(new THREE.TorusGeometry(radius * 0.55, 0.12, 6, 40, Math.PI * 0.4), glow('#ffffff', 1.8), 0, 10.5, 0);
      edge.rotation.set(Math.PI / 2, 0, Math.PI * 0.8 + Math.PI / 2);
      edge.raycast = () => {};
      group.add(edge);
      const anchor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false }));
      anchor.position.set(0, 6, -radius * 0.52);
      group.add(anchor);
      if (window.VideoScreens && VideoScreens.channelUploadsEmbed) VideoScreens.register(anchor, radius * 0.6, radius * 0.34, VideoScreens.channelUploadsEmbed('UC7c3Kb6jYCRj4JOHHZTxKsQ'));
      // Curved wooden canopy over the seats
      const slat = material('#c8a27c', { roughness: 0.7 });
      for (let i = 0; i < 9; i++) {
        const angle = -Math.PI * 0.32 + (i / 8) * Math.PI * 0.64;
        const beam = box(0.5, 0.3, radius * 0.5, slat, Math.sin(angle) * radius * 0.78, 9 - i * 0.1, Math.cos(angle) * radius * 0.78);
        beam.rotation.y = angle;
        beam.rotation.x = -0.25;
        group.add(beam);
      }
      [-Math.PI * 0.32, Math.PI * 0.32].forEach((angle) => group.add(cylinder(0.25, 0.3, 9, material('#8d6e63'), Math.sin(angle) * radius * 0.95, 4.5, Math.cos(angle) * radius * 0.95, 8)));
      // Strings of light bulbs from the screen to the canopy
      const bulbs = [];
      for (let c = 0; c < 5; c++) {
        const from = new THREE.Vector3(-radius * 0.4 + c * radius * 0.2, 10.3, -radius * 0.45);
        const to = new THREE.Vector3(-radius * 0.5 + c * radius * 0.25, 8.6, radius * 0.6);
        const curve = new THREE.QuadraticBezierCurve3(from, new THREE.Vector3((from.x + to.x) / 2, 7, (from.z + to.z) / 2), to);
        const cable = mesh(new THREE.TubeGeometry(curve, 16, 0.04, 4), material('#1b1b1b'), 0, 0, 0);
        cable.raycast = () => {};
        group.add(cable);
        for (let k = 1; k < 6; k++) {
          const p = curve.getPoint(k / 6);
          const bulb = sphere(0.18, glow('#fff3bf', 2.2), p.x, p.y - 0.2, p.z, 8);
          bulb.raycast = () => {};
          bulbs.push(bulb);
          group.add(bulb);
        }
      }
      // Concert rig: towers of huge speakers on both sides of the stage, woofers
      // that pump to a 124 BPM kick, neon trims cycling through colors, and a
      // DJ booth with two turntables, a mixer and glowing front panel
      const cabinet = material('#16171b', { roughness: 0.55, metalness: 0.2 });
      const grille = material('#24262c', { roughness: 0.9 });
      const cone = material('#0c0c0e', { roughness: 0.4, metalness: 0.3 });
      const woofers = [];
      const neons = [];
      [-1, 1].forEach((side) => {
        const tower = new THREE.Group();
        for (let level = 0; level < 3; level++) {
          const y = 1.2 + level * 2.3;
          tower.add(box(2.4, 2.2, 1.8, cabinet, 0, y, 0));
          tower.add(box(2.2, 2.0, 0.05, grille, 0, y, 0.92));
          // Two woofers per cabinet on the lower boxes, horns on the top one
          const cones = level < 2 ? [[-0.5, y], [0.5, y]] : [[0, y + 0.35]];
          cones.forEach(([cx, cy]) => {
            const size = level < 2 ? 0.44 : 0.36;
            const ring = mesh(new THREE.TorusGeometry(size + 0.06, 0.05, 6, 24), glow('#ff2bd6', 1.6), cx, cy, 0.96);
            tower.add(ring);
            neons.push(ring);
            const woofer = mesh(new THREE.CylinderGeometry(size, size * 0.4, 0.25, 24).rotateX(Math.PI / 2), cone, cx, cy, 0.9);
            tower.add(woofer);
            woofers.push(woofer);
          });
          if (level === 2) tower.add(box(1.6, 0.4, 0.06, glow('#4dabf7', 1.4), 0, y - 0.55, 0.95));
        }
        const strip = box(0.08, 6.9, 0.08, glow('#4dabf7', 1.8), 1.25, 3.45, 0.95);
        tower.add(strip);
        neons.push(strip);
        tower.position.set(side * radius * 0.4, 0.3, -radius * 0.18);
        tower.rotation.y = -side * 0.35;
        tower.traverse((node) => { if (node.isMesh) node.castShadow = true; });
        group.add(tower);
        neons.push(tower);
      });
      const booth = new THREE.Group();
      booth.add(box(4.2, 1.1, 1.3, material('#1a1b20', { metalness: 0.4, roughness: 0.4 }), 0, 0.85, 0));
      const front = box(4.1, 0.9, 0.05, glow('#7048e8', 1.4), 0, 0.82, 0.67);
      booth.add(front);
      neons.push(front);
      booth.add(box(4.4, 0.08, 1.5, material('#2a2c33', { metalness: 0.5 }), 0, 1.44, 0));
      [-1.25, 1.25].forEach((x) => {
        booth.add(box(1.2, 0.1, 1.0, material('#3a3d45', { metalness: 0.6 }), x, 1.53, 0));
        const platter = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 32), material('#0b0b0d', { roughness: 0.3 }), x - 0.08, 1.6, 0);
        booth.add(platter);
        booth.add(cylinder(0.06, 0.06, 0.045, glow('#ff6b6b', 1.3), x - 0.08, 1.625, 0, 12));
        const arm = box(0.04, 0.03, 0.5, material('#c9ccd1', { metalness: 0.8 }), x + 0.42, 1.66, -0.05);
        arm.rotation.y = 0.35;
        booth.add(arm);
        woofers.push(platter);
        platter.userData.spin = true;
      });
      booth.add(box(0.7, 0.12, 0.9, material('#25272e', { metalness: 0.6 }), 0, 1.54, 0));
      for (let i = 0; i < 4; i++) booth.add(box(0.04, 0.05, 0.3, glow(['#51cf66', '#fcc419', '#ff6b6b', '#4dabf7'][i], 1.4), -0.24 + i * 0.16, 1.62, 0.1));
      booth.add(box(1.6, 0.06, 0.3, glow('#e64980', 1.5), 0, 1.47, 0.62));
      booth.position.set(0, 0.3, -radius * 0.12);
      group.add(interactive(booth, 'inspect', 'DJ booth: two turntables and a mixer'));
      // Own copies of the neon materials (shared materials would recolor other props)
      neons.forEach((part) => { if (part.isMesh) part.material = part.material.clone(); });
      const neonColors = ['#ff2bd6', '#4dabf7', '#51cf66', '#fcc419', '#7048e8'];
      const tint = new THREE.Color();
      animate(booth, (time) => {
        const beat = (time * 124 / 60) % 1;
        const kick = Math.exp(-beat * 9);
        woofers.forEach((part) => {
          if (part.userData.spin) { part.rotation.y = time * 3.5; return; }
          part.scale.set(1 + kick * 0.12, 1 + kick * 0.12, 1 + kick * 0.6);
        });
        tint.set(neonColors[Math.floor(time * 124 / 60 / 4) % neonColors.length]);
        neons.forEach((part) => {
          if (part.isGroup) { part.position.y = 0.3 + kick * 0.03; return; }
          part.material.emissive.copy(tint);
          part.material.color.copy(tint);
          part.material.emissiveIntensity = 1 + kick * 1.6;
        });
      });
      const sign = textSprite(label || 'Open Stage', { width: 7, background: 'rgba(43, 45, 66, 0.9)' });
      sign.position.set(0, 12.5, -radius * 0.5);
      group.add(sign);
      animate(group, (time) => bulbs.forEach((bulb, i) => { bulb.material.emissiveIntensity = 1.8 + Math.sin(time * 3 + i) * 0.5; }));
    },

    // ------------------------------------------------------------------------
    ring_colosseum(group, { w, label }) {
      const radius = w / 2;
      const stone = concrete('#8a8c74', 'colosseum', 12, 1);
      // Wide stairs up to the plateau
      for (let i = 0; i < 4; i++) group.add(box(14 - i, 0.4, 2, material('#9a9a8a', { roughness: 1 }), 0, 0.2 + i * 0.4, radius + 4 - i * 1.6));
      group.add(cylinder(radius + 2, radius + 2.4, 1.6, material('#a2a392', { roughness: 1 }), 0, 0.8, 0, 40));
      // Columns and the ring of wall panels on top
      const columns = 14;
      for (let i = 0; i < columns; i++) {
        const angle = (i / columns) * Math.PI * 2;
        group.add(cylinder(0.45, 0.55, 5.5, material('#6b8f71', { roughness: 0.8 }), Math.cos(angle) * radius, 4.35, Math.sin(angle) * radius, 10));
      }
      const wall = mesh(new THREE.CylinderGeometry(radius + 0.6, radius + 0.6, 4, 48, 1, true), stone, 0, 9, 0);
      wall.material.side = THREE.DoubleSide;
      group.add(wall);
      const lip = mesh(new THREE.TorusGeometry(radius + 0.6, 0.25, 6, 48).rotateX(Math.PI / 2), material('#76786a'), 0, 11, 0);
      group.add(lip);
      // Red banners hanging between the columns
      for (let i = 0; i < columns; i += 2) {
        const angle = ((i + 0.5) / columns) * Math.PI * 2;
        const banner = box(1.2, 2.6, 0.05, material('#c92a2a', { roughness: 0.9 }), Math.cos(angle) * (radius - 0.3), 5.6, Math.sin(angle) * (radius - 0.3));
        banner.rotation.y = -angle + Math.PI / 2;
        group.add(banner);
      }
      // Canopy flag on top and planters with orange flowers
      group.add(box(4, 0.1, 2.5, material('#e9c46a'), 0, 12.6, -radius * 0.4));
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        group.add(cylinder(0.5, 0.4, 0.6, material('#5c5f52'), Math.cos(angle) * radius * 0.6, 1.9, Math.sin(angle) * radius * 0.6, 8));
        group.add(sphere(0.45, material('#ff922b', { flatShading: true }), Math.cos(angle) * radius * 0.6, 2.4, Math.sin(angle) * radius * 0.6, 6));
      }
      // Low-poly boulders around
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + 0.3;
        if (Math.abs(angle - Math.PI / 2) < 0.4) continue; // stairs side
        const boulder = mesh(new THREE.DodecahedronGeometry(2 + (i % 3), 0), material('#8a8d8f', { flatShading: true, roughness: 1 }), Math.cos(angle) * (radius + 6), 1.4, Math.sin(angle) * (radius + 6));
        boulder.scale.set(1.3, 0.8 + (i % 2) * 0.5, 1);
        boulder.rotation.y = i;
        group.add(boulder);
      }
      // Big stylized trees: flat layered canopy and a deep green cone tree
      [[radius + 9, -6], [-(radius + 8), 5]].forEach(([x, z], i) => {
        const tree = new THREE.Group();
        tree.add(cylinder(0.5, 0.8, 7, material('#7a4e2d'), 0, 3.5, 0, 7));
        [[0, 7.5, 0, 6], [2.5, 8.6, 1, 4.5], [-2.2, 9.2, -1, 4]].forEach(([tx, ty, tz, r]) => {
          const crown = mesh(new THREE.CylinderGeometry(r, r * 1.1, 1.4, 7), material('#7cb342', { flatShading: true }), tx, ty, tz);
          tree.add(crown);
        });
        tree.position.set(x, 0, z);
        group.add(tree);
        const cone = mesh(new THREE.ConeGeometry(3.4, 10, 7), material('#1b7f6b', { flatShading: true }), x + (i ? 4 : -4), 5, z + 5);
        group.add(cone);
      });
      const sign = textSprite(label || 'The Ring', { width: 7, background: 'rgba(92, 95, 82, 0.92)' });
      sign.position.set(0, 14, 0);
      group.add(sign);
    }
  };

  Object.entries({
    round_pavilion: /round_pavilion/, wave_cube: /wave_cube/, retro_arcade: /retro_arcade/, screen_amphitheater: /screen_amphitheater/, ring_colosseum: /ring_colosseum/
  }).forEach(([name, pattern]) => PropKit.registerBuilder(pattern, name, builders[name]));
})();
