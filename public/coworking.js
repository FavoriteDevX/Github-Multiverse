// ============================================================================
// COWORKING HUB, PAIR PROGRAMMING, COLLABS BOARD AND AVATAR STATUS
// ============================================================================
// - Coworking Hub (Genesis Plaza): a modern pergola with four private tables.
//   Each table has a marked area on the floor; inside it the HUD shows
//   "Private zone: Table 01" and the text chat only reaches that table.
// - Pair programming laptops on every table (E): commit code (+3 MVC), open
//   the shared code board, or start a collective Pomodoro (25 min, +15 MVC).
// - Collabs & Jobs board in the plaza: 20 MVC posts a card looking for
//   partners on an open source project.
// - Status next to every avatar name: Available, Focus (Pomodoro) or AFK.
// The server keeps the shared state (boards, timers, cards, statuses) and
// broadcasts it, so everyone sees the same thing.
const Coworking = (() => {
  const { material, glow, mesh, box, cylinder, textSprite, interactive, seat } = PropKit.kit;
  const zones = [];
  const probe = new THREE.Vector3();
  let socket = null;
  let hooks = { system: () => {}, localRecord: () => null, peers: () => ({}) };
  let currentTable = null;
  let boardText = '';
  let pomodoro = { running: false, endsAt: 0 };
  let status = 'available';
  let collabs = [];
  const collabBoards = [];
  const esc = (text) => String(text == null ? '' : text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tableName = (table) => `Table ${String(table).padStart(2, '0')}`;

  // --------------------------------------------------------------------------
  // Builders
  // --------------------------------------------------------------------------
  // Modern condo-style pergola over four desk zones: slim steel posts, a
  // slatted wooden roof, a light deck, and per table a glowing floor outline,
  // a block desk (two cubes) with two laptops and four stools
  function coworkingHub(group, { w, d }) {
    const width = w || 30;
    const depth = d || 24;
    const steel = material('#2b2f36', { metalness: 0.7, roughness: 0.35 });
    const wood = new THREE.MeshStandardMaterial({ map: PropKit.kit.repeated(PropKit.kit.plankTexture('#b98a5a'), 1, 6), roughness: 0.7 });
    const deck = new THREE.MeshStandardMaterial({ map: PropKit.kit.repeated(PropKit.kit.plankTexture('#d9c2a0'), width / 3, depth / 3), roughness: 0.8 });
    group.add(box(width, 0.2, depth, deck, 0, 0.1, 0));
    // Pergola: posts and slats
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => group.add(box(0.25, 3.4, 0.25, steel, sx * (width / 2 - 0.4), 1.9, sz * (depth / 2 - 0.4)))));
    [-1, 1].forEach((sz) => group.add(box(width - 0.4, 0.3, 0.25, steel, 0, 3.6, sz * (depth / 2 - 0.4))));
    for (let x = -width / 2 + 0.8; x <= width / 2 - 0.8; x += 0.9) group.add(box(0.16, 0.22, depth - 0.5, wood, x, 3.85, 0));
    const caption = textSprite('Coworking Hub · 4 private tables', { width: 8 });
    caption.position.set(0, 5.2, depth / 2 - 0.5);
    group.add(caption);
    // Four tables in a 2 x 2 grid
    const zoneW = width / 2 - 2;
    const zoneD = depth / 2 - 2;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], index) => {
      const table = index + 1;
      const cx = sx * (width / 4);
      const cz = sz * (depth / 4);
      // Floor outline of the private zone
      const line = glow('#4dabf7', 1.1);
      [[zoneW, 0.06, 0.1, 0, -zoneD / 2], [zoneW, 0.06, 0.1, 0, zoneD / 2], [0.1, 0.06, zoneD, -zoneW / 2, 0], [0.1, 0.06, zoneD, zoneW / 2, 0]].forEach(([bw, bh, bd, x, z]) => {
        const edge = box(bw, bh, bd, line, cx + x, 0.24, cz + z);
        edge.raycast = () => {};
        group.add(edge);
      });
      const label = textSprite(tableName(table), { width: 2.6, background: 'rgba(24, 119, 242, 0.85)' });
      label.position.set(cx, 2.6, cz - zoneD / 2 + 0.3);
      group.add(label);
      // Block desk: a long white slab on two cubes
      const white = material('#f1f3f5', { roughness: 0.45 });
      group.add(box(3.4, 0.12, 1.4, white, cx, 0.95, cz));
      [-1.25, 1.25].forEach((dx) => group.add(box(0.8, 0.75, 1.2, material('#dee2e6', { roughness: 0.6 }), cx + dx, 0.575, cz)));
      // Two laptops (one per side) open the pair programming menu
      [-0.75, 0.75].forEach((dx, k) => {
        const laptop = PropKit.kit.laptop(cx + dx, 1.02, cz, k ? Math.PI : 0);
        laptop.traverse((node) => {
          if (!node.isMesh) return;
          interactive(node, 'action', `Pair programming laptop · ${tableName(table)}`);
          node.userData.onInteract = () => { openLaptop(table); return null; };
        });
        group.add(laptop);
      });
      // Stools
      [[-0.9, -1.2], [0.9, -1.2], [-0.9, 1.2], [0.9, 1.2]].forEach(([dx, dz]) => {
        group.add(cylinder(0.32, 0.32, 0.6, material('#495057'), cx + dx, 0.5, cz + dz, 14));
        group.add(seat(cx + dx, 0.85, cz + dz, `${tableName(table)} stool`, dz < 0 ? 0 : Math.PI));
      });
      const marker = new THREE.Object3D();
      marker.position.set(cx, 0, cz);
      group.add(marker);
      zones.push({ table, marker, halfW: zoneW / 2, halfD: zoneD / 2 });
    });
    group.userData.label = 'Coworking Hub';
  }

  // Collabs & Jobs board: a freestanding panel listing the latest cards
  function collabBoard(group, { w, h }) {
    const width = w || 6;
    const height = h || 4;
    const steel = material('#2b2f36', { metalness: 0.7, roughness: 0.35 });
    [-1, 1].forEach((side) => group.add(box(0.2, height + 0.6, 0.2, steel, side * (width / 2 + 0.1), (height + 0.6) / 2, 0)));
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = Math.round(1024 * height / width);
    const texture = new THREE.CanvasTexture(canvas);
    texture.encoding = THREE.sRGBEncoding;
    const panel = PropKit.kit.facedBox(width, height, 0.15, steel, new THREE.MeshBasicMaterial({ map: texture }), 0, height / 2 + 0.5, 0);
    interactive(panel, 'action', 'Collabs & Jobs board');
    panel.userData.onInteract = () => { openCollabs(); return null; };
    group.add(panel);
    collabBoards.push({ canvas, texture });
    drawCollabBoard({ canvas, texture });
    group.userData.label = 'Collabs & Jobs board';
  }

  function drawCollabBoard({ canvas, texture }) {
    const ctx = canvas.getContext('2d');
    const { width, height } = canvas;
    ctx.fillStyle = '#0e1934';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 54px Segoe UI, Arial, sans-serif';
    ctx.fillText('Collabs & Jobs', 40, 80);
    ctx.fillStyle = '#9fb3d9';
    ctx.font = '26px Segoe UI, Arial, sans-serif';
    ctx.fillText('Looking for partners on open source · E to post (20 MVC)', 40, 124);
    const cards = collabs.slice(0, 4);
    if (!cards.length) {
      ctx.fillStyle = '#c9d6ee';
      ctx.font = '32px Segoe UI, Arial, sans-serif';
      ctx.fillText('No cards yet. Be the first one!', 40, 230);
    }
    cards.forEach((card, i) => {
      const y = 160 + i * ((height - 180) / 4);
      const cardHeight = (height - 180) / 4 - 14;
      ctx.fillStyle = '#18264a';
      ctx.fillRect(40, y, width - 80, cardHeight);
      ctx.fillStyle = '#4dabf7';
      ctx.fillRect(40, y, 8, cardHeight);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px Segoe UI, Arial, sans-serif';
      ctx.fillText(card.title, 66, y + 42, width - 140);
      ctx.fillStyle = '#9fb3d9';
      ctx.font = '24px Segoe UI, Arial, sans-serif';
      ctx.fillText(`${card.roles ? `Looking for: ${card.roles} · ` : ''}by ${card.author}`, 66, y + 78, width - 140);
    });
    texture.needsUpdate = true;
  }

  PropKit.registerBuilder(/coworking_hub/, 'coworkingHub', coworkingHub);
  PropKit.registerBuilder(/collab_board/, 'collabBoard', collabBoard);

  // --------------------------------------------------------------------------
  // HUD: private zone notice, Pomodoro chip and the status selector
  // --------------------------------------------------------------------------
  let ui = null;
  function css() {
    if (document.getElementById('cowork-style')) return;
    const style = document.createElement('style');
    style.id = 'cowork-style';
    style.textContent = `
      #cowork-zone { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); z-index: 30; display: none; padding: 7px 14px; border-radius: 999px; background: rgba(14, 25, 52, 0.86); border: 1px solid rgba(77, 171, 247, 0.6); color: #dbe8ff; font: 600 13px var(--font, "Segoe UI", Arial, sans-serif); pointer-events: none; }
      #cowork-pomodoro { position: fixed; top: 100px; left: 50%; transform: translateX(-50%); z-index: 30; display: none; padding: 6px 12px; border-radius: 999px; background: rgba(224, 49, 49, 0.88); color: #fff; font: 700 13px var(--font, "Segoe UI", Arial, sans-serif); pointer-events: none; }
      #status-picker { position: fixed; top: 14px; left: 50%; transform: translateX(-50%); z-index: 31; display: flex; gap: 4px; padding: 4px; border-radius: 999px; background: rgba(14, 25, 52, 0.82); border: 1px solid rgba(255,255,255,0.12); font: 600 12px var(--font, "Segoe UI", Arial, sans-serif); }
      #status-picker button { display: flex; align-items: center; gap: 6px; border: 0; border-radius: 999px; padding: 5px 10px; background: transparent; color: #c9d1e0; cursor: pointer; font: inherit; }
      #status-picker button.on { background: rgba(255,255,255,0.14); color: #fff; }
      .status-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
      .status-available { background: #2f9e44; box-shadow: 0 0 6px #2f9e44; }
      .status-focus { background: #e03131; box-shadow: 0 0 6px #e03131; }
      .status-afk { background: #868e96; }
      .dev-floating-tag .status-dot { margin-right: 6px; vertical-align: middle; }
      body.hide-ui #cowork-zone, body.hide-ui #cowork-pomodoro, body.hide-ui #status-picker { display: none !important; }
      #cowork-overlay { position: fixed; inset: 0; z-index: 95; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(8, 12, 20, 0.55); font-family: var(--font, "Segoe UI", Arial, sans-serif); }
      #cowork-overlay .cw-card { width: min(520px, 100%); max-height: 86vh; overflow: auto; box-sizing: border-box; padding: 22px; border-radius: 16px; background: var(--panel-bg, rgba(14, 25, 52, 0.96)); border: 1px solid var(--panel-border, rgba(255,255,255,0.12)); color: #f0f0f5; box-shadow: 0 20px 50px rgba(0,0,0,0.45); }
      #cowork-overlay .cw-card.wide { width: min(820px, 100%); }
      #cowork-overlay h3 { margin: 0 0 4px; font-size: 18px; }
      #cowork-overlay .cw-sub { margin: 0 0 14px; color: #a9b4c8; font-size: 13px; }
      #cowork-overlay .cw-option { display: block; width: 100%; text-align: left; margin: 8px 0; padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: #fff; cursor: pointer; font: 600 14px inherit; }
      #cowork-overlay .cw-option small { display: block; margin-top: 3px; color: #a9b4c8; font-weight: 400; }
      #cowork-overlay .cw-option:hover { background: rgba(24, 119, 242, 0.25); }
      #cowork-overlay textarea.cw-code { width: 100%; height: 52vh; box-sizing: border-box; padding: 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: #0b1020; color: #e6edf3; font: 13px/1.5 "SFMono-Regular", Consolas, monospace; resize: vertical; tab-size: 2; }
      #cowork-overlay label { display: block; margin: 10px 0 4px; font-size: 12px; color: #c9d1e0; }
      #cowork-overlay input, #cowork-overlay textarea.cw-field { width: 100%; box-sizing: border-box; padding: 9px 11px; border-radius: 9px; border: 1px solid rgba(255,255,255,0.16); background: rgba(255,255,255,0.06); color: #fff; font: 14px inherit; resize: none; }
      #cowork-overlay .cw-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 14px; }
      #cowork-overlay .cw-actions button { padding: 9px 16px; border-radius: 10px; border: 0; cursor: pointer; font: 600 14px inherit; }
      #cowork-overlay .cw-cancel { background: rgba(255,255,255,0.1); color: #fff; }
      #cowork-overlay .cw-go { background: #1877f2; color: #fff; }
      #cowork-overlay .cw-error { min-height: 18px; margin: 8px 0 0; color: #ff8fa3; font-size: 13px; }
      #cowork-overlay .cw-note { color: #a9b4c8; font-size: 12px; margin-top: 6px; }
      #cowork-overlay .cw-collab { padding: 12px; margin: 8px 0; border-radius: 12px; background: rgba(255,255,255,0.05); border-left: 4px solid #4dabf7; }
      #cowork-overlay .cw-collab b { display: block; margin-bottom: 3px; }
      #cowork-overlay .cw-collab p { margin: 4px 0; color: #c9d1e0; font-size: 13px; line-height: 1.45; }
      #cowork-overlay .cw-collab a { color: #74c0fc; font-size: 13px; word-break: break-all; }
    `;
    document.head.appendChild(style);
  }

  function buildHud() {
    css();
    ui = {
      zone: Object.assign(document.createElement('div'), { id: 'cowork-zone' }),
      pomodoro: Object.assign(document.createElement('div'), { id: 'cowork-pomodoro' }),
      picker: Object.assign(document.createElement('div'), { id: 'status-picker' })
    };
    ui.picker.innerHTML = [['available', 'Available'], ['focus', 'Focus'], ['afk', 'AFK']].map(([key, name]) => `<button type="button" data-status="${key}"><span class="status-dot status-${key}"></span>${name}</button>`).join('');
    ui.picker.addEventListener('click', (event) => {
      const button = event.target.closest('[data-status]');
      if (button) setStatus(button.dataset.status);
    });
    document.body.append(ui.zone, ui.pomodoro, ui.picker);
    renderPicker();
  }

  function renderPicker() {
    if (!ui) return;
    ui.picker.querySelectorAll('button').forEach((button) => button.classList.toggle('on', button.dataset.status === status));
  }

  // The colored dot before a name (local or remote avatar)
  function applyStatus(record, value) {
    if (!record || !record.domElement) return;
    let dot = record.domElement.querySelector('.status-dot');
    if (!dot) {
      dot = document.createElement('span');
      record.domElement.prepend(dot);
    }
    dot.className = `status-dot status-${STATUS_NAMES[value] ? value : 'available'}`;
    dot.title = STATUS_NAMES[value] || 'Available';
  }
  const STATUS_NAMES = { available: 'Available', focus: 'Focus (Pomodoro)', afk: 'AFK' };

  function setStatus(value, quiet = false) {
    if (!STATUS_NAMES[value]) return;
    status = value;
    renderPicker();
    applyStatus(hooks.localRecord(), value);
    if (socket) socket.emit('set_status', value);
    if (!quiet) hooks.system(`Status: ${STATUS_NAMES[value]}.`);
  }

  // --------------------------------------------------------------------------
  // Modals
  // --------------------------------------------------------------------------
  let overlay = null;
  function close() { if (overlay) { overlay.remove(); overlay = null; } }
  function open(html, wide = false) {
    css();
    close();
    overlay = document.createElement('div');
    overlay.id = 'cowork-overlay';
    overlay.innerHTML = `<div class="cw-card${wide ? ' wide' : ''}">${html}</div>`;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    document.body.appendChild(overlay);
    return overlay;
  }

  // Pair programming laptop: commit, shared code board or collective Pomodoro
  function openLaptop(table) {
    const here = currentTable === table;
    const view = open(`<h3>Pair programming · ${tableName(table)}</h3>
      <p class="cw-sub">${here ? 'You are at this table: everything here is shared with the people sitting with you.' : `Step into the ${tableName(table)} area to work here.`}</p>
      <button class="cw-option" data-go="commit">Commit code (+3 MVC)<small>One commit per minute while you are at the table</small></button>
      <button class="cw-option" data-go="board">Open the code board<small>A simple shared editor for everyone at this table</small></button>
      <button class="cw-option" data-go="pomodoro">Start a collective Pomodoro<small>25 minutes of focus; everyone who stays until the end earns +15 MVC</small></button>
      <p class="cw-error"></p>`);
    const error = view.querySelector('.cw-error');
    const need = () => {
      if (!socket) { error.textContent = 'This needs the multiplayer server.'; return false; }
      if (currentTable !== table) { error.textContent = `Walk into the ${tableName(table)} area first.`; return false; }
      return true;
    };
    view.querySelector('[data-go="commit"]').addEventListener('click', () => {
      if (!need()) return;
      socket.emit('cowork_commit', (reply = {}) => {
        if (reply.error) { error.textContent = reply.error; return; }
        close();
        hooks.system('Code committed: +3 MVC.');
      });
    });
    view.querySelector('[data-go="board"]').addEventListener('click', () => { if (need()) openBoard(table); });
    view.querySelector('[data-go="pomodoro"]').addEventListener('click', () => {
      if (!need()) return;
      socket.emit('cowork_pomodoro_start', (reply = {}) => {
        if (reply.error) { error.textContent = reply.error; return; }
        close();
      });
    });
  }

  // Shared code board: what anyone at the table types reaches the others
  let boardSendTimer = null;
  function openBoard(table) {
    const view = open(`<h3>Code board · ${tableName(table)}</h3><p class="cw-sub">Shared live with everyone at this table · Esc to close</p>
      <textarea class="cw-code" spellcheck="false" placeholder="// Write together here"></textarea><p class="cw-note"></p>`, true);
    const area = view.querySelector('textarea');
    const note = view.querySelector('.cw-note');
    area.value = boardText;
    area.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') { event.preventDefault(); const start = area.selectionStart; area.setRangeText('  ', start, area.selectionEnd, 'end'); area.dispatchEvent(new Event('input')); }
    });
    area.addEventListener('input', () => {
      boardText = area.value;
      clearTimeout(boardSendTimer);
      boardSendTimer = setTimeout(() => { if (socket && currentTable === table) socket.emit('cowork_board', { text: boardText }); }, 250);
      note.textContent = 'Saved for the table';
    });
    area.focus();
  }

  function receiveBoard({ table, text, by }) {
    if (table !== currentTable) return;
    boardText = text;
    const area = overlay && overlay.querySelector('textarea.cw-code');
    if (area && document.activeElement !== area) area.value = text;
    else if (area) {
      const { selectionStart, selectionEnd } = area;
      area.value = text;
      area.setSelectionRange(Math.min(selectionStart, text.length), Math.min(selectionEnd, text.length));
    }
    const note = overlay && overlay.querySelector('.cw-note');
    if (note && by) note.textContent = `Last edit by ${by}`;
  }

  // Collabs & Jobs: the cards and the form to post one (20 MVC)
  function openCollabs() {
    const list = collabs.map((card) => `<div class="cw-collab"><b>${esc(card.title)}</b>
      ${card.roles ? `<p>Looking for: ${esc(card.roles)}</p>` : ''}<p>${esc(card.description)}</p>
      ${card.repo ? `<a href="${esc(card.repo)}" target="_blank" rel="noopener noreferrer nofollow">${esc(card.repo)}</a>` : ''}
      <p style="color:#7d8aa3;font-size:12px">by ${esc(card.author)} · ${new Date(card.createdAt).toLocaleDateString()}</p></div>`).join('') || '<p class="cw-sub">No cards yet.</p>';
    const view = open(`<h3>Collabs & Jobs</h3><p class="cw-sub">Find partners for open source projects. Cards stay for 14 days.</p>${list}
      <form><h3 style="margin-top:18px">Post a card (20 MVC)</h3>
      <label>Project title</label><input name="title" maxlength="40" required autocomplete="off">
      <label>Looking for (roles)</label><input name="roles" maxlength="60" placeholder="e.g. React dev, Three.js, designer" autocomplete="off">
      <label>Short description</label><textarea class="cw-field" name="description" maxlength="140" rows="2" required></textarea>
      <label>Repository (https://, optional)</label><input name="repo" type="url" maxlength="200" placeholder="https://github.com/you/project" autocomplete="off">
      <p class="cw-error"></p><div class="cw-actions"><button type="button" class="cw-cancel">Close</button><button type="submit" class="cw-go">Post for 20 MVC</button></div></form>`, true);
    const form = view.querySelector('form');
    const error = view.querySelector('.cw-error');
    view.querySelector('.cw-cancel').addEventListener('click', close);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!socket) { error.textContent = 'Posting needs the multiplayer server.'; return; }
      const repo = form.repo.value.trim();
      if (repo && !/^https:\/\/\S+\.\S+/i.test(repo)) { error.textContent = 'The repository link must start with https://'; return; }
      socket.emit('collab_post', { title: form.title.value, roles: form.roles.value, description: form.description.value, repo }, (reply = {}) => {
        if (reply.error) { error.textContent = reply.error; return; }
        close();
        hooks.system('Your card is on the Collabs & Jobs board.');
      });
    });
  }

  function setCollabs(list) {
    if (!Array.isArray(list)) return;
    collabs = list;
    collabBoards.forEach(drawCollabBoard);
  }

  // --------------------------------------------------------------------------
  // Zones and the Pomodoro chip, every frame
  // --------------------------------------------------------------------------
  function zoneAt(position) {
    for (const zone of zones) {
      zone.marker.getWorldPosition(probe);
      if (Math.abs(position.x - probe.x) <= zone.halfW && Math.abs(position.z - probe.z) <= zone.halfD && Math.abs(position.y - probe.y) < 4) return zone.table;
    }
    return null;
  }

  function enterTable(table) {
    currentTable = table;
    boardText = '';
    pomodoro = { running: false, endsAt: 0 };
    if (ui) {
      ui.zone.style.display = table ? 'block' : 'none';
      ui.zone.textContent = table ? `Private zone: ${tableName(table)} · chat only reaches this table` : '';
    }
    if (!socket) return;
    socket.emit('cowork_zone', table, (reply = {}) => {
      if (!reply.ok || reply.table !== currentTable) return;
      if (reply.board) boardText = reply.board.text || '';
      if (reply.pomodoro) receivePomodoro(reply.pomodoro);
    });
    if (table) hooks.system(`You joined ${tableName(table)}: the chat is private to this table. E on a laptop for pair programming.`);
    else hooks.system('You left the coworking table: the chat is public again.');
  }

  function receivePomodoro(data) {
    if (!data || data.table !== currentTable) return;
    const wasRunning = pomodoro.running;
    pomodoro = { running: data.running, endsAt: data.endsAt };
    if (data.running && !wasRunning) { setStatus('focus', true); hooks.system(`Collective Pomodoro started${data.startedBy ? ` by ${data.startedBy}` : ''}: 25 minutes of focus.`); }
    if (data.done) { setStatus('available', true); hooks.system('Pomodoro finished! Everyone who stayed earned +15 MVC.'); }
  }

  let lastCheck = 0;
  function update(position) {
    if (!position) return;
    const now = performance.now();
    if (now - lastCheck > 250) {
      lastCheck = now;
      const table = zoneAt(position);
      if (table !== currentTable) enterTable(table);
    }
    if (ui) {
      const left = pomodoro.running ? Math.max(0, pomodoro.endsAt - Date.now()) : 0;
      ui.pomodoro.style.display = pomodoro.running && currentTable ? 'block' : 'none';
      if (pomodoro.running) ui.pomodoro.textContent = `Pomodoro · ${tableName(currentTable)} · ${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    }
  }

  function connect(networkSocket, options = {}) {
    hooks = { ...hooks, ...options };
    socket = networkSocket || null;
    buildHud();
    applyStatus(hooks.localRecord(), status);
    if (!socket) return;
    socket.on('cowork_board', receiveBoard);
    socket.on('cowork_pomodoro', receivePomodoro);
    socket.on('cowork_event', ({ table, text }) => { if (table === currentTable) hooks.system(text); });
    socket.on('collabs_state', setCollabs);
    socket.emit('collabs_list', setCollabs);
    socket.on('peer_status', ({ id, status: value }) => applyStatus(hooks.peers()[id], value));
    socket.emit('set_status', status);
    // Peers that were already here: their status comes with the pool
    socket.on('sync_entire_developer_pool', (developers) => setTimeout(() => developers.forEach((peer) => { if (peer.status) applyStatus(hooks.peers()[peer.id], peer.status); }), 0));
    socket.on('new_developer_joined', (peer) => setTimeout(() => applyStatus(hooks.peers()[peer.id], peer.status || 'available'), 0));
  }

  // Distance to the nearest coworking table (for the typing sounds)
  function distanceToTables(position) {
    let best = Infinity;
    zones.forEach((zone) => { zone.marker.getWorldPosition(probe); best = Math.min(best, Math.hypot(position.x - probe.x, position.z - probe.z), Math.abs(position.y - probe.y) > 6 ? Infinity : best); });
    return best;
  }

  return { connect, update, close, isOpen: () => Boolean(overlay), currentTable: () => currentTable, tableName, distanceToTables };
})();
