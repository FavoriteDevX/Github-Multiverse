// ============================================================================
// BRAND LOGOS: REAL LOGOS FROM SIMPLE ICONS (CC0), LOADED AT RUNTIME FROM A CDN
// ============================================================================
// The SVGs used by the Multiverse are bundled in public/vendor/simple-icons.json
// (CC0, works offline); any other slug falls back to the Simple Icons CDN.
// Brands that asked Simple Icons to remove their logo (e.g. OpenAI, AWS,
// Microsoft, LinkedIn, Oracle, Adobe, Salesforce) keep a text wordmark.
const BrandLogos = (() => {
  // Every logo used in the world, bundled in one file: { slug: "<svg ...>" }
  let localIconsPromise = null;
  function localIcons() {
    if (!localIconsPromise) localIconsPromise = fetch('vendor/simple-icons.json').then((response) => (response.ok ? response.json() : {})).catch(() => ({}));
    return localIconsPromise;
  }
  const SIMPLE_ICONS_CDN = 'https://cdn.jsdelivr.net/npm/simple-icons@16.33.0/icons';
  // Brand name -> Simple Icons slug (only brands available in the library)
  const SLUGS = {
    GitHub: 'github', Docker: 'docker', Kubernetes: 'kubernetes', 'Node.js': 'nodedotjs', Python: 'python',
    TypeScript: 'typescript', Rust: 'rust', React: 'react', Linux: 'linux', Git: 'git', npm: 'npm',
    'Stack Overflow': 'stackoverflow', Anthropic: 'anthropic', Claude: 'claude', NVIDIA: 'nvidia',
    'Google Cloud': 'googlecloud', Google: 'google', Apple: 'apple', Meta: 'meta', Vercel: 'vercel',
    Figma: 'figma', Postman: 'postman', Uber: 'uber', Tesla: 'tesla', HP: 'hp', Intel: 'intel',
    Cisco: 'cisco', Netflix: 'netflix', eBay: 'ebay', EA: 'ea', 'Electronic Arts': 'ea', Googleplex: 'google',
    macOS: 'macos', 'App Store': 'appstore', Safari: 'safari', Xcode: 'xcode', Swift: 'swift', iCloud: 'icloud', iOS: 'ios',
    Unity: 'unity', Blender: 'blender', 'Cinema 4D': 'cinema4d', 'Unreal Engine': 'unrealengine', Godot: 'godotengine', 'Godot Engine': 'godotengine',
    'Apple Music': 'applemusic', 'Apple TV': 'appletv', 'Apple Arcade': 'applearcade', 'Apple Pay': 'applepay', iMessage: 'imessage', 'Apple News': 'applenews', 'Apple Podcasts': 'applepodcasts'
  };
  const svgCache = new Map();

  // Brands that asked Simple Icons to remove their logo: their official logo
  // can be dropped into public/assets/logos/<key>.svg (or .png) by the owner
  const OWNER_LOGOS = {
    OpenAI: 'openai', Microsoft: 'microsoft', 'Microsoft Azure': 'azure', Azure: 'azure', AWS: 'aws', Amazon: 'amazon',
    Oracle: 'oracle', Adobe: 'adobe', LinkedIn: 'linkedin', Salesforce: 'salesforce'
  };

  function slugFor(name) {
    return SLUGS[name] || OWNER_LOGOS[name] || null;
  }

  function imageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  }

  // Owner-provided files: official logos (assets/logos) and real ads (assets/ads/brands)
  const ownerFiles = new Map();
  // Finds an owner file by its name in any format: "macbook-air" matches
  // macbook-air.png, MacBook Air.jpg, macbook_air.webp... Resolves with the URL,
  // or rejects when the file was not added (no request is made for it)
  const normalize = (name) => name.toLowerCase().replace(/\.(png|jpe?g|webp|svg)$/, '').replace(/[\s_]+/g, '-');
  let ownerListing = null;
  function findOwnerAsset(folder, name) {
    if (!ownerListing) ownerListing = fetch('/api/owner-assets').then((response) => (response.ok ? response.json() : null)).catch(() => null);
    return ownerListing.then((listing) => {
      const wanted = normalize(name);
      // Without the Node server (static hosting) try the name exactly as given
      if (!listing) return /\.(png|jpe?g|webp|svg)$/i.test(name) ? `assets/${folder}/${encodeURIComponent(name)}` : Promise.reject(new Error('no listing'));
      const match = (listing[folder] || []).find((file) => normalize(file) === wanted);
      return match ? `assets/${folder}/${encodeURIComponent(match)}` : Promise.reject(new Error('not added'));
    });
  }
  function ownerImage(path) {
    if (!ownerFiles.has(path)) ownerFiles.set(path, imageFromUrl(path));
    return ownerFiles.get(path);
  }

  // Fetches the SVG once and recolors it (Simple Icons ship single-color paths)
  function loadLogoImage(slug, color) {
    const key = `${slug}|${color}`;
    if (!svgCache.has(key) && Object.values(OWNER_LOGOS).includes(slug)) {
      // Official logo files keep their own colors
      svgCache.set(key, findOwnerAsset('logos', slug).then(ownerImage));
    }
    if (!svgCache.has(key)) {
      const fromCdn = () => fetch(`${SIMPLE_ICONS_CDN}/${slug}.svg`).then((response) => (response.ok ? response.text() : Promise.reject(new Error(response.status))));
      svgCache.set(key, localIcons().then((icons) => icons[slug] || fromCdn()).catch(fromCdn)
        .then((svg) => new Promise((resolve, reject) => {
          const colored = svg.replace('<svg ', `<svg fill="${color}" width="512" height="512" `);
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(colored)}`;
        })));
    }
    return svgCache.get(key);
  }

  // A canvas texture showing the brand: logo (when available) + name + tagline.
  // It renders the wordmark immediately and redraws once the logo arrives.
  function billboardTexture(name, { tagline = '', background = '#24292f', foreground = '#ffffff', width = 1024, height = 512, layout = 'billboard', logoSlug = null } = {}) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;

    const draw = (logo) => {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, background);
      gradient.addColorStop(1, new THREE.Color(background).offsetHSL(0, 0, 0.1).getStyle());
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = foreground;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (layout === 'logo') {
        // Just the logo, centered on a transparent background
        ctx.clearRect(0, 0, width, height);
        if (logo) ctx.drawImage(logo, width * 0.1, height * 0.1, width * 0.8, height * 0.8);
        else { ctx.font = `bold ${Math.floor(height * 0.2)}px Helvetica, Arial, sans-serif`; ctx.fillText(name, width / 2, height / 2); }
      } else if (layout === 'sign') {
        // Building sign: logo on the left, name on the right
        const logoSize = height * 0.7;
        if (logo) ctx.drawImage(logo, height * 0.15, height * 0.15, logoSize, logoSize);
        ctx.textAlign = logo ? 'left' : 'center';
        ctx.font = `bold ${Math.floor(height * 0.42)}px Segoe UI, Helvetica, Arial, sans-serif`;
        ctx.fillText(name, logo ? height * 1.05 : width / 2, height / 2, logo ? width - height * 1.2 : width - 40);
      } else {
        const logoSize = height * 0.42;
        if (logo) ctx.drawImage(logo, width / 2 - logoSize / 2, height * 0.1, logoSize, logoSize);
        ctx.font = `bold ${name.length > 12 ? 92 : 120}px Segoe UI, Helvetica, Arial, sans-serif`;
        ctx.fillText(name, width / 2, logo ? height * 0.66 : height * 0.45, width - 60);
        ctx.font = '44px Segoe UI, Helvetica, Arial, sans-serif';
        ctx.globalAlpha = 0.85;
        ctx.fillText(tagline, width / 2, logo ? height * 0.84 : height * 0.68, width - 60);
        ctx.globalAlpha = 1;
      }
      texture.needsUpdate = true;
    };

    draw(null);
    const slug = logoSlug || slugFor(name);
    if (slug) loadLogoImage(slug, foreground).then(draw).catch(() => { /* offline: keep the wordmark */ });
    // A real ad dropped in public/assets/ads/brands/<slug>.png (or .jpg) replaces the board
    if (slug && layout === 'billboard') {
      findOwnerAsset('ads/brands', slug).then(ownerImage).then((ad) => {
        const scale = Math.max(width / ad.width, height / ad.height);
        ctx.drawImage(ad, (width - ad.width * scale) / 2, (height - ad.height * scale) / 2, ad.width * scale, ad.height * scale);
        texture.needsUpdate = true;
      }).catch(() => { /* no ad file: keep the logo board */ });
    }
    return texture;
  }

  // iOS-style app icon: rounded square in the brand color with the white glyph
  const iconCache = new Map();
  function appIconTexture(slug, background, { glyph = '#ffffff', letter = '?' } = {}) {
    const key = `${slug}|${background}|${glyph}`;
    if (iconCache.has(key)) return iconCache.get(key);
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    const draw = (logo) => {
      ctx.clearRect(0, 0, size, size);
      const r = size * 0.22;
      ctx.beginPath();
      ctx.moveTo(r, 0); ctx.arcTo(size, 0, size, size, r); ctx.arcTo(size, size, 0, size, r); ctx.arcTo(0, size, 0, 0, r); ctx.arcTo(0, 0, size, 0, r);
      const gradient = ctx.createLinearGradient(0, 0, 0, size);
      gradient.addColorStop(0, new THREE.Color(background).offsetHSL(0, 0, 0.08).getStyle());
      gradient.addColorStop(1, background);
      ctx.fillStyle = gradient;
      ctx.fill();
      if (logo) ctx.drawImage(logo, size * 0.2, size * 0.2, size * 0.6, size * 0.6);
      else { ctx.fillStyle = glyph; ctx.font = `bold ${size * 0.5}px Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, size / 2, size / 2 + 6); }
      texture.needsUpdate = true;
    };
    draw(null);
    loadLogoImage(slug, glyph).then(draw).catch(() => { /* offline: keep the letter */ });
    iconCache.set(key, texture);
    return texture;
  }

  return { billboardTexture, slugFor, appIconTexture, findOwnerAsset };
})();
