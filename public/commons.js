// ============================================================================
// THE COMMONS: AN OPEN, BRIGHT SPACE FOR HANGING OUT (CURSOR CAMP STYLE)
// ============================================================================
// A wide white plaza with room to move around and things to do: modern
// pergolas with cube tables and laptops (Windows 11 and macOS style desktops
// with a Team Sign-in hub that opens the official sign-in pages), a wooden
// sauna, an open-air micro cinema playing movie clips (louder as you get
// closer, full volume in the seats) and Stack Overflow-style ad boards for
// creative tools and game engines.
(() => {
  const {
    material, glow, mesh, box, cylinder, sphere, facedBox, animate, textSprite, seat, interactive,
    labelTexture, canvasTexture, repeated, plankTexture, stuccoTexture, concreteTexture
  } = PropKit.kit;

  // Clips for the open-air cinema (played back to back, YouTube player)
  const CINEMA_CLIPS = ['b2f2Kqt_KcE', 'cbAfhBNQ2qU', '7lVp_JW7HIY', 'xVhdV6z1tsk', 'ifwngc8FHZM', 'uXGE0vuuaDo', '7DXP7HsnL2A', 'tjMGuJMIgwM', '1bMYtYSqXns', 'fbLP345xThk', 'QEbDoad7o8o', '0dsvhatg29s'];

  // Ad boards in the style of the sidebar ads on Stack Overflow: a white card,
  // a small "Advertisement" tag, the product in its color, one line and a button
  const ADS = [
    { name: 'Unity', color: '#222c37', accent: '#ffffff', line: 'Build 2D, 3D, AR and VR games once and ship them everywhere.', cta: 'Get Unity', url: 'https://unity.com/' },
    { name: 'Blender', color: '#e87d0d', accent: '#ffffff', line: 'Free and open source 3D creation: modeling, sculpting, animation and rendering.', cta: 'Download Blender', url: 'https://www.blender.org/' },
    { name: 'Cinema 4D', color: '#0b3c8c', accent: '#ffffff', line: 'Motion graphics and 3D for designers, from Maxon.', cta: 'Try Cinema 4D', url: 'https://www.maxon.net/cinema-4d' },
    { name: 'Unreal Engine', color: '#0e1128', accent: '#ffffff', line: 'Photoreal real-time 3D: Nanite, Lumen and MetaHumans.', cta: 'Get Unreal Engine', url: 'https://www.unrealengine.com/' },
    { name: 'Godot Engine', color: '#478cbf', accent: '#ffffff', line: 'Open source 2D and 3D game engine. No fees, no royalties.', cta: 'Download Godot', url: 'https://godotengine.org/' },
    { name: 'Houdini', color: '#ff4713', accent: '#ffffff', line: 'Procedural VFX, simulations and worlds from SideFX.', cta: 'Learn Houdini', url: 'https://www.sidefx.com/' },
    { name: 'GameMaker', color: '#1d1f2b', accent: '#38f28a', line: 'Make 2D games fast, from prototype to console.', cta: 'Start making', url: 'https://gamemaker.io/' },
    { name: 'Substance 3D', color: '#3c1d5c', accent: '#ffffff', line: 'Texture and material tools for 3D artists.', cta: 'Explore Substance', url: 'https://www.adobe.com/products/substance3d.html' }
  ];

  function adTexture(ad) {
    return canvasTexture(`devad|${ad.name}`, 512, 640, (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#d6d9dc';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#6a737c';
      ctx.font = '20px Segoe UI, Arial, sans-serif';
      ctx.fillText('Advertisement', 28, 44);
      // Product banner in its own colors (name set in type, no logo artwork)
      ctx.fillStyle = ad.color;
      ctx.fillRect(28, 70, w - 56, 230);
      ctx.fillStyle = ad.accent;
      ctx.textAlign = 'center';
      ctx.font = `bold ${ad.name.length > 10 ? 50 : 62}px Segoe UI, Arial, sans-serif`;
      ctx.fillText(ad.name, w / 2, 200, w - 90);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#232629';
      ctx.font = '27px Segoe UI, Arial, sans-serif';
      const words = ad.line.split(' ');
      let line = '';
      let y = 360;
      words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > w - 56) { ctx.fillText(line, 28, y); y += 36; line = word; } else line = test;
      });
      if (line) ctx.fillText(line, 28, y);
      ctx.fillStyle = '#0a95ff';
      ctx.fillRect(28, h - 112, w - 56, 64);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.font = '600 28px Segoe UI, Arial, sans-serif';
      ctx.fillText(ad.cta, w / 2, h - 70);
    });
  }

  // ---------------------------------------------------------------------------
  // Overlays: ad card and the laptop desktops
  // ---------------------------------------------------------------------------
  const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function overlayStyle() {
    if (document.getElementById('commons-style')) return;
    const style = document.createElement('style');
    style.id = 'commons-style';
    style.textContent = `
      #commons-overlay { position: fixed; inset: 0; z-index: 95; display: flex; align-items: center; justify-content: center; background: rgba(8, 12, 20, 0.55); font-family: "Segoe UI", -apple-system, BlinkMacSystemFont, Arial, sans-serif; }
      #commons-overlay .cm-card { width: min(420px, calc(100% - 32px)); padding: 22px; border-radius: 16px; background: #fff; color: #232629; box-shadow: 0 20px 50px rgba(0,0,0,0.45); }
      #commons-overlay .cm-card h3 { margin: 0 0 8px; }
      #commons-overlay .cm-card p { margin: 0 0 12px; line-height: 1.5; color: #3b4045; }
      #commons-overlay .cm-warn { font-size: 12.5px; color: #6a737c !important; }
      #commons-overlay .cm-row { display: flex; gap: 10px; justify-content: flex-end; }
      #commons-overlay .cm-row button, #commons-overlay .cm-row a { padding: 9px 16px; border-radius: 8px; border: 0; font: 600 14px inherit; cursor: pointer; text-decoration: none; }
      #commons-overlay .cm-close { background: #e3e6e8; color: #232629; }
      #commons-overlay .cm-go { background: #0a95ff; color: #fff; }
      /* Desktop window */
      #commons-overlay .os { position: relative; width: min(1100px, calc(100vw - 24px)); height: min(680px, calc(100vh - 24px)); border-radius: 12px; overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,0.6); color: #1b1b1f; user-select: none; }
      #commons-overlay .os.win { background: radial-gradient(1200px 700px at 70% 120%, #2b6be3 0%, #0b3a9c 35%, #0a1f5c 70%), #0a1f5c; font-family: "Segoe UI Variable", "Segoe UI", Arial, sans-serif; }
      #commons-overlay .os.mac { background: linear-gradient(160deg, #1f2b6c 0%, #6a3fb5 45%, #f28aa0 80%, #ffcf8a 100%); font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif; }
      #commons-overlay .win .taskbar { position: absolute; left: 0; right: 0; bottom: 0; height: 48px; background: rgba(32, 32, 40, 0.78); backdrop-filter: blur(20px); display: flex; align-items: center; justify-content: center; gap: 6px; }
      #commons-overlay .win .taskbar .tb { width: 40px; height: 40px; border-radius: 6px; display: grid; place-items: center; cursor: pointer; }
      #commons-overlay .win .taskbar .tb:hover { background: rgba(255,255,255,0.1); }
      #commons-overlay .win .tray { position: absolute; right: 12px; bottom: 0; height: 48px; display: flex; align-items: center; gap: 12px; color: #fff; font-size: 12px; text-align: right; }
      #commons-overlay .win .start { position: absolute; left: 50%; bottom: 58px; transform: translateX(-50%); width: 560px; max-width: calc(100% - 24px); padding: 24px; border-radius: 10px; background: rgba(40, 40, 48, 0.92); backdrop-filter: blur(30px); color: #fff; display: none; }
      #commons-overlay .win .start.open { display: block; }
      #commons-overlay .win .start input { width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.06); color: #fff; margin-bottom: 18px; }
      #commons-overlay .win .pins { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; }
      #commons-overlay .win .pin { text-align: center; font-size: 11px; cursor: pointer; padding: 8px 2px; border-radius: 6px; }
      #commons-overlay .win .pin:hover { background: rgba(255,255,255,0.08); }
      #commons-overlay .win .pin i, #commons-overlay .mac .dock i { display: block; width: 34px; height: 34px; margin: 0 auto 6px; border-radius: 8px; }
      #commons-overlay .mac .menubar { position: absolute; left: 0; right: 0; top: 0; height: 26px; background: rgba(255,255,255,0.28); backdrop-filter: blur(20px); display: flex; align-items: center; gap: 18px; padding: 0 14px; font-size: 13px; color: #111; }
      #commons-overlay .mac .menubar b { font-weight: 700; }
      #commons-overlay .mac .menubar .right { margin-left: auto; }
      #commons-overlay .mac .dock { position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%); display: flex; gap: 8px; padding: 8px 10px; border-radius: 18px; background: rgba(255,255,255,0.3); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.35); }
      #commons-overlay .mac .dock div { cursor: pointer; transition: transform 0.12s; }
      #commons-overlay .mac .dock div:hover { transform: translateY(-6px) scale(1.12); }
      #commons-overlay .mac .dock i { width: 48px; height: 48px; margin: 0; border-radius: 12px; }
      #commons-overlay .window { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); width: 560px; max-width: calc(100% - 40px); border-radius: 10px; overflow: hidden; background: #f3f3f3; box-shadow: 0 20px 60px rgba(0,0,0,0.45); }
      #commons-overlay .mac .window { border-radius: 12px; background: #ececec; }
      #commons-overlay .window .bar { height: 34px; display: flex; align-items: center; padding: 0 12px; font-size: 12px; color: #333; background: #ffffff; }
      #commons-overlay .win .window .bar { justify-content: space-between; }
      #commons-overlay .win .window .bar span { display: flex; gap: 18px; font-size: 14px; }
      #commons-overlay .mac .window .bar { gap: 8px; background: #e6e6e6; }
      #commons-overlay .mac .window .bar .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
      #commons-overlay .window .body { padding: 20px; }
      #commons-overlay .window h2 { margin: 0 0 4px; font-size: 20px; font-weight: 600; }
      #commons-overlay .window p { margin: 0 0 14px; color: #555; font-size: 13px; line-height: 1.5; }
      #commons-overlay .accounts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      #commons-overlay .account { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 8px; background: #fff; border: 1px solid #ddd; cursor: pointer; text-decoration: none; color: #1b1b1f; font-size: 13px; }
      #commons-overlay .account:hover { border-color: #0a64d8; background: #f7faff; }
      #commons-overlay .account i { width: 26px; height: 26px; border-radius: 6px; display: grid; place-items: center; color: #fff; font: 700 13px Arial, sans-serif; font-style: normal; flex: none; }
      #commons-overlay .note { margin-top: 12px; font-size: 11.5px; color: #6b6b6b; }
      #commons-overlay .closeos { position: absolute; right: 10px; top: 8px; z-index: 3; border: 0; background: rgba(0,0,0,0.45); color: #fff; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
    `;
    document.head.appendChild(style);
  }
  let overlay = null;
  function close() { if (overlay) { overlay.remove(); overlay = null; } }
  function show(html) {
    overlayStyle();
    close();
    overlay = document.createElement('div');
    overlay.id = 'commons-overlay';
    overlay.innerHTML = html;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    document.body.appendChild(overlay);
    return overlay;
  }
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && overlay) close(); });

  function showAd(ad) {
    const view = show(`<div class="cm-card"><h3>${esc(ad.name)}</h3><p>${esc(ad.line)}</p><p class="cm-warn">Opens the official site in a new tab.</p>
      <div class="cm-row"><button class="cm-close" type="button">Close</button><a class="cm-go" href="${esc(ad.url)}" target="_blank" rel="noopener noreferrer">${esc(ad.cta)}</a></div></div>`);
    view.querySelector('.cm-close').addEventListener('click', close);
  }

  // Team Sign-in: each account opens its OFFICIAL sign-in page in a new tab.
  // No password is ever typed into the game.
  const ACCOUNTS = [
    ['Google Workspace', '#1a73e8', 'G', 'https://accounts.google.com/'],
    ['GitHub', '#24292f', 'GH', 'https://github.com/login'],
    ['Microsoft 365', '#d83b01', 'M', 'https://www.office.com/'],
    ['Slack', '#4a154b', 'S', 'https://slack.com/signin'],
    ['Figma', '#a259ff', 'F', 'https://www.figma.com/login'],
    ['Notion', '#000000', 'N', 'https://www.notion.so/login'],
    ['GitLab', '#fc6d26', 'GL', 'https://gitlab.com/users/sign_in'],
    ['Jira', '#0052cc', 'J', 'https://id.atlassian.com/login']
  ];
  function signInWindow(os) {
    const bar = os === 'win'
      ? '<div class="bar"><b style="font-weight:600">Team Sign-in</b><span><em>&#8211;</em><em>&#9633;</em><em class="x" style="cursor:pointer">&#10005;</em></span></div>'
      : '<div class="bar"><i class="dot x" style="background:#ff5f57;cursor:pointer"></i><i class="dot" style="background:#febc2e"></i><i class="dot" style="background:#28c840"></i><b style="margin-left:auto;margin-right:auto;font-weight:600">Team Sign-in</b></div>';
    return `<div class="window">${bar}<div class="body"><h2>Work on your team's projects</h2>
      <p>Pick where your team works. The official sign-in page opens in a new tab, so your password only goes to that company.</p>
      <div class="accounts">${ACCOUNTS.map(([name, color, letter, url]) => `<a class="account" href="${url}" target="_blank" rel="noopener noreferrer"><i style="background:${color}">${letter}</i>${name}</a>`).join('')}</div>
      <div class="note">GitHub Multiverse never asks for these passwords.</div></div></div>`;
  }
  const tile = (color, label = '') => `<i style="background:${color}" title="${label}"></i>`;
  function openDesktop(os) {
    const clock = new Date();
    const time = clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const date = clock.toLocaleDateString();
    let html;
    if (os === 'win') {
      const icons = [['#ffffff00', 'Start'], ['#3a3a44', 'Search'], ['#f9c440', 'File Explorer'], ['#0f6cbd', 'Edge'], ['#2b2b2b', 'Terminal'], ['#5b5fc7', 'Teams'], ['#107c10', 'Team Sign-in']];
      html = `<div class="os win"><button class="closeos" type="button">Close (Esc)</button>
        ${signInWindow('win')}
        <div class="start"><input placeholder="Search for apps, settings, and documents"><div style="font-size:13px;font-weight:600;margin-bottom:12px">Pinned</div>
          <div class="pins">${[['#0f6cbd', 'Edge'], ['#107c10', 'Team Sign-in'], ['#f9c440', 'Explorer'], ['#2b2b2b', 'Terminal'], ['#5b5fc7', 'Teams'], ['#0078d4', 'Settings'], ['#ca5010', 'Office'], ['#038387', 'Calculator'], ['#8764b8', 'Photos'], ['#e3008c', 'Paint'], ['#4f6bed', 'VS Code'], ['#24292f', 'GitHub Desktop']].map(([c, n]) => `<div class="pin" data-app="${n}">${tile(c)}${n}</div>`).join('')}</div></div>
        <div class="taskbar">${icons.map(([c, n], i) => `<div class="tb" data-app="${n}" title="${n}">${i === 0 ? '<svg width="22" height="22" viewBox="0 0 22 22"><rect x="1" y="1" width="9.5" height="9.5" rx="1.5" fill="#4cc2ff"/><rect x="11.5" y="1" width="9.5" height="9.5" rx="1.5" fill="#4cc2ff"/><rect x="1" y="11.5" width="9.5" height="9.5" rx="1.5" fill="#4cc2ff"/><rect x="11.5" y="11.5" width="9.5" height="9.5" rx="1.5" fill="#4cc2ff"/></svg>' : `<i style="display:block;width:24px;height:24px;border-radius:5px;background:${c}"></i>`}</div>`).join('')}</div>
        <div class="tray"><span>ENG</span><span>${time}<br>${date}</span></div></div>`;
    } else {
      const dock = [['#0a84ff', 'Finder'], ['#34c759', 'Team Sign-in'], ['#1e90ff', 'Safari'], ['#ff9f0a', 'Notes'], ['#1c1c1e', 'Terminal'], ['#bf5af2', 'Xcode'], ['#ff375f', 'Music'], ['#8e8e93', 'System Settings']];
      html = `<div class="os mac"><button class="closeos" type="button">Close (Esc)</button>
        <div class="menubar"><svg width="13" height="15" viewBox="0 0 13 15"><circle cx="6.5" cy="8.5" r="5.5" fill="#111"/><circle cx="9" cy="2.5" r="1.6" fill="#111"/></svg><b>Team Sign-in</b><span>File</span><span>Edit</span><span>View</span><span>Window</span><span>Help</span><span class="right">${clock.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}  ${time}</span></div>
        ${signInWindow('mac')}
        <div class="dock">${dock.map(([c, n]) => `<div data-app="${n}" title="${n}">${tile(c, n)}</div>`).join('')}</div></div>`;
    }
    const view = show(html);
    const desktop = view.querySelector('.os');
    view.querySelector('.closeos').addEventListener('click', close);
    const windowEl = () => desktop.querySelector('.window');
    desktop.addEventListener('click', (event) => {
      if (event.target.closest('.x')) { const w = windowEl(); if (w) w.style.display = 'none'; return; }
      const app = event.target.closest('[data-app]');
      if (!app) return;
      const name = app.dataset.app;
      const start = desktop.querySelector('.start');
      if (name === 'Start') { start.classList.toggle('open'); return; }
      if (start) start.classList.remove('open');
      if (name === 'Team Sign-in') { const w = windowEl(); if (w) w.style.display = ''; }
      else if (os === 'mac' && typeof MacDemo !== 'undefined' && ['Finder', 'Safari', 'Notes', 'Terminal', 'System Settings'].includes(name)) { close(); MacDemo.open(name === 'System Settings' ? 'Settings' : name); }
    });
  }

  // ---------------------------------------------------------------------------
  // Builders
  // ---------------------------------------------------------------------------
  const builders = {
    // Wide, bright floor with soft paths, the open space of the Commons
    commonsFloor(group, { w, h, d }) {
      const floor = new THREE.MeshStandardMaterial({ map: repeated(stuccoTexture('#f4f5f7'), w / 8, d / 8), roughness: 0.85 });
      group.add(box(w, h, d, floor, 0, 0, 0));
      const path = new THREE.MeshStandardMaterial({ map: repeated(concreteTexture('#e3e6ea'), 2, d / 6), roughness: 0.8 });
      group.add(box(5, h + 0.02, d * 0.9, path, 0, 0, 0));
      group.add(box(w * 0.9, h + 0.02, 5, path, 0, 0, 0));
      const caption = textSprite('The Commons', { width: 12 });
      caption.position.set(0, 12, 0);
      group.add(caption);
      group.userData.label = 'The Commons';
    },

    // Modern condo-style pergola: slim aluminum posts, a louvered roof and two
    // cube tables with a laptop each (Windows on one, macOS on the other)
    modernPergola(group, { w, h, d }) {
      const base = -h / 2;
      const alu = material('#2f3237', { metalness: 0.6, roughness: 0.35 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => group.add(box(0.22, h, 0.22, alu, sx * (w / 2 - 0.2), 0, sz * (d / 2 - 0.2))));
      group.add(box(w, 0.28, 0.22, alu, 0, h / 2 - 0.14, -d / 2 + 0.2));
      group.add(box(w, 0.28, 0.22, alu, 0, h / 2 - 0.14, d / 2 - 0.2));
      const slats = new THREE.Group();
      for (let x = -w / 2 + 0.4; x <= w / 2 - 0.3; x += 0.55) {
        const slat = box(0.16, 0.32, d - 0.4, material('#3a3e45', { metalness: 0.55, roughness: 0.35 }), x, h / 2 - 0.2, 0);
        slat.rotation.z = 0.35;
        slats.add(slat);
      }
      group.add(PropKit.kit.mergeByMaterial(slats));
      // Wood deck under the pergola
      group.add(box(w - 0.2, 0.12, d - 0.2, new THREE.MeshStandardMaterial({ map: repeated(plankTexture('#b98a5c'), w / 3, d / 3), roughness: 0.7 }), 0, base + 0.06, 0));
      const cube = new THREE.MeshStandardMaterial({ map: repeated(concreteTexture('#d9dcdf'), 1, 1), roughness: 0.8 });
      [['win', -w * 0.24], ['mac', w * 0.24]].forEach(([os, x]) => {
        group.add(box(1.4, 0.9, 1.4, cube, x, base + 0.57, 0));
        [-1, 1].forEach((side) => {
          group.add(box(0.5, 0.45, 0.5, cube, x + side * 1.2, base + 0.35, 0.2));
          group.add(seat(x + side * 1.2, base + 0.6, 0.2, 'Cube stool'));
        });
        const laptop = new THREE.Group();
        const shell = material(os === 'mac' ? '#c9ccd1' : '#2d2f33', { metalness: 0.7, roughness: 0.3 });
        laptop.add(box(0.62, 0.03, 0.42, shell, 0, 0.015, 0));
        const lid = new THREE.Group();
        lid.add(box(0.62, 0.4, 0.02, shell, 0, 0.2, 0));
        const screen = canvasTexture(`osscreen|${os}`, 256, 160, (ctx, sw, sh) => {
          const gradient = ctx.createLinearGradient(0, 0, sw, sh);
          if (os === 'win') { gradient.addColorStop(0, '#0a1f5c'); gradient.addColorStop(1, '#2b6be3'); } else { gradient.addColorStop(0, '#1f2b6c'); gradient.addColorStop(0.5, '#6a3fb5'); gradient.addColorStop(1, '#ffcf8a'); }
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, sw, sh);
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          if (os === 'win') ctx.fillRect(sw * 0.3, sh - 16, sw * 0.4, 10);
          else { ctx.fillRect(0, 0, sw, 8); ctx.fillRect(sw * 0.25, sh - 18, sw * 0.5, 12); }
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 16px Segoe UI, Arial, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Team Sign-in', sw / 2, sh / 2);
        });
        lid.add(box(0.58, 0.36, 0.005, new THREE.MeshBasicMaterial({ map: screen }), 0, 0.2, 0.012));
        lid.position.z = -0.2;
        lid.rotation.x = -0.22;
        laptop.add(lid);
        laptop.position.set(x, base + 1.03, 0);
        interactive(laptop, 'action', os === 'win' ? 'Windows laptop · Team Sign-in' : 'Mac · Team Sign-in');
        laptop.userData.onInteract = () => { openDesktop(os); return null; };
        group.add(laptop);
      });
      // Two simple pendant lamps
      [-1, 1].forEach((side) => {
        group.add(cylinder(0.01, 0.01, 0.8, alu, side * w * 0.24, h / 2 - 0.6, 0, 4));
        group.add(sphere(0.18, glow('#fff1cf', 1.1), side * w * 0.24, h / 2 - 1.05, 0, 12));
      });
      group.userData.label = 'Pergola workspace';
    },

    // Wooden sauna: cedar walls, glass door, tiered benches, a stove with hot
    // stones and steam that rises out of the roof vent
    sauna(group, { w, h, d }) {
      const base = -h / 2;
      const cedar = new THREE.MeshStandardMaterial({ map: repeated(plankTexture('#a86a3d'), w / 2, h / 2), roughness: 0.75 });
      const dark = new THREE.MeshStandardMaterial({ map: repeated(plankTexture('#7a4a28'), w / 2, 1), roughness: 0.8 });
      group.add(box(w, 0.2, d, dark, 0, base + 0.1, 0));
      group.add(box(w, h, 0.25, cedar, 0, 0, -d / 2));
      [-1, 1].forEach((side) => group.add(box(0.25, h, d, cedar, side * w / 2, 0, 0)));
      [-1, 1].forEach((side) => group.add(box(w / 2 - 0.6, h, 0.25, cedar, side * (w / 4 + 0.3), 0, d / 2)));
      group.add(box(1.2, h - 2.1, 0.25, cedar, 0, base + 2.1 + (h - 2.1) / 2, d / 2));
      group.add(box(1.1, 2.0, 0.06, material('#c9e6f2', { transparent: true, opacity: 0.35, roughness: 0.05 }), 0, base + 1.05, d / 2 + 0.05));
      const roof = box(w + 0.6, 0.3, d + 0.6, dark, 0, h / 2 + 0.15, 0);
      group.add(roof);
      // Tiered benches
      [[0.45, d * 0.32], [0.95, d * 0.12]].forEach(([y, z], tier) => {
        group.add(box(w - 0.8, 0.12, 0.7, cedar, 0, base + y, -z));
        for (let x = -w / 2 + 1.2; x <= w / 2 - 1.2; x += 1.1) group.add(seat(x, base + y + 0.25, -z, tier ? 'Upper sauna bench' : 'Sauna bench'));
      });
      // Stove with glowing stones
      group.add(box(0.8, 0.9, 0.6, material('#2b2b2b', { metalness: 0.6 }), w / 2 - 0.8, base + 0.65, d / 2 - 0.8));
      for (let i = 0; i < 7; i++) group.add(sphere(0.12, glow(i % 2 ? '#ff7b39' : '#c94a1c', 0.9), w / 2 - 1.0 + (i % 4) * 0.13, base + 1.15, d / 2 - 0.9 + Math.floor(i / 4) * 0.15, 6));
      // Steam puffs from the roof vent
      const puffs = [];
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#ffffff', transparent: true, opacity: 0.4, depthWrite: false }));
        puff.raycast = () => {};
        group.add(puff);
        puffs.push(puff);
      }
      group.add(box(0.5, 0.4, 0.5, dark, w / 2 - 0.8, h / 2 + 0.5, d / 2 - 0.8));
      animate(roof, (time) => puffs.forEach((puff, i) => {
        const t = (time * 0.35 + i / puffs.length) % 1;
        puff.position.set(w / 2 - 0.8 + Math.sin(t * 6 + i) * 0.3, h / 2 + 0.8 + t * 3.5, d / 2 - 0.8);
        puff.scale.setScalar(0.6 + t * 1.6);
        puff.material.opacity = 0.45 * (1 - t);
      }));
      const sign = textSprite('Sauna · 80 °C', { width: 4.5 });
      sign.position.set(0, h / 2 + 1.2, d / 2 + 0.3);
      group.add(sign);
      group.userData.label = 'Sauna';
    },

    // Open-air micro cinema: a big screen on a frame, deck chairs and beanbags
    // on the lawn, string lights; clips play with sound that fades with distance
    outdoorCinema(group, { w, h, d }) {
      const base = -h / 2;
      const frame = material('#1e2126', { metalness: 0.5, roughness: 0.5 });
      const screenW = w * 0.62;
      const screenH = screenW * 9 / 16;
      const screenY = base + 2.2 + screenH / 2;
      const screenZ = -d / 2 + 1;
      [-1, 1].forEach((side) => group.add(box(0.3, screenY + screenH / 2 + 0.4 - base, 0.3, frame, side * (screenW / 2 + 0.4), (screenY + screenH / 2 + 0.4 + base) / 2, screenZ)));
      group.add(box(screenW + 1.1, 0.3, 0.3, frame, 0, screenY + screenH / 2 + 0.35, screenZ));
      const screen = box(screenW, screenH, 0.08, material('#0a0a0a'), 0, screenY, screenZ + 0.12);
      group.add(screen);
      VideoScreens.register(screen, screenW, screenH, VideoScreens.youtubeEmbed(CINEMA_CLIPS), { distance: 140, spatial: { full: d * 0.55, fade: 120 } });
      // Lawn and seats
      group.add(box(w, 0.06, d * 0.75, material('#6fae4f', { roughness: 1 }), 0, base + 0.03, d * 0.1));
      const canvas = material('#f2efe6', { roughness: 0.9 });
      const wood = material('#a0764d', { roughness: 0.7 });
      const colors = ['#e8590c', '#1c7ed6', '#f59f00', '#d6336c', '#2f9e44'];
      let n = 0;
      for (let row = 0; row < 3; row++) {
        for (let x = -screenW / 2 + 1.2; x <= screenW / 2 - 1.2; x += 2.4) {
          const z = -d / 2 + 9 + row * 3.2;
          if (row === 0) {
            // Beanbags in front
            const bag = sphere(0.7, material(colors[n % colors.length], { roughness: 1 }), x, base + 0.42, z, 12);
            bag.scale.set(1, 0.6, 1);
            group.add(bag);
            group.add(seat(x, base + 0.7, z, 'Beanbag'));
          } else {
            group.add(box(0.7, 0.06, 0.9, canvas, x, base + 0.45, z));
            const back = box(0.7, 0.8, 0.06, canvas, x, base + 0.8, z + 0.5);
            back.rotation.x = -0.35;
            group.add(back);
            [-0.35, 0.35].forEach((dx) => group.add(box(0.05, 0.5, 1, wood, x + dx, base + 0.25, z + 0.1)));
            group.add(seat(x, base + 0.7, z, 'Deck chair'));
          }
          n++;
        }
      }
      // String lights between two poles
      [-1, 1].forEach((side) => group.add(cylinder(0.06, 0.08, 4.5, frame, side * w * 0.48, base + 2.25, d * 0.2, 6)));
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        group.add(sphere(0.08, glow('#ffe8a3', 1.4), -w * 0.48 + t * w * 0.96, base + 4.3 - Math.sin(t * Math.PI) * 0.7, d * 0.2, 6));
      }
      // Projector booth at the back
      group.add(box(1.4, 1.2, 1.2, material('#30343a'), 0, base + 0.6, d / 2 - 1));
      group.add(cylinder(0.18, 0.18, 0.4, glow('#d0ebff', 1.2), 0, base + 1.0, d / 2 - 1.65, 10));
      const caption = textSprite('Open-air cinema · movie clips (sound up close)', { width: 10 });
      caption.position.set(0, screenY + screenH / 2 + 1.6, screenZ);
      group.add(caption);
      group.userData.label = 'Open-air cinema';
    },

    // A row of Stack Overflow-style ad boards (creative tools and game engines)
    devAds(group, { w, h }) {
      const post = material('#2f3237', { metalness: 0.6, roughness: 0.4 });
      const count = Math.max(1, Math.min(ADS.length, Math.floor(w / 3.2)));
      for (let i = 0; i < count; i++) {
        const ad = ADS[i];
        const x = -w / 2 + (i + 0.5) * (w / count);
        group.add(box(0.12, h, 0.12, post, x, 0, -0.1));
        const board = facedBox(2.4, 3, 0.12, material('#ffffff'), new THREE.MeshBasicMaterial({ map: adTexture(ad) }), x, h / 2 - 1.7, 0);
        interactive(board, 'action', `Ad · ${ad.name}`);
        board.userData.onInteract = () => { showAd(ad); return null; };
        group.add(board);
      }
      group.userData.label = 'Developer ads';
    }
  };

  // Cave paintings about code: ochre, red and charcoal strokes on rock, like
  // prehistoric art (people at laptops, braces, a git branch, a hunted bug)
  function caveArt(seed) {
    return canvasTexture(`caveart|${seed}`, 512, 256, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const ochre = ['#a0522d', '#8b2e16', '#c27c3a', '#2b211c'];
      const pick = (i) => ochre[(seed + i) % ochre.length];
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.85;
      const person = (x, y, s, color) => {
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 5 * s;
        ctx.beginPath(); ctx.arc(x, y - 52 * s, 9 * s, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y - 42 * s); ctx.lineTo(x, y - 10 * s); ctx.lineTo(x - 12 * s, y + 14 * s); ctx.moveTo(x, y - 10 * s); ctx.lineTo(x + 12 * s, y + 14 * s);
        ctx.moveTo(x, y - 32 * s); ctx.lineTo(x + 22 * s, y - 22 * s); ctx.stroke();
      };
      const laptop = (x, y, color) => { ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(x, y - 30, 40, 26); ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 46, y); ctx.stroke(); };
      const scene = seed % 4;
      if (scene === 0) {
        person(90, 190, 1, pick(0)); laptop(110, 180, pick(0));
        person(260, 190, 1, pick(1)); laptop(280, 180, pick(1));
        ctx.font = 'bold 64px Georgia, serif'; ctx.fillStyle = pick(2); ctx.fillText('{ }', 380, 140);
      } else if (scene === 1) {
        // A git history: a main line with a branch and a merge
        ctx.strokeStyle = pick(0); ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(40, 150); ctx.lineTo(470, 150); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(140, 150); ctx.quadraticCurveTo(200, 70, 270, 80); ctx.lineTo(330, 80); ctx.quadraticCurveTo(380, 80, 400, 150); ctx.stroke();
        ctx.fillStyle = pick(1);
        [70, 140, 210, 400, 450].forEach((x) => { ctx.beginPath(); ctx.arc(x, 150, 12, 0, Math.PI * 2); ctx.fill(); });
        [270, 330].forEach((x) => { ctx.beginPath(); ctx.arc(x, 80, 12, 0, Math.PI * 2); ctx.fill(); });
      } else if (scene === 2) {
        // The hunt: devs with spears chasing a giant bug
        person(70, 200, 1.1, pick(0)); person(150, 205, 1, pick(0));
        ctx.strokeStyle = pick(3); ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(100, 140); ctx.lineTo(230, 110); ctx.moveTo(175, 150); ctx.lineTo(260, 120); ctx.stroke();
        ctx.fillStyle = pick(1);
        ctx.beginPath(); ctx.ellipse(360, 150, 70, 42, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(445, 140, 22, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = pick(1); ctx.lineWidth = 5;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(320 + i * 40, 185); ctx.lineTo(305 + i * 40, 225); ctx.moveTo(320 + i * 40, 115); ctx.lineTo(305 + i * 40, 80); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(455, 122); ctx.lineTo(480, 90); ctx.moveTo(462, 130); ctx.lineTo(495, 112); ctx.stroke();
      } else {
        // Hand prints and symbols: </>, if, 0 1, a semicolon
        ctx.fillStyle = pick(1);
        [[60, 120], [130, 90]].forEach(([x, y]) => {
          ctx.beginPath(); ctx.ellipse(x, y + 40, 26, 32, 0, 0, Math.PI * 2); ctx.fill();
          for (let f = 0; f < 5; f++) { ctx.beginPath(); ctx.ellipse(x - 26 + f * 13, y + (f === 0 ? 30 : 0), 6, 18, (f - 2) * 0.15, 0, Math.PI * 2); ctx.fill(); }
        });
        ctx.fillStyle = pick(2);
        ctx.font = 'bold 70px Georgia, serif';
        ctx.fillText('</>', 220, 130);
        ctx.font = 'bold 46px Georgia, serif';
        ctx.fillText('if', 400, 110);
        ctx.fillText('0 1 1 0 ;', 230, 215);
      }
    });
  }

  // Minecraft-like cave entrance in the site's style: a mound of stone blocks
  // with a dark opening, a corridor into a chamber lit by torches, and cave
  // paintings about code on its walls
  builders.codeCave = function codeCave(group, { w, h }) {
    const base = -h / 2;
    const size = 1.6;
    const cells = Math.floor(w / size);
    const half = cells / 2;
    const stone = new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.graniteTexture ? PropKit.kit.graniteTexture('#8d8f91') : concreteTexture('#8d8f91'), 1, 1), roughness: 0.9 });
    const moss = new THREE.MeshStandardMaterial({ map: repeated(PropKit.kit.grassTexture ? PropKit.kit.grassTexture('#6a9a4a') : concreteTexture('#6a9a4a'), 1, 1), roughness: 1 });
    const spots = [];
    const tops = [];
    for (let i = 0; i < cells; i++) {
      for (let j = 0; j < cells; j++) {
        const x = (i - half + 0.5) * size;
        const z = (j - half + 0.5) * size;
        const r = Math.hypot(x, z) / (w / 2);
        if (r > 1) continue;
        const bumps = Math.sin(i * 0.9) * 0.6 + Math.cos(j * 0.7 + i * 0.3) * 0.6;
        const columns = Math.max(1, Math.round((1 - r * r) * (h / size) + bumps));
        for (let k = 0; k < columns; k++) {
          const y = base + (k + 0.5) * size;
          // Corridor from the south edge into the chamber, and the chamber itself
          const inCorridor = Math.abs(x) < 1.7 && z > 0 && k < 2;
          const inChamber = Math.hypot(x, z + 1) < 5.2 && k < 3;
          if (inCorridor || inChamber) continue;
          (k === columns - 1 ? tops : spots).push([x, y, z]);
        }
      }
    }
    const geometry = new THREE.BoxGeometry(size, size, size);
    [[spots, stone], [tops, moss]].forEach(([list, blockMaterial]) => {
      const blocks = new THREE.InstancedMesh(geometry, blockMaterial, list.length);
      const m = new THREE.Matrix4();
      list.forEach(([x, y, z], index) => blocks.setMatrixAt(index, m.makeTranslation(x, y, z)));
      blocks.castShadow = true;
      blocks.receiveShadow = true;
      group.add(blocks);
    });
    // Dark floor of the cave and the paintings on the chamber walls
    group.add(box(9, 0.1, 13, material('#3b342e', { roughness: 1 }), 0, base + 0.05, 1.5));
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI * 0.7 + i * (Math.PI * 0.6 / 3) + Math.PI * 0.2;
      const art = mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: caveArt(i), transparent: true, roughness: 1, depthWrite: false }), Math.cos(angle) * 4.95, base + 2.4, -1 + Math.sin(angle) * 4.95);
      art.lookAt(0, base + 2.4, -1);
      art.raycast = () => {};
      group.add(art);
    }
    // Torches at the entrance and inside
    [[-1.9, base + 2, 7.2], [1.9, base + 2, 7.2], [-3.5, base + 2.2, -1], [3.5, base + 2.2, -1]].forEach(([x, y, z]) => {
      group.add(cylinder(0.06, 0.06, 0.7, material('#5d4037'), x, y, z, 6));
      group.add(sphere(0.16, glow('#ffb347', 2.2), x, y + 0.42, z, 8));
    });
    const sign = textSprite('Code Cave · cave paintings of the first devs', { width: 8 });
    sign.position.set(0, base + h + 2, 6);
    group.add(sign);
    group.userData.label = 'Code Cave';
  };

  [[/code_cave/, 'codeCave'], [/commons_floor/, 'commonsFloor'], [/modern_pergola/, 'modernPergola'], [/^sauna/, 'sauna'], [/outdoor_cinema/, 'outdoorCinema'], [/dev_ads/, 'devAds']]
    .forEach(([pattern, name]) => PropKit.registerBuilder(pattern, name, builders[name]));

  window.CommonsUI = { close, isOpen: () => Boolean(overlay), openDesktop };
})();
