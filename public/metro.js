// ============================================================================
// MULTIVERSE METRO: SCHEMATIC TRANSIT MAP + TRAIN RIDES BETWEEN PLACES
// ============================================================================
// A London Underground-style map (N, /metro or a station kiosk) connects
// Genesis Plaza to every scene and World. Picking a station starts a train
// ride: the camera rides along with the train above the landscape.
const Metro = (() => {
  const LINES = [
    { name: 'Genesis Line', color: '#1877f2', stations: ['plaza', 'lobby', 'pavilion', 'agile', 'workspace', 'social', 'districts'] },
    { name: 'Arcade Line', color: '#e03131', stations: ['plaza', 'arcade', 'parkour', 'sandbox', 'retro', 'cyberpunk', 'gamer'] },
    { name: 'Leisure Line', color: '#2f9e44', stations: ['plaza', 'beach', 'zen', 'gallery', 'mall', 'apple', 'house', 'equalizer', 'hotel', 'villas'] },
    { name: 'Worlds Express', color: '#fab005', stations: ['plaza', 'techsquare', 'museum', 'dungeon', 'opensource', 'keynote', 'greentech', 'valley', 'cryptovalley', 'jpegworld', 'squidgame'] }
  ];
  const RIDE_SECONDS = 7;
  let hooks = null;
  let ride = null;
  let hitboxes = [];
  const ui = {
    overlay: document.getElementById('metro-overlay'),
    canvas: document.getElementById('metro-canvas'),
    close: document.getElementById('metro-close')
  };

  // --------------------------------------------------------------------------
  // Schematic map: each line is a straight branch radiating from Genesis Plaza
  // --------------------------------------------------------------------------
  function drawMap() {
    const ctx = ui.canvas.getContext('2d');
    const w = ui.canvas.width;
    const h = ui.canvas.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0d1b3e';
    ctx.font = 'bold 30px Segoe UI, Arial, sans-serif';
    ctx.fillText('Multiverse Metro', 24, 44);
    ctx.font = '16px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#495057';
    ctx.fillText('Click a station to ride the train · N or Esc to close', 24, 70);
    hitboxes = [];
    const center = { x: w / 2, y: h / 2 + 30 };
    const directions = [[1, -0.55], [1, 0.55], [-1, 0.55], [-1, -0.55]];
    LINES.forEach((line, lineIndex) => {
      const [dx, dy] = directions[lineIndex];
      const stations = line.stations.filter((key) => hooks.findPlace(key));
      const step = Math.min(68, (w / 2 - 70) / Math.max(1, stations.length - 1));
      const points = stations.map((key, index) => {
        // First segment goes diagonally (45°), then the line runs horizontally
        const diagonal = Math.min(index, 1) * 70;
        const horizontal = Math.max(0, index - 1) * step;
        return { key, x: center.x + dx * (diagonal + horizontal), y: center.y + dy * diagonal * 1.2 + dy * horizontal * 0.35 };
      });
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.stroke();
      // Line name tag at the end of the line
      const last = points[points.length - 1];
      ctx.fillStyle = line.color;
      ctx.font = 'bold 15px Segoe UI, Arial, sans-serif';
      ctx.textAlign = dx > 0 ? 'right' : 'left';
      ctx.fillText(line.name, last.x, last.y + (dy > 0 ? 44 : -34));
      ctx.textAlign = 'left';
      points.slice(1).forEach((point, index) => {
        const place = hooks.findPlace(point.key);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#0d1b3e';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(point.x, point.y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.save();
        ctx.translate(point.x, point.y);
        ctx.rotate(-0.8);
        ctx.fillStyle = '#0d1b3e';
        ctx.font = '12px Segoe UI, Arial, sans-serif';
        ctx.fillText(place.name, 12, index % 2 ? 18 : -10);
        ctx.restore();
        hitboxes.push({ x: point.x, y: point.y, key: point.key });
      });
    });
    // Interchange at Genesis Plaza
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0d1b3e';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(center.x, center.y, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0d1b3e';
    ctx.font = 'bold 16px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Genesis Plaza', center.x, center.y + 40);
    ctx.textAlign = 'left';
    hitboxes.push({ x: center.x, y: center.y, key: 'plaza' });
  }

  function open() {
    ui.overlay.style.display = 'flex';
    drawMap();
  }

  function close() {
    ui.overlay.style.display = 'none';
  }

  function isOpen() {
    return ui.overlay.style.display === 'flex';
  }

  // --------------------------------------------------------------------------
  // Train ride: a 3-car train flies along an arc above the landscape
  // --------------------------------------------------------------------------
  function buildTrain() {
    const { box, material, glow } = PropKit.kit;
    const train = new THREE.Group();
    for (let car = 0; car < 3; car++) {
      const carriage = new THREE.Group();
      carriage.add(box(3.2, 3.4, 12, material('#e9ecef', { metalness: 0.5, roughness: 0.3 }), 0, 0, 0));
      carriage.add(box(3.25, 0.7, 12.05, material('#1877f2'), 0, -0.8, 0));
      carriage.add(box(3.26, 1, 10.5, material('#1b2a4a', { roughness: 0.1, metalness: 0.4 }), 0, 0.6, 0));
      carriage.add(box(2, 0.3, 0.1, glow('#fff3c4', 1.5), 0, 0.9, -6.05));
      carriage.position.z = car * 12.6;
      train.add(carriage);
    }
    train.traverse((node) => { node.raycast = () => {}; });
    return train;
  }

  function startRide(key) {
    const place = hooks.findPlace(key);
    if (!place) return;
    close();
    const from = hooks.avatarPosition().clone();
    const to = hooks.placeLanding(place);
    const distance = Math.hypot(to.x - from.x, to.z - from.z);
    const altitude = Math.min(90, 30 + distance * 0.02);
    const curve = new THREE.CatmullRomCurve3([
      from.clone().add(new THREE.Vector3(0, 4, 0)),
      from.clone().lerp(to, 0.2).setY(altitude),
      from.clone().lerp(to, 0.5).setY(altitude + 10),
      from.clone().lerp(to, 0.8).setY(altitude),
      to.clone().add(new THREE.Vector3(0, 4, 0))
    ]);
    const train = buildTrain();
    hooks.scene.add(train);
    ride = { curve, train, start: performance.now(), place, to };
    hooks.system(`All aboard! Next stop: ${place.name}.`);
  }

  function update(camera, controls) {
    if (!ride) return;
    const progress = Math.min(1, (performance.now() - ride.start) / (RIDE_SECONDS * 1000));
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const point = ride.curve.getPointAt(eased);
    const ahead = ride.curve.getPointAt(Math.min(1, eased + 0.01));
    ride.train.position.copy(point);
    ride.train.lookAt(ahead);
    ride.train.rotateY(Math.PI);
    // Camera rides behind and above the train, looking ahead at the landscape
    const back = point.clone().sub(ahead).setY(0).normalize();
    camera.position.copy(point).add(back.multiplyScalar(22)).add(new THREE.Vector3(0, 9, 0));
    controls.target.copy(ahead).add(new THREE.Vector3(0, 2, 0));
    hooks.avatarPosition().copy(point);
    if (progress >= 1) {
      hooks.scene.remove(ride.train);
      const arrived = ride;
      ride = null;
      hooks.arrive(arrived.place);
    }
  }

  function init(options) {
    hooks = options;
    ui.close.addEventListener('click', close);
    ui.canvas.addEventListener('click', (event) => {
      const rect = ui.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) * (ui.canvas.width / rect.width);
      const y = (event.clientY - rect.top) * (ui.canvas.height / rect.height);
      const hit = hitboxes.find((box) => Math.hypot(box.x - x, box.y - y) < 18);
      if (hit) startRide(hit.key);
    });
  }

  return { init, open, close, isOpen, update, startRide, isRiding: () => !!ride };
})();
