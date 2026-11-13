// ============================================================================
// TECH SQUARE: TIMES SQUARE-STYLE DISTRICT WITH LIVE DATA BILLBOARDS
// ============================================================================
// Giant LED screens fed by the server (feeds.js): the GitHub Mural (latest
// commits & PRs of famous repos, flashing with fireworks on new commits), the
// Big Tech Scoreboard (3D stock bars, only with a FINNHUB_API_KEY) and the Dev
// Trends feed (Hacker News, Stack Overflow, r/programming).
const TechSquare = (() => {
  const { material, glow, mesh, box, cylinder, animate, textSprite, repeated, windowsTexture, roundedSlab } = PropKit.kit;
  const screens = { mural: [], scoreboard: [], trends: [], ticker: [] };
  let feeds = null;
  const stockBars = [];
  const fireworks = [];
  let fireworksScene = null;
  let flashUntil = 0;

  function ledCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return { canvas, ctx: canvas.getContext('2d'), texture };
  }

  function timeAgo(timestamp) {
    if (!timestamp) return 'waiting for data...';
    const minutes = Math.round((Date.now() - timestamp) / 60000);
    return minutes < 1 ? 'updated just now' : `updated ${minutes} min ago`;
  }

  function header(ctx, w, title, color, updatedAt) {
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, w, 90);
    ctx.fillStyle = color;
    ctx.font = 'bold 54px Segoe UI, Arial, sans-serif';
    ctx.fillText(title, 30, 62);
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(w - 210, 45, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9d1d9';
    ctx.font = '26px Segoe UI, Arial, sans-serif';
    ctx.fillText(`LIVE · ${timeAgo(updatedAt)}`.slice(0, 32), w - 190, 55);
  }

  function drawMural(screen) {
    const { ctx, canvas, texture } = screen;
    const w = canvas.width;
    const h = canvas.height;
    const flashing = performance.now() < flashUntil && Math.floor(performance.now() / 200) % 2 === 0;
    ctx.fillStyle = flashing ? '#1f6feb' : '#0d1117';
    ctx.fillRect(0, 0, w, h);
    const github = feeds && feeds.github;
    header(ctx, w, 'GitHub Mural', '#ffffff', github && github.updatedAt);
    ctx.font = '28px Consolas, monospace';
    if (!github || (!github.commits.length && github.error)) {
      ctx.fillStyle = '#8b949e';
      ctx.fillText(github && github.error ? github.error.slice(0, 60) : 'Connecting to the GitHub API...', 30, 160);
    } else {
      ctx.fillStyle = '#7ee787';
      ctx.fillText('Latest commits', 30, 140);
      github.commits.slice(0, 7).forEach((commit, index) => {
        ctx.fillStyle = '#d29922';
        ctx.fillText(commit.sha, 30, 185 + index * 40);
        ctx.fillStyle = '#58a6ff';
        ctx.fillText(commit.repo.split('/')[1].padEnd(7, ' ').slice(0, 7), 160, 185 + index * 40);
        ctx.fillStyle = '#e6edf3';
        ctx.fillText(commit.message.slice(0, 52), 300, 185 + index * 40);
      });
      ctx.fillStyle = '#a371f7';
      ctx.fillText('Open pull requests', 30, 480);
      github.pulls.slice(0, 3).forEach((pull, index) => {
        ctx.fillStyle = '#e6edf3';
        ctx.fillText(`#${pull.number} ${pull.repo.split('/')[1]}: ${pull.title}`.slice(0, 70), 30, 525 + index * 40);
      });
    }
    texture.needsUpdate = true;
  }

  function drawScoreboard(screen) {
    const { ctx, canvas, texture } = screen;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#071018';
    ctx.fillRect(0, 0, w, h);
    const stocks = feeds && feeds.stocks;
    header(ctx, w, 'Big Tech Scoreboard · Nasdaq', '#ffffff', stocks && stocks.updatedAt);
    if (!stocks || !stocks.quotes.length) {
      ctx.fillStyle = '#8b949e';
      ctx.font = '30px Segoe UI, Arial, sans-serif';
      ctx.fillText(stocks && stocks.error ? stocks.error : 'Waiting for quotes...', 30, 170);
      ctx.fillText('Get a free key at finnhub.io and start the server with', 30, 230);
      ctx.fillStyle = '#7ee787';
      ctx.font = '28px Consolas, monospace';
      ctx.fillText('FINNHUB_API_KEY=your_key npm start', 30, 280);
    } else {
      stocks.quotes.forEach((quote, index) => {
        const y = 150 + index * 70;
        const up = quote.change >= 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 34px Segoe UI, Arial, sans-serif';
        ctx.fillText(quote.symbol, 30, y);
        ctx.font = '30px Segoe UI, Arial, sans-serif';
        ctx.fillStyle = '#c9d1d9';
        ctx.fillText(quote.name, 170, y);
        ctx.fillText(`$${quote.price.toFixed(2)}`, 470, y);
        ctx.fillStyle = up ? '#3fb950' : '#f85149';
        ctx.fillText(`${up ? '▲' : '▼'} ${quote.percent.toFixed(2)}%`, 690, y);
      });
    }
    texture.needsUpdate = true;
    updateStockBars();
  }

  function drawTrends(screen) {
    const { ctx, canvas, texture } = screen;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#140d1f';
    ctx.fillRect(0, 0, w, h);
    const trends = feeds && feeds.trends;
    header(ctx, w, 'Dev Trending Topics', '#ffffff', trends && trends.updatedAt);
    const colors = { 'Hacker News': '#ff6600', 'Stack Overflow': '#f48024', 'r/programming': '#ff4500' };
    if (!trends || !trends.items.length) {
      ctx.fillStyle = '#8b949e';
      ctx.font = '30px Segoe UI, Arial, sans-serif';
      ctx.fillText(trends && trends.error ? trends.error : 'Loading trends...', 30, 170);
    } else {
      trends.items.slice(0, 11).forEach((item, index) => {
        const y = 140 + index * 44;
        ctx.fillStyle = colors[item.source] || '#ffffff';
        ctx.font = 'bold 24px Segoe UI, Arial, sans-serif';
        ctx.fillText(item.source, 30, y);
        ctx.fillStyle = '#f0f6fc';
        ctx.font = '26px Segoe UI, Arial, sans-serif';
        ctx.fillText(item.title.slice(0, 58), 230, y);
      });
    }
    texture.needsUpdate = true;
  }

  function drawTicker(screen, offset) {
    const { ctx, canvas, texture } = screen;
    const w = canvas.width;
    const h = canvas.height;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    const parts = [];
    if (feeds) {
      (feeds.stocks.quotes || []).forEach((quote) => parts.push(`${quote.symbol} ${quote.price.toFixed(2)} ${quote.change >= 0 ? '▲' : '▼'}${Math.abs(quote.percent).toFixed(2)}%`));
      (feeds.github.commits || []).slice(0, 4).forEach((commit) => parts.push(`${commit.repo}: ${commit.message}`));
      (feeds.trends.items || []).slice(0, 4).forEach((item) => parts.push(`${item.source}: ${item.title}`));
    }
    const text = parts.length ? `${parts.join('   ◆   ')}   ◆   ` : 'GitHub Multiverse · Tech Square · live data loading...   ◆   ';
    ctx.font = 'bold 60px Segoe UI, Arial, sans-serif';
    ctx.fillStyle = '#ffd43b';
    const textWidth = ctx.measureText(text).width;
    const x = -(offset % textWidth);
    ctx.fillText(text, x, h * 0.68);
    ctx.fillText(text, x + textWidth, h * 0.68);
    texture.needsUpdate = true;
  }

  // Boards used outside Tech Square (Panorama Deck): Hall of Fame and Newsroom
  const newsBoards = [];
  function board(kind) {
    const led = ledCanvas(1024, 576);
    if (kind === 'newsroom') {
      newsBoards.push(led);
      drawNewsroom(led);
    } else {
      const drawFame = (entries) => {
        const { ctx, canvas, texture } = led;
        ctx.fillStyle = '#1b1208';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffd166';
        ctx.font = 'bold 60px Georgia, serif';
        ctx.fillText('Hall of Fame', 40, 80);
        ctx.font = '28px Segoe UI, Arial, sans-serif';
        ctx.fillStyle = '#e9d8b4';
        ctx.fillText('Creators of the month · most commits shipped from laptops', 40, 130);
        ctx.font = 'bold 36px Segoe UI, Arial, sans-serif';
        const list = (entries || []).slice(0, 6);
        if (!list.length) { ctx.fillStyle = '#c9b48a'; ctx.fillText('Be the first: sit at a laptop (E) and commit!', 40, 220); }
        list.forEach(([name, commits], index) => {
          ctx.fillStyle = index === 0 ? '#ffd166' : '#ffffff';
          ctx.fillText(`${index + 1}. ${name}`, 40, 210 + index * 58);
          ctx.fillText(`${commits} commits`, 720, 210 + index * 58);
        });
        texture.needsUpdate = true;
      };
      drawFame([]);
      window.commitBoards = window.commitBoards || [];
      window.commitBoards.push(drawFame);
    }
    return led.texture;
  }

  function drawNewsroom(led) {
    const { ctx, canvas, texture } = led;
    ctx.fillStyle = '#0d1b3e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px Segoe UI, Arial, sans-serif';
    ctx.fillText('Newsroom', 40, 80);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(330, 40, 110, 46);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px Segoe UI, Arial, sans-serif';
    ctx.fillText('LIVE', 352, 74);
    const items = (feeds && feeds.trends && feeds.trends.items) || [];
    ctx.font = '30px Segoe UI, Arial, sans-serif';
    if (!items.length) ctx.fillText(feeds && feeds.trends && feeds.trends.error ? feeds.trends.error : 'Loading dev news...', 40, 170);
    items.slice(0, 8).forEach((item, index) => {
      ctx.fillStyle = '#7fb3ff';
      ctx.fillText(item.source, 40, 160 + index * 52);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(item.title.slice(0, 44), 260, 160 + index * 52);
    });
    texture.needsUpdate = true;
  }

  function redrawAll() {
    newsBoards.forEach(drawNewsroom);
    screens.mural.forEach(drawMural);
    screens.scoreboard.forEach(drawScoreboard);
    screens.trends.forEach(drawTrends);
  }

  function updateStockBars() {
    const quotes = (feeds && feeds.stocks.quotes) || [];
    stockBars.forEach((bar, index) => {
      const quote = quotes[index];
      const percent = quote ? quote.percent : 0;
      const height = quote ? Math.max(0.6, 4 + percent * 2.5) : 0.6;
      bar.mesh.scale.y = height;
      bar.mesh.position.y = height / 2;
      bar.mesh.material = glow(quote ? (percent >= 0 ? '#2ea043' : '#da3633') : '#30363d', 0.6);
      bar.label.material.map = PropKit.kit.labelTexture(quote ? `${quote.symbol} ${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%` : bar.symbol, { bg: '#0d1117', fg: '#ffffff', width: 256, height: 64, font: 'bold 34px Segoe UI, Arial' });
      bar.label.position.y = height + 1.2;
    });
  }

  // Simple particle fireworks above the mural when a famous repo gets a new commit
  function launchFireworks(origin) {
    if (!fireworksScene) return;
    for (let burst = 0; burst < 5; burst++) {
      const count = 80;
      const positions = new Float32Array(count * 3);
      const velocities = [];
      const center = origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 25 + Math.random() * 15, (Math.random() - 0.5) * 10));
      for (let i = 0; i < count; i++) {
        positions.set([center.x, center.y, center.z], i * 3);
        const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 6);
        velocities.push(direction);
      }
      const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.9, 0.6), size: 0.8, transparent: true }));
      fireworksScene.add(points);
      fireworks.push({ points, velocities, born: performance.now() + burst * 350 });
    }
  }

  function update(time, deltaSeconds) {
    screens.ticker.forEach((screen) => drawTicker(screen, time * 220));
    if (performance.now() < flashUntil) screens.mural.forEach(drawMural);
    for (let i = fireworks.length - 1; i >= 0; i--) {
      const firework = fireworks[i];
      const age = (performance.now() - firework.born) / 1000;
      if (age < 0) { firework.points.visible = false; continue; }
      firework.points.visible = true;
      const positions = firework.points.geometry.attributes.position;
      firework.velocities.forEach((velocity, index) => {
        velocity.y -= 9 * deltaSeconds;
        positions.setXYZ(index, positions.getX(index) + velocity.x * deltaSeconds, positions.getY(index) + velocity.y * deltaSeconds, positions.getZ(index) + velocity.z * deltaSeconds);
      });
      positions.needsUpdate = true;
      firework.points.material.opacity = Math.max(0, 1 - age / 2.2);
      if (age > 2.2) { fireworksScene.remove(firework.points); fireworks.splice(i, 1); }
    }
  }

  // --------------------------------------------------------------------------
  // Builders
  // --------------------------------------------------------------------------
  const builders = {
    // A tower wrapped by a giant LED screen of the given kind
    ledTower(group, { w, h, d, color, data, block }) {
      const kind = (data && data.screen) || 'mural';
      const facing = Math.atan2(-block.position[0], -block.position[2]);
      const inner = new THREE.Group();
      inner.rotation.y = facing;
      const body = roundedSlab(w, h, d, Math.min(w, d) * 0.1, new THREE.MeshStandardMaterial({ map: repeated(windowsTexture('#1b2230', '#8ab4ff'), 3, Math.round(h / 4)), roughness: 0.3, metalness: 0.5 }));
      body.position.y = -h / 2;
      inner.add(body);
      const screenWidth = w * 0.95;
      const screenHeight = Math.min(h * 0.45, screenWidth * 0.62);
      const led = ledCanvas(1024, Math.round(1024 * screenHeight / screenWidth));
      const screenMesh = box(screenWidth, screenHeight, 0.3, new THREE.MeshBasicMaterial({ map: led.texture }), 0, h * 0.12, d / 2 + 0.3);
      inner.add(screenMesh);
      inner.add(box(screenWidth + 0.6, screenHeight + 0.6, 0.3, material('#111111', { metalness: 0.6 }), 0, h * 0.12, d / 2 + 0.1));
      // Neon trim
      const trim = box(w + 0.4, 0.3, d + 0.4, glow(color || '#1877f2', 1.4), 0, h * 0.12 - screenHeight / 2 - 0.8, 0);
      inner.add(trim);
      group.add(inner);
      screens[kind].push(led);
      if (kind === 'mural') { drawMural(led); screenMesh.userData.label = 'GitHub Mural: live commits and pull requests'; }
      if (kind === 'scoreboard') { drawScoreboard(led); screenMesh.userData.label = 'Big Tech Scoreboard (Finnhub quotes)'; }
      if (kind === 'trends') { drawTrends(led); screenMesh.userData.label = 'Dev Trending Topics: Hacker News, Stack Overflow, r/programming'; }
      group.userData.label = screenMesh.userData.label;
    },

    // Curved ticker band wrapping a round tower
    tickerTower(group, { w, h, color }) {
      const radius = w / 2;
      group.add(cylinder(radius, radius, h, new THREE.MeshStandardMaterial({ map: repeated(windowsTexture('#202838', '#ffd27a'), 6, Math.round(h / 4)), roughness: 0.3, metalness: 0.5 }), 0, 0, 0, 32));
      const led = ledCanvas(4096, 128);
      const band = mesh(new THREE.CylinderGeometry(radius + 0.3, radius + 0.3, 2.4, 48, 1, true), new THREE.MeshBasicMaterial({ map: led.texture, side: THREE.DoubleSide }), 0, h * 0.2, 0);
      group.add(band);
      group.add(cylinder(radius + 0.5, radius + 0.5, 0.3, glow(color || '#ffd43b', 1.4), 0, h * 0.2 + 1.4, 0, 48));
      group.add(cylinder(radius + 0.5, radius + 0.5, 0.3, glow(color || '#ffd43b', 1.4), 0, h * 0.2 - 1.4, 0, 48));
      screens.ticker.push(led);
    },

    // 3D stock bars (height = today's % change), only real data
    stockPodium(group, { w, d }) {
      group.add(box(w, 0.6, d, material('#161b22'), 0, 0.3, 0));
      ['AAPL', 'GOOGL', 'NVDA', 'MSFT', 'META', 'AMZN'].forEach((symbol, index) => {
        const bar = box(1.8, 1, 1.8, glow('#30363d', 0.6), -w / 2 + 1.6 + index * ((w - 3.2) / 5), 0.5, 0);
        const holder = new THREE.Group();
        holder.position.y = 0.6;
        holder.add(bar);
        const label = textSprite(symbol, { width: 3, background: 'rgba(13, 17, 23, 0.9)' });
        label.position.set(bar.position.x, 2, 0);
        holder.add(label);
        group.add(holder);
        stockBars.push({ mesh: bar, label, symbol });
      });
      updateStockBars();
    },

    neonArch(group, { w, h, color, label }) {
      const arch = mesh(new THREE.TorusGeometry(w / 2, 0.35, 10, 48, Math.PI), glow(color || '#1877f2', 1.6));
      group.add(arch);
      const sign = textSprite(label || 'TECH SQUARE', { width: w * 0.7, background: 'rgba(24, 119, 242, 0.9)' });
      sign.position.y = w / 2 + 2;
      group.add(sign);
      animate(arch, (time) => { arch.material.emissiveIntensity = 1.2 + Math.sin(time * 3) * 0.5; });
    }
  };

  const rules = [
    [/shibuya_building/, 'shibuyaBuilding'], [/events_screen/, 'eventsScreen'], [/universe_replays/, 'universeReplays'], [/roadster_reel/, 'roadsterReel'], [/apple_reel/, 'appleReel'],[/led_tower/, 'ledTower'], [/ticker_tower/, 'tickerTower'], [/stock_podium/, 'stockPodium'], [/neon_arch/, 'neonArch']];
  // ---------------------------------------------------------------------------
  // GitHub events screen: countdown to the next annual event (GitHub Universe),
  // a LIVE badge while it happens, and the official livestream on the screen
  // when its YouTube link is added to maps/github_events.json
  // ---------------------------------------------------------------------------
  function youtubeId(url) {
    const match = /(?:v=|youtu\.be\/|\/live\/|\/embed\/)([\w-]{11})/.exec(url || '');
    return match ? match[1] : null;
  }

  // Replays of past GitHub Universe opening keynotes, autoplaying (muted) nearby
  function universeReplays(group, { w, h, data }) {
    const steel = material('#2b2d33', { metalness: 0.8, roughness: 0.35 });
    [-1, 1].forEach((side) => group.add(box(0.5, h, 0.5, steel, side * (w / 2 + 0.25), h / 2, 0)));
    const screenHeight = w * 9 / 16;
    const screen = box(w, screenHeight, 0.2, material('#000000'), 0, h - screenHeight / 2 - 0.3, 0);
    group.add(screen);
    const videos = (data && data.videos) || ['P6Va0_KILi4', 'dSf8QOjazrQ', 'NrQkdDVupQE'];
    VideoScreens.register(screen, w, screenHeight, VideoScreens.youtubeEmbed(videos), { distance: 90 });
    const caption = textSprite('GitHub Universe · keynote replays (V for sound)', { width: 9, background: 'rgba(45, 27, 78, 0.92)' });
    caption.position.set(0, h + 0.8, 0.2);
    group.add(caption);
    group.userData.label = 'GitHub Universe keynote replays';
  }

  // Tesla Roadster reel: one screen playing the flying-Roadster clips of several
  // official videos back to back (reel.html streams each clip from YouTube's
  // player; nothing is downloaded). The clips live in maps/github_events.json
  // under "roadsterReel" so their start and end seconds are easy to adjust.
  function roadsterReel(group, { w, h }) {
    const steel = material('#2b2d33', { metalness: 0.8, roughness: 0.35 });
    [-1, 1].forEach((side) => group.add(box(0.5, h, 0.5, steel, side * (w / 2 + 0.25), h / 2, 0)));
    const screenHeight = w * 9 / 16;
    const screen = box(w, screenHeight, 0.2, material('#000000'), 0, h - screenHeight / 2 - 0.3, 0);
    group.add(screen);
    group.add(box(w + 0.6, 0.3, 0.6, glow('#e82127', 1.4), 0, h - screenHeight - 0.6, 0));
    const caption = textSprite('Roadster in space · reel (V for sound)', { width: 8, background: 'rgba(130, 16, 22, 0.92)' });
    caption.position.set(0, h + 0.8, 0.2);
    group.add(caption);
    group.userData.label = 'Tesla Roadster reel';
    fetch('maps/github_events.json').then((response) => response.json()).then((data) => {
      const clips = ((data.roadsterReel && data.roadsterReel.clips) || [])
        .map((clip) => ({ id: youtubeId(clip.video) || (/^[\w-]{11}$/.test(clip.video || '') ? clip.video : null), start: Math.max(0, Math.floor(clip.start || 0)), end: clip.end ? Math.floor(clip.end) : '' }))
        .filter((clip) => clip.id);
      if (!clips.length) return;
      const reel = clips.map((clip) => `${clip.id}:${clip.start}-${clip.end}`).join(',');
      VideoScreens.register(screen, w, screenHeight, `reel.html?s=${encodeURIComponent(reel)}&mute=1`, { distance: 90 });
    }).catch(() => {});
  }

  // Apple animations reel: official Apple animation videos back to back (only
  // the animated parts; clips and their start/end seconds live in
  // maps/github_events.json under "appleReel")
  function appleReel(group, { w, h }) {
    const aluminum = material('#c9ccd1', { metalness: 0.85, roughness: 0.3 });
    [-1, 1].forEach((side) => group.add(box(0.5, h, 0.5, aluminum, side * (w / 2 + 0.25), h / 2, 0)));
    const screenHeight = w * 9 / 16;
    const screen = box(w, screenHeight, 0.2, material('#000000'), 0, h - screenHeight / 2 - 0.3, 0);
    group.add(screen);
    group.add(box(w + 0.6, 0.3, 0.6, glow('#f5f5f7', 1.2), 0, h - screenHeight - 0.6, 0));
    const caption = textSprite('Apple animations · reel (V for sound)', { width: 8, background: 'rgba(29, 29, 31, 0.92)' });
    caption.position.set(0, h + 0.8, 0.2);
    group.add(caption);
    group.userData.label = 'Apple animations reel';
    fetch('maps/github_events.json').then((response) => response.json()).then((data) => {
      const clips = ((data.appleReel && data.appleReel.clips) || [])
        .map((clip) => ({ id: youtubeId(clip.video) || (/^[\w-]{11}$/.test(clip.video || '') ? clip.video : null), start: Math.max(0, Math.floor(clip.start || 0)), end: clip.end ? Math.floor(clip.end) : '' }))
        .filter((clip) => clip.id);
      if (!clips.length) return;
      const reel = clips.map((clip) => `${clip.id}:${clip.start}-${clip.end}`).join(',');
      VideoScreens.register(screen, w, screenHeight, `reel.html?s=${encodeURIComponent(reel)}&mute=1`, { distance: 90 });
    }).catch(() => {});
  }

  function eventsScreen(group, { w, h }) {
    const steel = material('#2b2d33', { metalness: 0.8, roughness: 0.35 });
    [-1, 1].forEach((side) => group.add(box(0.6, h, 0.6, steel, side * (w / 2 + 0.3), h / 2, 0)));
    group.add(box(w + 1.2, 0.6, 0.6, steel, 0, h, 0));
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 576;
    const texture = new THREE.CanvasTexture(canvas);
    const screenHeight = h * 0.62;
    const screen = box(w, screenHeight, 0.25, [steel, steel, steel, steel, new THREE.MeshBasicMaterial({ map: texture }), steel], 0, h - screenHeight / 2 - 0.4, 0);
    group.add(screen);
    const glowFrame = box(w + 0.3, screenHeight + 0.3, 0.1, PropKit.kit.glow('#a371f7', 1.2), 0, h - screenHeight / 2 - 0.4, -0.15);
    group.add(glowFrame);
    let events = [];
    let video = null;
    fetch('maps/github_events.json').then((response) => response.json()).then((data) => { events = data.events || []; draw(); }).catch(() => {});
    const ctx = canvas.getContext('2d');
    const pad = (n) => String(n).padStart(2, '0');
    function current() {
      const now = Date.now();
      return events.map((event) => ({ ...event, startAt: Date.parse(event.start), endAt: Date.parse(event.end) })).filter((event) => event.endAt > now - 86400000).sort((a, b) => a.startAt - b.startAt)[0];
    }
    function draw() {
      const event = current();
      const now = Date.now();
      const gradient = ctx.createLinearGradient(0, 0, 1024, 576);
      gradient.addColorStop(0, '#0d1117');
      gradient.addColorStop(1, '#2d1b4e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 576);
      for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(163, 113, 247, ${0.05 + (i % 5) * 0.03})`; ctx.beginPath(); ctx.arc((i * 137) % 1024, (i * 91) % 576, 2 + (i % 4), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#a371f7';
      ctx.font = 'bold 30px Segoe UI, Arial, sans-serif';
      ctx.fillText('GITHUB EVENTS · LIVE ON THE MULTIVERSE', 48, 70);
      if (!event) {
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 52px Segoe UI, Arial, sans-serif';
        ctx.fillText('No upcoming event announced yet', 48, 300);
        texture.needsUpdate = true;
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 76px Segoe UI, Arial, sans-serif';
      ctx.fillText(event.name, 48, 190, 930);
      ctx.fillStyle = '#c9d1d9';
      ctx.font = '32px Segoe UI, Arial, sans-serif';
      ctx.fillText(event.location || '', 48, 245, 930);
      const dates = `${new Date(event.startAt).toUTCString().slice(0, 16)} → ${new Date(event.endAt - 1).toUTCString().slice(0, 16)}`;
      ctx.fillText(dates, 48, 292, 930);
      if (now < event.startAt) {
        const left = event.startAt - now;
        const days = Math.floor(left / 86400000);
        const hours = Math.floor((left % 86400000) / 3600000);
        const minutes = Math.floor((left % 3600000) / 60000);
        const seconds = Math.floor((left % 60000) / 1000);
        ctx.fillStyle = '#3fb950';
        ctx.font = 'bold 30px Segoe UI, Arial, sans-serif';
        ctx.fillText('STARTS IN', 48, 380);
        ctx.font = 'bold 96px Consolas, Menlo, monospace';
        ctx.fillText(`${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`, 48, 480);
      } else if (now <= event.endAt) {
        const blink = Math.floor(now / 700) % 2;
        ctx.fillStyle = blink ? '#f85149' : '#da3633';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(48, 340, 300, 90, 20) : ctx.rect(48, 340, 300, 90); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 60px Segoe UI, Arial, sans-serif';
        ctx.fillText('● LIVE', 80, 407);
        ctx.font = '32px Segoe UI, Arial, sans-serif';
        ctx.fillText(youtubeId(event.stream) ? 'The keynote is playing on this screen' : 'Press E to watch on the official site', 380, 400, 600);
      } else {
        ctx.fillStyle = '#8b949e';
        ctx.font = 'bold 44px Segoe UI, Arial, sans-serif';
        ctx.fillText('Thanks for watching! See you next year.', 48, 420);
      }
      texture.needsUpdate = true;
      // Official livestream on the screen while the event is live
      const id = youtubeId(event.stream);
      const live = now >= event.startAt && now <= event.endAt;
      if (live && id && !video) video = VideoScreens.register(screen, w, screenHeight, VideoScreens.youtubeEmbed([id]), { distance: 120 });
      screen.userData.url = event.url;
    }
    screen.userData.url = 'https://githubuniverse.com/';
    screen.userData.label = 'GitHub events screen';
    PropKit.kit.interactive(screen, 'link', 'GitHub events (official site)');
    setInterval(draw, 1000);
    draw();
    group.userData.label = 'GitHub events screen';
  }

  // ---------------------------------------------------------------------------
  // Shibuya-style buildings: colorful facades, vertical neon signs, a white
  // corner store with a big slogan, a pastel striped column and shop windows
  // ---------------------------------------------------------------------------
  const SIGN_WORDS = ['コード', 'カラオケ', 'ラーメン', 'ゲーム', 'デバッグ', 'お店', 'ハッカソン', '飲食店', 'モール', 'アプリ'];
  function verticalSign(text, background, color) {
    return PropKit.kit.canvasTexture(`vsign|${text}|${background}`, 128, 64 + text.length * 100, (ctx, w, h) => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 6;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = color;
      ctx.font = 'bold 84px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      [...text].forEach((char, i) => ctx.fillText(char, w / 2, 82 + i * 100));
    });
  }

  function horizontalSign(text, background, color) {
    return PropKit.kit.canvasTexture(`hsign|${text}|${background}`, 512, 128, (ctx, w, h) => {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = color;
      ctx.font = 'bold 80px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 4);
    });
  }

  function stripedTexture(base, stripe) {
    return PropKit.kit.canvasTexture(`stripes|${base}|${stripe}`, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = stripe;
      for (let y = 0; y < h; y += 32) ctx.fillRect(0, y, w, 12);
    });
  }

  Object.assign(builders, {
    eventsScreen,
    universeReplays,
    roadsterReel,
    appleReel,
    shibuyaBuilding(group, { w, h, d, data }) {
      const variant = (data && data.variant) || 'stripes';
      const seed = (data && data.seed) || 0;
      const palettes = {
        stripes: ['#e8590c', '#ffd8a8'],
        pastel: ['#fff4e6', '#ffa8a8'],
        corner: ['#f8f9fa', '#1c3d6e']
      };
      const [base, accent] = palettes[variant] || palettes.stripes;
      if (variant === 'corner') {
        // White rounded corner store with a slogan, navy curved side and a striped column
        group.add(roundedSlab(w, h, d, 3, material(base, { roughness: 0.5 })));
        group.add(mesh(new THREE.CylinderGeometry(d / 2, d / 2, h, 32, 1, false, 0, Math.PI), material(accent, { roughness: 0.4 }), w / 2, h / 2, 0));
        const slogan = horizontalSign((data && data.slogan) || 'WHATEVER YOU CODE', base, '#1d1d1f');
        group.add(box(w * 0.6, w * 0.15, 0.1, new THREE.MeshBasicMaterial({ map: slogan }), -w * 0.05, h * 0.62, d / 2 + 0.05));
        // Shop window with displays
        group.add(box(w * 0.7, 4.2, 0.1, material('#bfe3ff', { transparent: true, opacity: 0.45, roughness: 0.05 }), -w * 0.05, 2.3, d / 2 + 0.06));
        for (let i = 0; i < 4; i++) group.add(box(1.2, 2.4, 0.1, new THREE.MeshBasicMaterial({ map: BrandLogos.billboardTexture(['GitHub', 'Figma', 'Docker', 'Rust'][i], { tagline: 'merch', background: '#ffffff', foreground: '#1d1d1f', width: 256, height: 512 }) }), -w * 0.3 + i * 2, 1.7, d / 2 - 0.5));
        // Pastel striped column at the corner
        ['#ff8fab', '#69db7c', '#4dabf7'].forEach((color, i) => group.add(box(0.35, h + 1, 0.35, material(color), -w / 2 - 0.6 + i * 0.36, (h + 1) / 2, d / 2 + 0.8)));
        group.add(box(w * 0.5, 2.2, 0.2, new THREE.MeshBasicMaterial({ map: horizontalSign('お店 · DEV STORE', '#1c3d6e', '#69db7c') }), -w * 0.05, h - 1.6, d / 2 + 0.1));
      } else {
        const facade = new THREE.MeshStandardMaterial({ map: repeated(stripedTexture(base, accent), Math.max(1, w / 8), h / 8), roughness: 0.6 });
        group.add(roundedSlab(w, h, d, 0.8, facade));
        // Recessed windows as darker bands with glass
        for (let floor = 1; floor < Math.floor(h / 4); floor++) group.add(box(w * 0.7, 1.6, 0.1, material('#2b3a55', { transparent: true, opacity: 0.85, roughness: 0.1 }), 0, floor * 4 + 1, d / 2 + 0.05));
        // Vertical neon signs on the corners and a horizontal one at the top
        const signColors = [['#ffd43b', '#c92a2a'], ['#ffffff', '#5f3dc4'], ['#ff8fab', '#ffffff'], ['#b2f2bb', '#2b8a3e']];
        [-1, 1].forEach((side, i) => {
          const word = SIGN_WORDS[(seed + i * 3) % SIGN_WORDS.length];
          const [bg, fg] = signColors[(seed + i) % signColors.length];
          const height = word.length * 1.5 + 0.6;
          const sign = box(1.4, height, 0.3, new THREE.MeshBasicMaterial({ map: verticalSign(word, bg, fg) }), side * (w / 2 + 0.3), h * 0.55, d / 2 - 0.4);
          sign.rotation.y = side * Math.PI / 2;
          group.add(sign);
          const light = box(1.5, height + 0.2, 0.1, glow(fg, 0.6), side * (w / 2 + 0.3), h * 0.55, d / 2 - 0.4);
          light.rotation.y = side * Math.PI / 2;
          group.add(light);
        });
        const [bg, fg] = signColors[(seed + 2) % signColors.length];
        group.add(box(w * 0.7, 2, 0.3, new THREE.MeshBasicMaterial({ map: horizontalSign(SIGN_WORDS[(seed + 5) % SIGN_WORDS.length], bg, fg) }), 0, h - 1.4, d / 2 + 0.2));
        // Glowing shop front on the ground floor
        group.add(box(w * 0.8, 3, 0.1, glow('#fff3bf', 0.5), 0, 1.6, d / 2 + 0.06));
      }
    }
  });

  rules.slice().reverse().forEach(([pattern, name]) => PropKit.registerBuilder(pattern, name, builders[name]));

  function init(socket, scene, system) {
    fireworksScene = scene;
    if (!socket) {
      feeds = {
        github: { commits: [], pulls: [], error: 'Live data needs the Node server (npm start)' },
        stocks: { quotes: [], error: 'Live data needs the Node server (npm start)' },
        trends: { items: [], error: 'Live data needs the Node server (npm start)' }
      };
      redrawAll();
      return;
    }
    socket.on('tech_feeds', (snapshot) => { feeds = snapshot; redrawAll(); });
    socket.on('feed_highlight', ({ repo, message }) => {
      flashUntil = performance.now() + 6000;
      system(`New commit on ${repo}: ${message}`);
      const mural = City.districts.find((district) => district.world.key === 'techsquare');
      if (mural) launchFireworks(mural.layout.center);
    });
    setInterval(redrawAll, 60000); // keeps the "updated X min ago" labels fresh
  }

  return { init, update, board };
})();
const TechBoards = { board: (kind) => TechSquare.board(kind) };
