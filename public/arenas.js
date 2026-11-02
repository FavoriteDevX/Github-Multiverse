// ============================================================================
// ARENAS: THE PIT (HALF-SUNKEN FIGHT CLUB STADIUM) AND THE CANDLESTICK MAZE
// ============================================================================
// Two districts built from map blocks:
//
// 1) "pit_arena" (map_fight_arena.json): a gladiator pit that feels half
//    underground. A circular concrete floor with a radial pinwheel pattern and
//    two drain-grate rings sits at y=0, surrounded by a curved 6.5 m concrete
//    wall (panels + steel pilasters) with a red light line and red slit doors.
//    Dark stepped stands rise behind the wall, and a grass berm wraps the outside
//    so from the street the stadium reads as a low mound. A wide tunnel cuts
//    through the berm, stairs climb from the floor to the stands, and a lighting
//    truss with spotlights (fake additive cones, no real lights) hangs above.
//    E on the red gong starts a friendly sparring round with a countdown.
//
// 2) "candle_maze" (map_candlestick_maze.json): a seeded maze on a 4 m grid
//    whose walls are holographic glass panels drawn like a candlestick chart.
//    Three sectors follow MANA, ETH and BTC: wall heights follow each asset's
//    recent price history (CoinGecko public "simple price" endpoint, polled
//    every 60 s, small simulated ticks in between; if the feed fails, a smooth
//    simulated random walk is used and the boards say "SIMULATED"). Floors glow
//    green or red with the 24h change. Prices are informational only: there is
//    no trading, wallet or purchase anywhere in the game.
(() => {
  const { material, glow, mesh, box, cylinder, sphere, animate, textSprite, interactive, seat, canvasTexture, labelTexture } = PropKit.kit;

  // --------------------------------------------------------------------------
  // Shared helpers
  // --------------------------------------------------------------------------
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const noDecorRaycast = (object) => { object.traverse((node) => { node.raycast = () => {}; node.castShadow = false; }); return object; };

  function repeatTexture(texture, x, y) {
    const copy = texture.clone();
    copy.wrapS = copy.wrapT = THREE.RepeatWrapping;
    copy.repeat.set(x, y);
    copy.needsUpdate = true;
    return copy;
  }

  // Board-formed concrete: speckle noise, soft stains, form-tie holes and seams
  function concreteTexture(key, base, { seams = true, ties = true, size = 512, seed = 7 } = {}) {
    return canvasTexture(`arena-concrete|${key}`, size, size, (ctx, w, h) => {
      const random = seeded(seed);
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const x = random() * w;
        const y = random() * h;
        const r = 20 + random() * 90;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        const dark = random() < 0.5;
        gradient.addColorStop(0, dark ? 'rgba(0,0,0,0.09)' : 'rgba(255,255,255,0.06)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const image = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < image.data.length; i += 4) {
        const n = (random() - 0.5) * 26;
        image.data[i] += n; image.data[i + 1] += n; image.data[i + 2] += n;
      }
      ctx.putImageData(image, 0, 0);
      // Vertical rain streaks
      for (let i = 0; i < 30; i++) {
        ctx.fillStyle = `rgba(0,0,0,${0.03 + random() * 0.05})`;
        ctx.fillRect(random() * w, random() * h * 0.4, 1 + random() * 3, h * (0.2 + random() * 0.6));
      }
      if (seams) {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 3;
        ctx.strokeRect(1, 1, w - 2, h - 2);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      }
      if (ties) {
        for (let row = 1; row < 4; row++) {
          for (let col = 1; col < 4; col++) {
            const x = (col * w) / 4;
            const y = (row * h) / 4;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.beginPath(); ctx.arc(x - 1, y - 1, 2, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    });
  }

  function radialTexture(key, inner, outer) {
    return canvasTexture(`arena-radial|${key}`, 256, 256, (ctx, w, h) => {
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gradient.addColorStop(0, inner);
      gradient.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.45)'));
      gradient.addColorStop(1, outer);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    });
  }

  // Light beam texture: bright at the top (lamp) fading to nothing at the floor
  function beamTexture() {
    return canvasTexture('arena-beam', 64, 256, (ctx, w, h) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.35, 'rgba(200,205,215,0.55)');
      gradient.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    });
  }

  const additive = (map, color, opacity) => new THREE.MeshBasicMaterial({
    map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
  });

  const dummy = new THREE.Object3D();
  const UP = new THREE.Vector3(0, 1, 0);
  function placeBetween(target, a, b, thickness) {
    const direction = b.clone().sub(a);
    const length = direction.length();
    target.position.copy(a).addScaledVector(direction, 0.5);
    target.quaternion.setFromUnitVectors(UP, direction.normalize());
    target.scale.set(thickness, length, thickness);
    target.updateMatrix();
    return target.matrix;
  }

  function instancedFrom(geometry, instanceMaterial, matrices, colors) {
    const instanced = new THREE.InstancedMesh(geometry, instanceMaterial, matrices.length);
    matrices.forEach((matrix, index) => instanced.setMatrixAt(index, matrix));
    if (colors) {
      const color = new THREE.Color();
      colors.forEach((value, index) => instanced.setColorAt(index, color.set(value)));
    }
    instanced.instanceMatrix.needsUpdate = true;
    instanced.frustumCulled = false; // instances spread far beyond the unit geometry
    instanced.receiveShadow = true;
    return instanced;
  }

  const polar = (angle, radius) => [Math.sin(angle) * radius, Math.cos(angle) * radius];
  const DEG = Math.PI / 180;

  // ==========================================================================
  // 1) THE PIT ARENA
  // ==========================================================================
  // Local layout (entrance tunnel along +z; the map block rotates it to face
  // the city). Angles: 0 = +z, increasing toward +x.
  const PIT = {
    floorR: 19,        // inner face of the perimeter wall (floor is 38 m wide)
    wallH: 6.5,
    wallT: 0.9,
    walkwayOuter: 20.6, // top of the wall walkway, then the stand tiers
    tiers: 8,          // 7 seated tiers + the top concourse
    rise: 0.45,
    backR: 29,         // back wall of the stands (outer stadium shell)
    bermTop: 6.3,
    bermFoot: 34.5,
    doorHalfAngle: 9 * DEG,
    tunnelHalf: 3
  };
  const tierTop = (i) => PIT.wallH + PIT.rise * (i + 1);
  const concourseY = tierTop(PIT.tiers - 1);

  function pinwheelTexture() {
    return canvasTexture('arena-pinwheel', 1024, 1024, (ctx, w, h) => {
      const random = seeded(31);
      const cx = w / 2;
      const cy = h / 2;
      const R = w / 2;
      const wedges = 16;
      const twist = 1.05;
      ctx.fillStyle = '#3f4042';
      ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < wedges; k++) {
        const a0 = (k / wedges) * Math.PI * 2;
        const a1 = ((k + 1) / wedges) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        for (let s = 0; s <= 40; s++) {
          const r = (s / 40) * R;
          const a = a0 + twist * (r / R);
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        for (let s = 0; s <= 20; s++) {
          const a = a0 + twist + (a1 - a0) * (s / 20);
          ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        }
        for (let s = 40; s >= 0; s--) {
          const r = (s / 40) * R;
          const a = a1 + twist * (r / R);
          ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = k % 2 ? '#6f706d' : '#36383b';
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,20,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      // Concrete grain and stains (scuffs from sparring)
      for (let i = 0; i < 120; i++) {
        const x = random() * w;
        const y = random() * h;
        const r = 6 + random() * 60;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, `rgba(0,0,0,${0.06 + random() * 0.1})`);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      const image = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < image.data.length; i += 4) {
        const n = (random() - 0.5) * 22;
        image.data[i] += n; image.data[i + 1] += n; image.data[i + 2] += n;
      }
      ctx.putImageData(image, 0, 0);
      // Two drain-grate rings (steel frames with radial bars)
      const floorRadius = PIT.floorR + PIT.wallT;
      [[6.2, 6.9], [12.6, 13.3]].forEach(([r0, r1]) => {
        const p0 = (r0 / floorRadius) * R;
        const p1 = (r1 / floorRadius) * R;
        ctx.fillStyle = '#121314';
        ctx.beginPath(); ctx.arc(cx, cy, p1, 0, Math.PI * 2); ctx.arc(cx, cy, p0, 0, Math.PI * 2, true); ctx.fill();
        const bars = Math.round(p1 * 1.6);
        ctx.strokeStyle = '#6d7175';
        ctx.lineWidth = 2;
        for (let b = 0; b < bars; b++) {
          const a = (b / bars) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * p0, cy + Math.sin(a) * p0);
          ctx.lineTo(cx + Math.cos(a) * p1, cy + Math.sin(a) * p1);
          ctx.stroke();
        }
        ctx.strokeStyle = '#9a9ea3';
        ctx.lineWidth = 4;
        [p0, p1].forEach((p) => { ctx.beginPath(); ctx.arc(cx, cy, p, 0, Math.PI * 2); ctx.stroke(); });
      });
      // Center mark: dark disc with a thin red ring
      ctx.fillStyle = '#26272a';
      ctx.beginPath(); ctx.arc(cx, cy, (2.2 / floorRadius) * R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#d0242a';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, (2.0 / floorRadius) * R, 0, Math.PI * 2); ctx.stroke();
    });
  }

  function grassTexture() {
    return canvasTexture('arena-grass', 256, 256, (ctx, w, h) => {
      const random = seeded(5);
      ctx.fillStyle = '#4f6b2e';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) {
        const shade = 30 + Math.floor(random() * 50);
        ctx.fillStyle = `rgba(${shade + 20}, ${shade + 60}, ${shade}, 0.7)`;
        ctx.fillRect(random() * w, random() * h, 1, 2 + random() * 4);
      }
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = 'rgba(92, 70, 45, 0.25)';
        ctx.beginPath(); ctx.ellipse(random() * w, random() * h, 6 + random() * 20, 3 + random() * 8, random() * 3, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  function signTexture() {
    return canvasTexture('arena-sign-pit', 1024, 256, (ctx, w, h) => {
      ctx.fillStyle = '#121214';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#3a3c40';
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.font = 'bold 150px Impact, Arial Black, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#ff2020';
      ctx.shadowBlur = 40;
      ctx.fillStyle = '#ff3b30';
      ctx.fillText('THE PIT', w / 2, h / 2 + 6);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd0cc';
      ctx.font = 'bold 22px Arial, sans-serif';
      ctx.fillText('FRIENDLY SPARRING ARENA', w / 2, h - 26);
    });
  }

  // Jumbotron canvas (redrawn when the fight round changes state)
  const jumbo = { canvas: null, texture: null, last: '' };
  function drawJumbo(title, subtitle, accent = '#ff3b30') {
    const key = `${title}|${subtitle}|${accent}`;
    if (!jumbo.canvas || jumbo.last === key) return;
    jumbo.last = key;
    const ctx = jumbo.canvas.getContext('2d');
    const w = jumbo.canvas.width;
    const h = jumbo.canvas.height;
    ctx.fillStyle = '#070708';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.font = `bold ${title.length > 6 ? 70 : 110}px Impact, Arial Black, sans-serif`;
    ctx.fillText(title, w / 2, h * 0.44);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8e8ea';
    ctx.font = 'bold 26px Arial, sans-serif';
    ctx.fillText(subtitle, w / 2, h * 0.82);
    jumbo.texture.needsUpdate = true;
  }

  function pitArena(group) {
    const random = seeded(2024);
    const floorConcrete = concreteTexture('floor-side', '#55575a', { ties: false, seed: 3 });
    const wallTexture = concreteTexture('wall', '#606265', { seed: 11 });
    const darkTexture = concreteTexture('dark', '#3b3d41', { ties: false, seed: 19 });
    const steel = material('#26282c', { metalness: 0.75, roughness: 0.38 });
    const darkSteel = material('#16171a', { metalness: 0.7, roughness: 0.45 });
    const wallMaterial = material('#ffffff', { map: repeatTexture(wallTexture, 1, 2), roughness: 0.9 });
    const standMaterial = material('#ffffff', { map: repeatTexture(darkTexture, 24, 1), roughness: 0.92, side: THREE.DoubleSide });
    const riserMaterial = material('#c4c4c4', { map: repeatTexture(darkTexture, 30, 0.2), roughness: 0.92, side: THREE.DoubleSide });
    const redLine = new THREE.MeshBasicMaterial({ color: '#ff2a1f' });
    const redSoft = new THREE.MeshBasicMaterial({ color: '#c0100c' });

    // ---- Arena floor: pinwheel concrete with grate rings ----
    const floorRadius = PIT.floorR + PIT.wallT;
    const floor = mesh(new THREE.CylinderGeometry(floorRadius, floorRadius, 0.35, 96), [
      material('#ffffff', { map: repeatTexture(floorConcrete, 8, 0.3) }),
      new THREE.MeshStandardMaterial({ map: pinwheelTexture(), roughness: 0.82, metalness: 0.08 }),
      material('#222222')
    ], 0, -0.125, 0);
    floor.castShadow = false;
    group.add(floor);

    // ---- Perimeter wall: concrete panels between steel pilasters ----
    const panelCount = 40;
    const step = (Math.PI * 2) / panelCount;
    const panelRadius = PIT.floorR + PIT.wallT / 2;
    const panelWidth = 2 * panelRadius * Math.sin(step / 2) - 0.02;
    const doorPanels = [7, 13, 20, 26, 32];
    const panelMatrices = [];
    const pilasterMatrices = [];
    const doors = [];
    for (let k = 0; k < panelCount; k++) {
      const a = step / 2 + k * step;
      const isOpening = Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < PIT.doorHalfAngle;
      const [x, z] = polar(a, panelRadius);
      if (!isOpening) {
        dummy.position.set(x, PIT.wallH / 2, z);
        dummy.rotation.set(0, a, 0);
        dummy.scale.set(panelWidth, PIT.wallH, PIT.wallT);
        dummy.updateMatrix();
        panelMatrices.push(dummy.matrix.clone());
      }
      if (doorPanels.includes(k)) doors.push(a);
      const pa = k * step;
      const [px, pz] = polar(pa, PIT.floorR + 0.3);
      dummy.position.set(px, (PIT.wallH + 0.5) / 2, pz);
      dummy.rotation.set(0, pa, 0);
      dummy.scale.set(0.5, PIT.wallH + 0.5, 1.3);
      dummy.updateMatrix();
      pilasterMatrices.push(dummy.matrix.clone());
    }
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const panelBox = new THREE.BoxGeometry(1, 1, 1);
    const panels = instancedFrom(panelBox, wallMaterial, panelMatrices);
    panels.castShadow = true;
    group.add(panels);
    group.add(instancedFrom(unitBox, steel, pilasterMatrices));
    // Lintel over the tunnel opening
    group.add(box(2 * PIT.floorR * Math.sin(PIT.doorHalfAngle) + 0.6, PIT.wallH - 4.6, PIT.wallT, wallMaterial, 0, (PIT.wallH + 4.6) / 2, panelRadius));
    group.add(box(6.2, 0.12, 0.08, redLine, 0, 4.5, PIT.floorR - 0.02));

    // Thin red light line running around the top of the wall
    const ring = new THREE.Mesh(new THREE.TorusGeometry(PIT.floorR - 0.06, 0.05, 6, 180), redLine);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = PIT.wallH - 0.25;
    noDecorRaycast(ring);
    group.add(ring);
    const ringHalo = new THREE.Mesh(new THREE.CylinderGeometry(PIT.floorR - 0.08, PIT.floorR - 0.08, 0.6, 120, 1, true),
      additive(beamTexture(), '#ff2a1f', 0.22));
    ringHalo.position.y = PIT.wallH - 0.25;
    noDecorRaycast(ringHalo);
    group.add(ringHalo);

    // Red slit doorways in the wall
    const redWash = additive(radialTexture('red', 'rgba(255,40,30,0.9)', 'rgba(0,0,0,0)'), '#ff2a1f', 0.55);
    doors.forEach((a) => {
      const door = new THREE.Group();
      door.rotation.y = a;
      door.add(box(2.0, 5.2, 0.3, darkSteel, 0, 2.6, PIT.floorR - 0.1));
      door.add(box(1.5, 4.8, 0.12, material('#060606'), 0, 2.5, PIT.floorR - 0.28));
      const slit = box(0.7, 4.4, 0.1, redLine, 0, 2.3, PIT.floorR - 0.36);
      door.add(slit);
      door.add(box(2.4, 0.18, 0.35, steel, 0, 5.3, PIT.floorR - 0.15));
      const wash = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), redWash);
      wash.rotation.x = -Math.PI / 2;
      wash.position.set(0, 0.07, PIT.floorR - 2.2);
      noDecorRaycast(wash);
      door.add(wash);
      const haze = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.4), additive(beamTexture(), '#ff2a1f', 0.12));
      haze.position.set(0, 2.6, PIT.floorR - 0.7);
      noDecorRaycast(haze);
      door.add(haze);
      group.add(door);
    });

    // ---- Wall-top walkway, stepped stands and the top concourse ----
    const walkway = new THREE.Mesh(new THREE.RingGeometry(PIT.floorR - 0.05, PIT.walkwayOuter, 120, 1), standMaterial);
    walkway.rotation.x = -Math.PI / 2;
    walkway.position.y = PIT.wallH + 0.02;
    walkway.receiveShadow = true;
    group.add(walkway);
    for (let i = 0; i < PIT.tiers; i++) {
      const inner = PIT.walkwayOuter + i;
      const outer = i === PIT.tiers - 1 ? PIT.backR : inner + 1;
      const top = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 120, 1), standMaterial);
      top.rotation.x = -Math.PI / 2;
      top.position.y = tierTop(i);
      top.receiveShadow = true;
      group.add(top);
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(inner, inner, PIT.rise, 120, 1, true), riserMaterial);
      riser.position.y = tierTop(i) - PIT.rise / 2;
      group.add(riser);
    }
    // Back shell of the stadium (parapet above the concourse)
    const shellHeight = concourseY + 1.15;
    const shell = mesh(new THREE.CylinderGeometry(PIT.backR, PIT.backR, shellHeight, 120, 1, true, 7 * DEG, 346 * DEG),
      material('#ffffff', { map: repeatTexture(wallTexture, 48, 2), roughness: 0.9, side: THREE.DoubleSide }), 0, shellHeight / 2, 0);
    group.add(shell);
    group.add(box(2 * PIT.backR * Math.sin(7 * DEG) + 0.4, shellHeight - 5, 0.4, wallMaterial, 0, 5 + (shellHeight - 5) / 2, PIT.backR * Math.cos(7 * DEG)));
    const backLine = new THREE.Mesh(new THREE.TorusGeometry(PIT.backR - 0.25, 0.04, 6, 200), redLine);
    backLine.rotation.x = Math.PI / 2;
    backLine.position.y = shellHeight - 0.05;
    noDecorRaycast(backLine);
    group.add(backLine);
    const outerLine = noDecorRaycast(new THREE.Mesh(new THREE.TorusGeometry(PIT.backR + 0.05, 0.05, 6, 200), redSoft));
    outerLine.rotation.x = Math.PI / 2;
    outerLine.position.y = shellHeight - 0.4;
    group.add(outerLine);

    // Railing on top of the wall (steel posts and a handrail ring)
    const railRing = new THREE.Mesh(new THREE.TorusGeometry(PIT.floorR + 0.1, 0.04, 6, 160), steel);
    railRing.rotation.x = Math.PI / 2;
    railRing.position.y = PIT.wallH + 1.0;
    noDecorRaycast(railRing);
    group.add(railRing);

    // ---- Seats (instanced) with spectators and a few usable seats ----
    const seatPans = [];
    const seatBacks = [];
    const seatColors = [];
    const bodies = [];
    const heads = [];
    const bodyColors = [];
    const aisles = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((d) => d * DEG);
    for (let i = 0; i < PIT.tiers - 1; i++) {
      const radius = PIT.walkwayOuter + i + 0.42;
      const y = tierTop(i);
      const count = Math.floor((Math.PI * 2 * radius) / 0.62);
      for (let s = 0; s < count; s++) {
        const a = (s / count) * Math.PI * 2;
        const nearAisle = aisles.some((aisle) => Math.abs(Math.atan2(Math.sin(a - aisle), Math.cos(a - aisle))) * radius < 0.8);
        if (nearAisle) continue;
        const [x, z] = polar(a, radius);
        dummy.position.set(x, y + 0.42, z);
        dummy.rotation.set(0, a, 0);
        dummy.scale.set(0.48, 0.07, 0.44);
        dummy.updateMatrix();
        seatPans.push(dummy.matrix.clone());
        const [bx, bz] = polar(a, radius + 0.24);
        dummy.position.set(bx, y + 0.68, bz);
        dummy.rotation.set(-0.12, a, 0, 'YXZ');
        dummy.scale.set(0.48, 0.5, 0.06);
        dummy.updateMatrix();
        seatBacks.push(dummy.matrix.clone());
        seatColors.push(random() < 0.12 ? '#5a1416' : '#1e1f23');
        if (random() < 0.2) {
          const [sx, sz] = polar(a, radius + 0.05);
          dummy.rotation.set(0, a, 0);
          dummy.position.set(sx, y + 0.8, sz);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          bodies.push(dummy.matrix.clone());
          dummy.position.set(sx, y + 1.28, sz - 0);
          dummy.updateMatrix();
          heads.push(dummy.matrix.clone());
          bodyColors.push(['#2b2d33', '#3a2a28', '#24303a', '#40403f', '#1f1f22', '#5b2a24'][Math.floor(random() * 6)]);
        }
      }
    }
    const plastic = material('#ffffff', { roughness: 0.55, metalness: 0.1 });
    const pans = instancedFrom(unitBox, plastic, seatPans, seatColors);
    const backs = instancedFrom(unitBox, plastic, seatBacks, seatColors);
    const crowd = instancedFrom(new THREE.CylinderGeometry(0.16, 0.22, 0.72, 8), material('#ffffff', { roughness: 0.85 }), bodies, bodyColors);
    const crowdHeads = instancedFrom(new THREE.SphereGeometry(0.12, 8, 6), material('#8a6a58', { roughness: 0.7 }), heads);
    [pans, backs, crowd, crowdHeads].forEach((object) => { object.raycast = () => {}; group.add(object); });
    // Usable seats on the front row next to each aisle
    aisles.forEach((aisle, index) => {
      [-1, 1].forEach((side) => {
        const radius = PIT.walkwayOuter + 0.42;
        const a = aisle + side * (1.25 / radius);
        const [x, z] = polar(a, radius);
        group.add(seat(x, tierTop(0) + 0.05, z, `Pit stand seat ${index * 2 + (side > 0 ? 2 : 1)}`, a + Math.PI));
      });
    });

    // ---- Stairs from the floor up to the wall walkway (both sides of the tunnel) ----
    const stepMaterial = material('#ffffff', { map: repeatTexture(wallTexture, 0.5, 0.5), roughness: 0.9 });
    const stepCount = 14;
    const stepRise = PIT.wallH / stepCount;
    const stepRun = 0.62;
    [-1, 1].forEach((side) => {
      const stair = new THREE.Group();
      stair.rotation.y = side * 28 * DEG;
      const zc = 17.4;
      const start = -stepCount * stepRun / 2;
      for (let k = 0; k < stepCount; k++) {
        const height = (k + 1) * stepRise;
        stair.add(box(stepRun + 0.02, height, 1.8, stepMaterial, side * (start + stepRun * (k + 0.5)), height / 2, zc));
      }
      const landingLength = 2.0;
      stair.add(box(landingLength, PIT.wallH, 2.6, stepMaterial, side * (-start + landingLength / 2), PIT.wallH / 2, zc + 0.4));
      // Sloped handrail on the open side and a few posts
      const railStart = new THREE.Vector3(side * start, 1.0, zc - 0.85);
      const railEnd = new THREE.Vector3(side * -start, PIT.wallH + 1.0, zc - 0.85);
      const handrail = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), steel);
      placeBetween(handrail, railStart, railEnd, 0.045);
      handrail.matrixAutoUpdate = true;
      noDecorRaycast(handrail);
      stair.add(handrail);
      for (let p = 0; p <= 4; p++) {
        const t = p / 4;
        const x = side * (start + (-2 * start) * t);
        const y = t * PIT.wallH;
        stair.add(noDecorRaycast(cylinder(0.035, 0.035, 1.0, steel, x, y + 0.5, zc - 0.85, 6)));
      }
      // Red step-edge lights
      stair.add(noDecorRaycast(box(stepCount * stepRun, 0.04, 0.04, redSoft, 0, 0.03, zc - 0.92)));
      group.add(stair);
    });

    // ---- Outer berm (grass mound) and the entrance tunnel ----
    const berm = mesh(new THREE.CylinderGeometry(PIT.backR + 0.2, PIT.bermFoot, PIT.bermTop + 0.3, 96, 1, true, 7 * DEG, 346 * DEG),
      material('#ffffff', { map: repeatTexture(grassTexture(), 46, 3), roughness: 1 }), 0, (PIT.bermTop + 0.3) / 2 - 0.3, 0);
    berm.castShadow = false;
    group.add(berm);
    const tunnelStart = PIT.floorR + 0.3;
    const tunnelEnd = PIT.bermFoot + 0.3;
    const tunnelLength = tunnelEnd - tunnelStart;
    const tunnelMid = (tunnelStart + tunnelEnd) / 2;
    const tunnelWall = material('#ffffff', { map: repeatTexture(wallTexture, 4, 1), roughness: 0.9 });
    [-1, 1].forEach((side) => {
      group.add(box(0.5, 5.0, tunnelLength, tunnelWall, side * (PIT.tunnelHalf + 0.25), 2.5, tunnelMid));
      // Red guide strips along the tunnel floor
      group.add(noDecorRaycast(box(0.08, 0.03, tunnelLength - 1, redLine, side * (PIT.tunnelHalf - 0.25), 0.07, tunnelMid)));
    });
    group.add(box(2 * PIT.tunnelHalf + 1.2, 0.4, tunnelLength, material('#ffffff', { map: repeatTexture(darkTexture, 2, 4) }), 0, 4.8, tunnelMid));
    group.add(box(2 * PIT.tunnelHalf + 0.2, 0.35, tunnelLength + 1, material('#ffffff', { map: repeatTexture(floorConcrete, 2, 6), roughness: 0.85 }), 0, -0.125, tunnelMid - 0.5));
    for (let i = 0; i < 5; i++) {
      group.add(noDecorRaycast(box(1.6, 0.06, 0.2, glow('#f4f4f6', 1.6), 0, 4.57, tunnelStart + 1.5 + i * (tunnelLength - 3) / 4)));
    }
    // Monumental portal at the tunnel mouth with the "THE PIT" sign
    const portalZ = PIT.bermFoot;
    const portalMaterial = material('#ffffff', { map: repeatTexture(wallTexture, 1, 1), roughness: 0.88 });
    [-1, 1].forEach((side) => {
      group.add(box(3.4, 7.6, 1.4, portalMaterial, side * (PIT.tunnelHalf + 0.5 + 1.7), 3.8, portalZ));
      group.add(box(0.35, 7.8, 1.6, steel, side * (PIT.tunnelHalf + 0.5), 3.9, portalZ));
    });
    group.add(box(2 * PIT.tunnelHalf + 7.8, 3.0, 1.4, portalMaterial, 0, 6.1, portalZ));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 2.6), new THREE.MeshBasicMaterial({ map: signTexture() }));
    sign.position.set(0, 6.15, portalZ + 0.72);
    noDecorRaycast(sign);
    group.add(sign);
    group.add(noDecorRaycast(box(11.2, 0.08, 0.08, redLine, 0, 4.66, portalZ + 0.72)));
    const portalWash = new THREE.Mesh(new THREE.CircleGeometry(5, 32), redWash);
    portalWash.rotation.x = -Math.PI / 2;
    portalWash.position.set(0, -0.26, portalZ + 3);
    noDecorRaycast(portalWash);
    group.add(portalWash);

    // ---- Lighting truss ring, masts and spotlights ----
    const trussR = 12.5;
    const trussY = 17.4;
    const chord = (radius, y, thickness) => {
      const torus = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 6, 120), steel);
      torus.rotation.x = Math.PI / 2;
      torus.position.y = y;
      noDecorRaycast(torus);
      group.add(torus);
    };
    chord(trussR, trussY, 0.09);
    chord(trussR, trussY + 0.9, 0.09);
    chord(trussR - 0.8, trussY + 0.45, 0.09);
    const strutMatrices = [];
    const segments = 64;
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2;
      const a2 = ((k + 0.5) / segments) * Math.PI * 2;
      const [x, z] = polar(a, trussR);
      const [ix, iz] = polar(a2, trussR - 0.8);
      const [nx, nz] = polar(((k + 1) / segments) * Math.PI * 2, trussR);
      const bottom = new THREE.Vector3(x, trussY, z);
      const topPoint = new THREE.Vector3(x, trussY + 0.9, z);
      const innerPoint = new THREE.Vector3(ix, trussY + 0.45, iz);
      strutMatrices.push(placeBetween(dummy, bottom, topPoint, 0.05).clone());
      strutMatrices.push(placeBetween(dummy, bottom, innerPoint, 0.04).clone());
      strutMatrices.push(placeBetween(dummy, topPoint, innerPoint, 0.04).clone());
      strutMatrices.push(placeBetween(dummy, topPoint, new THREE.Vector3(nx, trussY, nz), 0.035).clone());
    }
    const struts = instancedFrom(new THREE.CylinderGeometry(1, 1, 1, 5), steel, strutMatrices);
    struts.raycast = () => {};
    group.add(struts);

    // Spotlight heads under the truss, aimed at points on the floor
    const canMatrices = [];
    const lensMatrices = [];
    const beams = [];
    const beamMaterial = additive(beamTexture(), '#f2f4ff', 0.1);
    const poolMaterial = additive(radialTexture('white', 'rgba(255,255,255,0.85)', 'rgba(0,0,0,0)'), '#fbfbff', 0.2);
    const spots = 32;
    for (let k = 0; k < spots; k++) {
      const a = (k / spots) * Math.PI * 2;
      const [x, z] = polar(a, trussR);
      const lamp = new THREE.Vector3(x, trussY - 0.45, z);
      const aimRadius = 2 + random() * 12;
      const aimAngle = a + (random() - 0.5) * 1.2;
      const [tx, tz] = polar(aimAngle, aimRadius);
      const target = new THREE.Vector3(tx, 0, tz);
      const direction = target.clone().sub(lamp).normalize();
      dummy.position.copy(lamp);
      dummy.quaternion.setFromUnitVectors(UP, direction.clone().negate());
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      canMatrices.push(dummy.matrix.clone());
      dummy.position.copy(lamp).addScaledVector(direction, 0.27);
      dummy.updateMatrix();
      lensMatrices.push(dummy.matrix.clone());
      if (k % 2 === 0) {
        const length = lamp.distanceTo(target);
        const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 2.4, length, 20, 1, true), beamMaterial);
        cone.position.copy(lamp).addScaledVector(direction, length / 2);
        cone.quaternion.setFromUnitVectors(UP, direction.clone().negate());
        noDecorRaycast(cone);
        group.add(cone);
        beams.push(cone);
        const pool = new THREE.Mesh(new THREE.CircleGeometry(2.8, 28), poolMaterial);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(tx, 0.06 + k * 0.0005, tz);
        noDecorRaycast(pool);
        group.add(pool);
      }
    }
    const cans = instancedFrom(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 10), darkSteel, canMatrices);
    const lenses = instancedFrom(new THREE.CylinderGeometry(0.21, 0.21, 0.04, 12), new THREE.MeshBasicMaterial({ color: '#ffffff' }), lensMatrices);
    [cans, lenses].forEach((object) => { object.raycast = () => {}; group.add(object); });

    // Four masts on the concourse hold the truss with steel cables
    const cablePoints = [];
    [45, 135, 225, 315].forEach((degrees) => {
      const a = degrees * DEG;
      const [x, z] = polar(a, PIT.backR - 0.8);
      const mastHeight = 27 - concourseY;
      group.add(cylinder(0.32, 0.42, mastHeight, steel, x, concourseY + mastHeight / 2, z, 10));
      group.add(noDecorRaycast(sphere(0.22, new THREE.MeshBasicMaterial({ color: '#ff2a1f' }), x, 27.2, z, 8)));
      [-30, 0, 30].forEach((offset) => {
        const [tx, tz] = polar(a + offset * DEG, trussR);
        cablePoints.push(new THREE.Vector3(x, 26.6, z), new THREE.Vector3(tx, trussY + 0.9, tz));
      });
    });
    // Jumbotron hanging in the middle, held by four cables from the truss
    const jumboY = 13.5;
    [0, 90, 180, 270].forEach((degrees) => {
      const [tx, tz] = polar((degrees + 45) * DEG, trussR - 0.8);
      const [jx, jz] = polar((degrees + 45) * DEG, 2.6);
      cablePoints.push(new THREE.Vector3(jx, jumboY + 1.9, jz), new THREE.Vector3(tx, trussY + 0.45, tz));
    });
    const cables = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cablePoints), new THREE.LineBasicMaterial({ color: '#4a4c52' }));
    cables.raycast = () => {};
    group.add(cables);
    jumbo.canvas = document.createElement('canvas');
    jumbo.canvas.width = 512;
    jumbo.canvas.height = 288;
    jumbo.texture = new THREE.CanvasTexture(jumbo.canvas);
    jumbo.last = '';
    drawJumbo('THE PIT', 'Ring the red gong to start a round');
    const jumboGroup = new THREE.Group();
    jumboGroup.position.y = jumboY;
    jumboGroup.add(box(5.4, 3.5, 5.4, darkSteel));
    const screenMaterial = new THREE.MeshBasicMaterial({ map: jumbo.texture });
    [0, 90, 180, 270].forEach((degrees) => {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.8), screenMaterial);
      const a = degrees * DEG;
      screen.position.set(Math.sin(a) * 2.72, 0, Math.cos(a) * 2.72);
      screen.rotation.y = a;
      jumboGroup.add(screen);
    });
    jumboGroup.add(box(5.8, 0.12, 5.8, redLine, 0, -1.8, 0));
    noDecorRaycast(jumboGroup);
    group.add(jumboGroup);

    // ---- Haze layers (very faint, never block walking) ----
    const hazeTexture = canvasTexture('arena-haze', 256, 256, (ctx, w, h) => {
      const hazeRandom = seeded(77);
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = hazeRandom() * w;
        const y = hazeRandom() * h;
        const r = 20 + hazeRandom() * 70;
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, 'rgba(255,255,255,0.18)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    const hazeLayers = [];
    [3.2, 8.5, 13].forEach((y, index) => {
      const haze = new THREE.Mesh(new THREE.CircleGeometry(PIT.floorR - 0.5, 48), additive(hazeTexture, '#b8bcc8', 0.2 - index * 0.04));
      haze.rotation.x = -Math.PI / 2;
      haze.position.y = y;
      noDecorRaycast(haze);
      group.add(haze);
      hazeLayers.push(haze);
    });

    // ---- The red gong (starts a friendly sparring round) ----
    const gong = new THREE.Group();
    gong.position.set(0, 0, -(PIT.floorR - 3.2));
    gong.add(box(3.6, 0.3, 1.2, darkSteel, 0, 0.15, 0));
    [-1, 1].forEach((side) => gong.add(box(0.2, 3.8, 0.2, steel, side * 1.5, 2.0, 0)));
    gong.add(box(3.4, 0.2, 0.24, steel, 0, 3.8, 0));
    const disc = new THREE.Group();
    disc.position.set(0, 3.55, 0);
    const discFace = cylinder(1.05, 1.05, 0.08, material('#b3161a', { metalness: 0.65, roughness: 0.3, emissive: '#5a0000', emissiveIntensity: 0.6 }), 0, -1.3, 0, 32);
    discFace.rotation.x = Math.PI / 2;
    disc.add(discFace);
    const boss = sphere(0.28, material('#d63a2f', { metalness: 0.7, roughness: 0.25, emissive: '#7a0a05', emissiveIntensity: 0.8 }), 0, -1.3, 0.06, 16);
    boss.scale.z = 0.35;
    disc.add(boss);
    [-0.45, 0.45].forEach((x) => disc.add(box(0.03, 0.4, 0.03, steel, x * 0.6, -0.12, 0)));
    gong.add(disc);
    gong.add(box(0.08, 1.1, 0.08, material('#6b4a2f'), 1.25, 1.1, 0.4));
    gong.add(sphere(0.16, material('#2a2a2a', { roughness: 0.9 }), 1.25, 1.7, 0.4, 10));
    const gongPool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), redWash);
    gongPool.rotation.x = -Math.PI / 2;
    gongPool.position.y = 0.075;
    noDecorRaycast(gongPool);
    gong.add(gongPool);
    group.add(gong);

    const round = { phase: 'idle', start: 0, hooks: null, lastSecond: -1, number: 0 };
    gong.userData.prompt = 'Press E to ring the gong (friendly sparring round)';
    gong.userData.onInteract = (hooks) => {
      round.hooks = hooks;
      if (round.phase === 'countdown' || round.phase === 'fight') {
        return 'A round is already running. Wait for the bell.';
      }
      round.phase = 'countdown';
      round.start = performance.now();
      round.lastSecond = -1;
      round.number += 1;
      if (window.Sound) Sound.play('interact');
      if (hooks.broadcast) hooks.broadcast(`rang the gong at The Pit: round ${round.number} starts in 10 seconds`);
      return `GONG! Round ${round.number} starts in 10 seconds. Friendly sparring only: emotes and dodging, no real money.`;
    };
    interactive(gong, 'action', 'Red gong');

    // ---- Rules plaque near the tunnel mouth ----
    const plaque = new THREE.Group();
    plaque.position.set(PIT.tunnelHalf + 2.2, 0, PIT.floorR - 2.4);
    plaque.rotation.y = -0.5;
    plaque.add(box(0.12, 1.1, 0.12, steel, 0, 0.55, 0));
    const plaqueFace = labelTexture('THE PIT - RULES: friendly sparring only. No real money, no bets. Ring the gong to start a round.', {
      bg: '#18191c', fg: '#f1f1f1', width: 512, height: 320, font: 'bold 34px Arial, sans-serif', border: '#c0201a'
    });
    plaque.add(box(1.5, 0.95, 0.08, darkSteel, 0, 1.45, 0));
    const plaqueScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.86), new THREE.MeshBasicMaterial({ map: plaqueFace }));
    plaqueScreen.position.set(0, 1.45, 0.045);
    plaque.add(plaqueScreen);
    plaque.userData.label = 'The Pit: house rules';
    plaque.userData.info = 'Friendly sparring only. This is a social arena: ring the red gong to start a timed round, then dodge, jump and emote. There is no real money, no betting and nothing to buy here. Be kind, shake hands when the bell rings.';
    interactive(plaque, 'inspect', 'Rules plaque');
    group.add(plaque);

    // ---- Animation: round state, pulsing red line, flickering beams ----
    const baseRed = new THREE.Color('#ff2a1f');
    animate(group, (time) => {
      let pulseSpeed = 1.2;
      if (round.phase === 'countdown') {
        const elapsed = (performance.now() - round.start) / 1000;
        const left = Math.ceil(10 - elapsed);
        if (left !== round.lastSecond) {
          round.lastSecond = left;
          if (left > 0) {
            drawJumbo(String(left), `Round ${round.number} - get ready`, '#ffcc33');
            if (left <= 3 && round.hooks) round.hooks.system(`${left}...`);
          }
        }
        if (elapsed >= 10) {
          round.phase = 'fight';
          round.start = performance.now();
          round.lastSecond = -1;
          if (round.hooks) {
            round.hooks.system(`FIGHT! Round ${round.number}: 60 seconds of friendly sparring.`);
            if (round.hooks.emote) round.hooks.emote('cheer');
          }
          if (window.Sound) Sound.play('coin');
        }
        pulseSpeed = 4;
      } else if (round.phase === 'fight') {
        const elapsed = (performance.now() - round.start) / 1000;
        const left = Math.max(0, Math.ceil(60 - elapsed));
        if (left !== round.lastSecond) {
          round.lastSecond = left;
          drawJumbo(`0:${String(left).padStart(2, '0')}`, `ROUND ${round.number} - FIGHT`, '#ff3b30');
        }
        if (elapsed >= 60) {
          round.phase = 'idle';
          drawJumbo('BELL', `Round ${round.number} over - shake hands`, '#ffffff');
          if (round.hooks) round.hooks.system(`Round ${round.number} over. Shake hands. Ring the gong again for another round.`);
          if (window.Sound) Sound.play('interact');
        }
        pulseSpeed = 7;
      }
      const pulse = 0.65 + 0.35 * Math.sin(time * pulseSpeed);
      redLine.color.copy(baseRed).multiplyScalar(0.6 + pulse * 0.5);
      disc.rotation.z = round.phase === 'countdown' ? Math.sin(time * 18) * 0.05 * Math.max(0, 1 - (performance.now() - round.start) / 2500) : 0;
      beams.forEach((beam, index) => {
        const flicker = round.phase === 'fight' ? 0.6 + 0.4 * Math.abs(Math.sin(time * 3 + index)) : 1;
        beam.visible = flicker > 0.25;
      });
      hazeLayers.forEach((haze, index) => { haze.rotation.z = time * 0.01 * (index % 2 ? 1 : -1); });
    });
  }

  // ==========================================================================
  // 2) THE CANDLESTICK MAZE
  // ==========================================================================
  const MAZE = { cell: 4, n: 20, half: 40 };
  const HISTORY = 48;
  const FEED_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=decentraland,ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true';
  const ASSETS = [
    { id: 'decentraland', symbol: 'MANA', name: 'Decentraland', color: '#ff4d6d', fallback: 0.3, vol: 0.0009 },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', color: '#8c9cff', fallback: 3000, vol: 0.0006 },
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', color: '#f7a531', fallback: 60000, vol: 0.0005 }
  ];

  // Price feed: real samples every 60 s, simulated ticks in between, and a
  // fully simulated walk when the public endpoint is unreachable.
  const Feed = {
    simulated: true,
    live: false,
    lastFetch: 0,
    lastOk: null,
    version: 0,
    started: false,
    state: ASSETS.map((asset) => ({ ...asset, price: asset.fallback, anchor: asset.fallback, change: 0, candles: [] })),

    // Rebuild a plausible path ending at the current price: 48 candles following
    // the 24h change (an estimate, not real intraday data) plus small noise
    backfill(entry, randomSource = Math.random) {
      const start = entry.price / (1 + entry.change / 100);
      const candles = [];
      let previous = start;
      for (let i = 0; i < HISTORY; i++) {
        const t = (i + 1) / HISTORY;
        const trend = start + (entry.price - start) * t;
        const noise = (randomSource() - 0.5) * entry.price * entry.vol * 18 * Math.sin(Math.PI * t);
        const close = i === HISTORY - 1 ? entry.price : trend + noise;
        const open = previous;
        const wiggle = Math.abs(close - open) * 0.5 + entry.price * entry.vol * 4 * randomSource();
        candles.push({ o: open, c: close, h: Math.max(open, close) + wiggle * randomSource(), l: Math.min(open, close) - wiggle * randomSource() });
        previous = close;
      }
      entry.candles = candles;
    },

    start() {
      if (this.started) return;
      this.started = true;
      const random = seeded(99);
      this.state.forEach((entry) => {
        entry.change = (random() - 0.45) * 6;
        this.backfill(entry, random);
      });
      this.version++;
      this.fetch();
      setInterval(() => this.tick(), 2000);
    },

    async fetch() {
      this.lastFetch = performance.now();
      let data = null;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(FEED_URL, { cache: 'no-store', signal: controller.signal });
        clearTimeout(timer);
        if (response.ok) data = await response.json();
      } catch (error) {
        data = null;
      }
      const valid = data && this.state.every((entry) => data[entry.id] && Number.isFinite(data[entry.id].usd));
      if (valid) {
        const wasSimulated = this.simulated;
        this.simulated = false;
        this.live = true;
        this.lastOk = new Date();
        this.state.forEach((entry) => {
          const sample = data[entry.id];
          entry.anchor = sample.usd;
          entry.change = Number.isFinite(sample.usd_24h_change) ? sample.usd_24h_change : entry.change;
          if (wasSimulated) {
            entry.price = sample.usd;
            this.backfill(entry);
          } else {
            this.closeCandle(entry, sample.usd);
          }
        });
      } else {
        // Feed unavailable: keep a smooth simulated random walk
        this.simulated = true;
        this.state.forEach((entry) => {
          const drift = (Math.random() - 0.5) * entry.vol * 12;
          entry.anchor = entry.price * (1 + drift);
          entry.change = Math.max(-12, Math.min(12, entry.change + drift * 100));
          this.closeCandle(entry, entry.price);
        });
      }
      this.version++;
    },

    closeCandle(entry, price) {
      const last = entry.candles[entry.candles.length - 1];
      last.c = entry.price;
      entry.candles.push({ o: last.c, c: price, h: Math.max(last.c, price), l: Math.min(last.c, price) });
      while (entry.candles.length > HISTORY) entry.candles.shift();
      entry.price = price;
    },

    // Small realistic ticks between real samples (mean-reverting to the anchor)
    tick() {
      this.state.forEach((entry) => {
        const shock = (Math.random() + Math.random() + Math.random() - 1.5) * entry.vol;
        entry.price = entry.price * (1 + shock) + (entry.anchor - entry.price) * 0.08;
        const last = entry.candles[entry.candles.length - 1];
        last.c = entry.price;
        last.h = Math.max(last.h, entry.price);
        last.l = Math.min(last.l, entry.price);
      });
      this.version++;
      const due = performance.now() - this.lastFetch > 60000;
      if (due && document.visibilityState !== 'hidden' && this.nearDistrict()) this.fetch();
    },

    nearDistrict() {
      if (typeof avatar === 'undefined' || !this.anchorObject) return true;
      const position = new THREE.Vector3();
      this.anchorObject.getWorldPosition(position);
      return position.distanceTo(avatar.position) < 600;
    }
  };

  const formatPrice = (value) => (value >= 1000 ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : value >= 1 ? value.toFixed(2) : value.toFixed(4));

  function drawBoard(board) {
    const entry = Feed.state[board.index];
    const ctx = board.canvas.getContext('2d');
    const w = board.canvas.width;
    const h = board.canvas.height;
    const up = entry.change >= 0;
    const trend = up ? '#38d97a' : '#ff4b4b';
    ctx.clearRect(0, 0, w, h);
    const background = ctx.createLinearGradient(0, 0, 0, h);
    background.addColorStop(0, 'rgba(8, 18, 30, 0.92)');
    background.addColorStop(1, 'rgba(4, 8, 16, 0.92)');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = entry.color;
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = 'rgba(140, 220, 255, 0.05)';
    for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = entry.color;
    ctx.font = 'bold 54px Arial, sans-serif';
    ctx.fillText(entry.symbol, 36, 78);
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '30px Arial, sans-serif';
    ctx.fillText(`${entry.name} / USD`, 36 + ctx.measureText(entry.symbol).width * 1.85, 76);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px Arial, sans-serif';
    ctx.fillText(`$${formatPrice(entry.price)}`, 36, 184);
    ctx.fillStyle = trend;
    ctx.font = 'bold 46px Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${up ? '+' : ''}${entry.change.toFixed(2)}%`, w - 36, 120);
    ctx.font = '26px Arial, sans-serif';
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText('24h change', w - 36, 160);
    // Mini candlestick chart of the rolling history
    const chart = { x: 36, y: 214, w: w - 72, h: 220 };
    const lows = entry.candles.map((c) => c.l);
    const highs = entry.candles.map((c) => c.h);
    const lo = Math.min(...lows);
    const hi = Math.max(...highs);
    const span = hi - lo || 1;
    const toY = (v) => chart.y + chart.h - ((v - lo) / span) * chart.h;
    ctx.strokeStyle = 'rgba(160, 200, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(chart.x, chart.y + (chart.h * i) / 4); ctx.lineTo(chart.x + chart.w, chart.y + (chart.h * i) / 4); ctx.stroke();
    }
    const slot = chart.w / entry.candles.length;
    entry.candles.forEach((candle, index) => {
      const x = chart.x + slot * (index + 0.5);
      const color = candle.c >= candle.o ? '#38d97a' : '#ff4b4b';
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, toY(candle.h)); ctx.lineTo(x, toY(candle.l)); ctx.stroke();
      const top = toY(Math.max(candle.o, candle.c));
      const bottom = toY(Math.min(candle.o, candle.c));
      ctx.fillRect(x - slot * 0.32, top, slot * 0.64, Math.max(2, bottom - top));
    });
    ctx.textAlign = 'left';
    ctx.font = 'bold 26px Arial, sans-serif';
    if (Feed.simulated) {
      ctx.fillStyle = '#ffcc33';
      ctx.fillText('SIMULATED - live feed unavailable', 36, h - 30);
    } else {
      ctx.fillStyle = '#7fe3ff';
      const time = Feed.lastOk ? Feed.lastOk.toLocaleTimeString('en-US', { hour12: false }) : '';
      ctx.fillText(`LIVE - CoinGecko - ${time}`, 36, h - 30);
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = '#7a8a9c';
    ctx.font = '22px Arial, sans-serif';
    ctx.fillText('Information only. No trading.', w - 36, h - 30);
    board.texture.needsUpdate = true;
  }

  function generateMaze() {
    const { n } = MAZE;
    const random = seeded(4242);
    // hWalls[j][i]: wall along x at z line j (0..n), cell column i
    // vWalls[j][i]: wall along z at x line i (0..n), cell row j
    const hWalls = Array.from({ length: n + 1 }, () => Array(n).fill(true));
    const vWalls = Array.from({ length: n }, () => Array(n + 1).fill(true));
    const visited = Array.from({ length: n }, () => Array(n).fill(false));
    const stack = [[0, 0]];
    visited[0][0] = true;
    while (stack.length) {
      const [ci, cj] = stack[stack.length - 1];
      const options = [];
      if (ci > 0 && !visited[cj][ci - 1]) options.push([-1, 0]);
      if (ci < n - 1 && !visited[cj][ci + 1]) options.push([1, 0]);
      if (cj > 0 && !visited[cj - 1][ci]) options.push([0, -1]);
      if (cj < n - 1 && !visited[cj + 1][ci]) options.push([0, 1]);
      if (!options.length) { stack.pop(); continue; }
      const [di, dj] = options[Math.floor(random() * options.length)];
      if (di === -1) vWalls[cj][ci] = false;
      if (di === 1) vWalls[cj][ci + 1] = false;
      if (dj === -1) hWalls[cj][ci] = false;
      if (dj === 1) hWalls[cj + 1][ci] = false;
      visited[cj + dj][ci + di] = true;
      stack.push([ci + di, cj + dj]);
    }
    // A few extra openings so the maze has loops (less frustrating)
    for (let k = 0; k < 22; k++) {
      const i = 1 + Math.floor(random() * (n - 2));
      const j = 1 + Math.floor(random() * (n - 2));
      if (random() < 0.5) hWalls[j][i] = false; else vWalls[j][i] = false;
    }
    // Open 2x2 chamber in the middle for the ATH pedestal
    const mid = n / 2;
    vWalls[mid - 1][mid] = false;
    vWalls[mid][mid] = false;
    hWalls[mid][mid - 1] = false;
    hWalls[mid][mid] = false;
    // Entrance on the west edge (z 0..4), exit on the east edge (z -4..0)
    vWalls[mid][0] = false;
    vWalls[mid - 1][n] = false;
    const walls = [];
    const { cell, half } = MAZE;
    for (let j = 0; j <= n; j++) for (let i = 0; i < n; i++) if (hWalls[j][i]) walls.push({ x: -half + cell * (i + 0.5), z: -half + cell * j, along: 'x' });
    for (let j = 0; j < n; j++) for (let i = 0; i <= n; i++) if (vWalls[j][i]) walls.push({ x: -half + cell * i, z: -half + cell * (j + 0.5), along: 'z' });
    return walls;
  }

  // Sector bounds along x: MANA (west), ETH (middle), BTC (east)
  const SECTORS = [[-40, -12], [-12, 12], [12, 40]];
  const sectorOf = (x) => (x < -12 ? 0 : x < 12 ? 1 : 2);

  function tileTexture() {
    return canvasTexture('maze-tile', 256, 256, (ctx, w, h) => {
      const random = seeded(8);
      ctx.fillStyle = '#0d1014';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) {
        ctx.fillStyle = `rgba(255,255,255,${random() * 0.04})`;
        ctx.fillRect(random() * w, random() * h, 2, 2);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, w - 40, h - 40);
    });
  }

  function glassTexture() {
    return canvasTexture('maze-glass', 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#6f8fa8';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 2;
      for (let y = h / 8; y < h; y += h / 8) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      ctx.setLineDash([6, 8]);
      for (let x = w / 3; x < w; x += w / 3) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      const sheen = ctx.createLinearGradient(0, 0, w, h);
      sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
      sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
      sheen.addColorStop(1, 'rgba(255,255,255,0.1)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);
    });
  }

  function candleMaze(group) {
    Feed.anchorObject = group;
    Feed.start();
    const walls = generateMaze();
    const count = walls.length;
    const CANDLES = 3;

    // ---- Floors: dark margin + one glowing tile floor per sector ----
    const margin = box(96, 0.12, 96, material('#15181d', { roughness: 0.6, metalness: 0.3 }), 0, -0.04, 0);
    margin.castShadow = false;
    group.add(margin);
    const sectorFloors = SECTORS.map(([x0, x1]) => {
      const width = x1 - x0;
      const tiles = repeatTexture(tileTexture(), width / 2, 40);
      const floorMaterial = new THREE.MeshStandardMaterial({ color: '#2a2f36', map: tiles, emissiveMap: tiles, emissive: '#22ff88', emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.4 });
      const floor = box(width, 0.1, 80, floorMaterial, (x0 + x1) / 2, 0.04, 0);
      floor.castShadow = false;
      group.add(floor);
      return floorMaterial;
    });
    // Sector divider strips
    [-12, 12].forEach((x) => group.add(noDecorRaycast(box(0.12, 0.03, 80, new THREE.MeshBasicMaterial({ color: '#9fe8ff' }), x, 0.11, 0))));

    // ---- Instanced walls: glass panels, glowing top caps, steel base rails and candles ----
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const glassMaterial = new THREE.MeshStandardMaterial({
      color: '#ffffff', map: glassTexture(), transparent: true, opacity: 0.34, roughness: 0.08, metalness: 0.2,
      emissive: '#0d2a3a', emissiveIntensity: 0.6, depthWrite: false, side: THREE.DoubleSide
    });
    const panels = new THREE.InstancedMesh(unit, glassMaterial, count);
    const caps = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: '#ffffff' }), count);
    const bodies = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: '#ffffff' }), count * CANDLES);
    const wicks = new THREE.InstancedMesh(unit, new THREE.MeshBasicMaterial({ color: '#ffffff' }), count * CANDLES);
    const railMatrices = [];
    const color = new THREE.Color();
    const sectorTint = ASSETS.map((asset) => new THREE.Color(asset.color).lerp(new THREE.Color('#bfefff'), 0.55));
    walls.forEach((wall, index) => {
      wall.sector = sectorOf(wall.x + (wall.along === 'z' ? 0.01 : 0));
      const [x0, x1] = SECTORS[wall.sector];
      const t = ((wall.x - x0) / (x1 - x0)) * 0.78 + ((wall.z + 40) / 80) * 0.22;
      wall.base = Math.max(0, Math.min(HISTORY - CANDLES, Math.floor(t * (HISTORY - CANDLES + 1))));
      wall.height = 2.2;
      wall.parts = Array.from({ length: CANDLES }, () => ({ b0: 1, b1: 1.4, w0: 0.8, w1: 1.8 }));
      panels.setColorAt(index, sectorTint[wall.sector]);
      caps.setColorAt(index, color.set(ASSETS[wall.sector].color));
      dummy.position.set(wall.x, 0.08, wall.z);
      dummy.rotation.set(0, wall.along === 'x' ? 0 : Math.PI / 2, 0);
      dummy.scale.set(MAZE.cell + 0.12, 0.2, 0.42);
      dummy.updateMatrix();
      railMatrices.push(dummy.matrix.clone());
    });
    const rails = instancedFrom(unit, material('#2a2f36', { metalness: 0.8, roughness: 0.35 }), railMatrices);
    rails.raycast = () => {};
    [panels, caps, bodies, wicks].forEach((object) => { object.frustumCulled = false; object.castShadow = false; });
    caps.raycast = () => {};
    bodies.raycast = () => {};
    wicks.raycast = () => {};
    panels.renderOrder = 2;
    group.add(rails, bodies, wicks, caps, panels);

    // Targets from the price history (recomputed when the feed changes)
    let seenVersion = -1;
    function computeTargets() {
      const ranges = Feed.state.map((entry) => {
        const lo = Math.min(...entry.candles.map((c) => c.l));
        const hi = Math.max(...entry.candles.map((c) => c.h));
        return { lo, span: hi - lo || 1 };
      });
      walls.forEach((wall) => {
        const entry = Feed.state[wall.sector];
        const { lo, span } = ranges[wall.sector];
        const map = (v) => 1.0 + ((v - lo) / span) * 4.6;
        let top = 0;
        wall.targets = [];
        for (let k = 0; k < CANDLES; k++) {
          const candle = entry.candles[Math.min(entry.candles.length - 1, wall.base + k)];
          const b0 = map(Math.min(candle.o, candle.c));
          const b1 = Math.max(b0 + 0.12, map(Math.max(candle.o, candle.c)));
          const w1 = map(candle.h);
          wall.targets.push({ b0, b1, w0: map(candle.l), w1, up: candle.c >= candle.o });
          top = Math.max(top, w1, b1);
        }
        wall.targetHeight = Math.max(2.2, Math.min(6, top + 0.35));
      });
    }

    const green = new THREE.Color('#33ff8a');
    const red = new THREE.Color('#ff3b3b');
    function writeMatrices(lerp) {
      walls.forEach((wall, index) => {
        wall.height += (wall.targetHeight - wall.height) * lerp;
        const rotationY = wall.along === 'x' ? 0 : Math.PI / 2;
        dummy.rotation.set(0, rotationY, 0);
        dummy.position.set(wall.x, 0.18, wall.z);
        dummy.scale.set(MAZE.cell, wall.height - 0.18, 0.3);
        dummy.updateMatrix();
        panels.setMatrixAt(index, dummy.matrix);
        dummy.position.set(wall.x, wall.height - 0.02, wall.z);
        dummy.scale.set(MAZE.cell + 0.02, 0.06, 0.34);
        dummy.updateMatrix();
        caps.setMatrixAt(index, dummy.matrix);
        for (let k = 0; k < CANDLES; k++) {
          const part = wall.parts[k];
          const target = wall.targets[k];
          part.b0 += (target.b0 - part.b0) * lerp;
          part.b1 += (target.b1 - part.b1) * lerp;
          part.w0 += (target.w0 - part.w0) * lerp;
          part.w1 += (target.w1 - part.w1) * lerp;
          const offset = (k - (CANDLES - 1) / 2) * 1.25;
          const x = wall.x + (wall.along === 'x' ? offset : 0);
          const z = wall.z + (wall.along === 'z' ? offset : 0);
          const top = Math.min(part.b1, wall.height - 0.1);
          dummy.position.set(x, Math.min(part.b0, top - 0.1), z);
          dummy.scale.set(0.62, Math.max(0.1, top - Math.min(part.b0, top - 0.1)), 0.16);
          dummy.updateMatrix();
          bodies.setMatrixAt(index * CANDLES + k, dummy.matrix);
          const wickTop = Math.min(part.w1, wall.height - 0.05);
          dummy.position.set(x, Math.min(part.w0, wickTop - 0.1), z);
          dummy.scale.set(0.07, Math.max(0.1, wickTop - Math.min(part.w0, wickTop - 0.1)), 0.07);
          dummy.updateMatrix();
          wicks.setMatrixAt(index * CANDLES + k, dummy.matrix);
          if (lerp === 1 || part.up !== target.up) {
            part.up = target.up;
            bodies.setColorAt(index * CANDLES + k, target.up ? green : red);
            wicks.setColorAt(index * CANDLES + k, target.up ? green : red);
          }
        }
      });
      [panels, caps, bodies, wicks].forEach((object) => { object.instanceMatrix.needsUpdate = true; });
      if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
      if (wicks.instanceColor) wicks.instanceColor.needsUpdate = true;
    }
    computeTargets();
    walls.forEach((wall) => { wall.height = wall.targetHeight; });
    writeMatrices(1);
    if (panels.instanceColor) panels.instanceColor.needsUpdate = true;
    if (caps.instanceColor) caps.instanceColor.needsUpdate = true;

    // ---- Holographic price boards at the entrance (west side, facing the city) ----
    const boards = [];
    const steel = material('#2b3038', { metalness: 0.8, roughness: 0.3 });
    const boardSpecs = [
      { index: 0, z: -7.5, y: 1.6, w: 8, h: 4 },
      { index: 1, z: 2, y: 5.4, w: 8, h: 4 },
      { index: 2, z: 11.5, y: 1.6, w: 8, h: 4 }
    ];
    const boardX = -44.5;
    boardSpecs.forEach((spec) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const texture = new THREE.CanvasTexture(canvas);
      const board = { index: spec.index, canvas, texture };
      boards.push(board);
      drawBoard(board);
      const holder = new THREE.Group();
      holder.position.set(boardX, spec.y, spec.z);
      holder.rotation.y = -Math.PI / 2;
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(spec.w, spec.h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.96, side: THREE.DoubleSide }));
      screen.position.y = spec.h / 2;
      holder.add(screen);
      holder.add(box(spec.w + 0.3, 0.12, 0.3, steel, 0, -0.06, 0));
      holder.add(box(spec.w + 0.3, 0.12, 0.3, steel, 0, spec.h + 0.06, 0));
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(spec.w + 1, 1.6), additive(beamTexture(), ASSETS[spec.index].color, 0.35));
      halo.rotation.x = Math.PI;
      halo.position.set(0, -0.8, 0.05);
      noDecorRaycast(halo);
      holder.add(halo);
      group.add(holder);
      // Posts down to the ground
      [-1, 1].forEach((side) => {
        group.add(box(0.25, spec.y + spec.h + 0.2, 0.25, steel, boardX + 0.05, (spec.y + spec.h + 0.2) / 2, spec.z + side * (spec.w / 2 + 0.1)));
      });
    });
    const gateLabel = textSprite('THE CANDLESTICK MAZE', { width: 14, background: 'rgba(8, 20, 34, 0.88)', color: '#9fe8ff' });
    gateLabel.position.set(boardX, 11, 2);
    group.add(gateLabel);
    const entryLabel = textSprite('ENTRANCE', { width: 4, background: 'rgba(8, 20, 34, 0.85)', color: '#7fffb0' });
    entryLabel.position.set(-41, 4.3, 2);
    group.add(entryLabel);
    const exitLabel = textSprite('EXIT', { width: 3.5, background: 'rgba(8, 20, 34, 0.85)', color: '#ffcc66' });
    exitLabel.position.set(41.5, 4.3, -2);
    group.add(exitLabel);
    ASSETS.forEach((asset, index) => {
      const [x0, x1] = SECTORS[index];
      const label = textSprite(`${asset.symbol} SECTOR`, { width: 9, background: 'rgba(8, 14, 24, 0.85)', color: asset.color });
      label.position.set((x0 + x1) / 2, 8.5, -44);
      group.add(label);
    });

    // Information plaque (inspect)
    const plaque = new THREE.Group();
    plaque.position.set(-46, 0, -14);
    plaque.rotation.y = -Math.PI / 2;
    plaque.add(box(0.12, 1.1, 0.12, steel, 0, 0.55, 0));
    plaque.add(box(1.6, 1.0, 0.08, material('#11151b', { metalness: 0.5 }), 0, 1.45, 0));
    const plaqueScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), new THREE.MeshBasicMaterial({
      map: labelTexture('Prices are shown for information only. No trading, no purchases.', { bg: '#0b121a', fg: '#dff6ff', width: 512, height: 300, font: 'bold 34px Arial, sans-serif', border: '#3fb6ff' })
    }));
    plaqueScreen.position.set(0, 1.45, 0.045);
    plaque.add(plaqueScreen);
    plaque.userData.label = 'About the Candlestick Maze';
    plaque.userData.info = 'Wall heights and the sector floors follow the public prices of MANA, ETH and BTC (CoinGecko simple price API, refreshed every 60 s, small simulated ticks in between; if the feed is unavailable the boards say SIMULATED). The history shape before the first live samples is estimated from the 24h change. Prices are shown for information only: there is no trading, wallet or purchase anywhere in the game.';
    interactive(plaque, 'inspect', 'Info plaque');
    group.add(plaque);

    // ---- ATH pedestal in the central chamber ----
    const pedestal = new THREE.Group();
    pedestal.add(cylinder(1.3, 1.5, 0.4, steel, 0, 0.3, 0, 6));
    pedestal.add(cylinder(0.8, 1.0, 1.0, material('#1b2028', { metalness: 0.7, roughness: 0.3 }), 0, 1.0, 0, 6));
    pedestal.add(cylinder(0.95, 0.95, 0.08, glow('#ffd166', 1.4), 0, 1.54, 0, 6));
    const gem = mesh(new THREE.OctahedronGeometry(0.55, 0), new THREE.MeshStandardMaterial({ color: '#ffe08a', emissive: '#ffb703', emissiveIntensity: 0.9, metalness: 0.6, roughness: 0.15 }), 0, 2.5, 0);
    noDecorRaycast(gem);
    pedestal.add(gem);
    const athBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 10, 20, 1, true), additive(beamTexture(), '#ffd166', 0.25));
    athBeam.rotation.x = Math.PI;
    athBeam.position.y = 6.6;
    noDecorRaycast(athBeam);
    pedestal.add(athBeam);
    const athLabel = textSprite('ATH', { width: 3, background: 'rgba(40, 26, 0, 0.85)', color: '#ffd166' });
    athLabel.position.y = 4.2;
    pedestal.add(athLabel);
    group.add(pedestal);

    const BEST_KEY = 'multiverse-candles-best-time';
    const run = { start: 0, wasOutside: true };
    pedestal.userData.prompt = 'Press E to touch the ATH pedestal';
    pedestal.userData.onInteract = (hooks) => {
      if (window.Sound) Sound.play('coin');
      if (!run.start) return 'All-time high reached! Enter through the west ENTRANCE to time your run.';
      const seconds = (performance.now() - run.start) / 1000;
      run.start = 0;
      let best = null;
      try { best = parseFloat(localStorage.getItem(BEST_KEY)); } catch (error) { best = null; }
      const record = !Number.isFinite(best) || seconds < best;
      if (record) { try { localStorage.setItem(BEST_KEY, seconds.toFixed(1)); } catch (error) { /* storage blocked */ } }
      if (hooks.emote) hooks.emote('cheer');
      if (record && hooks.broadcast) hooks.broadcast(`reached the ATH of the Candlestick Maze in ${seconds.toFixed(1)}s`);
      return record ? `ATH reached in ${seconds.toFixed(1)} s. New personal best!` : `ATH reached in ${seconds.toFixed(1)} s. Your best is ${best.toFixed(1)} s.`;
    };
    interactive(pedestal, 'action', 'ATH pedestal');

    // ---- Animation: wall heights, floor glow, boards, maze clock ----
    const local = new THREE.Vector3();
    const greenFloor = new THREE.Color('#1dff7a');
    const redFloor = new THREE.Color('#ff2d2d');
    let lastBoardDraw = 0;
    let lastWrite = 0;
    animate(group, (time) => {
      if (typeof avatar !== 'undefined') {
        local.copy(avatar.position);
        group.worldToLocal(local);
        const nearby = Math.abs(local.x) < 160 && Math.abs(local.z) < 160;
        const inside = Math.abs(local.x) < 40 && Math.abs(local.z) < 40;
        if (inside && run.wasOutside && local.x < -36 && local.z > -0.5 && local.z < 4.5 && !run.start) {
          run.start = performance.now();
          if (typeof appendSystemMessage === 'function') appendSystemMessage('Maze clock started: find the ATH pedestal in the center.');
        }
        run.wasOutside = !inside;
        if (!nearby) return;
      }
      if (Feed.version !== seenVersion) {
        seenVersion = Feed.version;
        computeTargets();
      }
      if (time - lastWrite > 0.05) {
        writeMatrices(Math.min(1, (time - lastWrite) * 2.5));
        lastWrite = time;
      }
      sectorFloors.forEach((floorMaterial, index) => {
        const up = Feed.state[index].change >= 0;
        floorMaterial.emissive.copy(up ? greenFloor : redFloor);
        floorMaterial.emissiveIntensity = 0.85 + 0.3 * Math.sin(time * 1.6 + index);
      });
      if (time - lastBoardDraw > 5) {
        lastBoardDraw = time;
        boards.forEach(drawBoard);
      }
      gem.rotation.y = time * 1.2;
      gem.position.y = 2.5 + Math.sin(time * 2) * 0.15;
    });
  }

  PropKit.registerBuilder(/^pit_arena$/, 'pitArena', pitArena);
  PropKit.registerBuilder(/^candle_maze$/, 'candleMaze', candleMaze);
})();

// ============================================================================
// SQUID GAME EPIC EDITION: A DEVELOPERS EDITION OF THE SURVIVAL-GAME SHOW
// ============================================================================
// World "squidgame" (worlds.json, map "map_squid_game.json" in
// districts.json): a separate world like Roblox's Round 6, a 140 x 110 m walled
// compound on its own island, entered through JUMP IN, the metro or /world.
// The look borrows the show's set design only (pastel walls, magenta and teal
// accents, circle / triangle / square shapes everywhere, painted sky walls,
// an Escher-like staircase maze, a dormitory of stacked bunks with a giant
// piggy bank). There are no people figures and no character copies: the
// guards are floating shape drones and the doll is an original CI robot whose
// head is a traffic light. Nobody gets hurt: losing a game is "Build failed",
// a chat message and a teleport back to the start.
//
// Games (all single player against the clock or a bot, all non-violent):
//   1) Red Build, Green Build: walk on BUILD GREEN, freeze on BUILD RED.
//   2) Regex Honeycomb: trace a shape on a honeycomb candy with the mouse.
//   3) Merge Conflict Tug of War: press Space in rhythm against main.
//   4) Odd or Even Commits: a marbles guessing game against a bot.
//   5) Glass Bridge of Code Review: pick the tempered pane, trivia as hints.
//   6) Dormitory: bunks to sleep on, the MVC piggy bank and a wins board.
// Rewards: a win pays through the server-validated commit reward (+3 MVC,
// rate-limited by the server), the same path the district laptops use, and
// posts a "/me passed ..." line in chat. Every client counts those lines for
// the piggy bank and the session leaderboard. In-game coins only.
//
// Blocks (all at the district origin, local coordinates, north = -z = plaza):
// sgee_core (ground, walls, entrance logo arch, drones), sgee_redlight,
// sgee_bridge (staircase maze + glass bridge), sgee_dorm, sgee_tug,
// sgee_honeycomb, sgee_marbles.
(() => {
  const { material, glow, mesh, box, cylinder, sphere, animate, textSprite, interactive, labelTexture } = PropKit.kit;

  // --------------------------------------------------------------------------
  // Palette, shared state and small helpers
  // --------------------------------------------------------------------------
  const PINK = '#e6007e';
  const HOT = '#ff2e88';
  const TEAL = '#14a39a';
  const PASTEL = { pink: '#f6b8cc', mint: '#bfe6d6', yellow: '#f8e3a0', lilac: '#d9c9f1', sky: '#bfe3f7', cream: '#f7efe4' };
  const REWARD_MVC = 3; // what the server pays for one commit (one win)
  const STORE_KEY = 'multiverse-squidgame';
  const GAMES = { rl: 'Red Build, Green Build', honey: 'Regex Honeycomb', tug: 'Merge Conflict Tug of War', marbles: 'Odd or Even Commits', bridge: 'Glass Bridge of Code Review' };
  const WIN_LINE = /^\/me passed (.+) in Squid Game Epic Edition/;

  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const noRay = (object) => { object.traverse((node) => { node.raycast = () => {}; node.castShadow = false; }); return object; };
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  // Plain box (12 triangles) for walls and slabs; merged later per zone
  function blk(parent, w, h, d, boxMaterial, x, y, z, rotationY = 0) {
    const part = new THREE.Mesh(unitBox, boxMaterial);
    part.scale.set(w, h, d);
    part.position.set(x, y, z);
    part.rotation.y = rotationY;
    part.castShadow = Math.max(w, h, d) > 1.5;
    part.receiveShadow = true;
    parent.add(part);
    return part;
  }
  // Static parts of a zone become one mesh per material (few draw calls)
  function bake(group, staticGroup) {
    const merged = PropKit.kit.mergeByMaterial(staticGroup);
    merged.children.forEach((child) => { child.receiveShadow = true; });
    group.add(merged);
    return merged;
  }

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (error) { return {}; }
  }
  const stored = loadStore();
  const SG = {
    hooks: null,
    lifetimeWins: Number(stored.wins) || 0, // your wins on this browser (all sessions)
    sessionWins: new Map(), // devTag -> wins seen this session (everyone)
    myGames: {}, // game -> your wins this session
    othersWins: 0,
    dirty: { piggy: true, leaders: true },
    listening: false
  };
  function myTag() {
    try { if (typeof localDeveloperData !== 'undefined' && localDeveloperData && localDeveloperData.devTag) return localDeveloperData.devTag; } catch (error) { /* not ready */ }
    return 'You';
  }
  function system(text) { if (SG.hooks) SG.hooks.system(text); else if (typeof appendSystemMessage === 'function') appendSystemMessage(text); }
  function play(name) { try { if (window.Sound) Sound.play(name); } catch (error) { /* audio blocked */ } }
  function bankMVC() { return (SG.lifetimeWins + SG.othersWins) * REWARD_MVC; }
  function countWin(tag) {
    SG.sessionWins.set(tag, (SG.sessionWins.get(tag) || 0) + 1);
    SG.dirty.piggy = true;
    SG.dirty.leaders = true;
  }
  // Chat lines "/me passed <game> in Squid Game Epic Edition" from other
  // players feed the piggy bank and the leaderboard (your own wins are counted
  // locally, so your echo is skipped)
  function listenForWins() {
    if (SG.listening || typeof socket === 'undefined' || !socket) return;
    SG.listening = true;
    const lastSeen = new Map();
    socket.on('chat_message', (message) => {
      if (!message || message.id === socket.id || typeof message.text !== 'string' || !WIN_LINE.test(message.text)) return;
      const tag = String(message.devTag || 'dev').slice(0, 24);
      const now = Date.now();
      if (now - (lastSeen.get(tag) || 0) < 4000) return; // one win per player every few seconds
      lastSeen.set(tag, now);
      SG.othersWins++;
      countWin(tag);
    });
  }

  // A win: server-validated reward (the commit path, +3 MVC), chat line, boards
  function award(game) {
    const hooks = SG.hooks;
    SG.lifetimeWins++;
    SG.myGames[game] = (SG.myGames[game] || 0) + 1;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ wins: SG.lifetimeWins })); } catch (error) { /* storage blocked */ }
    countWin(myTag());
    play('coin');
    system(`BUILD PASSED: ${game}. +${REWARD_MVC} MVC goes to your wallet through the server commit reward, and ${REWARD_MVC} MVC drops into the dormitory piggy bank.`);
    if (hooks) {
      hooks.commit(12);
      hooks.broadcast(`passed ${game} in Squid Game Epic Edition`);
    }
  }
  // A loss: never violent, just a failed build and a trip back to the start
  function buildFailed(game, reason, anchor, spot) {
    system(`BUILD FAILED (${game}): ${reason}. Back to the start.`);
    play('teleport');
    if (anchor && spot) teleport(anchor, spot[0], spot[1], spot[2]);
  }
  function teleport(anchor, x, y, z) {
    const target = anchor.localToWorld(new THREE.Vector3(x, y, z));
    if (SG.hooks) SG.hooks.setAvatarPosition(target);
    else if (typeof avatar !== 'undefined') { avatar.position.copy(target); avatar.velocityY = 0; }
  }
  const probe = new THREE.Vector3();
  function avatarLocal(anchor) {
    if (typeof avatar === 'undefined' || !avatar) return null;
    return anchor.worldToLocal(probe.copy(avatar.position));
  }
  function isFlying() { try { return typeof flying !== 'undefined' && !!flying; } catch (error) { return false; } }
  // An E-usable object running a callback (keeps the hooks for later events)
  function action(object, label, prompt, run) {
    object.userData.prompt = prompt;
    object.userData.onInteract = (hooks) => { SG.hooks = hooks; listenForWins(); return run(hooks); };
    return interactive(object, 'action', label);
  }

  // --------------------------------------------------------------------------
  // Lazy canvases: textures are drawn the first time a player comes near
  // (static art) or only when their content changes (live boards)
  // --------------------------------------------------------------------------
  const pendingArt = [];
  function lazyTexture(width, height, draw, repeatX = 1, repeatY = 1) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    if (repeatX !== 1 || repeatY !== 1) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
    }
    pendingArt.push({ canvas, texture, draw });
    return texture;
  }
  function drawPendingArt() {
    while (pendingArt.length) {
      const { canvas, texture, draw } = pendingArt.shift();
      draw(canvas.getContext('2d'), canvas.width, canvas.height);
      texture.needsUpdate = true;
    }
  }
  // Live board: redraw(state) runs only when the board is marked dirty
  function liveBoard(width, height, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const board = { canvas, texture, dirty: true, draw, refresh() { if (!board.dirty) return; board.dirty = false; draw(canvas.getContext('2d'), width, height); texture.needsUpdate = true; } };
    return board;
  }
  const boardMaterial = (board) => new THREE.MeshBasicMaterial({ map: board.texture, toneMapped: false });
  function plane(w, h, planeMaterial, x, y, z, rotationY = 0) {
    const flat = mesh(new THREE.PlaneGeometry(w, h), planeMaterial, x, y, z);
    flat.rotation.y = rotationY;
    flat.castShadow = false;
    return flat;
  }
  function floorDecal(w, d, decalMaterial, x, y, z) {
    const flat = mesh(new THREE.PlaneGeometry(w, d), decalMaterial, x, y, z);
    flat.rotation.x = -Math.PI / 2;
    flat.castShadow = false;
    flat.raycast = () => {};
    return flat;
  }

  // Shape outlines (circle, triangle, square) as flat rings facing +z
  const SHAPE_RINGS = [
    new THREE.RingGeometry(0.74, 1, 40),
    new THREE.RingGeometry(0.5, 1, 3, 1, Math.PI / 2),
    new THREE.RingGeometry(0.66, 1, 4, 1, Math.PI / 4)
  ];
  // Solid extruded shapes for sculptures and pillar caps
  function shapeSolid(kind, size, depth) {
    const shape = new THREE.Shape();
    if (kind === 0) shape.absarc(0, 0, size, 0, Math.PI * 2, false);
    else {
      const sides = kind === 1 ? 3 : 4;
      for (let i = 0; i <= sides; i++) {
        const angle = Math.PI / 2 + (kind === 2 ? Math.PI / 4 : 0) + (i / sides) * Math.PI * 2;
        const px = Math.cos(angle) * size;
        const py = Math.sin(angle) * size;
        if (i === 0) shape.moveTo(px, py); else shape.lineTo(px, py);
      }
    }
    if (kind === 0) {
      const hole = new THREE.Path();
      hole.absarc(0, 0, size * 0.62, 0, Math.PI * 2, true);
      shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 32 });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }

  // Instanced shape stencils (pink and teal) on walls: 3 draw calls in total
  const stencils = [[], [], []];
  function stencil(kind, x, y, z, rotationY, scale, color) { stencils[kind].push({ x, y, z, rotationY, scale, color }); }
  function buildStencils(group) {
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    stencils.forEach((list, kind) => {
      if (!list.length) return;
      const instanced = new THREE.InstancedMesh(SHAPE_RINGS[kind], new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide, toneMapped: false }), list.length);
      list.forEach((item, index) => {
        dummy.position.set(item.x, item.y, item.z);
        dummy.rotation.set(0, item.rotationY, 0);
        dummy.scale.setScalar(item.scale);
        dummy.updateMatrix();
        instanced.setMatrixAt(index, dummy.matrix);
        instanced.setColorAt(index, color.set(item.color));
      });
      instanced.frustumCulled = false;
      noRay(instanced);
      group.add(instanced);
    });
  }

  // --------------------------------------------------------------------------
  // Shape drones (the guards): a black body with a glowing pink circle,
  // triangle or square face. One instanced set for the whole district.
  // --------------------------------------------------------------------------
  const droneSpecs = []; // { kind, at(t) -> { x, y, z, yaw } }
  function addDrone(kind, at) { droneSpecs.push({ kind, at }); }
  function buildDrones(group) {
    const capacity = 32;
    const bodyGeometry = new THREE.SphereGeometry(0.55, 16, 10);
    bodyGeometry.scale(1, 0.85, 0.8);
    const bodies = new THREE.InstancedMesh(bodyGeometry, new THREE.MeshStandardMaterial({ color: '#15151b', roughness: 0.25, metalness: 0.5 }), capacity);
    const faceMaterial = new THREE.MeshStandardMaterial({ color: HOT, emissive: HOT, emissiveIntensity: 1.8 });
    const faces = [32, 3, 4].map((segments) => {
      const geometry = new THREE.TorusGeometry(0.33, 0.06, 6, segments);
      if (segments === 3) geometry.rotateZ(Math.PI / 2);
      if (segments === 4) geometry.rotateZ(Math.PI / 4);
      return new THREE.InstancedMesh(geometry, faceMaterial, capacity);
    });
    [bodies, ...faces].forEach((instanced) => { instanced.count = 0; instanced.frustumCulled = false; noRay(instanced); group.add(instanced); });
    const dummy = new THREE.Object3D();
    return (t) => {
      const counts = [0, 0, 0];
      bodies.count = Math.min(capacity, droneSpecs.length);
      droneSpecs.slice(0, capacity).forEach((spec, index) => {
        const { x, y, z, yaw } = spec.at(t);
        dummy.position.set(x, y, z);
        dummy.rotation.set(Math.sin(t * 1.3 + index) * 0.08, yaw, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        bodies.setMatrixAt(index, dummy.matrix);
        dummy.position.set(x + Math.sin(yaw) * 0.47, y + 0.02, z + Math.cos(yaw) * 0.47);
        dummy.updateMatrix();
        faces[spec.kind].setMatrixAt(counts[spec.kind]++, dummy.matrix);
      });
      faces.forEach((instanced, kind) => { instanced.count = counts[kind]; instanced.instanceMatrix.needsUpdate = true; });
      bodies.instanceMatrix.needsUpdate = true;
    };
  }
  // Game logic runs on a real clock (the animate time only ticks near the camera)
  const clock = () => performance.now() / 1000;
  const yawTo = (fromX, fromZ, toX, toZ) => Math.atan2(toX - fromX, toZ - fromZ);

  // --------------------------------------------------------------------------
  // Canvas art (drawn lazily)
  // --------------------------------------------------------------------------
  function drawSky(ctx, w, h) {
    const random = seeded(456);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#7cc8f2');
    gradient.addColorStop(0.7, '#bfe6fb');
    gradient.addColorStop(1, '#e3f4fd');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    for (let c = 0; c < 7; c++) {
      const cx = (c + 0.3 + random() * 0.4) * (w / 7);
      const cy = h * (0.18 + random() * 0.45);
      const size = 26 + random() * 26;
      for (let p = 0; p < 7; p++) {
        const px = cx + (p - 3) * size * 0.7 + (random() - 0.5) * 10;
        const py = cy - Math.sin((p / 6) * Math.PI) * size * 0.6;
        const r = size * (0.7 + random() * 0.5);
        ctx.fillStyle = 'rgba(176, 200, 222, 0.9)';
        ctx.beginPath(); ctx.arc(px + 3, py + 6, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Painted look: soft brush noise and a faint seam at the panel edges
    const image = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (random() - 0.5) * 8;
      image.data[i] += n; image.data[i + 1] += n; image.data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);
    ctx.fillStyle = 'rgba(80, 110, 140, 0.18)';
    ctx.fillRect(0, 0, 2, h);
    ctx.fillRect(w / 2 - 1, 0, 2, h);
  }
  function drawTiles(ctx, w, h) {
    const random = seeded(67);
    const colors = ['#f6e7da', '#f9dbe5', '#dff1ea', '#f3ecc9'];
    const tile = w / 4;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        ctx.fillStyle = colors[(row + col * 3) % 4];
        ctx.fillRect(col * tile, row * tile, tile, tile);
        if ((row * 4 + col) % 3 === 0) {
          ctx.strokeStyle = (row + col) % 2 ? 'rgba(230, 0, 126, 0.16)' : 'rgba(20, 163, 154, 0.18)';
          ctx.lineWidth = 6;
          const cx = col * tile + tile / 2;
          const cy = row * tile + tile / 2;
          const kind = (row + col) % 3;
          ctx.beginPath();
          if (kind === 0) ctx.arc(cx, cy, tile * 0.28, 0, Math.PI * 2);
          else if (kind === 1) { ctx.moveTo(cx, cy - tile * 0.3); ctx.lineTo(cx + tile * 0.28, cy + tile * 0.22); ctx.lineTo(cx - tile * 0.28, cy + tile * 0.22); ctx.closePath(); } else ctx.rect(cx - tile * 0.24, cy - tile * 0.24, tile * 0.48, tile * 0.48);
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = '#d9c7b8';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * tile, 0); ctx.lineTo(i * tile, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * tile); ctx.lineTo(w, i * tile); ctx.stroke();
    }
    const image = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (random() - 0.5) * 12;
      image.data[i] += n; image.data[i + 1] += n; image.data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);
  }
  function drawSand(ctx, w, h) {
    const random = seeded(808);
    ctx.fillStyle = '#e4cc9c';
    ctx.fillRect(0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < image.data.length; i += 4) {
      const n = (random() - 0.5) * 30;
      image.data[i] += n; image.data[i + 1] += n * 0.9; image.data[i + 2] += n * 0.7;
    }
    ctx.putImageData(image, 0, 0);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(${120 + random() * 60}, ${100 + random() * 40}, ${70 + random() * 30}, 0.5)`;
      ctx.beginPath(); ctx.arc(random() * w, random() * h, 1 + random() * 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  function textCanvas(ctx, w, h, { bg, fg, title, sub, border }) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = Math.max(6, h * 0.04); ctx.strokeRect(0, 0, w, h); }
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(h * (sub ? 0.36 : 0.5))}px Segoe UI, Arial, sans-serif`;
    ctx.fillText(title, w / 2, sub ? h * 0.4 : h / 2, w * 0.94);
    if (sub) {
      ctx.font = `${Math.round(h * 0.16)}px Segoe UI, Arial, sans-serif`;
      ctx.fillText(sub, w / 2, h * 0.78, w * 0.94);
    }
  }
  function signPlane(w, h, options, x, y, z, rotationY = 0) {
    const texture = lazyTexture(512, Math.round(512 * (h / w)), (ctx, cw, ch) => textCanvas(ctx, cw, ch, options));
    return plane(w, h, new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }), x, y, z, rotationY);
  }

  // Sky wall: a painted sky-and-clouds plane (texture = 24 m x 12 m)
  const skyMaterial = new THREE.MeshStandardMaterial({ map: lazyTexture(1024, 512, drawSky), roughness: 0.95 });
  skyMaterial.map.wrapS = THREE.RepeatWrapping;
  function skyWall(parent, length, height, x, y, z, rotationY) {
    const geometry = new THREE.PlaneGeometry(length, height);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (length / 24), uv.getY(i) * (height / 12));
    const wall = new THREE.Mesh(geometry, skyMaterial);
    wall.position.set(x, y, z);
    wall.rotation.y = rotationY;
    wall.receiveShadow = true;
    parent.add(wall);
    return wall;
  }

  // ==========================================================================
  // CORE: ground, perimeter walls, the logo arch, sculptures, drones, info
  // ==========================================================================
  const HALF_X = 70;
  const HALF_Z = 55;
  function sgCore(group) {
    const S = new THREE.Group();
    // Pastel tile ground (5 m tiles with faint shape stencils)
    const ground = new THREE.Mesh(new THREE.BoxGeometry(HALF_X * 2, 0.3, HALF_Z * 2), new THREE.MeshStandardMaterial({ map: lazyTexture(512, 512, drawTiles, 28, 22), roughness: 0.85 }));
    ground.position.y = -0.15;
    ground.receiveShadow = true;
    group.add(ground);

    // Perimeter: pastel pink walls with a teal coping; the gate opens north
    const wall = material(PASTEL.pink, { roughness: 0.85 });
    const coping = material(TEAL, { roughness: 0.6 });
    const H = 6;
    [[-HALF_X, -8], [8, HALF_X]].forEach(([a, b]) => {
      blk(S, b - a, H, 0.8, wall, (a + b) / 2, H / 2, -HALF_Z + 0.4);
      blk(S, b - a, 0.3, 1.1, coping, (a + b) / 2, H + 0.15, -HALF_Z + 0.4);
    });
    blk(S, HALF_X * 2, H, 0.8, wall, 0, H / 2, HALF_Z - 0.4);
    blk(S, HALF_X * 2, 0.3, 1.1, coping, 0, H + 0.15, HALF_Z - 0.4);
    [-1, 1].forEach((side) => {
      blk(S, 0.8, H, HALF_Z * 2, wall, side * (HALF_X - 0.4), H / 2, 0);
      blk(S, 1.1, 0.3, HALF_Z * 2, coping, side * (HALF_X - 0.4), H + 0.15, 0);
    });
    // Shape stencils on the outer faces of the perimeter
    let k = 0;
    for (let x = -64; x <= 64; x += 12) {
      if (Math.abs(x) > 20) stencil(k % 3, x, 3.2, -HALF_Z - 0.05, Math.PI, 1.3, k % 2 ? TEAL : PINK);
      stencil((k + 1) % 3, x, 3.2, HALF_Z + 0.05, 0, 1.3, k % 2 ? PINK : TEAL);
      k++;
    }
    for (let z = -48; z <= 48; z += 12) {
      stencil(k % 3, -HALF_X - 0.05, 3.2, z, -Math.PI / 2, 1.3, k % 2 ? TEAL : PINK);
      stencil((k + 2) % 3, HALF_X + 0.05, 3.2, z, Math.PI / 2, 1.3, k % 2 ? PINK : TEAL);
      k++;
    }

    // Entrance arch: two teal pillars and the giant logo billboard over the gate
    const pillar = material(TEAL, { roughness: 0.5 });
    const frame = material('#1d1d24', { roughness: 0.4, metalness: 0.3 });
    [-17, 17].forEach((x) => {
      blk(S, 2.6, 26, 2.6, pillar, x, 13, -HALF_Z + 0.4);
      blk(S, 3.2, 0.6, 3.2, frame, x, 26.3, -HALF_Z + 0.4);
    });
    const logoWidth = 30;
    const logoHeight = logoWidth * (768 / 1376);
    const logoY = 6.8 + logoHeight / 2;
    blk(S, logoWidth + 1.4, logoHeight + 1.4, 0.8, frame, 0, logoY, -HALF_Z + 0.4);
    blk(S, logoWidth + 4, 0.8, 1.6, pillar, 0, logoY + logoHeight / 2 + 1.1, -HALF_Z + 0.4);
    const logoMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const front = plane(logoWidth, logoHeight, logoMaterial, 0, logoY, -HALF_Z - 0.03, Math.PI);
    const back = plane(logoWidth, logoHeight, logoMaterial, 0, logoY, -HALF_Z + 0.83, 0);
    group.add(front, back);
    // Neon circle, triangle and square on top of the arch
    const neon = glow(HOT, 2.2);
    [[-8, 0], [0, 1], [8, 2]].forEach(([x, kind]) => {
      const shape = mesh(shapeSolid(kind, 2.4, 0.5), neon, x, logoY + logoHeight / 2 + 4.2, -HALF_Z + 0.4);
      shape.castShadow = false;
      S.add(shape);
    });
    // Big pastel sculptures on the entrance plaza (walkable around, collidable)
    [[24, 0, PINK], [33, 1, TEAL], [42, 2, PINK], [-24, 2, TEAL]].forEach(([x, kind, color]) => {
      const sculpture = mesh(shapeSolid(kind, 2.2, 0.9), material(color, { roughness: 0.4 }), x, 2.6, -47);
      S.add(sculpture);
      blk(S, 3.2, 0.3, 1.6, material(PASTEL.cream), x, 0.15, -47);
    });
    // Welcome desk: rules and controls of every game (E)
    const desk = new THREE.Group();
    desk.position.set(10, 0, -47);
    blk(desk, 3.4, 1.1, 1.2, material(PASTEL.mint), 0, 0.55, 0);
    blk(desk, 3.6, 0.12, 1.4, material(PINK), 0, 1.16, 0);
    desk.add(plane(3.2, 1.8, logoMaterial, 0, 2.3, -0.2, Math.PI));
    blk(desk, 3.4, 2, 0.15, frame, 0, 2.3, -0.12);
    desk.userData.label = 'Squid Game Epic Edition: rules';
    desk.userData.info = 'A developers edition with no one hurt. Losing = BUILD FAILED and a teleport back to the start. Winning pays +3 MVC through the server commit reward and fills the dormitory piggy bank. ' +
      'RED BUILD, GREEN BUILD (west field): E at the start kiosk, walk on BUILD GREEN, freeze on BUILD RED, cross the finish line. ' +
      'REGEX HONEYCOMB (south stall): E at a table, pick a shape, hold the mouse button and trace the groove; leave the line and the candy cracks. ' +
      'MERGE CONFLICT TUG OF WAR (south-east): climb to YOUR BRANCH, E at the console, press Space when the marker is inside the green zone (off-beat presses slip). ' +
      'ODD OR EVEN COMMITS (marble alley): E at the table, pick a bet and guess odd or even. ' +
      'GLASS BRIDGE OF CODE REVIEW (staircase maze, center): climb the pastel stairs or take the lift, E at the console to start a crossing; the review board says which pane is tempered. ' +
      'DORMITORY (east): sleep on a bunk, watch the MVC piggy bank and the wins board. Esc closes any mini game.';
    interactive(desk, 'inspect', 'Squid Game Epic Edition: rules');
    group.add(desk);
    const welcome = textSprite('Squid Game Epic Edition', { width: 12, background: 'rgba(230, 0, 126, 0.88)' });
    welcome.position.set(10, 4.6, -47);
    group.add(welcome);

    // Zone signposts
    [['Red Build, Green Build', -50, -43], ['Staircase maze and Glass Bridge', -19, -41], ['Dormitory', 16, -41.5], ['Tug of War', 25, 10], ['Regex Honeycomb', 6, 31], ['Odd or Even Commits', 6, 47]].forEach(([text, x, z]) => {
      const sign = textSprite(text, { width: 8, background: 'rgba(20, 163, 154, 0.88)' });
      sign.position.set(x, 4.2, z);
      group.add(sign);
    });

    // Drones that greet arrivals at the gate
    [-1, 1].forEach((side, index) => addDrone(index, (t) => ({ x: side * 10, y: 4.2 + Math.sin(t * 1.6 + index) * 0.3, z: -50 + Math.sin(t * 0.4 + index * 2) * 3, yaw: Math.PI })));

    buildStencils(group);
    bake(group, S);
    const updateDrones = buildDrones(group);

    let logoLoaded = false;
    animate(group, (t) => {
      if (!logoLoaded) {
        logoLoaded = true;
        new THREE.TextureLoader().load('assets/squid-game-logo.jpg', (texture) => {
          texture.encoding = THREE.sRGBEncoding;
          texture.anisotropy = 8;
          logoMaterial.map = texture;
          logoMaterial.needsUpdate = true;
        });
      }
      if (pendingArt.length) drawPendingArt();
      listenForWins();
      updateDrones(t);
    });
  }

  // ==========================================================================
  // 1) RED BUILD, GREEN BUILD: the field with the CI traffic-light robot
  // ==========================================================================
  const FIELD = { x0: -69, x1: -31, z0: -40, z1: 54, cx: -50, start: -30, finish: 38 };
  function sgRedLight(group) {
    const S = new THREE.Group();
    const { x0, x1, z0, z1, cx } = FIELD;
    const length = z1 - z0;
    // Sandy field
    const sand = mesh(new THREE.BoxGeometry(x1 - x0, 0.06, length), new THREE.MeshStandardMaterial({ map: lazyTexture(512, 512, drawSand, 6, 14), roughness: 1 }), cx, 0.03, (z0 + z1) / 2);
    sand.castShadow = false;
    group.add(sand);
    // 12 m walls painted with sky and clouds on the inside
    const outer = material(PASTEL.pink, { roughness: 0.85 });
    const WH = 12;
    blk(S, 0.6, WH, length, outer, x0 - 0.5, WH / 2, (z0 + z1) / 2);
    blk(S, 0.8, WH, length, outer, x1 + 0.4, WH / 2, (z0 + z1) / 2);
    blk(S, x1 - x0, WH, 0.6, outer, cx, WH / 2, z1 + 0.2);
    // North wall with a 12 m gate in the middle
    [[x0 - 0.8, cx - 6], [cx + 6, x1 + 0.8]].forEach(([a, b]) => blk(S, b - a, WH, 0.8, outer, (a + b) / 2, WH / 2, z0));
    skyWall(S, length, WH, x0 - 0.18, WH / 2, (z0 + z1) / 2, Math.PI / 2);
    skyWall(S, length, WH, x1 - 0.02, WH / 2, (z0 + z1) / 2, -Math.PI / 2);
    skyWall(S, x1 - x0, WH, cx, WH / 2, z1 - 0.12, Math.PI);
    [[x0, cx - 6], [cx + 6, x1]].forEach(([a, b]) => skyWall(S, b - a, WH, (a + b) / 2, WH / 2, z0 + 0.42, 0));
    blk(S, x1 - x0 + 1.6, 0.4, 1.2, material(TEAL), cx, WH + 0.2, z0);
    // Start and finish lines, lane flags
    blk(S, x1 - x0, 0.04, 0.6, material('#ffffff', { roughness: 0.6 }), cx, 0.08, FIELD.start);
    for (let i = 0; i < 19; i++) blk(S, 2, 0.04, 1.2, material(i % 2 ? PINK : TEAL), x0 + 1 + i * 2, 0.08, FIELD.finish);
    group.add(floorDecal(10, 2.4, new THREE.MeshBasicMaterial({ map: labelTexture('START', { bg: 'rgba(0,0,0,0)', fg: '#ffffff', width: 512, height: 128, font: 'bold 96px Segoe UI, Arial, sans-serif' }), transparent: true, toneMapped: false }), cx, 0.1, FIELD.start - 2));
    group.add(floorDecal(18, 2.6, new THREE.MeshBasicMaterial({ map: labelTexture('FINISH: BUILD PASSED', { bg: 'rgba(0,0,0,0)', fg: PINK, width: 1024, height: 128, font: 'bold 92px Segoe UI, Arial, sans-serif' }), transparent: true, toneMapped: false }), cx, 0.1, FIELD.finish - 2.4));
    for (let z = z0 + 8; z < z1 - 4; z += 10) {
      [x0 + 1.2, x1 - 1.2].forEach((x, side) => {
        blk(S, 0.12, 2.4, 0.12, material('#f7f7f7'), x, 1.2, z);
        blk(S, 0.05, 0.6, 0.9, material(side ? PINK : TEAL), x, 2.1, z + 0.45);
      });
    }

    // ---- The CI robot: an original traffic-light-headed robot, 15 m tall ----
    const robot = new THREE.Group();
    robot.position.set(cx, 0, 47);
    const shell = material('#e9eef2', { roughness: 0.35, metalness: 0.2 });
    const joint = material('#3a3f4a', { roughness: 0.4, metalness: 0.6 });
    const tealShell = material(TEAL, { roughness: 0.4, metalness: 0.2 });
    [-1.5, 1.5].forEach((x) => {
      robot.add(box(1.8, 0.9, 2.8, tealShell, x, 0.45, -0.2));
      robot.add(cylinder(0.6, 0.7, 3.6, joint, x, 2.7, 0, 16));
      robot.add(sphere(0.75, joint, x, 4.6, 0, 14));
    });
    robot.add(box(4.8, 1.6, 2.8, tealShell, 0, 5.4, 0));
    robot.add(box(4.6, 4.2, 2.8, shell, 0, 8.3, 0));
    [-1, 1].forEach((side) => {
      robot.add(sphere(0.8, joint, side * 2.9, 9.7, 0, 14));
      const arm = cylinder(0.5, 0.45, 4, shell, side * 3.1, 7.6, 0, 14);
      arm.rotation.z = side * 0.12;
      robot.add(arm);
      robot.add(box(1.1, 1.1, 1.1, material(PINK, { roughness: 0.4 }), side * 3.35, 5.3, 0));
    });
    robot.add(cylinder(0.55, 0.65, 1, joint, 0, 10.9, 0, 14));
    // Chest status screen (front = -z, toward the players)
    const chest = liveBoard(256, 160, (ctx, w, h) => {
      const red = RL.phase === 'red';
      ctx.fillStyle = '#101418';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = red ? '#ff3b4e' : RL.phase === 'green' ? '#2fd46b' : '#ffc53d';
      ctx.font = 'bold 54px Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CI', w / 2, 66);
      ctx.font = 'bold 30px Segoe UI, Arial, sans-serif';
      ctx.fillText(red ? 'FAILING' : RL.phase === 'green' ? 'PASSING' : 'QUEUED', w / 2, 120);
    });
    robot.add(plane(2.8, 1.75, boardMaterial(chest), 0, 8.6, -1.42, Math.PI));
    // Traffic-light head (turns around: lamps toward the players = BUILD RED)
    const head = new THREE.Group();
    head.position.y = 13.9;
    head.add(box(2.6, 5.4, 2.2, material('#2a2d34', { roughness: 0.45, metalness: 0.4 }), 0, 0, 0));
    const lampColors = ['#ff3b4e', '#ffc53d', '#2fd46b'];
    const lamps = lampColors.map((color, index) => {
      const lampMaterial = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.1, roughness: 0.3 });
      const lamp = mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.3, 24), lampMaterial, 0, 1.65 - index * 1.65, -1.15);
      lamp.rotation.x = Math.PI / 2;
      head.add(lamp);
      const hood = mesh(new THREE.CylinderGeometry(0.98, 0.98, 0.7, 20, 1, true, -Math.PI / 2, Math.PI), material('#1b1d22', { side: THREE.DoubleSide }), 0, 1.65 - index * 1.65 + 0.15, -1.45);
      hood.rotation.x = Math.PI / 2;
      hood.rotation.y = Math.PI / 2;
      head.add(hood);
      return lampMaterial;
    });
    // Back of the head: pink plate with the three shapes
    head.add(box(2.2, 4.6, 0.12, material(PINK, { roughness: 0.5 }), 0, 0, 1.12));
    [0, 1, 2].forEach((kind) => {
      const shape = mesh(SHAPE_RINGS[kind], new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }), 0, 1.5 - kind * 1.5, 1.2);
      shape.scale.setScalar(0.55);
      head.add(shape);
    });
    head.add(cylinder(0.06, 0.06, 1.2, joint, 0, 3.3, 0, 8));
    head.add(sphere(0.32, glow(HOT, 1.6), 0, 4, 0, 12));
    robot.add(head);
    group.add(robot);
    // Status board above the robot (lazy, redrawn only when its text changes)
    const status = liveBoard(1024, 300, (ctx, w, h) => drawStatus(ctx, w, h));
    const statusFrame = new THREE.Group();
    statusFrame.position.set(cx, 0, 52.6);
    blk(statusFrame, 21, 7, 0.5, material('#1d1d24'), 0, 21.5, 0.2);
    statusFrame.add(plane(20, 6, boardMaterial(status), 0, 21.5, -0.08, Math.PI));
    [-9, 9].forEach((x) => blk(statusFrame, 0.6, 18, 0.6, material(TEAL), x, 9, 0.3));
    group.add(statusFrame);
    // Start kiosk
    const kiosk = new THREE.Group();
    kiosk.position.set(cx, 0, -35);
    blk(kiosk, 1.4, 1.1, 1.4, material(PASTEL.mint), 0, 0.55, 0);
    kiosk.add(cylinder(0.45, 0.45, 0.2, glow(HOT, 1.4), 0, 1.2, 0, 24));
    action(kiosk, 'Red Build, Green Build', 'Press E to start a Red Build, Green Build round', () => startRound(group));
    group.add(kiosk);
    const kioskSign = textSprite('E: start a round', { width: 5, background: 'rgba(230, 0, 126, 0.9)' });
    kioskSign.position.set(cx, 2.6, -35);
    group.add(kioskSign);
    // Field drones patrol both sides, always facing the players
    [[x0 + 3, 0], [x0 + 3, 2], [x1 - 3, 1], [x1 - 3, 0]].forEach(([x, kind], index) => addDrone(kind, (t) => {
      const z = 6 + Math.sin(t * 0.25 + index * 1.7) * 36;
      return { x, y: 5 + Math.sin(t * 1.4 + index) * 0.3, z, yaw: yawTo(x, z, cx, z) };
    }));
    bake(group, S);

    // ---- Game state ----
    const RL = { phase: 'green', since: 0, until: 0, round: null, headAngle: Math.PI, lastBoard: 0, limit: 90 };
    function setPhase(phase, t, duration) {
      RL.phase = phase;
      RL.since = t;
      RL.until = t + duration;
      lamps.forEach((lampMaterial, index) => { lampMaterial.emissiveIntensity = (phase === 'red' && index === 0) || (phase === 'ready' && index === 1) || (phase === 'green' && index === 2) ? 2.4 : 0.08; });
      chest.dirty = true;
      status.dirty = true;
      if (RL.round) RL.round.snapshot = null;
    }
    function drawStatus(ctx, w, h) {
      const t = RL.now || 0;
      const red = RL.phase === 'red';
      const ready = RL.phase === 'ready';
      ctx.fillStyle = red ? '#3a0710' : ready ? '#3a2a05' : '#06301a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = red ? '#ff3b4e' : ready ? '#ffc53d' : '#2fd46b';
      ctx.textAlign = 'center';
      ctx.font = 'bold 120px Segoe UI, Arial, sans-serif';
      ctx.fillText(red ? 'BUILD RED' : ready ? 'GET READY' : 'BUILD GREEN', w / 2, 130);
      ctx.font = 'bold 40px Segoe UI, Arial, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(red ? 'FREEZE: moving now fails the build' : ready ? 'Round starts in a moment' : 'GO: walk to the finish line', w / 2, 190);
      // Countdown song bar: "npm run build" fills while the build is green
      const progress = RL.phase === 'green' ? Math.min(1, (t - RL.since) / Math.max(0.1, RL.until - RL.since)) : red ? 1 : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(60, 220, w - 120, 46);
      ctx.fillStyle = red ? '#ff3b4e' : '#2fd46b';
      ctx.fillRect(60, 220, (w - 120) * progress, 46);
      const song = 'npm  run  build . . .';
      ctx.font = 'bold 34px Consolas, monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(song.slice(0, Math.ceil(song.length * progress)), w / 2, 255);
      if (RL.round) {
        ctx.textAlign = 'right';
        ctx.font = 'bold 30px Segoe UI, Arial, sans-serif';
        ctx.fillText(`${Math.max(0, RL.limit - (t - RL.round.start)).toFixed(0)} s`, w - 30, 40);
      }
    }
    function startRound(anchor) {
      if (RL.round) return 'A round is already running: reach the finish line!';
      const t = clock();
      RL.round = { start: t, snapshot: null };
      teleport(anchor, cx + (Math.random() - 0.5) * 16, 0.1, FIELD.start - 2.5);
      setPhase('ready', t, 3);
      return 'Red Build, Green Build: walk on BUILD GREEN, freeze on BUILD RED. Reach the pink and teal finish line within 90 s.';
    }
    function endRound() { RL.round = null; status.dirty = true; }
    function fail(reason) {
      endRound();
      buildFailed(GAMES.rl, reason, group, [cx + (Math.random() - 0.5) * 12, 0.1, -36]);
    }
    RL.start = () => startRound(group);
    RL.setPhase = (phase, duration) => setPhase(phase, clock(), duration); // test hook
    RL.fail = fail;
    window.SquidGameEE = window.SquidGameEE || {};
    window.SquidGameEE.redLight = RL;

    setPhase('green', 0, 4);
    animate(group, () => {
      const t = clock();
      RL.now = t;
      // Phase machine: ready -> green -> red -> green ... (faster as a round goes on)
      if (t >= RL.until) {
        const pace = RL.round ? Math.max(0.6, 1 - (t - RL.round.start) / 120) : 1;
        if (RL.phase === 'green') setPhase('red', t, 2 + Math.random() * 1.5);
        else setPhase('green', t, (2.5 + Math.random() * 2.5) * pace);
      }
      // Head: lamps face the players on red, the sky wall on green
      const target = RL.phase === 'red' ? 0 : Math.PI;
      RL.headAngle += (target - RL.headAngle) * 0.15;
      head.rotation.y = RL.headAngle;
      if (RL.phase === 'green' && t - RL.lastBoard > 0.12) { RL.lastBoard = t; status.dirty = true; }
      chest.refresh();
      status.refresh();
      if (!RL.round) return;
      const local = avatarLocal(group);
      if (!local) return;
      if (local.x < x0 - 1 || local.x > x1 + 1 || local.z < z0 - 2 || local.z > z1 + 1 || local.y > 14) {
        endRound();
        system('Red Build, Green Build: round cancelled, you left the field.');
        return;
      }
      if (isFlying()) { fail('no flying during a build'); return; }
      if (t - RL.round.start > RL.limit) { fail(`the build timed out (${RL.limit} s)`); return; }
      if (RL.phase === 'red' && t - RL.since > 0.45) {
        if (!RL.round.snapshot) RL.round.snapshot = local.clone();
        else if (Math.hypot(local.x - RL.round.snapshot.x, local.z - RL.round.snapshot.z) > 0.35 || Math.abs(local.y - RL.round.snapshot.y) > 0.6) { fail('you moved on BUILD RED'); return; }
      }
      if (local.z >= FIELD.finish && RL.phase !== 'ready') {
        endRound();
        award(GAMES.rl);
      }
    });
  }

  // ==========================================================================
  // 5) STAIRCASE MAZE + GLASS BRIDGE OF CODE REVIEW
  // ==========================================================================
  const BRIDGE = { y: 12, lanes: [-8.75, -11.25], z0: -2.2, step: 2.8, pairs: 9, paneW: 2.1, paneD: 2.0, startZ0: -17.3, startZ1: -3.2, endZ0: 22, endZ1: 28, x0: -20.4, x1: -4 };
  const TRIVIA = [
    ['git rebase rewrites commit history', true], ['HTTP 404 means Not Found', true], ['JSON keys must be double-quoted strings', true],
    ['A Promise is pending, fulfilled or rejected', true], ['typeof null is "object" in JavaScript', true], ['Binary search runs in O(log n)', true],
    ['git stash shelves uncommitted changes', true], ['UTF-8 is backward compatible with ASCII', true], ['Python lists are mutable', true],
    ['TCP delivers bytes in order', true], ['A mutex lets one thread in at a time', true], ['CSS flexbox lays out one axis at a time', true],
    ['HTTP 500 means the client sent a bad request', false], ['0.1 + 0.2 === 0.3 in JavaScript', false], ['Binary search works on unsorted arrays', false],
    ['HTTPS uses port 80 by default', false], ['In SQL, NULL = NULL is true', false], ['git reset --soft deletes your changes', false],
    ['The regex dot matches a newline by default', false], ['const makes a JS object immutable', false], ['A Docker container boots its own kernel', false],
    ['git pull never creates a merge commit', false], ['Arrays in JavaScript have a fixed size', false], ['DNS turns IP addresses into MAC addresses', false]
  ];
  function sgBridge(group) {
    const S = new THREE.Group();
    const D = new THREE.Group(); // decor that never holds you up
    const Y = BRIDGE.y;
    const stepColors = [PASTEL.pink, '#a8e6cf', '#ffe08a'];
    // ---- Escher-like pastel staircase maze (instanced steps) ----
    // flight: start point, direction, start height, rise per step (negative goes down)
    const flights = [
      { x: -26, z: -36, dx: 1, dz: 0, y: 0, rise: 0.5, color: 0 }, // ground -> L1 (4 m)
      { x: -17.9, z: -33.5, dx: 0, dz: 1, y: 4, rise: 0.5, color: 1 }, // L1 -> L2 (8 m)
      { x: -17.9, z: -22.9, dx: 0, dz: 1, y: 8, rise: 0.5, color: 2 }, // L2 -> bridge deck (12 m)
      { x: -15.4, z: -36, dx: 1, dz: 0, y: 4, rise: 0.5, color: 2 }, // L1 -> dead end (8 m)
      { x: -20.4, z: -25.4, dx: -1, dz: 0, y: 8, rise: -0.5, color: 0 } // L2 -> dead end down (4 m)
    ];
    const RUN = 0.7;
    const STEPS = 8;
    const stepMatrices = [];
    const stepColorsList = [];
    const dummy = new THREE.Object3D();
    flights.forEach((flight) => {
      for (let k = 0; k < STEPS; k++) {
        const along = (k + 0.5) * RUN;
        const top = flight.y + (flight.rise > 0 ? (k + 1) * flight.rise : (k + 1) * flight.rise);
        dummy.position.set(flight.x + flight.dx * along, top - 0.25, flight.z + flight.dz * along);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(flight.dx ? RUN : 2.6, 0.5, flight.dz ? RUN : 2.6);
        dummy.updateMatrix();
        stepMatrices.push(dummy.matrix.clone());
        stepColorsList.push(stepColors[flight.color]);
      }
    });
    // Decorative Escher flights: upside down under the deck, sideways on a wall
    const decorMatrices = [];
    const decorColors = [];
    const decorFlight = (pivot, rotation, color) => {
      const outer = new THREE.Matrix4().compose(pivot, new THREE.Quaternion().setFromEuler(rotation), new THREE.Vector3(1, 1, 1));
      for (let k = 0; k < STEPS; k++) {
        dummy.position.set((k + 0.5) * RUN, (k + 1) * 0.5 - 0.25, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(RUN, 0.5, 2.6);
        dummy.updateMatrix();
        decorMatrices.push(outer.clone().multiply(dummy.matrix));
        decorColors.push(stepColors[color]);
      }
    };
    decorFlight(new THREE.Vector3(-17, Y - 0.8, -12), new THREE.Euler(Math.PI, 0, 0), 1);
    decorFlight(new THREE.Vector3(-23.8, 6, -15.5), new THREE.Euler(0, Math.PI / 2, Math.PI / 2), 2);
    decorFlight(new THREE.Vector3(-8.5, 14.5, -30), new THREE.Euler(0, -Math.PI / 2, Math.PI), 0);
    const stepMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
    const makeSteps = (matrices, colors, decorative) => {
      const instanced = new THREE.InstancedMesh(unitBox, decorative ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }) : stepMaterial, matrices.length);
      const color = new THREE.Color();
      matrices.forEach((matrix, index) => { instanced.setMatrixAt(index, matrix); instanced.setColorAt(index, color.set(colors[index])); });
      instanced.frustumCulled = false;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      if (decorative) noRay(instanced);
      group.add(instanced);
    };
    makeSteps(stepMatrices, stepColorsList, false);
    makeSteps(decorMatrices, decorColors, true);
    // Landings with pastel columns and Escher arches
    const landing = (x, z, w, d, top, color) => {
      blk(S, w, 0.5, d, material(color, { roughness: 0.7 }), x, top - 0.25, z);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => blk(S, 0.7, top - 0.5, 0.7, material(PASTEL.cream), x + sx * (w / 2 - 0.5), (top - 0.5) / 2, z + sz * (d / 2 - 0.5)));
    };
    landing(-17.9, -36, 5, 5, 4, PASTEL.lilac);
    landing(-17.9, -25.4, 5, 5, 8, PASTEL.mint);
    landing(-7.8, -36, 4, 5, 8, PASTEL.yellow); // dead end
    landing(-27.8, -25.4, 3.6, 5, 4, PASTEL.pink); // dead end
    const deadEnd = (x, y, z, text) => {
      const sign = textSprite(text, { width: 5, background: 'rgba(230, 0, 126, 0.9)' });
      sign.position.set(x, y + 2.4, z);
      group.add(sign);
    };
    deadEnd(-7.8, 8, -36, '404: stairway not found');
    deadEnd(-27.8, 4, -25.4, 'Infinite loop: go back');
    const archMaterial = material(PASTEL.lilac, { roughness: 0.7 });
    [[-17.9, 4, -37.8], [-17.9, 8, -27.2]].forEach(([x, y, z]) => {
      blk(S, 0.5, 3.2, 0.5, archMaterial, x - 2, y + 1.6, z);
      blk(S, 0.5, 3.2, 0.5, archMaterial, x + 2, y + 1.6, z);
      blk(S, 4.5, 0.5, 0.5, archMaterial, x, y + 3.45, z);
    });

    // ---- Start deck, end deck, rails ----
    const deck = material(PASTEL.mint, { roughness: 0.7 });
    const rail = material(TEAL, { roughness: 0.5, metalness: 0.2 });
    const deckZ = (BRIDGE.startZ0 + BRIDGE.startZ1) / 2;
    const deckDepth = BRIDGE.startZ1 - BRIDGE.startZ0;
    const deckW = BRIDGE.x1 - BRIDGE.x0;
    const deckX = (BRIDGE.x0 + BRIDGE.x1) / 2;
    blk(S, deckW, 0.6, deckDepth, deck, deckX, Y - 0.3, deckZ);
    blk(S, 12, 0.6, BRIDGE.endZ1 - BRIDGE.endZ0, deck, -10, Y - 0.3, (BRIDGE.endZ0 + BRIDGE.endZ1) / 2);
    [[BRIDGE.x0 + 0.5, BRIDGE.startZ0 + 0.5], [BRIDGE.x1 - 0.5, BRIDGE.startZ0 + 0.5], [BRIDGE.x0 + 0.5, BRIDGE.startZ1 - 0.5], [BRIDGE.x1 - 0.5, BRIDGE.startZ1 - 0.5], [-15.5, BRIDGE.endZ0 + 0.5], [-4.5, BRIDGE.endZ0 + 0.5], [-15.5, BRIDGE.endZ1 - 0.5], [-4.5, BRIDGE.endZ1 - 0.5]].forEach(([x, z]) => blk(S, 1, Y - 0.6, 1, material(PASTEL.yellow), x, (Y - 0.6) / 2, z));
    // Deck railings (gaps: stairs arrive at the north-west, the bridge leaves south)
    const railH = 1.1;
    blk(S, 12.4, railH, 0.2, rail, -10.2, Y + railH / 2, BRIDGE.startZ0 + 0.1);
    blk(S, 0.2, railH, deckDepth, rail, BRIDGE.x1 - 0.1, Y + railH / 2, deckZ);
    blk(S, 0.2, railH, deckDepth, rail, BRIDGE.x0 + 0.1, Y + railH / 2, deckZ);
    [[BRIDGE.x0, -12.5], [-7.5, BRIDGE.x1]].forEach(([a, b]) => blk(S, b - a, railH, 0.2, rail, (a + b) / 2, Y + railH / 2, BRIDGE.startZ1 - 0.1));
    blk(S, 12, railH, 0.2, rail, -10, Y + railH / 2, BRIDGE.endZ1 - 0.1);
    [-16, -4].forEach((x) => blk(S, 0.2, railH, BRIDGE.endZ1 - BRIDGE.endZ0, rail, x + (x < 0 && x === -16 ? 0.1 : -0.1), Y + railH / 2, (BRIDGE.endZ0 + BRIDGE.endZ1) / 2));
    [[-16, -12.5], [-7.5, -4]].forEach(([a, b]) => blk(S, b - a, railH, 0.2, rail, (a + b) / 2, Y + railH / 2, BRIDGE.endZ0 + 0.1));
    // Bridge frame: side rails (you cannot slip off the sides) and steel beams
    const bridgeLength = BRIDGE.endZ0 - BRIDGE.startZ1;
    const bridgeMid = (BRIDGE.endZ0 + BRIDGE.startZ1) / 2;
    [-12.45, -7.55].forEach((x) => {
      blk(S, 0.16, railH, bridgeLength, rail, x, Y + railH / 2, bridgeMid);
      blk(S, 0.4, 0.5, bridgeLength, material('#3a3f4a', { metalness: 0.6, roughness: 0.4 }), x, Y - 0.35, bridgeMid);
    });
    for (let i = 0; i <= BRIDGE.pairs; i++) {
      const z = BRIDGE.z0 - 1.4 + i * BRIDGE.step;
      const crossbeam = blk(D, 4.9, 0.18, 0.18, material('#3a3f4a', { metalness: 0.6, roughness: 0.4 }), -10, Y - 0.5, z);
      crossbeam.raycast = () => {};
    }
    // Lane markers on the start deck: LEFT (east lane) and RIGHT (west lane), seen walking south
    group.add(floorDecal(2, 1, new THREE.MeshBasicMaterial({ map: labelTexture('LEFT', { bg: PINK, fg: '#ffffff', width: 256, height: 128 }), toneMapped: false }), BRIDGE.lanes[0], Y + 0.02, BRIDGE.startZ1 - 1.2));
    group.add(floorDecal(2, 1, new THREE.MeshBasicMaterial({ map: labelTexture('RIGHT', { bg: TEAL, fg: '#ffffff', width: 256, height: 128 }), toneMapped: false }), BRIDGE.lanes[1], Y + 0.02, BRIDGE.startZ1 - 1.2));
    group.children[group.children.length - 1].rotation.z = Math.PI;
    group.children[group.children.length - 2].rotation.z = Math.PI;
    // Pit under the bridge (fenced at ground level)
    const pitFloor = floorDecal(12, bridgeLength, new THREE.MeshBasicMaterial({ map: lazyTexture(256, 512, (ctx, w, h) => {
      ctx.fillStyle = '#2a0f22';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255, 46, 136, 0.45)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(w, i * 64); ctx.stroke(); }
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, h); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255, 46, 136, 0.7)';
      ctx.font = 'bold 40px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('REJECTED', w / 2, h / 2);
    }), toneMapped: false }), -10, 0.03, bridgeMid);
    group.add(pitFloor);
    const fence = material(PINK, { roughness: 0.5 });
    blk(S, 0.3, 1.2, bridgeLength, fence, -16.2, 0.6, bridgeMid);
    blk(S, 0.3, 1.2, bridgeLength, fence, -3.8, 0.6, bridgeMid);
    blk(S, 12.7, 1.2, 0.3, fence, -10, 0.6, BRIDGE.startZ1 - 0.15);
    blk(S, 12.7, 1.2, 0.3, fence, -10, 0.6, BRIDGE.endZ0 + 0.15);

    // ---- Glass panes (one mesh each so a broken one can disappear) ----
    const glassMaterial = new THREE.MeshStandardMaterial({ color: '#cdeeff', transparent: true, opacity: 0.4, roughness: 0.05, metalness: 0.1, depthWrite: false });
    const edgeMaterial = material('#e8f6ff', { roughness: 0.2, metalness: 0.5 });
    const panes = [];
    for (let i = 0; i < BRIDGE.pairs; i++) {
      panes.push(BRIDGE.lanes.map((x) => {
        const z = BRIDGE.z0 + i * BRIDGE.step;
        const pane = new THREE.Mesh(new THREE.BoxGeometry(BRIDGE.paneW, 0.12, BRIDGE.paneD), glassMaterial);
        pane.position.set(x, Y - 0.06, z);
        pane.renderOrder = 2;
        group.add(pane);
        // Thin edge strips (decor, do not hold you up)
        [-1, 1].forEach((side) => { const edge = blk(D, BRIDGE.paneW, 0.05, 0.08, edgeMaterial, x, Y - 0.1, z + side * (BRIDGE.paneD / 2 - 0.04)); edge.raycast = () => {}; });
        return pane;
      }));
    }
    // Number tags along the rail
    for (let i = 0; i < BRIDGE.pairs; i++) {
      const tag = textSprite(`#${i + 1}`, { width: 1.6, background: 'rgba(230, 0, 126, 0.9)' });
      tag.position.set(-13.1, Y + 1.7, BRIDGE.z0 + i * BRIDGE.step);
      group.add(tag);
    }
    // Shards: one instanced burst reused for every break
    const shardGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.35, 0, 0.05, 0.1, 0, 0.3], 3));
    shardGeometry.computeVertexNormals();
    const shards = new THREE.InstancedMesh(shardGeometry, new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }), 40);
    shards.count = 0;
    shards.frustumCulled = false;
    noRay(shards);
    group.add(shards);
    const shardState = { start: -10, x: 0, z: 0, seeds: Array.from({ length: 40 }, () => [Math.random() - 0.5, Math.random() - 0.5, Math.random(), Math.random() * 6]) };

    // ---- Code review board on the end deck (facing the players) ----
    const reviewBoard = liveBoard(1024, 700, (ctx, w, h) => {
      ctx.fillStyle = '#fff7fb';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = PINK;
      ctx.fillRect(0, 0, w, 96);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 50px Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('CODE REVIEW: TRUE = LEFT  |  FALSE = RIGHT', w / 2, 66);
      ctx.textAlign = 'left';
      ctx.font = '34px Segoe UI, Arial, sans-serif';
      BR.statements.forEach((statement, index) => {
        ctx.fillStyle = index % 2 ? '#14a39a' : '#5b2a4a';
        ctx.fillText(`#${index + 1}  ${statement}`, 36, 150 + index * 60, w - 60);
      });
      ctx.fillStyle = '#888';
      ctx.font = 'italic 26px Segoe UI, Arial, sans-serif';
      ctx.fillText(BR.run ? 'Crossing in progress. One wrong pane = BUILD FAILED.' : 'E at the console on the start deck to shuffle the glass and start.', 36, h - 22);
    });
    const boardGroup = new THREE.Group();
    boardGroup.position.set(-10, Y, BRIDGE.endZ1 - 0.6);
    blk(boardGroup, 10.4, 7.2, 0.3, material('#1d1d24'), 0, 4.8, 0.1);
    boardGroup.add(plane(10, 6.8, boardMaterial(reviewBoard), 0, 4.8, -0.08, Math.PI));
    group.add(boardGroup);

    // ---- Console (start a crossing) and lifts ----
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(-6, Y, -12);
    blk(consoleGroup, 1.4, 1.1, 1, material(PASTEL.lilac), 0, 0.55, 0);
    consoleGroup.add(cylinder(0.4, 0.4, 0.15, glow(HOT, 1.5), 0, 1.15, 0, 20));
    action(consoleGroup, 'Glass Bridge console', 'Press E to start a crossing (shuffles the glass)', () => newCrossing(true));
    group.add(consoleGroup);
    const consoleSign = textSprite('E: start a crossing', { width: 5, background: 'rgba(230, 0, 126, 0.9)' });
    consoleSign.position.set(-6, Y + 2.6, -12);
    group.add(consoleSign);
    const lift = (x, y, z, label, prompt, to, message) => {
      const pad = new THREE.Group();
      pad.position.set(x, y, z);
      pad.add(cylinder(1.1, 1.1, 0.12, glow(TEAL, 1.2), 0, 0.06, 0, 24));
      blk(pad, 0.4, 1.3, 0.4, material(PASTEL.pink), 1.3, 0.65, 0);
      action(pad, label, prompt, () => { teleport(group, to[0], to[1], to[2]); return message; });
      group.add(pad);
      const sign = textSprite(label, { width: 4, background: 'rgba(20, 163, 154, 0.9)' });
      sign.position.set(x, y + 2.4, z);
      group.add(sign);
    };
    lift(-12, 0, -10, 'Lift up to the bridge', 'Press E to ride the lift up to the bridge deck', [-12, Y + 0.1, -9], 'Lift: bridge deck. E at the console starts a crossing.');
    lift(-14, Y, 25.5, 'Lift down', 'Press E to ride the lift down', [-10, 0.1, 25], 'Lift: ground level.');
    // Bridge drones fly along both sides
    [[-14.5, 1], [-5.5, 2]].forEach(([x, kind], index) => addDrone(kind, (t) => {
      const z = 9 + Math.sin(t * 0.35 + index * 3) * 11;
      return { x, y: Y + 2.4 + Math.sin(t * 1.8 + index) * 0.3, z, yaw: yawTo(x, z, -10, z) };
    }));
    bake(group, S);
    noRay(bake(group, D));

    // ---- Game state ----
    const BR = { safe: [], statements: [], run: false, broken: [], restoreAt: 0, panes };
    function newCrossing(start) {
      BR.safe = Array.from({ length: BRIDGE.pairs }, () => (Math.random() < 0.5 ? 0 : 1));
      const trues = TRIVIA.filter(([, truth]) => truth).sort(() => Math.random() - 0.5);
      const falses = TRIVIA.filter(([, truth]) => !truth).sort(() => Math.random() - 0.5);
      BR.statements = BR.safe.map((lane) => (lane === 0 ? trues.pop() : falses.pop())[0]);
      panes.forEach((pair) => pair.forEach((pane) => { pane.visible = true; }));
      BR.broken = [];
      BR.run = !!start;
      reviewBoard.dirty = true;
      return start ? 'Glass Bridge of Code Review: the glass is shuffled. Read the review board at the far end: TRUE = step on the LEFT pane, FALSE = the RIGHT pane.' : null;
    }
    function breakPane(i, lane) {
      const pane = panes[i][lane];
      pane.visible = false;
      BR.broken.push(pane);
      BR.restoreAt = clock() + 30;
      shardState.start = clock();
      shardState.x = pane.position.x;
      shardState.z = pane.position.z;
      play('click');
    }
    BR.newCrossing = newCrossing;
    window.SquidGameEE = window.SquidGameEE || {};
    window.SquidGameEE.bridge = BR;
    newCrossing(false);

    animate(group, () => {
      const t = clock();
      BR.now = t;
      reviewBoard.refresh();
      // Shards fall for 1.5 s after a break
      const age = t - shardState.start;
      if (age < 1.5) {
        shards.count = 40;
        shardState.seeds.forEach(([sx, sz, speed, spin], index) => {
          dummy.position.set(shardState.x + sx * (1.6 + age * 2), Y - 0.1 - age * age * 9 * (0.6 + speed * 0.6), shardState.z + sz * (1.6 + age * 2));
          dummy.rotation.set(spin + age * 6, spin * 2 + age * 4, age * 3);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          shards.setMatrixAt(index, dummy.matrix);
        });
        shards.instanceMatrix.needsUpdate = true;
      } else if (shards.count) shards.count = 0;
      if (!BR.run && BR.broken.length && t > BR.restoreAt) { BR.broken.forEach((pane) => { pane.visible = true; }); BR.broken = []; }
      const local = avatarLocal(group);
      if (!local) return;
      const overBridge = local.x > -12.6 && local.x < -7.4 && local.z > BRIDGE.startZ1 && local.z < BRIDGE.endZ0;
      // Standing on a fragile pane breaks it
      if (overBridge && local.y > Y - 0.5 && local.y < Y + 1.2) {
        for (let i = 0; i < BRIDGE.pairs; i++) {
          const z = BRIDGE.z0 + i * BRIDGE.step;
          if (Math.abs(local.z - z) > BRIDGE.paneD / 2) continue;
          BRIDGE.lanes.forEach((x, lane) => {
            if (lane !== BR.safe[i] && panes[i][lane].visible && Math.abs(local.x - x) < BRIDGE.paneW / 2) breakPane(i, lane);
          });
        }
      }
      // Falling into the pit: build failed, back on the start deck
      if (local.x > -16.5 && local.x < -3.5 && local.z > BRIDGE.startZ1 - 0.5 && local.z < BRIDGE.endZ0 + 0.5 && local.y < Y - 4 && local.y > -5) {
        const wasRun = BR.run;
        BR.run = false;
        reviewBoard.dirty = true;
        buildFailed(GAMES.bridge, 'that pane did not pass code review', group, [-10, Y + 0.1, -7]);
        if (wasRun) system('E at the console starts a new crossing.');
        return;
      }
      if (BR.run && local.z > BRIDGE.endZ0 + 0.3 && local.y > Y - 0.6 && local.y < Y + 3 && local.x > -16 && local.x < -4) {
        BR.run = false;
        reviewBoard.dirty = true;
        if (isFlying()) system('Glass Bridge: flying over the panes does not count. Start a new crossing and walk it.');
        else award(GAMES.bridge);
      }
    });
  }

  // ==========================================================================
  // 6) DORMITORY: stacked bunks, the MVC piggy bank, the wins board
  // ==========================================================================
  const DORM = { x0: 16, x1: 68, z0: -38, z1: 4, h: 16 };
  function sgDorm(group) {
    const S = new THREE.Group();
    const { x0, x1, z0, z1, h } = DORM;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const outside = material(PASTEL.mint, { roughness: 0.85 });
    const inside = material('#d6ece3', { roughness: 0.9 });
    // Walls (door on the west side), roof, floor
    blk(S, x1 - x0, h, 0.6, outside, cx, h / 2, z0);
    blk(S, x1 - x0, h, 0.6, outside, cx, h / 2, z1);
    blk(S, 0.6, h, z1 - z0, outside, x1, h / 2, cz);
    const doorZ0 = -20;
    const doorZ1 = -13;
    blk(S, 0.6, h, doorZ0 - z0, outside, x0, h / 2, (z0 + doorZ0) / 2);
    blk(S, 0.6, h, z1 - doorZ1, outside, x0, h / 2, (doorZ1 + z1) / 2);
    blk(S, 0.6, h - 6, doorZ1 - doorZ0, outside, x0, 6 + (h - 6) / 2, (doorZ0 + doorZ1) / 2);
    blk(S, x1 - x0 + 0.6, 0.6, z1 - z0 + 0.6, material('#9fc9bb'), cx, h + 0.3, cz);
    blk(S, x1 - x0 - 0.6, 0.06, z1 - z0 - 0.6, material('#c9d6d0', { roughness: 0.5 }), cx, 0.03, cz);
    // Inner lining (lighter) so the interior reads as a hall
    blk(S, x1 - x0 - 0.8, h - 0.4, 0.05, inside, cx, h / 2, z0 + 0.33);
    blk(S, x1 - x0 - 0.8, h - 0.4, 0.05, inside, cx, h / 2, z1 - 0.33);
    blk(S, 0.05, h - 0.4, z1 - z0 - 0.8, inside, x1 - 0.33, h / 2, cz);
    // Ceiling light strips
    for (let i = 0; i < 4; i++) {
      const strip = blk(S, x1 - x0 - 8, 0.15, 0.5, glow('#fff6e8', 1.4), cx, h - 0.2, z0 + 6 + i * 10);
      strip.castShadow = false;
    }
    // Door frame and sign
    blk(S, 0.9, 6.4, 0.6, material(PINK), x0 - 0.1, 3.2, doorZ0 - 0.3);
    blk(S, 0.9, 6.4, 0.6, material(PINK), x0 - 0.1, 3.2, doorZ1 + 0.3);
    blk(S, 0.9, 0.6, doorZ1 - doorZ0 + 1.2, material(PINK), x0 - 0.1, 6.3, (doorZ0 + doorZ1) / 2);
    group.add(signPlane(10, 2.2, { bg: '#ffffff', fg: PINK, title: 'DORMITORY', sub: 'bunks, piggy bank, wins board', border: TEAL }, x0 - 0.36, 9, (doorZ0 + doorZ1) / 2, -Math.PI / 2));
    for (let z = z0 + 5; z < z1; z += 9) {
      [x0 - 0.35, x1 + 0.35].forEach((x, side) => { if (Math.abs(z - (doorZ0 + doorZ1) / 2) > 6 || side) stencil(Math.round(z) % 3 < 0 ? 0 : (Math.abs(Math.round(z)) % 3), x, 11, z, side ? Math.PI / 2 : -Math.PI / 2, 1.4, side ? TEAL : PINK); });
    }
    for (let x = x0 + 6; x < x1; x += 9) stencil(Math.abs(Math.round(x)) % 3, x, 11, z0 - 0.35, Math.PI, 1.4, PINK);
    // Inside: shapes high on the walls
    for (let x = x0 + 5; x < x1 - 2; x += 8) stencil(Math.abs(Math.round(x / 8)) % 3, x, 12.5, z0 + 0.4, 0, 1, PINK);

    // ---- Stacked bunks (instanced: frames, bases, mattresses, blankets) ----
    const tiers = [0.55, 2.15, 3.75, 5.35, 6.95];
    const columns = [];
    for (let x = x0 + 2.5; x <= x1 - 2.5; x += 1.55) columns.push(x);
    const rows = [{ z: z0 + 1.6, dir: 1 }, { z: z1 - 1.6, dir: -1 }];
    const posts = [];
    const bases = [];
    const mattresses = [];
    const blankets = [];
    const blanketColors = [];
    const dummy = new THREE.Object3D();
    const push = (list, x, y, z, sx, sy, sz) => { dummy.position.set(x, y, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); list.push(dummy.matrix.clone()); };
    rows.forEach(({ z }) => {
      columns.forEach((x, column) => {
        [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => push(posts, x + sx * 0.62, 4, z + sz * 1.1, 0.09, 8, 0.09)));
        tiers.forEach((y, tier) => {
          push(bases, x, y, z, 1.3, 0.08, 2.3);
          push(mattresses, x, y + 0.14, z, 1.2, 0.2, 2.15);
          push(blankets, x, y + 0.26, z + 0.25, 1.24, 0.06, 1.5);
          blanketColors.push((column + tier) % 5 === 0 ? PASTEL.pink : (column + tier) % 2 ? TEAL : '#4fb3a9');
        });
      });
    });
    const instanced = (list, instancedMaterial, colors) => {
      const result = new THREE.InstancedMesh(unitBox, instancedMaterial, list.length);
      list.forEach((matrix, index) => result.setMatrixAt(index, matrix));
      if (colors) { const color = new THREE.Color(); colors.forEach((value, index) => result.setColorAt(index, color.set(value))); }
      result.frustumCulled = false;
      result.receiveShadow = true;
      group.add(result);
      return result;
    };
    instanced(posts, new THREE.MeshStandardMaterial({ color: '#2f6f6a', roughness: 0.4, metalness: 0.5 }));
    instanced(bases, new THREE.MeshStandardMaterial({ color: '#8fa3a0', roughness: 0.5, metalness: 0.4 }));
    instanced(mattresses, new THREE.MeshStandardMaterial({ color: '#f4f4ef', roughness: 0.95 }));
    instanced(blankets, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95 }), blanketColors);
    // Bottom bunks you can sleep on (bed interaction) or sit on
    rows.forEach(({ z, dir }) => {
      columns.forEach((x, column) => {
        if (column % 3) return;
        const spot = new THREE.Object3D();
        spot.position.set(x, tiers[0] + 0.25, z + dir * 0.2);
        group.add(column % 2 ? interactive(spot, 'sit', 'Dorm bunk') : interactive(spot, 'bed', 'Dorm bunk'));
      });
    });

    // ---- Giant transparent piggy bank hanging from the ceiling ----
    const pig = new THREE.Group();
    pig.position.set(cx, 9.6, cz);
    const glass = new THREE.MeshStandardMaterial({ color: '#ff8fbf', emissive: '#ff5fa2', emissiveIntensity: 0.25, transparent: true, opacity: 0.42, roughness: 0.05, metalness: 0.1, depthWrite: false, side: THREE.DoubleSide });
    const body = mesh(new THREE.SphereGeometry(3.2, 32, 20), glass);
    body.scale.set(1.35, 1, 1);
    body.renderOrder = 3;
    pig.add(body);
    const snout = mesh(new THREE.CylinderGeometry(1.1, 1.2, 1, 24), glass, -4.6, -0.1, 0);
    snout.rotation.z = Math.PI / 2;
    pig.add(snout);
    [-0.4, 0.4].forEach((z) => pig.add(sphere(0.18, material('#b0476f'), -5.12, -0.1, z, 10)));
    [-1, 1].forEach((side) => {
      const ear = mesh(new THREE.ConeGeometry(0.9, 1.4, 4), glass, -2.4, 2.9, side * 1.4);
      ear.rotation.x = side * 0.3;
      pig.add(ear);
      [-1, 1].forEach((front) => pig.add(mesh(new THREE.CylinderGeometry(0.6, 0.55, 1.6, 16), glass, front * 2.4, -3.2, side * 1.5)));
    });
    const tail = mesh(new THREE.TorusGeometry(0.4, 0.12, 8, 16, Math.PI * 1.5), glass, 4.5, 0.6, 0);
    tail.rotation.y = Math.PI / 2;
    pig.add(tail);
    pig.add(box(1.6, 0.1, 0.3, material('#5b2a4a'), 0.2, 3.2, 0));
    [[-2.5, -1.2], [-2.5, 1.2], [2.5, -1.2], [2.5, 1.2]].forEach(([x, z]) => pig.add(cylinder(0.04, 0.04, h - 9.6 - 2.2, material('#c7ccd1', { metalness: 0.8 }), x, 2.2 + (h - 9.6 - 2.2) / 2, z, 6)));
    noRay(pig);
    group.add(pig);
    // MVC coins inside: instanced, filled bottom-up as the bank grows
    const coinCapacity = 420;
    const coinGeometry = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 16);
    const coins = new THREE.InstancedMesh(coinGeometry, new THREE.MeshStandardMaterial({ color: '#f2b705', emissive: '#7a4b00', emissiveIntensity: 0.35, metalness: 0.8, roughness: 0.3 }), coinCapacity);
    const random = seeded(2468);
    const coinSpots = [];
    while (coinSpots.length < coinCapacity) {
      const px = (random() - 0.5) * 7.6;
      const py = -3 + random() * 5.4;
      const pz = (random() - 0.5) * 5.6;
      if ((px / 3.95) ** 2 + (py / 2.95) ** 2 + (pz / 2.95) ** 2 < 1) coinSpots.push([px, py, pz, random() * 6, random() * 6]);
    }
    coinSpots.sort((a, b) => a[1] - b[1]);
    coinSpots.forEach(([px, py, pz, rx, rz], index) => {
      dummy.position.set(cx + px, 9.6 + py, cz + pz);
      dummy.rotation.set(rx, 0, rz);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      coins.setMatrixAt(index, dummy.matrix);
    });
    coins.frustumCulled = false;
    noRay(coins);
    group.add(coins);
    // Live counter under the bank and the session wins board on the east wall
    const counter = liveBoard(1024, 420, (ctx, w, ch) => {
      ctx.fillStyle = '#16161c';
      ctx.fillRect(0, 0, w, ch);
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, w - 14, ch - 14);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 54px Segoe UI, Arial, sans-serif';
      ctx.fillText('MVC IN THE PIGGY BANK', w / 2, 90);
      ctx.fillStyle = '#ffd43b';
      ctx.font = 'bold 170px Consolas, monospace';
      ctx.fillText(String(bankMVC()).padStart(6, '0'), w / 2, 270);
      ctx.fillStyle = '#c9d6f2';
      ctx.font = '34px Segoe UI, Arial, sans-serif';
      ctx.fillText(`Every win adds ${REWARD_MVC} MVC  |  in-game coins only`, w / 2, 360);
    });
    const counterGroup = new THREE.Group();
    counterGroup.position.set(cx, 0, cz);
    blk(counterGroup, 1.2, 2, 1.2, material(PINK, { roughness: 0.5 }), 0, 1, 0);
    blk(counterGroup, 7.4, 3.2, 0.3, material('#1d1d24'), 0, 3.6, 0);
    counterGroup.add(plane(7, 2.9, boardMaterial(counter), 0, 3.6, -0.16, Math.PI));
    counterGroup.add(plane(7, 2.9, boardMaterial(counter), 0, 3.6, 0.16, 0));
    group.add(counterGroup);
    const leaders = liveBoard(1024, 720, (ctx, w, bh) => {
      ctx.fillStyle = '#fff7fb';
      ctx.fillRect(0, 0, w, bh);
      ctx.fillStyle = TEAL;
      ctx.fillRect(0, 0, w, 110);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = 'bold 60px Segoe UI, Arial, sans-serif';
      ctx.fillText('WINS THIS SESSION', w / 2, 78);
      const list = [...SG.sessionWins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
      ctx.textAlign = 'left';
      ctx.font = 'bold 44px Segoe UI, Arial, sans-serif';
      if (!list.length) { ctx.fillStyle = '#888'; ctx.fillText('No passed builds yet. Be the first!', 60, 200); }
      list.forEach(([tag, wins], index) => {
        ctx.fillStyle = index === 0 ? PINK : '#3a2a3a';
        ctx.fillText(`${index + 1}. ${tag}`, 60, 180 + index * 62, 700);
        ctx.textAlign = 'right';
        ctx.fillText(String(wins), w - 60, 180 + index * 62);
        ctx.textAlign = 'left';
      });
      const mine = Object.entries(SG.myGames).map(([game, wins]) => `${game} x${wins}`).join('  |  ');
      ctx.fillStyle = '#14a39a';
      ctx.font = '26px Segoe UI, Arial, sans-serif';
      ctx.fillText(mine ? `You: ${mine}` : 'You: no wins yet this session', 40, bh - 30, w - 80);
    });
    const leadersGroup = new THREE.Group();
    leadersGroup.position.set(x1 - 0.7, 0, cz);
    blk(leadersGroup, 0.3, 7.4, 10.4, material('#1d1d24'), 0, 6.2, 0);
    leadersGroup.add(plane(10, 7, boardMaterial(leaders), -0.16, 6.2, 0, -Math.PI / 2));
    group.add(leadersGroup);
    // Dorm drones circle the piggy bank
    [0, 1, 2].forEach((kind) => addDrone(kind, (t) => {
      const angle = t * 0.3 + (kind * Math.PI * 2) / 3;
      const x = cx + Math.cos(angle) * 9;
      const z = cz + Math.sin(angle) * 9;
      return { x, y: 6.5 + Math.sin(t + kind) * 0.4, z, yaw: yawTo(x, z, cx, cz) };
    }));
    bake(group, S);

    window.SquidGameEE = window.SquidGameEE || {};
    window.SquidGameEE.dorm = { coins, counter, leaders };
    let shownBank = -1;
    animate(group, (t) => {
      if (SG.dirty.piggy) { SG.dirty.piggy = false; counter.dirty = true; }
      if (SG.dirty.leaders) { SG.dirty.leaders = false; leaders.dirty = true; }
      const bank = bankMVC();
      if (bank !== shownBank) {
        shownBank = bank;
        coins.count = Math.min(coinCapacity, 30 + bank * 2);
        coins.instanceMatrix.needsUpdate = true;
      }
      pig.rotation.y = Math.sin(t * 0.25) * 0.08;
      counter.refresh();
      leaders.refresh();
    });
  }

  // ==========================================================================
  // Mini-game overlay (one shared window, created the first time it opens)
  // ==========================================================================
  const Overlay = (() => {
    let root = null;
    let ui = null;
    let game = null;
    let frame = 0;
    const CSS = `
      .sgee-overlay { position: fixed; inset: 0; z-index: 70; display: none; align-items: center; justify-content: center; background: rgba(12, 8, 20, 0.55); font-family: Segoe UI, Arial, sans-serif; }
      .sgee-window { width: min(680px, calc(100vw - 32px)); background: #fff7fb; border: 4px solid ${PINK}; border-radius: 16px; box-shadow: 0 18px 60px rgba(0,0,0,0.45); overflow: hidden; }
      .sgee-bar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: ${PINK}; color: #fff; }
      .sgee-bar b { flex: 1; font-size: 18px; letter-spacing: 0.5px; }
      .sgee-shapes { display: flex; gap: 6px; }
      .sgee-shapes i { width: 14px; height: 14px; border: 3px solid #fff; display: inline-block; }
      .sgee-shapes i:nth-child(1) { border-radius: 50%; }
      .sgee-shapes i:nth-child(2) { width: 0; height: 0; border: 0; border-left: 9px solid transparent; border-right: 9px solid transparent; border-bottom: 16px solid #fff; }
      .sgee-close { background: transparent; border: 0; color: #fff; font-size: 26px; cursor: pointer; line-height: 1; }
      .sgee-body { padding: 12px 14px 14px; color: #3a2a3a; }
      .sgee-text { margin: 0 0 8px; font-size: 14px; min-height: 18px; }
      .sgee-canvas { width: 100%; display: block; border-radius: 10px; background: #f3e6d8; touch-action: none; }
      .sgee-buttons { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .sgee-buttons button { flex: 1; min-width: 90px; padding: 9px 10px; border-radius: 10px; border: 2px solid ${TEAL}; background: #fff; color: ${TEAL}; font-weight: 700; cursor: pointer; }
      .sgee-buttons button.on, .sgee-buttons button:hover { background: ${TEAL}; color: #fff; }
      .sgee-buttons button:disabled { opacity: 0.4; cursor: default; }
    `;
    function ensure() {
      if (root) return;
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      root = document.createElement('div');
      root.className = 'sgee-overlay';
      root.innerHTML = '<div class="sgee-window" role="dialog" aria-modal="true"><div class="sgee-bar"><span class="sgee-shapes"><i></i><i></i><i></i></span><b class="sgee-title"></b><button class="sgee-close" type="button" title="Close (Esc)">&times;</button></div>' +
        '<div class="sgee-body"><p class="sgee-text"></p><canvas class="sgee-canvas" width="640" height="380"></canvas><div class="sgee-buttons"></div></div></div>';
      document.body.appendChild(root);
      ui = { title: root.querySelector('.sgee-title'), text: root.querySelector('.sgee-text'), canvas: root.querySelector('.sgee-canvas'), buttons: root.querySelector('.sgee-buttons') };
      root.querySelector('.sgee-close').addEventListener('click', () => close());
      // Clicks and drags inside the window never reach the 3D view
      ['pointerdown', 'mousedown', 'click', 'wheel', 'pointerup', 'pointermove'].forEach((name) => root.addEventListener(name, (event) => event.stopPropagation()));
      const point = (event) => {
        const rect = ui.canvas.getBoundingClientRect();
        return { x: ((event.clientX - rect.left) / rect.width) * ui.canvas.width, y: ((event.clientY - rect.top) / rect.height) * ui.canvas.height };
      };
      ['pointerdown', 'pointermove', 'pointerup', 'pointerleave'].forEach((name) => ui.canvas.addEventListener(name, (event) => {
        if (game && game.onPointer) { game.onPointer(name, point(event), event); event.preventDefault(); }
      }));
      // While a mini game is open it owns the keyboard (no walking, no chat)
      window.addEventListener('keydown', (event) => {
        if (!isOpen()) return;
        if (event.key === 'Escape') close();
        else if (game && game.onKey) game.onKey(event);
        event.preventDefault();
        event.stopImmediatePropagation();
      }, true);
      window.addEventListener('keyup', (event) => { if (isOpen()) event.stopImmediatePropagation(); }, true);
    }
    function isOpen() { return !!root && root.style.display === 'flex'; }
    function setText(text) { if (ui) ui.text.textContent = text; }
    function setButtons(list) {
      ui.buttons.textContent = '';
      list.forEach(({ label, onClick, on, disabled }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        if (on) button.classList.add('on');
        button.disabled = !!disabled;
        button.addEventListener('click', () => onClick(button));
        ui.buttons.appendChild(button);
      });
    }
    function loop() {
      if (!isOpen() || !game) return;
      if (game.onFrame) game.onFrame(performance.now() / 1000, ui.canvas.getContext('2d'));
      frame = requestAnimationFrame(loop);
    }
    function open(title, nextGame) {
      ensure();
      if (game && game.onClose) game.onClose();
      game = nextGame;
      ui.title.textContent = title;
      root.style.display = 'flex';
      window.dispatchEvent(new Event('blur')); // release held movement keys
      if (game.init) game.init(ui.canvas.getContext('2d'));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    }
    function close() {
      if (!root) return;
      root.style.display = 'none';
      cancelAnimationFrame(frame);
      const closing = game;
      game = null;
      if (closing && closing.onClose) closing.onClose();
    }
    return { open, close, isOpen, setText, setButtons, get canvas() { return ui && ui.canvas; }, get game() { return game; } };
  })();
  window.SquidGameEE = window.SquidGameEE || {};
  window.SquidGameEE.overlay = Overlay;

  // ==========================================================================
  // 2) REGEX HONEYCOMB (Dalgona): trace the shape without leaving the groove
  // ==========================================================================
  const HONEY_SHAPES = {
    circle: () => [ringPath(320, 200, 110, 160)],
    triangle: () => [polyPath([[320, 70], [450, 300], [190, 300]], 4)],
    star: () => [polyPath(Array.from({ length: 10 }, (_, i) => { const angle = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? 54 : 130; return [320 + Math.cos(angle) * r, 205 + Math.sin(angle) * r]; }), 4)],
    braces: () => [bracePath(255, 1), bracePath(385, -1)]
  };
  function ringPath(cx, cy, r, count) { const points = []; for (let i = 0; i <= count; i++) { const angle = (i / count) * Math.PI * 2; points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]); } return points; }
  function polyPath(corners, spacing) {
    const points = [];
    corners.forEach((corner, index) => {
      const next = corners[(index + 1) % corners.length];
      const steps = Math.max(1, Math.round(Math.hypot(next[0] - corner[0], next[1] - corner[1]) / spacing));
      for (let s = 0; s < steps; s++) points.push([corner[0] + ((next[0] - corner[0]) * s) / steps, corner[1] + ((next[1] - corner[1]) * s) / steps]);
    });
    points.push(corners[0].slice());
    return points;
  }
  // "{" (dir 1) or "}" (dir -1): ends curl outward, the middle tip points in
  function bracePath(x0, dir) {
    const points = [];
    for (let i = 0; i <= 120; i++) {
      const u = (i / 120) * 2 - 1;
      const a = Math.abs(u);
      const ends = a > 0.78 ? ((a - 0.78) / 0.22) ** 2 * 26 : 0;
      const tip = a < 0.14 ? (1 - a / 0.14) * 30 : 0;
      points.push([x0 + dir * (ends - tip) + dir * 6, 200 + u * 120]);
    }
    return points;
  }
  function openHoneycomb(anchor) {
    const H = { state: 'pick', shape: null, strokes: [], samples: [], carved: 0, down: false, start: 0, limit: 45, crack: null, last: null };
    const TOL_CARVE = 13;
    const TOL_CRACK = 24;
    function pick(name) {
      H.shape = name;
      H.strokes = HONEY_SHAPES[name]();
      H.samples = [];
      H.strokes.forEach((stroke) => stroke.forEach(([x, y]) => H.samples.push({ x, y, done: false })));
      H.carved = 0;
      H.state = 'play';
      H.start = performance.now() / 1000;
      H.crack = null;
      Overlay.setText(`Hold the mouse button and trace the ${name === 'braces' ? 'curly braces' : name}. Stay inside the groove. ${H.limit} s.`);
      Overlay.setButtons([{ label: 'Give up', onClick: () => lose('you gave up on the pattern') }]);
    }
    function nearest(point) {
      let best = Infinity;
      H.samples.forEach((sample) => { const d = Math.hypot(sample.x - point.x, sample.y - point.y); if (d < best) best = d; });
      return best;
    }
    function lose(reason) {
      if (H.state !== 'play') return;
      H.state = 'lost';
      Overlay.setText('CRACKED. Build failed.');
      setTimeout(() => { Overlay.close(); buildFailed(GAMES.honey, reason, anchor, [-10, 0.1, 31]); }, 900);
    }
    function win() {
      H.state = 'won';
      Overlay.setText('Pattern carved clean. Build passed!');
      setTimeout(() => { Overlay.close(); award(GAMES.honey); }, 900);
    }
    function carve(point) {
      if (H.state !== 'play') return;
      if (nearest(point) > TOL_CRACK) { H.crack = point; lose('the honeycomb cracked: you left the line'); return; }
      H.samples.forEach((sample) => { if (!sample.done && Math.hypot(sample.x - point.x, sample.y - point.y) < TOL_CARVE) { sample.done = true; H.carved++; } });
      if (H.carved / H.samples.length >= 0.97) win();
    }
    function draw(ctx, t) {
      const w = 640;
      const h = 380;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#f3e6d8';
      ctx.fillRect(0, 0, w, h);
      // Tin and honeycomb candy
      ctx.fillStyle = '#9aa3ab';
      ctx.beginPath(); ctx.arc(320, 200, 176, 0, Math.PI * 2); ctx.fill();
      const candy = ctx.createRadialGradient(300, 170, 20, 320, 200, 165);
      candy.addColorStop(0, '#f2c46a');
      candy.addColorStop(1, '#c98a2c');
      ctx.fillStyle = candy;
      ctx.beginPath(); ctx.arc(320, 200, 165, 0, Math.PI * 2); ctx.fill();
      const random = seeded(99);
      ctx.fillStyle = 'rgba(120, 70, 10, 0.18)';
      for (let i = 0; i < 90; i++) { const angle = random() * Math.PI * 2; const r = random() * 155; ctx.beginPath(); ctx.arc(320 + Math.cos(angle) * r, 200 + Math.sin(angle) * r, 2 + random() * 5, 0, Math.PI * 2); ctx.fill(); }
      if (H.state === 'pick') {
        ctx.fillStyle = '#5b2a4a';
        ctx.font = 'bold 26px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Pick a pattern to carve', 320, 205);
        return;
      }
      // Groove
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      H.strokes.forEach((stroke) => {
        ctx.strokeStyle = 'rgba(110, 60, 5, 0.55)';
        ctx.lineWidth = 9;
        ctx.beginPath();
        stroke.forEach(([x, y], index) => (index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      });
      // Carved part
      ctx.fillStyle = PINK;
      H.samples.forEach((sample) => { if (sample.done) { ctx.beginPath(); ctx.arc(sample.x, sample.y, 4, 0, Math.PI * 2); ctx.fill(); } });
      if (H.crack) {
        ctx.strokeStyle = '#3a1d05';
        ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(H.crack.x, H.crack.y); ctx.lineTo(H.crack.x + Math.cos(i * 1.1) * 70, H.crack.y + Math.sin(i * 1.7) * 70); ctx.stroke(); }
      }
      // Needle and HUD
      if (H.last) { ctx.fillStyle = '#4a4f57'; ctx.beginPath(); ctx.arc(H.last.x, H.last.y, 5, 0, Math.PI * 2); ctx.fill(); }
      const left = Math.max(0, H.limit - (t - H.start));
      ctx.fillStyle = '#3a2a3a';
      ctx.textAlign = 'left';
      ctx.font = 'bold 20px Segoe UI, Arial, sans-serif';
      ctx.fillText(`Carved ${Math.floor((H.carved / H.samples.length) * 100)}%`, 16, 30);
      ctx.textAlign = 'right';
      ctx.fillText(`${left.toFixed(1)} s`, w - 16, 30);
      ctx.fillStyle = left < 10 ? '#e03131' : TEAL;
      ctx.fillRect(16, h - 18, (w - 32) * (left / H.limit), 8);
    }
    const game = {
      H,
      init(ctx) {
        Overlay.setText('Regex Honeycomb: carve the pattern out of the candy without breaking it.');
        Overlay.setButtons(Object.keys(HONEY_SHAPES).map((name) => ({ label: name === 'braces' ? '{ } braces' : name, onClick: () => pick(name) })));
        draw(ctx, performance.now() / 1000);
      },
      onPointer(type, point) {
        if (type === 'pointerdown') { H.down = true; H.last = point; carve(point); } else if (type === 'pointermove') { H.last = point; if (H.down) carve(point); } else H.down = false;
      },
      onFrame(t, ctx) {
        if (H.state === 'play' && t - H.start > H.limit) lose('time is up (45 s)');
        draw(ctx, t);
      },
      pick
    };
    window.SquidGameEE.honey = game;
    Overlay.open('Regex Honeycomb', game);
    return null;
  }
  function sgHoneycomb(group) {
    const S = new THREE.Group();
    // Stall: pastel back wall, striped awning, hexagon tables with candy tins
    blk(S, 28, 4.4, 0.6, material(PASTEL.yellow, { roughness: 0.8 }), -11, 2.2, 39.6);
    blk(S, 0.6, 4.4, 9, material(PASTEL.yellow, { roughness: 0.8 }), -25, 2.2, 35.4);
    for (let i = 0; i < 14; i++) {
      const stripe = blk(S, 2, 0.15, 7.6, material(i % 2 ? '#ffffff' : PINK, { roughness: 0.7 }), -24 + i * 2, 4.5, 36);
      stripe.rotation.x = -0.08;
    }
    [[-24.6, 32.4], [2.4, 32.4]].forEach(([x, z]) => blk(S, 0.25, 4.5, 0.25, material(TEAL), x, 2.25, z));
    group.add(signPlane(10, 1.8, { bg: '#ffffff', fg: PINK, title: 'REGEX HONEYCOMB', sub: 'carve the pattern, do not break the match', border: TEAL }, -11, 3.3, 39.28, 0));
    const tableMaterial = material(PASTEL.pink, { roughness: 0.6 });
    [-18, -10, -2].forEach((x) => {
      const table = new THREE.Group();
      table.position.set(x, 0, 35);
      table.add(cylinder(1.1, 1.1, 0.9, tableMaterial, 0, 0.45, 0, 6));
      table.add(cylinder(1.25, 1.25, 0.08, material('#ffffff'), 0, 0.94, 0, 6));
      table.add(cylinder(0.55, 0.55, 0.08, material('#9aa3ab', { metalness: 0.7, roughness: 0.3 }), 0, 1.02, 0, 24));
      table.add(cylinder(0.48, 0.48, 0.05, material('#d9a441', { roughness: 0.6 }), 0, 1.07, 0, 24));
      action(table, 'Regex Honeycomb table', 'Press E to play Regex Honeycomb', () => openHoneycomb(group));
      group.add(table);
      // Hexagonal stools around each table
      [[-1.8, 0], [1.8, 0]].forEach(([dx]) => S.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.45, 6), material(TEAL), x + dx, 0.225, 35)));
    });
    addDrone(0, (t) => ({ x: -11 + Math.sin(t * 0.3) * 10, y: 5.6, z: 33, yaw: 0 }));
    bake(group, S);
  }

  // ==========================================================================
  // 3) MERGE CONFLICT TUG OF WAR: your branch vs main over the merge pit
  // ==========================================================================
  const TUG = { y: 6, z: 33, you: { x0: 18, x1: 32 }, main: { x0: 52, x1: 66 }, z0: 25, z1: 41 };
  function sgTug(group) {
    const S = new THREE.Group();
    const { y: Y, z0, z1 } = TUG;
    const depth = z1 - z0;
    const cz = (z0 + z1) / 2;
    // Each platform tilts around its outer edge (pivot group)
    const makePlatform = (x0, x1, pivotX, color, label) => {
      const pivot = new THREE.Group();
      pivot.position.set(pivotX, Y, 0);
      const width = x1 - x0;
      const center = (x0 + x1) / 2 - pivotX;
      blk(pivot, width, 0.6, depth, material(color, { roughness: 0.7 }), center, -0.3, cz);
      blk(pivot, width, 0.2, 0.2, material(TEAL), center, 0.55, z0 + 0.1);
      blk(pivot, width, 1.1, 0.2, material(TEAL), center, 0.55, z1 - 0.1);
      blk(pivot, 0.2, 1.1, depth, material(TEAL), pivotX === x0 ? x0 - pivotX + 0.1 : x1 - pivotX - 0.1, 0.55, cz);
      const sign = textSprite(label, { width: 6, background: color === PASTEL.mint ? 'rgba(20, 163, 154, 0.9)' : 'rgba(230, 0, 126, 0.9)' });
      sign.position.set(center, 3.4, z0 + 2);
      pivot.add(sign);
      group.add(pivot);
      return pivot;
    };
    const yours = makePlatform(TUG.you.x0, TUG.you.x1, TUG.you.x0, PASTEL.mint, 'YOUR BRANCH');
    const mains = makePlatform(TUG.main.x0, TUG.main.x1, TUG.main.x1, PASTEL.pink, 'main');
    // North railing of your deck leaves a gap where the stairs arrive
    blk(yours, 8, 1.1, 0.2, material(TEAL), 9.5, 0.55, z0 + 0.1);
    // Fixed supports under the decks
    [[TUG.you.x0 + 1, TUG.you.x1 - 1], [TUG.main.x0 + 1, TUG.main.x1 - 1]].forEach(([a, b]) => [a, b].forEach((x) => [z0 + 1, z1 - 1].forEach((z) => blk(S, 0.8, Y - 0.9, 0.8, material(PASTEL.yellow), x, (Y - 0.9) / 2, z))));
    // Stairs up to your deck (12 steps of 0.5 m)
    for (let k = 0; k < 12; k++) blk(S, 3, 0.5, 0.8, material(k % 2 ? PASTEL.pink : PASTEL.lilac, { roughness: 0.7 }), 21.5, (k + 1) * 0.5 - 0.25, 15.6 + k * 0.8);
    // The merge pit between the decks
    group.add(floorDecal(20, depth, new THREE.MeshBasicMaterial({ map: lazyTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = '#2a0f22';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255, 46, 136, 0.85)';
      ctx.font = 'bold 44px Consolas, monospace';
      ctx.textAlign = 'center';
      ['<<<<<<< HEAD', '=======', '>>>>>>> main'].forEach((line, index) => ctx.fillText(line, w / 2, 170 + index * 90));
      ctx.strokeStyle = 'rgba(20, 163, 154, 0.5)';
      ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, w - 40, h - 40);
    }), toneMapped: false }), 42, 0.03, cz));
    const fence = material(PINK, { roughness: 0.5 });
    blk(S, 20, 1.2, 0.3, fence, 42, 0.6, z0 - 0.2);
    blk(S, 20, 1.2, 0.3, fence, 42, 0.6, z1 + 0.2);
    // Rope and knot (a pink flag)
    const rope = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8), material('#d9c08f', { roughness: 0.9 }), 42, Y + 1.1, TUG.z);
    rope.rotation.z = Math.PI / 2;
    rope.scale.y = TUG.main.x0 - TUG.you.x1 + 4;
    noRay(rope);
    group.add(rope);
    const knot = new THREE.Group();
    knot.add(box(0.2, 1.6, 0.2, material('#ffffff'), 0, 0.4, 0));
    knot.add(box(0.06, 0.8, 1, glow(HOT, 1.6), 0, 0.9, 0.5));
    knot.position.set(42, Y + 1.1, TUG.z);
    noRay(knot);
    group.add(knot);
    // Console on your deck
    const consoleGroup = new THREE.Group();
    consoleGroup.position.set(TUG.you.x0 + 2.5, 0, 38);
    blk(consoleGroup, 1.4, 1.1, 1, material(PASTEL.lilac), 0, 0.55, 0);
    consoleGroup.add(cylinder(0.4, 0.4, 0.15, glow(HOT, 1.5), 0, 1.15, 0, 20));
    yours.add(consoleGroup);
    consoleGroup.position.x -= TUG.you.x0;
    action(consoleGroup, 'Tug of War console', 'Press E to start the Merge Conflict Tug of War', () => openTug());
    const consoleSign = textSprite('E: start the tug of war', { width: 5, background: 'rgba(230, 0, 126, 0.9)' });
    consoleSign.position.set(2.5, 2.6, 38);
    yours.add(consoleSign);
    // Main team: five pink drones holding the rope
    const T = { pos: 0, tiltYours: 0, tiltMain: 0, fallAt: -10, until: 0, phase: 'idle' };
    for (let i = 0; i < 5; i++) {
      addDrone(i % 3, (t) => {
        const baseX = TUG.main.x0 + 1.5 + i * 2.2 - T.pos * 2;
        const fall = T.phase === 'mainFalls' ? Math.min(Y + 0.5, (clock() - T.fallAt) ** 2 * 9) : 0;
        return { x: baseX, y: Y + 1.3 + Math.sin(t * 3 + i) * 0.12 - fall, z: TUG.z + (i % 2 ? 0.6 : -0.6), yaw: -Math.PI / 2 };
      });
    }
    bake(group, S);

    function restore() { T.phase = 'idle'; T.pos = 0; }
    function openTug() {
      if (T.phase !== 'idle') return 'The decks are still being reset. Try again in a moment.';
      teleport(group, TUG.you.x1 - 2.5, Y + 0.1, TUG.z);
      const G = { pos: 0, start: performance.now() / 1000, limit: 45, zone: 360, marker: 0, phase: 0, last: 0, state: 'play', flash: '' };
      const ZONE = 110;
      const game = {
        G,
        markerX: () => 80 + (Math.sin(G.phase) * 0.5 + 0.5) * 480,
        init() {
          Overlay.setText('Press SPACE when the white marker is inside the green zone. Off-beat presses slip. Pull the flag to your side!');
          Overlay.setButtons([{ label: 'Give up', onClick: () => finish(false, 'you let go of the rope') }]);
        },
        onKey(event) {
          if (event.key !== ' ' || event.repeat || G.state !== 'play') return;
          const now = performance.now() / 1000;
          if (now - G.last < 0.12) return;
          G.last = now;
          if (Math.abs(game.markerX() - G.zone) < ZONE / 2) { G.pos += 0.11; G.flash = 'PERFECT PULL'; G.zone = 140 + Math.random() * 360; } else { G.pos -= 0.03; G.flash = 'slipped'; }
          play('click');
        },
        onFrame(t, ctx) {
          const dt = Math.min(0.05, t - (G.prev || t));
          G.prev = t;
          if (G.state === 'play') {
            G.phase += dt * 3.6;
            G.pos -= dt * (0.07 + 0.03 * Math.sin(t * 1.7));
            if (G.pos >= 1) finish(true);
            else if (G.pos <= -1) finish(false, 'main pulled your branch into the merge pit');
            else if (t - G.start > G.limit) finish(G.pos > 0, 'time ran out with main ahead');
          }
          T.pos = Math.max(-1, Math.min(1, G.pos));
          drawTug(ctx, t);
        },
        onClose() { if (G.state === 'play') finish(false, 'you let go of the rope', true); }
      };
      function drawTug(ctx, t) {
        const w = 640;
        const h = 380;
        ctx.fillStyle = '#bfe3f7';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#2a0f22';
        ctx.fillRect(230, 150, 180, 120);
        ctx.fillStyle = PASTEL.mint;
        ctx.fillRect(0, 140, 230, 18);
        ctx.fillStyle = PASTEL.pink;
        ctx.fillRect(410, 140, 230, 18);
        ctx.font = 'bold 22px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = TEAL;
        ctx.fillText('YOUR BRANCH', 115, 125);
        ctx.fillStyle = PINK;
        ctx.fillText('main', 525, 125);
        ctx.strokeStyle = '#a8864a';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(40, 110); ctx.lineTo(600, 110); ctx.stroke();
        const knotX = 320 - G.pos * 220;
        ctx.fillStyle = HOT;
        ctx.fillRect(knotX - 6, 80, 12, 50);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)';
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(320, 60); ctx.lineTo(320, 140); ctx.stroke();
        ctx.setLineDash([]);
        // Rhythm meter
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(80, 300, 480, 34);
        ctx.fillStyle = '#2fd46b';
        ctx.fillRect(G.zone - ZONE / 2, 300, ZONE, 34);
        ctx.fillStyle = '#16161c';
        ctx.fillRect(game.markerX() - 3, 294, 6, 46);
        ctx.fillStyle = '#3a2a3a';
        ctx.font = 'bold 18px Segoe UI, Arial, sans-serif';
        ctx.fillText(G.flash, 320, 285);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.max(0, G.limit - (t - G.start)).toFixed(0)} s`, w - 14, 28);
        if (G.state !== 'play') { ctx.textAlign = 'center'; ctx.font = 'bold 40px Segoe UI, Arial, sans-serif'; ctx.fillStyle = G.state === 'won' ? TEAL : '#e03131'; ctx.fillText(G.state === 'won' ? 'MERGED. BUILD PASSED' : 'BUILD FAILED', 320, 230); }
      }
      function finish(won, reason, closing) {
        if (G.state !== 'play') return;
        G.state = won ? 'won' : 'lost';
        T.pos = won ? 1 : -1;
        const now = clock();
        if (won) {
          T.phase = 'mainFalls';
          T.fallAt = now;
          T.until = now + 4;
          if (!closing) setTimeout(() => Overlay.close(), 1000);
          award(GAMES.tug);
        } else {
          T.phase = 'youFall';
          T.fallAt = now;
          T.until = now + 3.5;
          if (!closing) setTimeout(() => Overlay.close(), 900);
          // Your deck tilts and you slide into the merge pit (soft landing), then respawn
          setTimeout(() => teleport(group, 36, 0.3, TUG.z), closing ? 300 : 1100);
          setTimeout(() => buildFailed(GAMES.tug, reason, group, [21.5, 0.1, 13.5]), closing ? 2600 : 3400);
        }
      }
      game.finish = finish;
      window.SquidGameEE.tugGame = game;
      Overlay.open('Merge Conflict Tug of War', game);
      return null;
    }
    T.open = openTug;
    window.SquidGameEE = window.SquidGameEE || {};
    window.SquidGameEE.tug = T;

    animate(group, () => {
      const t = clock();
      T.now = t;
      if (T.phase !== 'idle' && t > T.until) restore();
      // Tilt by time (not per frame): 0.6 s down after a loss, eased back on reset
      const dt = Math.min(0.5, t - (T.last || t));
      T.last = t;
      const ease = 1 - Math.exp(-dt * 4);
      if (T.phase === 'youFall') T.tiltYours = -0.42 * Math.min(1, (t - T.fallAt) / 0.6); else T.tiltYours += (0 - T.tiltYours) * ease;
      if (T.phase === 'mainFalls') T.tiltMain = 0.42 * Math.min(1, (t - T.fallAt) / 0.6); else T.tiltMain += (0 - T.tiltMain) * ease;
      yours.rotation.z = T.tiltYours;
      mains.rotation.z = T.tiltMain;
      knot.position.x = 42 - T.pos * 8;
      rope.visible = T.phase === 'idle' || Math.abs(T.pos) < 1;
    });
  }

  // ==========================================================================
  // 4) ODD OR EVEN COMMITS (marbles) in the village alley
  // ==========================================================================
  function openMarbles(anchor) {
    const M = { you: 10, bot: 10, bet: 1, hidden: 0, state: 'play', reveal: null, rounds: 0 };
    const hide = () => { M.hidden = 1 + Math.floor(Math.random() * Math.min(M.bot, 6)); };
    function render() {
      const ctx = Overlay.canvas.getContext('2d');
      const w = 640;
      const h = 380;
      ctx.fillStyle = '#f7efe4';
      ctx.fillRect(0, 0, w, h);
      const bag = (x, label, count, color) => {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.ellipse(x, 140, 110, 90, 0, 0, Math.PI * 2); ctx.fill();
        const random = seeded(count * 7 + x);
        for (let i = 0; i < count; i++) {
          const angle = random() * Math.PI * 2;
          const r = Math.sqrt(random()) * 70;
          ctx.fillStyle = ['#e6007e', '#14a39a', '#ffc53d', '#4c6ef5'][i % 4];
          ctx.beginPath(); ctx.arc(x + Math.cos(angle) * r, 140 + Math.sin(angle) * r * 0.7, 9, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#3a2a3a';
        ctx.font = 'bold 22px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${label}: ${count} commits`, x, 262);
      };
      bag(160, 'You', M.you, 'rgba(20, 163, 154, 0.25)');
      bag(480, 'Bot', M.bot, 'rgba(230, 0, 126, 0.22)');
      ctx.fillStyle = '#3a2a3a';
      ctx.font = '20px Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(M.reveal || 'The bot squashed some commits in its hand. Odd or even?', 320, 310, 600);
      ctx.font = 'bold 18px Segoe UI, Arial, sans-serif';
      ctx.fillText(`Your bet: ${M.bet} commit${M.bet > 1 ? 's' : ''}`, 320, 345);
      if (M.state !== 'play') { ctx.font = 'bold 42px Segoe UI, Arial, sans-serif'; ctx.fillStyle = M.state === 'won' ? TEAL : '#e03131'; ctx.fillText(M.state === 'won' ? 'BUILD PASSED' : 'BUILD FAILED', 320, 60); }
    }
    function buttons() {
      const bets = [1, 2, 3].filter((value) => value <= M.you).map((value) => ({ label: `Bet ${value}`, on: M.bet === value, onClick: () => { M.bet = value; buttons(); render(); } }));
      bets.push({ label: 'All in', on: M.bet === M.you && M.you > 3, onClick: () => { M.bet = M.you; buttons(); render(); } });
      Overlay.setButtons([...bets, { label: 'ODD', onClick: () => guess(1) }, { label: 'EVEN', onClick: () => guess(0) }].map((button) => ({ ...button, disabled: M.state !== 'play' })));
    }
    function guess(parity) {
      if (M.state !== 'play') return;
      M.rounds++;
      const right = M.hidden % 2 === parity;
      const amount = Math.min(M.bet, right ? M.bot : M.you);
      if (right) { M.you += amount; M.bot -= amount; } else { M.you -= amount; M.bot += amount; }
      M.reveal = `The bot held ${M.hidden} (${M.hidden % 2 ? 'odd' : 'even'}). ${right ? `You win ${amount}.` : `You lose ${amount}.`}`;
      play('click');
      M.bet = Math.max(1, Math.min(M.bet, M.you));
      if (M.bot <= 0) {
        M.state = 'won';
        setTimeout(() => { Overlay.close(); award(GAMES.marbles); }, 1100);
      } else if (M.you <= 0) {
        M.state = 'lost';
        setTimeout(() => { Overlay.close(); buildFailed(GAMES.marbles, 'you ran out of commits', anchor, [2, 0.1, 48]); }, 1100);
      } else hide();
      buttons();
      render();
    }
    hide();
    const game = {
      M,
      guess,
      init() { Overlay.setText('Odd or Even Commits: guess if the bot holds an odd or even number of commits. Win all of its commits to pass the build.'); buttons(); render(); }
    };
    window.SquidGameEE.marbles = game;
    Overlay.open('Odd or Even Commits', game);
    return null;
  }
  function sgMarbles(group) {
    const S = new THREE.Group();
    // Village alley: pastel house facades on both sides (show-set style)
    const facadeColors = [PASTEL.pink, PASTEL.mint, PASTEL.yellow, PASTEL.lilac, PASTEL.sky];
    const doorMaterial = material('#4a3a46', { roughness: 0.8 });
    const windowMaterial = glow('#ffe8b0', 0.9);
    const roofMaterial = material('#c96b7d', { roughness: 0.7 });
    [[42.6, 1], [53.4, -1]].forEach(([z, facing], row) => {
      for (let i = 0; i < 5; i++) {
        const x = -22 + i * 5.6;
        const height = 4.4 + ((i + row) % 3) * 0.8;
        blk(S, 5.2, height, 1.2, material(facadeColors[(i + row * 2) % 5], { roughness: 0.85 }), x, height / 2, z);
        blk(S, 5.5, 0.3, 1.8, roofMaterial, x, height + 0.15, z);
        blk(S, 1.2, 2.3, 0.1, doorMaterial, x - 1.2, 1.15, z + facing * 0.62);
        const pane = blk(S, 1.1, 0.9, 0.06, windowMaterial, x + 1.2, 2.4, z + facing * 0.63);
        pane.castShadow = false;
      }
    });
    // Lamps along the alley
    [-20, -9, 2].forEach((x) => {
      blk(S, 0.15, 3.6, 0.15, material('#3a3f4a', { metalness: 0.6 }), x, 1.8, 46);
      S.add(sphere(0.32, glow('#ffd8a8', 1.8), x, 3.7, 46, 12));
    });
    // Marbles table at the far end
    const table = new THREE.Group();
    table.position.set(-21, 0, 48);
    table.add(cylinder(1.2, 1.2, 0.1, material(PASTEL.cream), 0, 0.9, 0, 28));
    table.add(cylinder(0.18, 0.3, 0.85, material('#3a3f4a'), 0, 0.43, 0, 12));
    table.add(cylinder(0.45, 0.3, 0.3, material('#ffffff', { roughness: 0.3 }), 0, 1.1, 0, 20));
    [0, 1, 2, 3, 4].forEach((i) => table.add(sphere(0.07, glow(['#e6007e', '#14a39a', '#ffc53d', '#4c6ef5', '#e6007e'][i], 0.6), Math.cos(i * 1.3) * 0.2, 1.25, Math.sin(i * 1.3) * 0.2, 8)));
    action(table, 'Odd or Even Commits', 'Press E to play Odd or Even Commits (marbles)', () => openMarbles(group));
    group.add(table);
    const sign = textSprite('E: Odd or Even Commits', { width: 6, background: 'rgba(230, 0, 126, 0.9)' });
    sign.position.set(-21, 3, 48);
    group.add(sign);
    addDrone(2, (t) => ({ x: -21 + Math.sin(t * 0.5) * 2, y: 4.2, z: 50.5, yaw: Math.PI }));
    bake(group, S);
  }

  PropKit.registerBuilder(/^sgee_core$/, 'sgeeCore', sgCore);
  PropKit.registerBuilder(/^sgee_redlight$/, 'sgeeRedLight', sgRedLight);
  PropKit.registerBuilder(/^sgee_bridge$/, 'sgeeBridge', sgBridge);
  PropKit.registerBuilder(/^sgee_dorm$/, 'sgeeDorm', sgDorm);
  PropKit.registerBuilder(/^sgee_tug$/, 'sgeeTug', sgTug);
  PropKit.registerBuilder(/^sgee_honeycomb$/, 'sgeeHoneycomb', sgHoneycomb);
  PropKit.registerBuilder(/^sgee_marbles$/, 'sgeeMarbles', sgMarbles);
})();
