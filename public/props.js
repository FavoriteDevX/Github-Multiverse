// ============================================================================
// PROP KIT: TURNS EVERY MAP BLOCK "type" INTO THE LOW-POLY OBJECT IT DESCRIBES
// ============================================================================
// Each map block keeps its JSON bounding box (position + scale). Instead of a
// plain cube, the block type decides what gets modeled inside that box: a palm
// tree, an arcade cabinet, a Kanban board, a building with windows, etc.
const PropKit = (() => {
  const animatedObjects = [];
  // Objects the avatar can use with E (laptops, seats, coffee machines, arcades...)
  const interactables = [];

  function interactive(object, type, label) {
    object.userData.interactable = { type, label };
    interactables.push(object);
    return object;
  }

  // --------------------------------------------------------------------------
  // Materials, geometry helpers and canvas textures (cached and shared)
  // --------------------------------------------------------------------------
  const materialCache = new Map();

  // --------------------------------------------------------------------------
  // Surface grain for flat-colored materials. Instead of a UV-mapped noise
  // (stretched on big walls, invisible on small parts), a tiny shader patch
  // samples a tileable grain texture in WORLD space (triplanar), so every
  // surface gets the same physical scale of detail: fine pores and sand, larger
  // mottling and stains, vertical rain streaks on walls, a slight roughness
  // variation and a faint relief. The material keeps its own color, so the
  // stylized palette stays; it just stops looking like plastic. Kinds:
  // paint (default), matte (rough plaster/concrete), gloss (lacquer, ceramic),
  // metal (brushed), fabric, carpet, wood, stone.
  // --------------------------------------------------------------------------
  const GRAIN_KINDS = {
    //        fine scale (repeats per meter), coarse scale, streak scale; amplitudes: fine, coarse, streaks; relief; roughness variation
    paint: { scale: [0.9, 0.07, 0.22], amp: [0.08, 0.18, 0.1], bump: 0.0025, rough: 0.16 },
    matte: { scale: [0.9, 0.07, 0.22], amp: [0.11, 0.2, 0.12], bump: 0.004, rough: 0.12 },
    gloss: { scale: [0.7, 0.06, 0.2], amp: [0.03, 0.07, 0.03], bump: 0.0008, rough: 0.35 },
    metal: { scale: [1.4, 0.1, 0.2], amp: [0.08, 0.08, 0.04], bump: 0.0012, rough: 0.45 },
    fabric: { scale: [5, 0.12, 0.2], amp: [0.16, 0.08, 0], bump: 0.0025, rough: 0.05 },
    carpet: { scale: [3, 0.1, 0.2], amp: [0.2, 0.1, 0], bump: 0.003, rough: 0.05 },
    wood: { scale: [0.8, 0.12, 0.2], amp: [0.22, 0.1, 0.02], bump: 0.0015, rough: 0.2 },
    stone: { scale: [0.8, 0.08, 0.2], amp: [0.12, 0.16, 0.06], bump: 0.003, rough: 0.15 }
  };
  const grainTextures = new Map();
  // 256x256 RGB grain: R = fine detail of the kind (also its relief),
  // G = large soft mottling, B = vertical streaks (stretched noise)
  function grainTexture(kind) {
    if (grainTextures.has(kind)) return grainTextures.get(kind);
    const size = 256;
    const bytes = new Uint8Array(size * size * 4);
    const coarse = noiseField(size, 4, 4, 5, 3);
    const streaks = noiseField(size, 24, 1, 3, 5);
    let fine;
    if (kind === 'metal') {
      // Brushed: long horizontal lines plus a few scratches
      const lines = noiseField(size, 2, 128, 2, 11);
      const soft = noiseField(size, 16, 16, 2, 12);
      fine = lines.map((value, i) => value * 0.8 + soft[i] * 0.2);
    } else if (kind === 'fabric') {
      // Plain weave: alternating over/under threads with slubs
      const slub = noiseField(size, 4, 64, 2, 13);
      const fuzz = noiseField(size, 128, 128, 1, 14);
      fine = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const over = ((x >> 2) + (y >> 2)) & 1;
          const along = over ? Math.sin(((x % 4) + 0.5) / 4 * Math.PI) : Math.sin(((y % 4) + 0.5) / 4 * Math.PI);
          const i = y * size + x;
          fine[i] = 0.25 + along * 0.45 + slub[i] * 0.15 + fuzz[i] * 0.15;
        }
      }
    } else if (kind === 'carpet') {
      const loops = noiseField(size, 128, 128, 1, 15);
      const tufts = noiseField(size, 32, 32, 2, 16);
      fine = loops.map((value, i) => value * 0.65 + tufts[i] * 0.35);
    } else if (kind === 'wood') {
      // Long fibers with growth rings warped by a soft noise
      const warp = noiseField(size, 2, 6, 3, 17);
      const fibers = noiseField(size, 8, 128, 2, 18);
      fine = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const ring = (y / size) * 12 + warp[i] * 3;
          const line = Math.pow(1 - Math.abs((ring % 1) * 2 - 1), 5);
          fine[i] = 0.75 - line * 0.5 + fibers[i] * 0.25;
        }
      }
    } else {
      // Paint, plaster, stone: sand grain over soft pores
      const sand = noiseField(size, 128, 128, 1, 19);
      const pores = noiseField(size, 32, 32, 3, 20);
      const weight = kind === 'gloss' ? 0.3 : kind === 'stone' ? 0.45 : 0.55;
      fine = sand.map((value, i) => value * weight + pores[i] * (1 - weight));
    }
    for (let i = 0; i < size * size; i++) {
      bytes[i * 4] = fine[i] * 255;
      bytes[i * 4 + 1] = coarse[i] * 255;
      bytes[i * 4 + 2] = streaks[i] * 255;
      bytes[i * 4 + 3] = 255;
    }
    const texture = dataTexture(bytes, size, size);
    grainTextures.set(kind, texture);
    return texture;
  }

  function dataTexture(bytes, width, height) {
    const texture = new THREE.DataTexture(bytes, width, height, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
  }

  // One shared shader patch for every grained material (same program cache key);
  // the per-kind texture and amplitudes are uniforms
  function grainShader(shader) {
    const kind = GRAIN_KINDS[this.userData.grainKind] || GRAIN_KINDS.paint;
    shader.uniforms.grainMap = { value: grainTexture(this.userData.grainKind || 'paint') };
    shader.uniforms.grainScale = { value: new THREE.Vector3(...kind.scale) };
    shader.uniforms.grainAmp = { value: new THREE.Vector4(...kind.amp, kind.rough) };
    shader.uniforms.grainBump = { value: kind.bump };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainPos;\nvarying vec3 vGrainNormal;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  vec4 grainWorld = vec4( transformed, 1.0 );
  vec3 grainNormal = objectNormal;
  #ifdef USE_INSTANCING
    grainWorld = instanceMatrix * grainWorld;
    grainNormal = mat3( instanceMatrix ) * grainNormal;
  #endif
  grainWorld = modelMatrix * grainWorld;
  vGrainPos = grainWorld.xyz;
  vGrainNormal = mat3( modelMatrix ) * grainNormal;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D grainMap;
uniform vec3 grainScale;
uniform vec4 grainAmp;
uniform float grainBump;
varying vec3 vGrainPos;
varying vec3 vGrainNormal;
vec3 grainPerturb( vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir ) {
  vec3 sigmaX = dFdx( surfPos );
  vec3 sigmaY = dFdy( surfPos );
  vec3 r1 = cross( sigmaY, surfNorm );
  vec3 r2 = cross( surfNorm, sigmaX );
  float det = dot( sigmaX, r1 ) * faceDir;
  vec3 grad = sign( det ) * ( dHdxy.x * r1 + dHdxy.y * r2 );
  return normalize( abs( det ) * surfNorm - grad );
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
  vec3 grainW = pow( abs( normalize( vGrainNormal ) ), vec3( 4.0 ) );
  grainW /= ( grainW.x + grainW.y + grainW.z );
  vec3 grainP = vGrainPos * grainScale.x;
  vec3 grainFine = texture2D( grainMap, grainP.zy ).rgb * grainW.x + texture2D( grainMap, grainP.xz ).rgb * grainW.y + texture2D( grainMap, grainP.xy ).rgb * grainW.z;
  float grainCoarse = texture2D( grainMap, ( vGrainPos.xz + vec2( vGrainPos.y * 0.71, - vGrainPos.y * 0.43 ) ) * grainScale.y ).g;
  float grainStreak = texture2D( grainMap, vec2( vGrainPos.x * grainW.z + vGrainPos.z * grainW.x, vGrainPos.y * 0.08 ) * grainScale.z ).b;
  float grainHeight = grainFine.r;
  diffuseColor.rgb *= 1.0 + ( grainFine.r - 0.5 ) * grainAmp.x + ( grainCoarse - 0.5 ) * grainAmp.y - max( 0.0, grainStreak - 0.45 ) * grainAmp.z * ( 1.0 - grainW.y );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = clamp( roughnessFactor * ( 1.0 + ( grainCoarse - 0.5 ) * grainAmp.w * 2.0 + ( grainFine.r - 0.5 ) * grainAmp.w ), 0.04, 1.0 );`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#if ! defined( USE_BUMPMAP ) && ! defined( TANGENTSPACE_NORMALMAP ) && ! defined( OBJECTSPACE_NORMALMAP )
  normal = grainPerturb( - vViewPosition, normal, vec2( dFdx( grainHeight ), dFdy( grainHeight ) ) * grainBump, faceDirection );
#endif`);
  }

  const hsl = { h: 0, s: 0, l: 0 };
  function grainKindFor(target) {
    if (target.metalness >= 0.45) return 'metal';
    // Warm browns are almost always wood (benches, frames, logs, furniture)
    if (target.color && target.metalness < 0.3 && target.roughness > 0.3) {
      target.color.getHSL(hsl);
      if (hsl.h > 0.035 && hsl.h < 0.12 && hsl.s > 0.28 && hsl.l > 0.1 && hsl.l < 0.6) return 'wood';
    }
    if (target.roughness <= 0.3) return 'gloss';
    if (target.roughness >= 0.95) return 'matte';
    return 'paint';
  }

  // Applies the grain patch to a plain material (kept as a string in userData
  // so material.clone() stays cheap)
  function applyGrain(target, kind) {
    if (target.userData.grainKind || !target.isMeshStandardMaterial) return target;
    target.userData.grainKind = kind || grainKindFor(target);
    target.onBeforeCompile = grainShader;
    target.needsUpdate = true;
    return target;
  }

  // Textures from the surface library carry a matching detail map (height in
  // R for the bump, roughness factor in G); it follows the color map's repeat
  function applySurfaceMaps(target) {
    if (!target.isMeshStandardMaterial || !target.map || !target.map.image) return false;
    const detail = surfaceDetails.get(target.map.image);
    if (!detail) return false;
    if (!target.bumpMap && !target.normalMap) {
      const normal = normalTexture(detail.detail);
      if (normal) {
        target.normalMap = normal;
        const depth = Math.max(0.7, Math.min(2.2, (detail.bumpScale || 0.015) / 0.012));
        target.normalScale = new THREE.Vector2(depth, depth);
      } else {
        target.bumpMap = detail.detail;
        target.bumpScale = detail.bumpScale;
      }
    }
    if (!target.roughnessMap) target.roughnessMap = detail.detail;
    // Curtain walls: only the lit offices glow at night (not the whole facade)
    if (target.emissiveMap && target.emissiveMap.image === target.map.image && windowLights.has(target.map.image)) {
      target.emissiveMap = windowLights.get(target.map.image);
    }
    target.needsUpdate = true;
    return true;
  }

  // Upgrades every material under an object (materials made directly with
  // new THREE.MeshStandardMaterial in district files included). Idempotent.
  const enhancedMaterials = new WeakSet();
  function enhanceSurfaces(root) {
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      (Array.isArray(node.material) ? node.material : [node.material]).forEach((target) => {
        if (!target || enhancedMaterials.has(target) || !target.isMeshStandardMaterial) return;
        enhancedMaterials.add(target);
        if (target.userData.noGrain) return;
        if (applySurfaceMaps(target)) return;
        const plain = !target.map && !target.transparent && !target.emissiveMap && !target.alphaMap && target.emissive && target.emissive.getHex() === 0;
        if (plain) applyGrain(target);
      });
    });
    return root;
  }

  // material('#hex', options): cached. options.surface picks a grain kind
  // (fabric, carpet, wood, stone, metal...); otherwise it is guessed from
  // roughness/metalness.
  function material(color, options = {}) {
    const key = `${color}|${JSON.stringify(options)}`;
    if (!materialCache.has(key)) {
      const { surface, ...rest } = options;
      const created = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...rest });
      const flat = !rest.map && !rest.transparent && !rest.emissive;
      if (rest.map) applySurfaceMaps(created);
      else if (flat || surface) applyGrain(created, surface);
      enhancedMaterials.add(created);
      materialCache.set(key, created);
    }
    return materialCache.get(key);
  }

  function glow(color, intensity = 0.9, options = {}) {
    return material(color, { emissive: color, emissiveIntensity: intensity, ...options });
  }

  function shade(color, lightness) {
    const shaded = new THREE.Color(color);
    shaded.offsetHSL(0, 0, lightness);
    return `#${shaded.getHexString()}`;
  }

  function mesh(geometry, meshMaterial, x = 0, y = 0, z = 0) {
    const result = new THREE.Mesh(geometry, meshMaterial);
    result.position.set(x, y, z);
    // Only big things cast shadows: thousands of small shadow casters were the
    // main cost of the shadow pass (each one is drawn a second time)
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    result.castShadow = geometry.boundingSphere.radius > 0.9;
    result.receiveShadow = true;
    return result;
  }

  // Every box in the world has softly rounded edges (Decentraland-like, less
  // "blocky"). The geometry keeps BoxGeometry's 6 material groups and per-face
  // UVs, so textured faces still work; geometries are cached by size.
  // Light version: one bevel band per edge (96 vertices instead of ~300), and
  // small parts (where rounding is invisible) stay plain cached boxes.
  const roundedBoxCache = new Map();
  function roundedBoxGeometry(w, h, d) {
    const minDim = Math.min(w, h, d);
    const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
    if (roundedBoxCache.has(key)) return roundedBoxCache.get(key);
    if (minDim < 0.25) {
      const plain = new THREE.BoxGeometry(w, h, d);
      roundedBoxCache.set(key, plain);
      return plain;
    }
    const r = Math.min(0.18, Math.max(0.02, minDim * 0.16));
    const geometry = new THREE.BoxGeometry(1, 1, 1, 3, 3, 3);
    const position = geometry.attributes.position;
    const normal = geometry.attributes.normal;
    const half = [w / 2, h / 2, d / 2];
    const v = new THREE.Vector3();
    const inner = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      const coords = [position.getX(i), position.getY(i), position.getZ(i)].map((c, axis) => {
        // Remap so the outer segment of each axis becomes the rounded band
        const a = Math.abs(c);
        const mapped = a <= 1 / 6 ? a * 6 * (half[axis] - r) : (half[axis] - r) + (a - 1 / 6) * 3 * r;
        return Math.sign(c) * mapped;
      });
      v.set(coords[0], coords[1], coords[2]);
      inner.set(
        THREE.MathUtils.clamp(v.x, -(half[0] - r), half[0] - r),
        THREE.MathUtils.clamp(v.y, -(half[1] - r), half[1] - r),
        THREE.MathUtils.clamp(v.z, -(half[2] - r), half[2] - r)
      );
      const n = v.clone().sub(inner);
      if (n.lengthSq() < 1e-10) n.set(normal.getX(i), normal.getY(i), normal.getZ(i));
      n.normalize();
      v.copy(inner).addScaledVector(n, r);
      position.setXYZ(i, v.x, v.y, v.z);
      normal.setXYZ(i, n.x, n.y, n.z);
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    roundedBoxCache.set(key, geometry);
    return geometry;
  }

  // A picture that is not a tiling surface (signs, logos, posters, screens)
  // goes on a plain box so the whole image shows (see facedBox)
  const isPicture = (boxMaterial) => Boolean(boxMaterial && !Array.isArray(boxMaterial) && boxMaterial.map && boxMaterial.map.wrapS === THREE.ClampToEdgeWrapping && boxMaterial.map.repeat.x === 1 && boxMaterial.map.repeat.y === 1);
  const plainBoxCache = new Map();
  const plainBox = (w, h, d) => {
    const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
    if (!plainBoxCache.has(key)) plainBoxCache.set(key, new THREE.BoxGeometry(w, h, d));
    return plainBoxCache.get(key);
  };
  const box = (w, h, d, boxMaterial, x, y, z) => mesh(isPicture(boxMaterial) ? plainBox(w, h, d) : roundedBoxGeometry(w, h, d), boxMaterial, x, y, z);
  const cylinder = (radiusTop, radiusBottom, h, cylinderMaterial, x, y, z, segments = 16) =>
    mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, h, segments), cylinderMaterial, x, y, z);
  const sphere = (radius, sphereMaterial, x, y, z, segments = 12) =>
    mesh(new THREE.SphereGeometry(radius, segments, Math.max(6, segments / 2)), sphereMaterial, x, y, z);

  const textureCache = new Map();
  function canvasTexture(key, width, height, draw) {
    if (textureCache.has(key)) return textureCache.get(key);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    texture.name = key;
    textureCache.set(key, texture);
    return texture;
  }

  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function labelTexture(text, { bg = '#ffffff', fg = '#1d1b26', width = 512, height = 160, font = 'bold 46px Segoe UI, Arial, sans-serif', border = null } = {}) {
    return canvasTexture(`label|${text}|${bg}|${fg}|${width}|${height}|${font}|${border}`, width, height, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      if (border) {
        ctx.strokeStyle = border;
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, w - 10, h - 10);
      }
      ctx.fillStyle = fg;
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = wrapText(ctx, text, w - 40).slice(0, 3);
      const lineHeight = parseInt(font.match(/(\d+)px/)[1], 10) * 1.15;
      lines.forEach((line, index) => {
        ctx.fillText(line, w / 2, h / 2 + (index - (lines.length - 1) / 2) * lineHeight);
      });
    });
  }

  // Realistic curtain wall: 4 x 8 windows per tile (same layout as before so
  // every building keeps its proportions). Each window shows depth (ceiling
  // light, floor shadow, the frame's shadow on the glass), blinds or curtains,
  // furniture silhouettes in the lit offices, a sky reflection with clouds and
  // the silhouette of the buildings across the street, pane-to-pane tint
  // variation, metal mullions, spandrel panels with seams and rain streaks.
  // The layout is shared by every color, so one detail map (glass is glossy,
  // frames rough, mullions raised) and one night-light mask per lit color
  // serve all facades: at night only the offices glow, not the walls.
  let windowsLayoutCache = null;
  function windowsLayout() {
    if (windowsLayoutCache) return windowsLayoutCache;
    const random = lcg(1043);
    const w = 512;
    const h = 1024;
    const columns = 4;
    const rows = 8;
    const cw = w / columns;
    const rh = h / rows;
    const cells = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        cells.push({
          x: col * cw + 8, y: row * rh + 18, gw: cw - 16, gh: rh - 34, row, col,
          lit: random() < 0.18, evening: random() < 0.4, plant: random() < 0.5, person: random() < 0.3,
          clouds: [0, 1].map(() => [random(), random(), random(), random()]),
          skyline: Array.from({ length: 5 }, () => [random(), random()]),
          cover: random(), coverDepth: random(), tint: random() - 0.5,
          streaks: Array.from({ length: 4 }, () => random())
        });
      }
    }
    windowsLayoutCache = { w, h, columns, rows, cw, rh, cells };
    return windowsLayoutCache;
  }

  const windowLights = new Map(); // facade canvas -> night-light mask texture
  let windowsDetailCache = null;
  function windowsDetail() {
    if (windowsDetailCache) return windowsDetailCache;
    const { w, h, columns, rows, cw, rh, cells } = windowsLayout();
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // R = height, G = roughness factor
    ctx.fillStyle = 'rgb(150, 245, 0)';
    ctx.fillRect(0, 0, w, h);
    cells.forEach(({ x, y, gw, gh }) => {
      ctx.fillStyle = 'rgb(175, 150, 0)';
      ctx.fillRect(x - 3, y - 3, gw + 6, gh + 6);
      ctx.fillStyle = 'rgb(70, 28, 0)';
      ctx.fillRect(x + 2, y + 2, gw - 4, gh - 4);
      ctx.fillStyle = 'rgb(165, 150, 0)';
      ctx.fillRect(x + gw / 2 - 1, y, 2, gh);
      ctx.fillStyle = 'rgb(200, 200, 0)';
      ctx.fillRect(x - 3, y + gh + 2, gw + 6, 4);
    });
    for (let row = 0; row < rows; row++) {
      ctx.fillStyle = 'rgb(165, 230, 0)';
      ctx.fillRect(0, row * rh, w, 10);
      ctx.fillStyle = 'rgb(120, 230, 0)';
      ctx.fillRect(0, row * rh + 10, w, 2);
    }
    for (let col = 0; col <= columns; col++) {
      ctx.fillStyle = 'rgb(235, 120, 0)';
      ctx.fillRect(col * cw - 3, 0, 6, h);
    }
    const data = ctx.getImageData(0, 0, w, h).data;
    const height = new Float32Array(w * h);
    const rough = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { height[i] = data[i * 4] / 255; rough[i] = data[i * 4 + 1] / 255; }
    windowsDetailCache = { detail: detailTexture(blurWrap(height, w, h, 1), rough, w, h), bumpScale: 0.02 };
    return windowsDetailCache;
  }

  function windowsLightMask(litColor) {
    return canvasTexture(`windowlights|${litColor}`, 128, 256, (ctx, w, h) => {
      const { cells } = windowsLayout();
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);
      ctx.scale(w / 512, h / 1024);
      cells.forEach((cell) => {
        if (!cell.lit && !cell.evening) return;
        const glow = ctx.createLinearGradient(0, cell.y, 0, cell.y + cell.gh);
        glow.addColorStop(0, shade(litColor, 0.06));
        glow.addColorStop(1, shade(litColor, -0.3));
        ctx.globalAlpha = cell.lit ? 1 : 0.75;
        ctx.fillStyle = glow;
        ctx.fillRect(cell.x, cell.y, cell.gw, cell.gh);
        // Blinds dim part of the light
        if (cell.cover < 0.25) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.fillRect(cell.x, cell.y, cell.gw, cell.gh * (0.2 + cell.coverDepth * 0.5));
        }
      });
      ctx.globalAlpha = 1;
    });
  }

  function windowsTexture(wallColor, litColor = '#ffe9a8') {
    const key = `windows|${wallColor}|${litColor}`;
    const existing = textureCache.get(key);
    const texture = existing || canvasTexture(key, 512, 1024, (ctx, w, h) => {
      const { columns, rows, cw, rh, cells } = windowsLayout();
      const random = lcg(wallColor.length * 131 + 7);
      // Facade: soft mottling and fine grain (tileable noise, not random rects)
      ctx.fillStyle = wallColor;
      ctx.fillRect(0, 0, w, h);
      const coarse = noiseField(512, 4, 4, 4, 171);
      const fine = noiseField(512, 128, 128, 1, 172);
      const image = ctx.getImageData(0, 0, w, h);
      const d = image.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const n = ((y & 511) * 512) + x;
          const f = 1 + (coarse[n] - 0.5) * 0.12 + (fine[n] - 0.5) * 0.08;
          const i = (y * w + x) * 4;
          d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
        }
      }
      ctx.putImageData(image, 0, 0);
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, 'rgba(196, 222, 242, 0.96)');
      sky.addColorStop(0.5, 'rgba(110, 146, 178, 0.96)');
      sky.addColorStop(1, 'rgba(58, 80, 108, 0.96)');
      cells.forEach((cell) => {
        const { x, y, gw, gh } = cell;
        if (cell.lit) {
          // Lit office: warm ceiling glow fading to the floor, light panels, furniture
          const room = ctx.createLinearGradient(0, y, 0, y + gh);
          room.addColorStop(0, shade(litColor, 0.08));
          room.addColorStop(0.55, litColor);
          room.addColorStop(1, shade(litColor, -0.35));
          ctx.fillStyle = room;
          ctx.fillRect(x, y, gw, gh);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.fillRect(x + gw * 0.12, y + 3, gw * 0.3, 3);
          ctx.fillRect(x + gw * 0.58, y + 3, gw * 0.3, 3);
          ctx.fillStyle = 'rgba(40, 30, 20, 0.45)';
          ctx.fillRect(x + gw * 0.1, y + gh * 0.68, gw * 0.45, gh * 0.08); // desk
          ctx.fillRect(x + gw * 0.18, y + gh * 0.5, gw * 0.12, gh * 0.18); // monitor
          if (cell.plant) { ctx.beginPath(); ctx.arc(x + gw * 0.8, y + gh * 0.7, gw * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x + gw * 0.78, y + gh * 0.7, gw * 0.04, gh * 0.3); }
          if (cell.person) { ctx.fillStyle = 'rgba(30, 25, 20, 0.5)'; ctx.beginPath(); ctx.arc(x + gw * 0.62, y + gh * 0.5, gw * 0.05, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x + gw * 0.57, y + gh * 0.56, gw * 0.1, gh * 0.3); }
        } else {
          // Glass reflecting the sky (shared gradient), each pane slightly different
          ctx.fillStyle = sky;
          ctx.fillRect(x, y, gw, gh);
          ctx.fillStyle = cell.tint > 0 ? `rgba(255, 255, 255, ${cell.tint * 0.12})` : `rgba(10, 25, 45, ${-cell.tint * 0.2})`;
          ctx.fillRect(x, y, gw, gh);
          // Reflected skyline of the buildings across the street
          ctx.fillStyle = 'rgba(40, 55, 75, 0.35)';
          let sx = x;
          cell.skyline.forEach(([a, b]) => {
            const bw = gw * (0.12 + a * 0.18);
            const bh = gh * (0.12 + b * 0.3);
            ctx.fillRect(sx, y + gh - bh, Math.min(bw, x + gw - sx), bh);
            sx += bw;
          });
          // Interior depth seen through the glass
          ctx.fillStyle = 'rgba(20, 30, 45, 0.25)';
          ctx.fillRect(x, y + gh * 0.62, gw, gh * 0.38);
          // Cloud streaks in the reflection
          cell.clouds.forEach(([a, b, c, e]) => {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.beginPath();
            ctx.ellipse(x + a * gw, y + b * gh * 0.6, gw * (0.25 + c * 0.3), 4 + e * 6, 0, 0, Math.PI * 2);
            ctx.fill();
          });
        }
        // Blinds (horizontal slats) or a curtain on some windows
        if (cell.cover < 0.25) {
          const depth = gh * (0.2 + cell.coverDepth * 0.5);
          ctx.fillStyle = 'rgba(225, 222, 210, 0.85)';
          ctx.fillRect(x, y, gw, depth);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
          for (let k = 4; k < depth; k += 5) ctx.fillRect(x, y + k, gw, 1);
        } else if (cell.cover < 0.35) {
          ctx.fillStyle = 'rgba(240, 236, 225, 0.75)';
          ctx.fillRect(x, y, gw * 0.28, gh);
          ctx.fillRect(x + gw * 0.72, y, gw * 0.28, gh);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
          for (let k = 6; k < gw * 0.28; k += 7) { ctx.fillRect(x + k, y, 2, gh); ctx.fillRect(x + gw * 0.72 + k, y, 2, gh); }
        }
        // Diagonal glare
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath(); ctx.moveTo(x, y + gh * 0.55); ctx.lineTo(x + gw * 0.5, y); ctx.lineTo(x + gw * 0.68, y); ctx.lineTo(x, y + gh * 0.8); ctx.fill();
        // Shadow of the frame on the glass (the glass sits back in the wall)
        const top = ctx.createLinearGradient(0, y, 0, y + 10);
        top.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
        top.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = top;
        ctx.fillRect(x, y, gw, 10);
        const left = ctx.createLinearGradient(x, 0, x + 7, 0);
        left.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
        left.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = left;
        ctx.fillRect(x, y, 7, gh);
        // Window frame and the vertical split of the pane
        ctx.strokeStyle = 'rgba(30, 34, 40, 0.75)';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, gw, gh);
        ctx.fillStyle = 'rgba(30, 34, 40, 0.6)';
        ctx.fillRect(x + gw / 2 - 1, y, 2, gh);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fillRect(x - 1, y - 2, gw + 2, 1);
        // Sill and rain streaks under it
        ctx.fillStyle = shade(wallColor, 0.15);
        ctx.fillRect(x - 3, y + gh + 2, gw + 6, 4);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.fillRect(x - 3, y + gh + 6, gw + 6, 2);
        cell.streaks.forEach((s, k) => {
          const sx = x + s * gw;
          const len = 14 + ((k * 7 + s * 40) % 30);
          const streak = ctx.createLinearGradient(0, y + gh + 8, 0, y + gh + 8 + len);
          streak.addColorStop(0, 'rgba(0, 0, 0, 0.14)');
          streak.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = streak;
          ctx.fillRect(sx, y + gh + 8, 2 + (k % 2), len);
        });
      });
      for (let row = 0; row < rows; row++) {
        // Spandrel band between floors, with panel seams
        ctx.fillStyle = shade(wallColor, 0.06);
        ctx.fillRect(0, row * rh, w, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(0, row * rh, w, 1);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        ctx.fillRect(0, row * rh + 10, w, 2);
        for (let col = 0; col < columns; col++) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
          ctx.fillRect(col * cw + cw / 2, row * rh, 1, 10);
        }
      }
      // Mullions with a metallic highlight and a soft shadow beside them
      for (let col = 0; col <= columns; col++) {
        ctx.fillStyle = shade(wallColor, -0.12);
        ctx.fillRect(col * cw - 3, 0, 6, h);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fillRect(col * cw - 3, 0, 1, h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        ctx.fillRect(col * cw + 3, 0, 2, h);
      }
      // A few grime streaks over the whole facade
      for (let k = 0; k < 10; k++) {
        const sx = random() * w;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(0, 0, 0, 0)');
        g.addColorStop(0.5, 'rgba(0, 0, 0, 0.05)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx, 0, 6 + random() * 20, h);
      }
    });
    if (!existing) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      surfaceDetails.set(texture.image, windowsDetail());
      const mask = windowsLightMask(litColor);
      mask.wrapS = mask.wrapT = THREE.RepeatWrapping;
      windowLights.set(texture.image, mask);
    }
    return texture;
  }

  // The night-light mask of a curtain-wall texture (for emissiveMap)
  function windowLightsFor(texture) {
    return (texture && texture.image && windowLights.get(texture.image)) || null;
  }

  // A repeated copy of a cached texture. Copies of the same canvas share ONE
  // GPU texture (three r128 would upload every clone separately: hundreds of
  // duplicate uploads); only the repeat/offset (a uniform) differs.
  function repeated(texture, repeatX, repeatY) {
    const copy = texture.clone();
    copy.needsUpdate = true;
    copy.wrapS = THREE.RepeatWrapping;
    copy.wrapT = THREE.RepeatWrapping;
    copy.repeat.set(repeatX, repeatY);
    // Sharp at grazing angles (floors and roads seen from the avatar's height)
    copy.anisotropy = 8;
    shareGpuTexture(copy, texture);
    return copy;
  }

  function shareGpuTexture(copy, source) {
    try {
      if (typeof renderer === 'undefined' || !renderer || !renderer.properties || !source.image) return;
      const isPowerOfTwo = (n) => (n & (n - 1)) === 0;
      if (!isPowerOfTwo(source.image.width) || !isPowerOfTwo(source.image.height)) return;
      const sourceProps = renderer.properties.get(source);
      if (sourceProps.__webglInit === undefined) {
        // Not uploaded yet: upload it once with the settings every copy needs
        source.wrapS = source.wrapT = THREE.RepeatWrapping;
        source.anisotropy = Math.max(source.anisotropy, 8);
        renderer.initTexture(source);
      } else if (source.wrapS !== THREE.RepeatWrapping || source.wrapT !== THREE.RepeatWrapping) {
        return; // already uploaded with clamped edges: keep a separate copy
      }
      if (!sourceProps.__webglTexture) return;
      const props = renderer.properties.get(copy);
      props.__webglInit = true;
      props.__webglTexture = sourceProps.__webglTexture;
      props.__version = copy.version;
    } catch (error) {
      // Fall back to a normal (separately uploaded) copy
    }
  }

  function codeScreenTexture(title) {
    return canvasTexture(`code|${title}`, 512, 320, (ctx, w, h) => {
      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2d2d44';
      ctx.fillRect(0, 0, w, 34);
      ['#ff5f57', '#febc2e', '#28c840'].forEach((dot, index) => {
        ctx.fillStyle = dot;
        ctx.beginPath(); ctx.arc(20 + index * 22, 17, 7, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillStyle = '#c7c7d9';
      ctx.font = '18px Consolas, monospace';
      ctx.fillText(title.slice(0, 40), 90, 23);
      const palette = ['#ff79c6', '#8be9fd', '#50fa7b', '#f1fa8c', '#bd93f9', '#ffb86c'];
      for (let line = 0; line < 11; line++) {
        let x = 20 + (line % 4) * 18;
        const tokens = 2 + ((line * 5) % 4);
        for (let token = 0; token < tokens; token++) {
          const width = 30 + ((line * 13 + token * 29) % 70);
          ctx.fillStyle = palette[(line + token) % palette.length];
          ctx.fillRect(x, 52 + line * 24, width, 10);
          x += width + 12;
        }
      }
    });
  }

  function chartScreenTexture(title) {
    return canvasTexture(`chart|${title}`, 512, 320, (ctx, w, h) => {
      ctx.fillStyle = '#101418';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 26px Segoe UI, Arial, sans-serif';
      ctx.fillText(title, 24, 40);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath(); ctx.moveTo(30, 70 + i * 40); ctx.lineTo(w - 20, 70 + i * 40); ctx.stroke();
      }
      ctx.strokeStyle = '#4dabf7';
      ctx.setLineDash([10, 8]);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(30, 75); ctx.lineTo(w - 20, h - 30); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      [75, 90, 88, 130, 160, 170, 205, 230, 260].forEach((y, index) => {
        const x = 30 + index * ((w - 50) / 8);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  function arcadeScreenTexture(title, hue) {
    return canvasTexture(`arcade|${title}|${hue}`, 256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#05040f';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = `hsl(${hue}, 90%, 60%)`;
      ctx.lineWidth = 4;
      for (let i = 0; i < 5; i++) ctx.strokeRect(20 + i * 10, 40 + i * 10, w - 40 - i * 20, h - 80 - i * 20);
      ctx.fillStyle = '#ffe600';
      ctx.beginPath(); ctx.moveTo(90, 130); ctx.arc(90, 130, 22, 0.25 * Math.PI, 1.75 * Math.PI); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(135 + i * 22, 130, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.font = 'bold 20px Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(title.toUpperCase().slice(0, 18), w / 2, 28);
    });
  }

  function artTexture(seed) {
    return canvasTexture(`art|${seed}`, 256, 256, (ctx, w, h) => {
      let state = seed * 9301 + 49297;
      const random = () => { state = (state * 9301 + 49297) % 233280; return state / 233280; };
      ctx.fillStyle = `hsl(${Math.floor(random() * 360)}, 60%, 85%)`;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = `hsla(${Math.floor(random() * 360)}, 75%, 55%, 0.85)`;
        const size = 30 + random() * 90;
        if (random() > 0.5) {
          ctx.beginPath(); ctx.arc(random() * w, random() * h, size / 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(random() * w, random() * h, size, size * 0.7);
        }
      }
    });
  }

  function contributionTexture() {
    return canvasTexture('contributions', 512, 160, (ctx, w, h) => {
      ctx.fillStyle = '#0d1117';
      ctx.fillRect(0, 0, w, h);
      const levels = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
      for (let week = 0; week < 30; week++) {
        for (let day = 0; day < 7; day++) {
          ctx.fillStyle = levels[(week * 7 + day * 3 + (week % 5) * day) % 5];
          ctx.fillRect(14 + week * 16.4, 18 + day * 18.5, 13, 14);
        }
      }
    });
  }

  function stripeTexture(color) {
    return canvasTexture(`stripes|${color}`, 64, 256, (ctx, w, h) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      for (let i = 0; i < 12; i++) ctx.fillRect((i * 23) % w, i * 21, 4, 40);
    });
  }

  // --------------------------------------------------------------------------
  // Procedural surface library. Every textured surface (pavers, brick, wood,
  // plaster, concrete, roof tiles, metal, asphalt, fabric, stone, sand, grass)
  // is built in two steps:
  //  1. a color-independent STRUCTURE, painted once per kind into the channels
  //     of a canvas (R = tone, G = joint/grout mask, B = height), then turned
  //     into ambient occlusion in the joints, bevelled edges and a DETAIL map
  //     (height in R for the bump, roughness factor in G) shared by all colors;
  //  2. a cheap COLORIZE pass per base color, with multi-scale tileable noise
  //     (large mottling, fine speckle, slight hue drift) and grime in the joints.
  // Everything tiles seamlessly, is generated once and cached.
  // --------------------------------------------------------------------------
  const surfaceDetails = new Map(); // color canvas -> structure (detail map, bump scale)
  // Generation time of the surface library (shown with PropKit.kit.surfaceStats)
  const surfaceStats = { ms: 0, structures: 0, colors: 0 };
  const structures = new Map();
  const noiseFields = new Map();

  function lcg(seed) {
    let state = Math.abs(Math.floor(seed)) % 233280;
    return () => { state = (state * 9301 + 49297) % 233280; return state / 233280; };
  }
  function mulberry(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Tileable fractal value noise (size x size, normalized to 0..1). fx/fy are
  // the lattice cells across the tile for the first octave; fx != fy stretches
  // the noise (wood fibers, brushed metal, rain streaks).
  function noiseField(size, fx, fy, octaves, seed) {
    const key = `${size}|${fx}|${fy}|${octaves}|${seed}`;
    if (noiseFields.has(key)) return noiseFields.get(key);
    const out = new Float32Array(size * size);
    const random = mulberry(seed * 7919 + 101);
    const x0 = new Int32Array(size);
    const x1 = new Int32Array(size);
    const xs = new Float32Array(size);
    let amplitude = 1;
    for (let o = 0; o < octaves; o++) {
      const cx = Math.min(size, fx * (1 << o));
      const cy = Math.min(size, fy * (1 << o));
      const lattice = new Float32Array(cx * cy);
      for (let i = 0; i < lattice.length; i++) lattice[i] = random();
      for (let x = 0; x < size; x++) {
        const g = (x / size) * cx;
        const i = Math.floor(g);
        const t = g - i;
        xs[x] = t * t * (3 - 2 * t);
        x0[x] = i % cx;
        x1[x] = (i + 1) % cx;
      }
      for (let y = 0; y < size; y++) {
        const g = (y / size) * cy;
        const i = Math.floor(g);
        let t = g - i;
        t = t * t * (3 - 2 * t);
        const r0 = (i % cy) * cx;
        const r1 = ((i + 1) % cy) * cx;
        const row = y * size;
        for (let x = 0; x < size; x++) {
          const a = lattice[r0 + x0[x]];
          const b = lattice[r0 + x1[x]];
          const c = lattice[r1 + x0[x]];
          const d = lattice[r1 + x1[x]];
          const s = xs[x];
          const top = a + (b - a) * s;
          out[row + x] += (top + (c + (d - c) * s - top) * t) * amplitude;
        }
      }
      amplitude *= 0.5;
    }
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < out.length; i++) { if (out[i] < min) min = out[i]; if (out[i] > max) max = out[i]; }
    const range = max - min || 1;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - min) / range;
    noiseFields.set(key, out);
    return out;
  }

  // Separable box blur that wraps around the edges (keeps textures tileable)
  function blurWrap(source, w, h, radius) {
    if (radius < 1) return source;
    const temp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const n = radius * 2 + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += source[row + ((k % w) + w) % w];
      for (let x = 0; x < w; x++) {
        temp[row + x] = sum / n;
        sum += source[row + (x + radius + 1) % w] - source[row + ((x - radius) % w + w) % w];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += temp[(((k % h) + h) % h) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = sum / n;
        sum += temp[((y + radius + 1) % h) * w + x] - temp[(((y - radius) % h + h) % h) * w + x];
      }
    }
    return out;
  }

  // Detail map from height/roughness arrays (rows flipped to match the
  // flipY of canvas textures, so bumps line up with the color map)
  function detailTexture(height, rough, w, h) {
    const bytes = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = y * w + x;
        const dst = ((h - 1 - y) * w + x) * 4;
        bytes[dst] = Math.max(0, Math.min(255, height[src] * 255));
        bytes[dst + 1] = Math.max(0, Math.min(255, rough[src] * 255));
        bytes[dst + 2] = 255;
        bytes[dst + 3] = 255;
      }
    }
    const texture = dataTexture(bytes, w, h);
    texture.userData.height = { height, w, h };
    return texture;
  }

  // Real relief instead of a flat picture: a tangent-space normal map computed
  // from the height map (Sobel, wrapping at the edges), so every joint, chip,
  // plank seam and brick edge catches the sun and casts its own shading as the
  // light moves. Big maps are computed at half size (sharp enough, 4x lighter).
  function normalTexture(detail) {
    if (detail.userData.normal) return detail.userData.normal;
    const source = detail.userData.height;
    if (!source) return null;
    const step = source.w >= 1024 ? 2 : 1;
    const w = Math.floor(source.w / step);
    const h = Math.floor(source.h / step);
    const sample = (x, y) => {
      const sx = ((x % w) + w) % w;
      const sy = ((y % h) + h) % h;
      return source.height[sy * step * source.w + sx * step];
    };
    const strength = 5.5 * (w / 512);
    const bytes = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const gx = (sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1)) - (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1));
        const gy = (sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1)) - (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1));
        // Texture rows are stored bottom-up (v grows upwards), source rows top-down
        let nx = -gx * strength / 4;
        let ny = gy * strength / 4;
        const length = Math.hypot(nx, ny, 1);
        nx /= length;
        ny /= length;
        const nz = 1 / length;
        const dst = ((h - 1 - y) * w + x) * 4;
        bytes[dst] = (nx * 0.5 + 0.5) * 255;
        bytes[dst + 1] = (ny * 0.5 + 0.5) * 255;
        bytes[dst + 2] = (nz * 0.5 + 0.5) * 255;
        bytes[dst + 3] = 255;
      }
    }
    const normal = dataTexture(bytes, w, h);
    detail.userData.normal = normal;
    return normal;
  }

  // Draws fn(dx, dy) at every wrapped copy needed for a shape near the edges
  function wrapped(size, x, y, w, h, fn) {
    [-size, 0, size].forEach((dx) => {
      if (x + dx > size || x + dx + w < 0) return;
      [-size, 0, size].forEach((dy) => {
        if (y + dy > size || y + dy + h < 0) return;
        fn(dx, dy);
      });
    });
  }

  // Structure channels as a CSS color: tone (1 = neutral), joint (0..1), height (0..1)
  const channels = (tone, joint, height, alpha = 1) =>
    `rgba(${Math.round(Math.max(0, Math.min(255, tone * 160)))}, ${Math.round(joint * 255)}, ${Math.round(Math.max(0, Math.min(255, height * 255)))}, ${alpha})`;
  // Changes only the tone (R) of what is already painted: multiply darkens, screen lightens
  function toneSpot(ctx, factor, draw) {
    ctx.save();
    if (factor < 1) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = `rgb(${Math.round(factor * 255)}, 255, 255)`;
    } else {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgb(${Math.round(Math.min(1, factor - 1) * 255)}, 0, 0)`;
    }
    draw();
    ctx.restore();
  }

  // Irregular rounded quad (worn stone): 8 jitter values move the corners
  function stonePath(ctx, x, y, w, h, r, jitter) {
    const p = [[x + jitter[0], y + jitter[1]], [x + w + jitter[2], y + jitter[3]], [x + w + jitter[4], y + h + jitter[5]], [x + jitter[6], y + h + jitter[7]]];
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = p[i];
      const b = p[(i + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const k = Math.min(r, len / 2) / len;
      const start = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      if (i === 0) ctx.moveTo(start[0], start[1]); else ctx.quadraticCurveTo(a[0], a[1], start[0], start[1]);
      const end = [b[0] - (b[0] - a[0]) * k, b[1] - (b[1] - a[1]) * k];
      ctx.lineTo(end[0], end[1]);
    }
    const a = p[0];
    const b = p[1];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const k = Math.min(r, len / 2) / len;
    ctx.quadraticCurveTo(a[0], a[1], a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k);
    ctx.closePath();
  }

  function structure(kind, size, options, paint) {
    if (structures.has(kind)) return structures.get(kind);
    const started = performance.now();
    const o = { seed: 1, bevel: 2, aoRadius: 6, ao: 2, fineBump: 0.04, roughness: 0.9, jointRough: 1, roughVar: 0.1, bumpScale: 0.02, mottleFreq: 4, speckleFreq: 64, ...options };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = channels(1, 0, 0.75);
    ctx.fillRect(0, 0, size, size);
    paint(ctx, size, lcg(o.seed));
    const data = ctx.getImageData(0, 0, size, size).data;
    const count = size * size;
    const tone = new Float32Array(count);
    const joint = new Float32Array(count);
    const height = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      tone[i] = data[i * 4] / 160;
      joint[i] = data[i * 4 + 1] / 255;
      height[i] = data[i * 4 + 2] / 255;
    }
    const bevelled = blurWrap(height, size, size, o.bevel);
    const wide = blurWrap(blurWrap(height, size, size, o.aoRadius), size, size, o.aoRadius);
    const coarse = noiseField(size, o.mottleFreq, o.mottleFreq, 5, o.seed);
    const fine = noiseField(size, o.speckleFreq, o.speckleFreq, 2, o.seed + 1);
    const hue = noiseField(size, o.mottleFreq * 2, o.mottleFreq * 2, 3, o.seed + 2);
    const occl = new Float32Array(count);
    const bump = new Float32Array(count);
    const rough = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      occl[i] = Math.min(0.7, Math.max(0, (wide[i] - height[i]) * o.ao));
      bump[i] = bevelled[i] + (fine[i] - 0.5) * o.fineBump;
      rough[i] = o.roughness + (o.jointRough - o.roughness) * joint[i] + (coarse[i] - 0.5) * o.roughVar * 2 + occl[i] * 0.3;
    }
    const result = { size, tone, joint, occl, coarse, fine, hue, detail: detailTexture(bump, rough, size, size), bumpScale: o.bumpScale };
    structures.set(kind, result);
    surfaceStats.ms += performance.now() - started;
    surfaceStats.structures++;
    return result;
  }

  // One color canvas per (kind, base color); the detail map stays shared
  function colorize(key, s, base, o = {}) {
    const texture = canvasTexture(key, s.size, s.size, (ctx, w, h) => {
      const started = performance.now();
      const { grout = shade(base, -0.3), mottle = 0.1, speckle = 0.06, hueShift = 0.05, grime = null, grimeAmount = 0, toneAmount = 1, groutSpeckle = 0.3 } = o;
      const b = new THREE.Color(base);
      const g = new THREE.Color(grout);
      const dirt = grime ? new THREE.Color(grime) : null;
      const image = ctx.createImageData(w, h);
      const d = image.data;
      for (let i = 0; i < w * h; i++) {
        const t = 1 + (s.tone[i] - 1) * toneAmount;
        const n = (1 + (s.coarse[i] - 0.5) * mottle * 2 + (s.fine[i] - 0.5) * speckle * 2) * t;
        const j = s.joint[i];
        const gn = 1 + (s.fine[i] - 0.5) * groutSpeckle;
        const lit = 1 - s.occl[i];
        const hs = (s.hue[i] - 0.5) * hueShift * 2;
        let r = (b.r * n * (1 + hs) * (1 - j) + g.r * gn * j) * lit;
        let gg = (b.g * n * (1 - j) + g.g * gn * j) * lit;
        let bb = (b.b * n * (1 - hs) * (1 - j) + g.b * gn * j) * lit;
        if (dirt) {
          const k = Math.min(1, (j * 0.7 + s.occl[i] * 1.4) * (0.3 + s.coarse[i] * 1.2)) * grimeAmount;
          r += (dirt.r - r) * k;
          gg += (dirt.g - gg) * k;
          bb += (dirt.b - bb) * k;
        }
        d[i * 4] = r * 255;
        d[i * 4 + 1] = gg * 255;
        d[i * 4 + 2] = bb * 255;
        d[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      if (o.after) o.after(ctx, w, h);
      surfaceStats.ms += performance.now() - started;
      surfaceStats.colors++;
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    surfaceDetails.set(texture.image, s);
    return texture;
  }

  // ---- Structures ----------------------------------------------------------
  // Irregular stone pavers in running bond: uneven sizes and heights, worn
  // rounded edges, chips, hairline cracks, deep sandy joints
  function paverStructure() {
    return structure('pavers', 1024, { seed: 7, bevel: 3, aoRadius: 8, ao: 2.4, bumpScale: 0.01, roughness: 0.86, jointRough: 1, speckleFreq: 128 }, (ctx, size, random) => {
      ctx.fillStyle = channels(1, 1, 0.12);
      ctx.fillRect(0, 0, size, size);
      const rows = 14;
      const rh = size / rows;
      for (let row = 0; row < rows; row++) {
        const count = 6 + Math.floor(random() * 3);
        const weights = Array.from({ length: count }, () => 0.7 + random() * 0.6);
        const total = weights.reduce((a, b) => a + b, 0);
        let x = random() * size;
        const y = row * rh;
        weights.forEach((weight) => {
          const sw = (weight / total) * size;
          const gap = 3 + random() * 2.5;
          let tone = 0.88 + random() * 0.24;
          if (random() < 0.1) tone -= 0.14;
          const level = 0.72 + random() * 0.2;
          const jitter = Array.from({ length: 8 }, () => (random() - 0.5) * 7);
          const radius = 8 + random() * 12;
          const spots = Array.from({ length: 5 }, () => [random() * sw, random() * rh, 6 + random() * 22, random() < 0.5 ? 0.9 : 1.08]);
          const chip = random() < 0.35 ? [random() * sw, random() < 0.5 ? gap + 2 : rh - gap - 2, 3 + random() * 5] : null;
          const crack = random() < 0.1 ? Array.from({ length: 7 }, () => random()) : null;
          wrapped(size, x, y, sw, rh, (dx, dy) => {
            const sx = x + dx;
            const sy = y + dy;
            stonePath(ctx, sx + gap, sy + gap, sw - gap * 2, rh - gap * 2, radius, jitter);
            const gradient = ctx.createLinearGradient(sx, sy, sx + sw * 0.3, sy + rh);
            gradient.addColorStop(0, channels(tone + 0.05, 0, level + 0.04));
            gradient.addColorStop(1, channels(tone - 0.05, 0, level - 0.04));
            ctx.fillStyle = gradient;
            ctx.fill();
            spots.forEach(([px, py, pr, f]) => toneSpot(ctx, f, () => { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(sx + px, sy + py, pr, pr * 0.6, 0, 0, Math.PI * 2); ctx.fill(); }));
            if (chip) { ctx.fillStyle = channels(0.85, 0.5, level - 0.3); ctx.beginPath(); ctx.arc(sx + chip[0], sy + chip[1], chip[2], 0, Math.PI * 2); ctx.fill(); }
            if (crack) {
              ctx.strokeStyle = channels(0.7, 0.8, level - 0.35);
              ctx.lineWidth = 1.3;
              ctx.beginPath();
              let cx = sx + gap + crack[0] * (sw - gap * 2);
              let cy = sy + gap + 2;
              ctx.moveTo(cx, cy);
              for (let k = 1; k < 7; k++) { cx += (crack[k] - 0.5) * 14; cy += (rh - gap * 2) / 6; ctx.lineTo(cx, cy); }
              ctx.stroke();
            }
          });
          x += sw;
        });
      }
    });
  }

  // Bricks in running bond: varied firing (dark clinkers, pale ones), pores,
  // chipped corners, recessed sandy mortar and soot/rain streaks
  function brickStructure() {
    return structure('brick', 512, { seed: 13, bevel: 1, aoRadius: 4, ao: 2.2, bumpScale: 0.008, roughness: 0.95, jointRough: 1, speckleFreq: 128, mottleFreq: 4 }, (ctx, size, random) => {
      ctx.fillStyle = channels(1, 1, 0.3);
      ctx.fillRect(0, 0, size, size);
      const rows = 16;
      const rh = size / rows;
      const perRow = 5;
      const bw = size / perRow;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < perRow; col++) {
          const x = col * bw + (row % 2) * bw / 2;
          const y = row * rh;
          const roll = random();
          const tone = roll < 0.08 ? 0.62 + random() * 0.1 : roll < 0.16 ? 1.14 + random() * 0.08 : 0.9 + random() * 0.18;
          const level = 0.78 + random() * 0.08;
          const jitter = Array.from({ length: 8 }, () => (random() - 0.5) * 1.6);
          const pores = Array.from({ length: 26 }, () => [random() * bw, random() * rh, 0.6 + random() * 1.3]);
          const chips = Array.from({ length: 2 }, () => (random() < 0.3 ? [random() < 0.5 ? 4 : bw - 4, random() < 0.5 ? 4 : rh - 4, 2 + random() * 3] : null));
          const burn = random() < 0.4 ? [random() * bw, random() * rh, 10 + random() * 20] : null;
          wrapped(size, x, y, bw, rh, (dx, dy) => {
            const sx = x + dx;
            const sy = y + dy;
            stonePath(ctx, sx + 2.6, sy + 2.6, bw - 5.2, rh - 5.2, 2, jitter);
            const gradient = ctx.createLinearGradient(0, sy, 0, sy + rh);
            gradient.addColorStop(0, channels(tone + 0.04, 0, level + 0.02));
            gradient.addColorStop(1, channels(tone - 0.05, 0, level - 0.02));
            ctx.fillStyle = gradient;
            ctx.fill();
            if (burn) toneSpot(ctx, 0.85, () => { const gr = ctx.createRadialGradient(sx + burn[0], sy + burn[1], 0, sx + burn[0], sy + burn[1], burn[2]); gr.addColorStop(0, 'rgb(200, 255, 255)'); gr.addColorStop(1, 'rgb(255, 255, 255)'); ctx.fillStyle = gr; ctx.fillRect(sx, sy, bw, rh); });
            pores.forEach(([px, py, pr]) => { ctx.fillStyle = channels(tone * 0.8, 0, level - 0.18, 0.7); ctx.beginPath(); ctx.arc(sx + px, sy + py, pr, 0, Math.PI * 2); ctx.fill(); });
            chips.forEach((chip) => { if (chip) { ctx.fillStyle = channels(1, 1, 0.32); ctx.beginPath(); ctx.arc(sx + chip[0], sy + chip[1], chip[2], 0, Math.PI * 2); ctx.fill(); } });
          });
        }
      }
      // Soot and rain streaks running down the wall
      for (let k = 0; k < 14; k++) {
        const sx = random() * size;
        const sy = random() * size;
        const len = 80 + random() * 200;
        const width = 6 + random() * 18;
        const strength = 0.78 + random() * 0.15;
        wrapped(size, sx, sy, width, len, (dx, dy) => toneSpot(ctx, strength, () => {
          const gr = ctx.createLinearGradient(0, sy + dy, 0, sy + dy + len);
          gr.addColorStop(0, `rgb(${Math.round(strength * 255)}, 255, 255)`);
          gr.addColorStop(1, 'rgb(255, 255, 255)');
          ctx.fillStyle = gr;
          ctx.fillRect(sx + dx, sy + dy, width, len);
        }));
      }
    });
  }

  // Wood boards: growth rings warped around knots, fine fibers, butt joints
  // with nail heads, slightly cupped boards and dark seams
  function plankStructure() {
    return structure('plank', 512, { seed: 17, bevel: 1, aoRadius: 3, ao: 2, bumpScale: 0.006, roughness: 0.85, jointRough: 1, roughVar: 0.15, speckleFreq: 128, mottleFreq: 2 }, (ctx, size, random) => {
      const boards = 8;
      const bh = size / boards;
      const warp = noiseField(size, 2, 16, 3, 51);
      const fibers = noiseField(size, 8, 128, 2, 52);
      const plan = Array.from({ length: boards }, () => {
        const c1 = random() * size;
        const c2 = c1 + size * (0.35 + random() * 0.3);
        const segments = [0, 1].map(() => ({
          tone: 0.88 + random() * 0.22,
          offset: random() * 40,
          freq: 0.18 + random() * 0.14,
          knots: Array.from({ length: random() < 0.6 ? 1 + Math.floor(random() * 2) : 0 }, () => ({ x: random() * size, y: bh * (0.25 + random() * 0.5), rx: 7 + random() * 8, ry: 3 + random() * 3 }))
        }));
        return { c1, c2, segments };
      });
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let y = 0; y < size; y++) {
        const b = Math.floor(y / bh);
        const v = y - b * bh;
        const board = plan[b];
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const rel = ((x - board.c1) % size + size) % size;
          const seg = board.segments[rel < board.c2 - board.c1 ? 0 : 1];
          let ring = v + seg.offset + warp[i] * 18;
          let knotDark = 0;
          seg.knots.forEach((knot) => {
            let dx = Math.abs(x - knot.x);
            dx = Math.min(dx, size - dx) / knot.rx;
            const dy = (v - knot.y) / knot.ry;
            const d2 = dx * dx + dy * dy;
            if (d2 < 12) ring += 7 / (1 + d2 * 1.5);
            if (d2 < 1) knotDark = Math.max(knotDark, 1 - d2);
          });
          const phase = (ring * seg.freq) % 1;
          const late = Math.pow(1 - Math.abs(phase * 2 - 1), 6);
          let tone = seg.tone * (1 - late * 0.24) * (0.92 + fibers[i] * 0.16) * (1 - knotDark * 0.5);
          let joint = 0;
          let height = 0.78 + Math.sin((v / bh) * Math.PI) * 0.08 - late * 0.03 - knotDark * 0.05;
          // Seams between boards and butt joints
          const edge = Math.min(v, bh - 1 - v);
          const cut = Math.min(Math.abs(rel), Math.abs(rel - (board.c2 - board.c1)), size - rel);
          if (edge < 1.5 || cut < 1.2) { joint = 1; height = 0.15; }
          // Nail heads next to the joints
          const nail = [[board.c1 + 9, 10], [board.c1 + 9, bh - 11], [board.c2 + 9, 10], [board.c2 + 9, bh - 11]].some(([nx, ny]) => {
            let dx = Math.abs(x - nx % size);
            dx = Math.min(dx, size - dx);
            return dx * dx + (v - ny) * (v - ny) < 5;
          });
          if (nail) { joint = 0.75; height = 0.7; tone = 0.6; }
          d[i * 4] = Math.max(0, Math.min(255, tone * 160));
          d[i * 4 + 1] = joint * 255;
          d[i * 4 + 2] = height * 255;
          d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    });
  }

  // Trowelled plaster: sand grain, trowel strokes, soft stains, hairline cracks
  function stuccoStructure() {
    return structure('stucco', 512, { seed: 29, bevel: 1, aoRadius: 3, ao: 1.5, fineBump: 0.12, bumpScale: 0.004, roughness: 0.95, roughVar: 0.12, speckleFreq: 128, mottleFreq: 3 }, (ctx, size, random) => {
      const trowel = noiseField(size, 6, 4, 4, 61);
      const sand = noiseField(size, 128, 128, 1, 62);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let i = 0; i < size * size; i++) {
        d[i * 4] = (0.94 + trowel[i] * 0.1 + (sand[i] - 0.5) * 0.08) * 160;
        d[i * 4 + 1] = 0;
        d[i * 4 + 2] = (0.55 + trowel[i] * 0.25 + sand[i] * 0.2) * 255;
        d[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      for (let k = 0; k < 9; k++) {
        const x = random() * size;
        const y = random() * size;
        const r = 40 + random() * 120;
        const f = random() < 0.7 ? 0.88 + random() * 0.08 : 1.06;
        wrapped(size, x - r, y - r, r * 2, r * 2, (dx, dy) => toneSpot(ctx, f, () => {
          const gr = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gr.addColorStop(0, f < 1 ? `rgb(${Math.round(f * 255)}, 255, 255)` : `rgb(${Math.round((f - 1) * 255)}, 0, 0)`);
          gr.addColorStop(1, f < 1 ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)');
          ctx.fillStyle = gr;
          ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }));
      }
      ctx.lineWidth = 0.9;
      for (let c = 0; c < 4; c++) {
        let x = 20 + random() * (size - 40);
        let y = 20 + random() * (size - 60);
        ctx.strokeStyle = channels(0.75, 0.6, 0.3);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 12; k++) { x += (random() - 0.5) * 14; y += 3 + random() * 7; ctx.lineTo(Math.max(2, Math.min(size - 2, x)), Math.min(size - 2, y)); }
        ctx.stroke();
      }
    });
  }

  // Cast concrete: pores, aggregate, formwork seams with tie holes, water marks
  function concreteStructure() {
    return structure('concrete', 512, { seed: 37, bevel: 1, aoRadius: 3, ao: 2.2, fineBump: 0.1, bumpScale: 0.004, roughness: 0.92, speckleFreq: 128, mottleFreq: 3 }, (ctx, size, random) => {
      const cloud = noiseField(size, 5, 5, 5, 71);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let i = 0; i < size * size; i++) {
        d[i * 4] = (0.92 + cloud[i] * 0.16) * 160;
        d[i * 4 + 1] = 0;
        d[i * 4 + 2] = (0.7 + cloud[i] * 0.1) * 255;
        d[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      for (let k = 0; k < 2600; k++) {
        const x = random() * size;
        const y = random() * size;
        const r = 0.5 + Math.pow(random(), 3) * 2.4;
        ctx.fillStyle = random() < 0.75 ? channels(0.7, 0.35, 0.35) : channels(1.12, 0, 0.78);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      // Formwork panel seam along the tile edges and four tie holes
      ctx.fillStyle = channels(0.86, 0.45, 0.45);
      ctx.fillRect(0, 0, size, 2);
      ctx.fillRect(0, 0, 2, size);
      [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].forEach(([u, v]) => {
        ctx.fillStyle = channels(0.65, 0.8, 0.2);
        ctx.beginPath(); ctx.arc(u * size, v * size, 5, 0, Math.PI * 2); ctx.fill();
        toneSpot(ctx, 0.88, () => { ctx.fillRect(u * size - 4, v * size + 5, 8, 50 + random() * 60); });
      });
      for (let k = 0; k < 8; k++) {
        const x = random() * size;
        const w = 20 + random() * 60;
        const f = 0.86 + random() * 0.1;
        wrapped(size, x, 0, w, size, (dx) => toneSpot(ctx, f, () => {
          const gr = ctx.createLinearGradient(0, 0, 0, size);
          gr.addColorStop(0, `rgb(${Math.round(f * 255)}, 255, 255)`);
          gr.addColorStop(0.5, 'rgb(255, 255, 255)');
          gr.addColorStop(1, `rgb(${Math.round(f * 255)}, 255, 255)`);
          ctx.fillStyle = gr;
          ctx.fillRect(x + dx, 0, w, size);
        }));
      }
    });
  }

  // Clay barrel tiles in overlapping rows (curved, shadowed under each row)
  function roofTileStructure() {
    return structure('rooftile', 512, { seed: 41, bevel: 2, aoRadius: 6, ao: 2.4, bumpScale: 0.012, roughness: 0.8, speckleFreq: 128, mottleFreq: 4 }, (ctx, size, random) => {
      ctx.fillStyle = channels(0.6, 1, 0.1);
      ctx.fillRect(0, 0, size, size);
      const tile = 64;
      const rows = size / tile;
      for (let row = -1; row <= rows; row++) {
        for (let col = 0; col < size / tile; col++) {
          const x = col * tile + (row % 2 ? tile / 2 : 0);
          const y = row * tile;
          const tone = 0.86 + random() * 0.26;
          const lichen = random() < 0.15 ? [random() * tile, tile * (0.3 + random() * 0.5), 5 + random() * 9] : null;
          wrapped(size, x - tile / 2, y, tile, tile * 1.1, (dx, dy) => {
            const cx = x + dx;
            const cy = y + dy;
            ctx.beginPath();
            ctx.moveTo(cx - tile / 2 + 2, cy);
            ctx.lineTo(cx - tile / 2 + 2, cy + tile * 0.72);
            ctx.quadraticCurveTo(cx, cy + tile * 1.04, cx + tile / 2 - 2, cy + tile * 0.72);
            ctx.lineTo(cx + tile / 2 - 2, cy);
            ctx.closePath();
            const gr = ctx.createLinearGradient(cx - tile / 2, 0, cx + tile / 2, 0);
            gr.addColorStop(0, channels(tone * 0.78, 0, 0.45));
            gr.addColorStop(0.45, channels(tone * 1.08, 0, 0.95));
            gr.addColorStop(1, channels(tone * 0.74, 0, 0.42));
            ctx.fillStyle = gr;
            ctx.fill();
            // Shadow cast by the row above on the top of this tile
            toneSpot(ctx, 0.7, () => {
              const sh = ctx.createLinearGradient(0, cy, 0, cy + tile * 0.25);
              sh.addColorStop(0, 'rgb(170, 255, 255)');
              sh.addColorStop(1, 'rgb(255, 255, 255)');
              ctx.fillStyle = sh;
              ctx.fillRect(cx - tile / 2 + 2, cy, tile - 4, tile * 0.25);
            });
            if (lichen) toneSpot(ctx, 0.82, () => { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(cx - tile / 2 + lichen[0], cy + lichen[1], lichen[2], 0, Math.PI * 2); ctx.fill(); });
          });
        }
      }
    });
  }

  // Standing-seam metal roofing / cladding: raised ribs, oil-canning, rust streaks
  function metalRoofStructure() {
    return structure('metalroof', 512, { seed: 43, bevel: 2, aoRadius: 4, ao: 1.6, bumpScale: 0.01, roughness: 0.6, roughVar: 0.2, mottleFreq: 3, speckleFreq: 64 }, (ctx, size, random) => {
      const canning = noiseField(size, 8, 2, 3, 81);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      const pitch = size / 8;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const u = x % pitch;
          const rib = u < 6 ? 1 - Math.abs(u - 3) / 3 : 0;
          d[i * 4] = (0.95 + canning[i] * 0.1 + rib * 0.12) * 160;
          d[i * 4 + 1] = 0;
          d[i * 4 + 2] = (0.45 + canning[i] * 0.08 + rib * 0.5) * 255;
          d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      for (let k = 0; k < 10; k++) {
        const x = random() * size;
        const y = random() * size;
        const len = 60 + random() * 160;
        wrapped(size, x, y, 4, len, (dx, dy) => toneSpot(ctx, 0.8, () => {
          const gr = ctx.createLinearGradient(0, y + dy, 0, y + dy + len);
          gr.addColorStop(0, 'rgb(190, 255, 255)');
          gr.addColorStop(1, 'rgb(255, 255, 255)');
          ctx.fillStyle = gr;
          ctx.fillRect(x + dx, y + dy, 3 + random() * 4, len);
        }));
      }
    });
  }

  // Brushed metal: fine directional lines and a few scratches
  function brushedStructure() {
    return structure('brushed', 512, { seed: 47, bevel: 0, aoRadius: 2, ao: 0.5, fineBump: 0.02, bumpScale: 0.002, roughness: 0.7, roughVar: 0.35, mottleFreq: 2, speckleFreq: 64 }, (ctx, size, random) => {
      const lines = noiseField(size, 2, 256, 2, 91);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let i = 0; i < size * size; i++) {
        d[i * 4] = (0.93 + lines[i] * 0.14) * 160;
        d[i * 4 + 1] = 0;
        d[i * 4 + 2] = (0.5 + lines[i] * 0.3) * 255;
        d[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      ctx.lineWidth = 0.7;
      for (let k = 0; k < 40; k++) {
        const x = random() * size;
        const y = random() * size;
        const a = (random() - 0.5) * 0.6;
        const len = 20 + random() * 90;
        ctx.strokeStyle = channels(1.15, 0, 0.4, 0.6);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
      }
    });
  }

  // Asphalt: packed aggregate, tar patches, fine cracks
  function asphaltStructure() {
    return structure('asphalt', 512, { seed: 53, bevel: 1, aoRadius: 2, ao: 2, fineBump: 0.15, bumpScale: 0.004, roughness: 0.95, speckleFreq: 128, mottleFreq: 3 }, (ctx, size, random) => {
      ctx.fillStyle = channels(1, 0, 0.55);
      ctx.fillRect(0, 0, size, size);
      for (let k = 0; k < 14000; k++) {
        const x = random() * size;
        const y = random() * size;
        const r = 0.5 + Math.pow(random(), 2) * 1.8;
        const t = 0.6 + random() * 0.9;
        ctx.fillStyle = channels(t, 0, 0.6 + random() * 0.25);
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      for (let k = 0; k < 6; k++) {
        const x = random() * size;
        const y = random() * size;
        const r = 30 + random() * 70;
        wrapped(size, x - r, y - r, r * 2, r * 2, (dx, dy) => toneSpot(ctx, 0.8, () => {
          const gr = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          gr.addColorStop(0, 'rgb(190, 255, 255)');
          gr.addColorStop(1, 'rgb(255, 255, 255)');
          ctx.fillStyle = gr;
          ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
        }));
      }
      ctx.lineWidth = 1.1;
      for (let c = 0; c < 5; c++) {
        let x = 20 + random() * (size - 40);
        let y = 20 + random() * (size - 40);
        ctx.strokeStyle = channels(0.5, 0.9, 0.2);
        ctx.beginPath(); ctx.moveTo(x, y);
        const a = random() * Math.PI * 2;
        for (let k = 0; k < 14; k++) { x += Math.cos(a) * 6 + (random() - 0.5) * 8; y += Math.sin(a) * 6 + (random() - 0.5) * 8; ctx.lineTo(Math.max(2, Math.min(size - 2, x)), Math.max(2, Math.min(size - 2, y))); }
        ctx.stroke();
      }
    });
  }

  // Woven upholstery (twill) with slubs and pilling
  function fabricStructure() {
    return structure('fabric', 256, { seed: 59, bevel: 0, aoRadius: 1, ao: 1.2, fineBump: 0.1, bumpScale: 0.003, roughness: 1, roughVar: 0.05, mottleFreq: 2, speckleFreq: 128 }, (ctx, size) => {
      const slub = noiseField(size, 2, 32, 2, 101);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const over = ((((x >> 2) + (y >> 2)) % 2) + 2) % 2;
          const along = over ? Math.sin(((x % 4) + 0.5) / 4 * Math.PI) : Math.sin(((y % 4) + 0.5) / 4 * Math.PI);
          d[i * 4] = (0.86 + along * 0.16 + (slub[i] - 0.5) * 0.12) * 160;
          d[i * 4 + 1] = 0;
          d[i * 4 + 2] = (0.4 + along * 0.5) * 255;
          d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    });
  }

  // Loop-pile carpet
  function carpetStructure() {
    return structure('carpet', 256, { seed: 61, bevel: 0, aoRadius: 1, ao: 1.5, fineBump: 0.3, bumpScale: 0.003, roughness: 1, roughVar: 0.04, mottleFreq: 2, speckleFreq: 128 }, (ctx, size) => {
      const loops = noiseField(size, 128, 128, 1, 111);
      const tufts = noiseField(size, 32, 32, 2, 112);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let i = 0; i < size * size; i++) {
        d[i * 4] = (0.86 + loops[i] * 0.14 + tufts[i] * 0.08) * 160;
        d[i * 4 + 1] = 0;
        d[i * 4 + 2] = (0.35 + loops[i] * 0.45 + tufts[i] * 0.2) * 255;
        d[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
    });
  }

  // Polished marble: turbulent veins over a cloudy base (tileable sine bands)
  function marbleStructure() {
    return structure('marble', 512, { seed: 67, bevel: 0, aoRadius: 2, ao: 0.4, fineBump: 0.02, bumpScale: 0.001, roughness: 0.45, roughVar: 0.15, mottleFreq: 3, speckleFreq: 64 }, (ctx, size) => {
      const turbulence = noiseField(size, 4, 4, 6, 121);
      const cloud = noiseField(size, 3, 3, 4, 122);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const phase = (x / size) * Math.PI * 4 + (y / size) * Math.PI * 2 + turbulence[i] * 9;
          const vein = Math.pow(1 - Math.abs(Math.sin(phase)), 14);
          const thin = Math.pow(1 - Math.abs(Math.sin(phase * 2.0 + cloud[i] * 5)), 30);
          d[i * 4] = (1.04 + cloud[i] * 0.06 - vein * 0.32 - thin * 0.16) * 160;
          d[i * 4 + 1] = 0;
          d[i * 4 + 2] = 0.8 * 255;
          d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    });
  }

  // Granite / terrazzo speckle
  function graniteStructure() {
    return structure('granite', 512, { seed: 71, bevel: 0, aoRadius: 2, ao: 0.4, fineBump: 0.02, bumpScale: 0.001, roughness: 0.5, roughVar: 0.12, mottleFreq: 3, speckleFreq: 128 }, (ctx, size, random) => {
      ctx.fillStyle = channels(1, 0, 0.8);
      ctx.fillRect(0, 0, size, size);
      for (let k = 0; k < 16000; k++) {
        const r = 0.6 + Math.pow(random(), 3) * 3;
        const roll = random();
        ctx.fillStyle = channels(roll < 0.45 ? 0.55 + random() * 0.2 : roll < 0.85 ? 1.15 + random() * 0.15 : 0.85, 0, 0.8);
        ctx.beginPath(); ctx.arc(random() * size, random() * size, r, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  // Wind ripples in sand with scattered grains and shells
  function sandStructure() {
    return structure('sand', 512, { seed: 73, bevel: 2, aoRadius: 5, ao: 0.8, fineBump: 0.25, bumpScale: 0.006, roughness: 1, roughVar: 0.05, mottleFreq: 3, speckleFreq: 128 }, (ctx, size, random) => {
      const warp = noiseField(size, 3, 3, 4, 131);
      const grains = noiseField(size, 256, 256, 1, 132);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const ripple = Math.sin(((y / size) * 18 + (x / size) * 2 + warp[i] * 3) * Math.PI * 2);
          d[i * 4] = (0.96 + ripple * 0.04 + (grains[i] - 0.5) * 0.14) * 160;
          d[i * 4 + 1] = 0;
          d[i * 4 + 2] = (0.55 + ripple * 0.15 + grains[i] * 0.2) * 255;
          d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
      for (let k = 0; k < 220; k++) {
        ctx.fillStyle = channels(random() < 0.5 ? 0.7 : 1.25, 0, 0.8);
        ctx.beginPath(); ctx.arc(random() * size, random() * size, 0.8 + random() * 1.6, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  // Lawn: dense blades in several tones, clover patches, bare soil spots (the
  // "joint" channel is exposed soil, colored by the grout color)
  function grassStructure() {
    return structure('grass', 1024, { seed: 79, bevel: 1, aoRadius: 3, ao: 1.4, fineBump: 0.25, bumpScale: 0.004, roughness: 1, roughVar: 0.05, mottleFreq: 4, speckleFreq: 256 }, (ctx, size, random) => {
      const patches = noiseField(size, 6, 6, 5, 141);
      const soil = noiseField(size, 10, 10, 4, 142);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let i = 0; i < size * size; i++) {
        const bare = Math.max(0, Math.min(1, (0.2 - soil[i]) * 6));
        d[i * 4] = (0.86 + patches[i] * 0.26) * 160;
        d[i * 4 + 1] = bare * 200;
        d[i * 4 + 2] = (0.45 + patches[i] * 0.1) * 255;
        d[i * 4 + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      ctx.lineCap = 'round';
      for (let k = 0; k < 42000; k++) {
        const x = random() * size;
        const y = random() * size;
        const t = 0.55 + random() * 0.85;
        ctx.strokeStyle = channels(t, 0, 0.5 + random() * 0.45, 0.8);
        ctx.lineWidth = 0.8 + random() * 0.9;
        const a = -Math.PI / 2 + (random() - 0.5) * 1.2;
        const len = 3 + random() * 7;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); ctx.stroke();
      }
      for (let k = 0; k < 60; k++) {
        const x = random() * size;
        const y = random() * size;
        for (let c = 0; c < 10; c++) {
          ctx.fillStyle = channels(1.12, 0, 0.8, 0.8);
          ctx.beginPath(); ctx.arc(x + (random() - 0.5) * 24, y + (random() - 0.5) * 24, 2 + random() * 2, 0, Math.PI * 2); ctx.fill();
        }
      }
    });
  }

  // Polished stone floor tiles (large format): faint veins, per-tile tone,
  // grooved joints. cells = tiles across the texture (2..4)
  function tileStructure(cells) {
    const count = Math.max(2, Math.min(cells, 4));
    return structure(`tiles${count}`, 512, { seed: 83 + count, bevel: 1, aoRadius: 3, ao: 2, fineBump: 0.02, bumpScale: 0.004, roughness: 0.55, jointRough: 1, roughVar: 0.2, mottleFreq: 4, speckleFreq: 128 }, (ctx, size, random) => {
      const turbulence = noiseField(size, 4, 4, 5, 151);
      const tileSize = size / count;
      const tones = Array.from({ length: count * count }, () => 0.94 + random() * 0.12);
      const image = ctx.createImageData(size, size);
      const d = image.data;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const tx = Math.floor(x / tileSize);
          const ty = Math.floor(y / tileSize);
          const u = x - tx * tileSize;
          const v = y - ty * tileSize;
          const edge = Math.min(u, v, tileSize - 1 - u, tileSize - 1 - v);
          const phase = (x / size) * Math.PI * 2 + turbulence[i] * 7 + tx * 1.7;
          const vein = Math.pow(1 - Math.abs(Math.sin(phase)), 18);
          const joint = edge < 1.5 ? 1 : 0;
          d[i * 4] = (tones[ty * count + tx] - vein * 0.1) * 160;
          d[i * 4 + 1] = joint * 255;
          d[i * 4 + 2] = (joint ? 0.25 : 0.8 - (edge < 4 ? (4 - edge) * 0.03 : 0)) * 255;
          d[i * 4 + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    });
  }

  // ---- Public textures (same names and signatures as before) ---------------
  function cobbleTexture(base = '#c98b5a') {
    return colorize(`cobble|${base}`, paverStructure(), base, { grout: shade(base, -0.32), mottle: 0.1, speckle: 0.07, hueShift: 0.06, grime: '#4d4637', grimeAmount: 0.35 });
  }
  function brickTexture(base = '#b5533c') {
    return colorize(`brick|${base}`, brickStructure(), base, { grout: '#b9ad9a', mottle: 0.08, speckle: 0.1, hueShift: 0.05, grime: '#3e3a36', grimeAmount: 0.18, groutSpeckle: 0.4 });
  }
  function plankTexture(base = '#a8743f') {
    return colorize(`plank|${base}`, plankStructure(), base, { grout: shade(base, -0.38), mottle: 0.08, speckle: 0.03, hueShift: 0.03 });
  }
  function stuccoTexture(base = '#f1e3c8') {
    return colorize(`stucco|${base}`, stuccoStructure(), base, { mottle: 0.07, speckle: 0.05, hueShift: 0.02, grout: shade(base, -0.25) });
  }
  function concreteTexture(base = '#a7a39b') {
    return colorize(`concrete|${base}`, concreteStructure(), base, { grout: shade(base, -0.3), mottle: 0.1, speckle: 0.06, hueShift: 0.02 });
  }
  function roofTileTexture(base = '#c0392b') {
    return colorize(`rooftile|${base}`, roofTileStructure(), base, { grout: shade(base, -0.4), mottle: 0.12, speckle: 0.06, hueShift: 0.06, grime: '#3b3a30', grimeAmount: 0.25 });
  }
  function metalRoofTexture(base = '#7d8a96') {
    return colorize(`metalroof|${base}`, metalRoofStructure(), base, { mottle: 0.08, speckle: 0.03, hueShift: 0.02 });
  }
  function metalTexture(base = '#b8bec6') {
    return colorize(`brushed|${base}`, brushedStructure(), base, { mottle: 0.05, speckle: 0.02, hueShift: 0.01 });
  }
  function asphaltTexture(base = '#3d3f43') {
    return colorize(`asphalt|${base}`, asphaltStructure(), base, { grout: shade(base, -0.15), mottle: 0.1, speckle: 0.08, hueShift: 0.02 });
  }
  function fabricTexture(base = '#6c757d') {
    return colorize(`fabric|${base}`, fabricStructure(), base, { mottle: 0.06, speckle: 0.06, hueShift: 0.02 });
  }
  function carpetTexture(base = '#5c677d') {
    return colorize(`carpet|${base}`, carpetStructure(), base, { mottle: 0.08, speckle: 0.08, hueShift: 0.02 });
  }
  function marbleTexture(base = '#eeeae4') {
    return colorize(`marble|${base}`, marbleStructure(), base, { mottle: 0.04, speckle: 0.02, hueShift: 0.02 });
  }
  function graniteTexture(base = '#8f8b86') {
    return colorize(`granite|${base}`, graniteStructure(), base, { mottle: 0.05, speckle: 0.05, hueShift: 0.02 });
  }
  function sandTexture(base = '#e3cf9f') {
    return colorize(`sand|${base}`, sandStructure(), base, { mottle: 0.08, speckle: 0.05, hueShift: 0.04 });
  }
  function grassTexture(base = '#5f8f3a') {
    return colorize(`grass|${base}`, grassStructure(), base, {
      grout: '#6f5a3e', mottle: 0.2, speckle: 0.1, hueShift: 0.14, groutSpeckle: 0.5, toneAmount: 1.5,
      // A few tiny flowers and pebbles
      after: (ctx, w) => {
        const random = lcg(5);
        for (let k = 0; k < 160; k++) {
          ctx.fillStyle = ['#f8f9fa', '#ffe066', '#e599f7', '#ced4da'][k % 4];
          ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.arc(random() * w, random() * w, 1.4 + random() * 1.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    });
  }

  // Stone floor tiles (kept name: used for floors everywhere)
  function gridTexture(baseColor, lineColor, cells = 8) {
    const grout = new THREE.Color(baseColor).lerp(new THREE.Color(lineColor), 0.6);
    return colorize(`grid|${baseColor}|${lineColor}|${cells}`, tileStructure(cells), baseColor, { grout: `#${grout.getHexString()}`, mottle: 0.06, speckle: 0.03, hueShift: 0.02 });
  }

  // Asphalt road with worn lane markings (along V)
  function roadTexture(asphaltColor) {
    return colorize(`road|${asphaltColor}`, asphaltStructure(), asphaltColor, {
      grout: shade(asphaltColor, -0.15), mottle: 0.1, speckle: 0.08,
      after: (ctx, w, h) => {
        const random = lcg(9);
        ctx.fillStyle = 'rgba(240, 238, 228, 0.85)';
        ctx.fillRect(w / 2 - 6, 40, 12, 180);
        ctx.fillRect(w / 2 - 6, 296, 12, 180);
        // Worn paint: asphalt showing through
        for (let k = 0; k < 500; k++) {
          ctx.fillStyle = `rgba(40, 40, 40, ${0.2 + random() * 0.4})`;
          ctx.fillRect(w / 2 - 6 + random() * 12, 40 + random() * 440, 1 + random() * 2, 1 + random() * 3);
        }
        const edge = ctx.createLinearGradient(0, 0, 18, 0);
        edge.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        edge.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = edge;
        ctx.fillRect(0, 0, 18, h);
        ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1); ctx.fillRect(0, 0, 18, h); ctx.restore();
      }
    });
  }

  // Tileable water normal map (fractal ripples), RGB tangent-space normals
  let waterNormalTexture = null;
  function waterNormals() {
    if (waterNormalTexture) return waterNormalTexture;
    const size = 512;
    const a = noiseField(size, 8, 8, 4, 161);
    const b = noiseField(size, 16, 12, 3, 162);
    const height = a.map((value, i) => value * 0.65 + b[i] * 0.35);
    const bytes = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const dx = (height[y * size + (x + 1) % size] - height[y * size + (x - 1 + size) % size]) * 6;
        const dy = (height[((y + 1) % size) * size + x] - height[((y - 1 + size) % size) * size + x]) * 6;
        const len = Math.hypot(dx, dy, 1);
        bytes[i * 4] = (-dx / len * 0.5 + 0.5) * 255;
        bytes[i * 4 + 1] = (-dy / len * 0.5 + 0.5) * 255;
        bytes[i * 4 + 2] = (1 / len * 0.5 + 0.5) * 255;
        bytes[i * 4 + 3] = 255;
      }
    }
    waterNormalTexture = dataTexture(bytes, size, size);
    return waterNormalTexture;
  }

  // --------------------------------------------------------------------------
  // Realistic trees: one texture atlas (bark | dense foliage | leaf cluster
  // with transparent gaps) and merged tree geometries with UVs into each
  // region. Crowns are an organic leafy core plus crossed "leaf cards" cut
  // out with alphaTest, like trees in real games. One material for all trees.
  // --------------------------------------------------------------------------
  const treeAtlases = new Map();
  const LEAF_PALETTES = {
    green: ['#2f5d23', '#3b7029', '#4a8532', '#5d9a3a', '#6fae46', '#2a4f1f', '#86bf55'],
    blossom: ['#d6336c', '#e64980', '#f06595', '#f783ac', '#faa2c1', '#c2255c', '#fcc2d7'],
    autumn: ['#a33a0b', '#c2410c', '#e8590c', '#f08c00', '#fab005', '#862e0b', '#ffd43b']
  };
  function treeAtlas(variant = 'green') {
    if (treeAtlases.has(variant)) return treeAtlases.get(variant);
    let treeAtlasTexture = null;
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    let seed = 99;
    const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    // Bark (0..512): vertical fissures and plates
    ctx.fillStyle = '#5a4331';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 260; i++) {
      const x = random() * 512;
      ctx.strokeStyle = random() < 0.5 ? 'rgba(30, 20, 12, 0.55)' : 'rgba(150, 125, 100, 0.25)';
      ctx.lineWidth = 1 + random() * 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= 512; y += 32) ctx.lineTo(x + Math.sin(y * 0.05 + i) * 4 + (random() - 0.5) * 3, y);
      ctx.stroke();
    }
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = 'rgba(90, 110, 60, 0.18)';
      ctx.beginPath(); ctx.ellipse(random() * 512, random() * 512, 6 + random() * 18, 3 + random() * 8, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Leaves are drawn as small pointed ellipses with a midrib
    const leaf = (x, y, size, angle, color) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.quadraticCurveTo(size * 0.55, 0, 0, size);
      ctx.quadraticCurveTo(-size * 0.55, 0, 0, -size);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 230, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -size * 0.9); ctx.lineTo(0, size * 0.9); ctx.stroke();
      ctx.restore();
    };
    const greens = LEAF_PALETTES[variant] || LEAF_PALETTES.green;
    // Dense foliage (512..1024): fully covered, darker inside, light on top
    ctx.fillStyle = greens[0];
    ctx.fillRect(512, 0, 512, 512);
    for (let i = 0; i < 5200; i++) {
      const y = random() * 512;
      const shadeIndex = Math.min(greens.length - 1, Math.floor(random() * 4 + (1 - y / 512) * 3));
      leaf(512 + random() * 512, y, 5 + random() * 7, random() * Math.PI * 2, greens[shadeIndex]);
    }
    // Leaf cluster cut-out (1024..1536): a few twigs full of leaves, transparent gaps
    ctx.clearRect(1024, 0, 512, 512);
    ctx.save();
    ctx.beginPath(); ctx.rect(1024, 0, 512, 512); ctx.clip();
    for (let cluster = 0; cluster < 9; cluster++) {
      const cx = 1024 + 70 + random() * 372;
      const cy = 70 + random() * 372;
      ctx.strokeStyle = '#4a3726';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(1024 + 256, 500); ctx.quadraticCurveTo(cx, cy + 120, cx, cy); ctx.stroke();
      for (let i = 0; i < 160; i++) {
        const angle = random() * Math.PI * 2;
        const distance = Math.pow(random(), 0.7) * 85;
        leaf(cx + Math.cos(angle) * distance, cy + Math.sin(angle) * distance, 7 + random() * 8, angle + Math.PI / 2, greens[Math.floor(random() * greens.length)]);
      }
    }
    ctx.restore();
    treeAtlasTexture = new THREE.CanvasTexture(canvas);
    treeAtlasTexture.encoding = THREE.sRGBEncoding;
    treeAtlasTexture.anisotropy = 4;
    treeAtlases.set(variant, treeAtlasTexture);
    return treeAtlasTexture;
  }

  // variant: 'green' (default), 'blossom' (pink cherry trees) or 'autumn'
  const treeMaterials = new Map();
  function treeMaterial(variant = 'green') {
    if (!treeMaterials.has(variant)) treeMaterials.set(variant, new THREE.MeshStandardMaterial({ map: treeAtlas(variant), vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85 }));
    treeMaterials.get(variant).userData.variant = variant;
    return treeMaterials.get(variant);
  }

  // Merges parts { geometry, region: 0 bark | 1 foliage | 2 leaf cards, color }
  function mergeTreeParts(parts) {
    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    parts.forEach(({ geometry, region, color }) => {
      const flat = geometry.index ? geometry.toNonIndexed() : geometry;
      if (!flat.attributes.normal) flat.computeVertexNormals();
      positions.push(...flat.attributes.position.array);
      normals.push(...flat.attributes.normal.array);
      const uv = flat.attributes.uv.array;
      for (let i = 0; i < uv.length; i += 2) uvs.push((region + Math.min(0.999, Math.max(0.001, uv[i]))) / 3, uv[i + 1]);
      const tint = new THREE.Color(color || '#ffffff');
      for (let i = 0; i < flat.attributes.position.count; i++) colors.push(tint.r, tint.g, tint.b);
    });
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    merged.computeBoundingSphere();
    return merged;
  }

  // A lumpy, organic crown core (an icosphere pushed in and out)
  function leafyCore(radius, seed) {
    const core = new THREE.IcosahedronGeometry(radius, 1);
    const position = core.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const v = new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i));
      const n = 1 + 0.16 * Math.sin(v.x * 2.1 + seed) * Math.cos(v.y * 1.7 + seed * 2) + 0.08 * Math.sin(v.z * 3.3 + seed);
      v.multiplyScalar(n);
      v.y *= 0.85;
      position.setXYZ(i, v.x, v.y, v.z);
    }
    core.computeVertexNormals();
    return core;
  }

  const treeGeometryCache = new Map();
  // kind: 'broadleaf' (round crown) or 'pine'. Height about 7-9 m at scale 1.
  function realisticTreeGeometry(kind = 'broadleaf') {
    if (treeGeometryCache.has(kind)) return treeGeometryCache.get(kind);
    const parts = [];
    if (kind === 'pine') {
      parts.push({ geometry: new THREE.CylinderGeometry(0.22, 0.38, 7.5, 8).translate(0, 3.75, 0), region: 0, color: '#d8cfc6' });
      [[2.9, 3.4, 2.6], [2.4, 3.1, 4.4], [1.9, 2.8, 6.0], [1.3, 2.4, 7.5]].forEach(([radius, height, y], i) => {
        parts.push({ geometry: new THREE.ConeGeometry(radius, height, 10, 1, true).translate(0, y, 0), region: 1, color: i % 2 ? '#a9c9a0' : '#c2dcb6' });
        // Drooping needle cards around each tier
        for (let k = 0; k < 6; k++) {
          const card = new THREE.PlaneGeometry(radius * 1.1, height * 0.8);
          card.rotateX(-0.5);
          card.translate(0, y - height * 0.15, radius * 0.55);
          card.rotateY((k / 6) * Math.PI * 2 + i * 0.4);
          parts.push({ geometry: card, region: 2, color: '#8fb07f' });
        }
      });
    } else {
      parts.push({ geometry: new THREE.CylinderGeometry(0.2, 0.34, 4.2, 8).translate(0, 2.1, 0), region: 0, color: '#ffffff' });
      // Branches reaching into the crown
      [[0.9, 0.6], [-0.8, 2.2], [0.3, 4.1]].forEach(([tilt, turn]) => {
        const branch = new THREE.CylinderGeometry(0.07, 0.13, 2.4, 6).translate(0, 1.2, 0);
        branch.rotateZ(tilt);
        branch.rotateY(turn);
        branch.translate(0, 3.4, 0);
        parts.push({ geometry: branch, region: 0, color: '#ffffff' });
      });
      parts.push({ geometry: leafyCore(2.5, 1.3).translate(0, 5.6, 0), region: 1, color: '#ffffff' });
      parts.push({ geometry: leafyCore(1.6, 2.7).translate(1.3, 6.4, 0.6), region: 1, color: '#e6f2d8' });
      parts.push({ geometry: leafyCore(1.5, 4.1).translate(-1.2, 6.2, -0.8), region: 1, color: '#d6e8c6' });
      // Leaf cards sticking out of the crown (they break the round silhouette)
      for (let k = 0; k < 14; k++) {
        const card = new THREE.PlaneGeometry(2.8, 2.8);
        card.rotateX((k % 3 - 1) * 0.6);
        card.rotateY((k / 14) * Math.PI * 2 * 3);
        const angle = (k / 14) * Math.PI * 2;
        card.translate(Math.cos(angle) * 2.2, 4.8 + (k % 4) * 0.7, Math.sin(angle) * 2.2);
        parts.push({ geometry: card, region: 2, color: '#ffffff' });
      }
    }
    const geometry = mergeTreeParts(parts);
    geometry.userData.treeKind = kind;
    treeGeometryCache.set(kind, geometry);
    return geometry;
  }

  // A single (non-instanced) realistic tree, scaled to `height` meters
  function realisticTree(kind = 'broadleaf', height = 7, variant = 'green') {
    const tree = new THREE.Mesh(realisticTreeGeometry(kind), treeMaterial(variant));
    tree.scale.setScalar(height / (kind === 'pine' ? 8.8 : 8));
    tree.castShadow = true;
    tree.receiveShadow = true;
    return tree;
  }

  // Box with rounded vertical edges (softer, less "blocky" buildings)
  function roundedSlab(w, h, d, radius, slabMaterial) {
    const r = Math.min(radius, w / 2 - 0.01, d / 2 - 0.01);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -d / 2);
    shape.lineTo(w / 2 - r, -d / 2);
    shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    shape.lineTo(w / 2, d / 2 - r);
    shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    shape.lineTo(-w / 2 + r, d / 2);
    shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    shape.lineTo(-w / 2, -d / 2 + r);
    shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 6 });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, h / 2, 0);
    // Planar UVs so tiled textures wrap around the walls
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) + position.getZ(i)) / 4, position.getY(i) / 4);
    return mesh(geometry, slabMaterial);
  }

  // Unit-size rounded box (1 x 1 x 1, base at y=0) for instanced buildings.
  // UVs wrap around the perimeter so window textures tile cleanly on every wall.
  let roundedUnitGeometry = null;
  function roundedUnitBox() {
    if (roundedUnitGeometry) return roundedUnitGeometry;
    const r = 0.12;
    const shape = new THREE.Shape();
    shape.moveTo(-0.5 + r, -0.5);
    shape.lineTo(0.5 - r, -0.5);
    shape.quadraticCurveTo(0.5, -0.5, 0.5, -0.5 + r);
    shape.lineTo(0.5, 0.5 - r);
    shape.quadraticCurveTo(0.5, 0.5, 0.5 - r, 0.5);
    shape.lineTo(-0.5 + r, 0.5);
    shape.quadraticCurveTo(-0.5, 0.5, -0.5, 0.5 - r);
    shape.lineTo(-0.5, -0.5 + r);
    shape.quadraticCurveTo(-0.5, -0.5, -0.5 + r, -0.5);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 4 });
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 1, 0);
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < position.count; i++) {
      const angle = Math.atan2(position.getZ(i), position.getX(i));
      uv.setXY(i, (angle / (Math.PI * 2) + 0.5) * 4, position.getY(i));
    }
    geometry.computeVertexNormals();
    roundedUnitGeometry = geometry;
    return geometry;
  }

  // Merges every mesh of a group into one mesh per material (fewer draw calls for big interiors)
  function mergeByMaterial(source) {
    source.updateMatrixWorld(true);
    const buckets = new Map();
    source.traverse((node) => {
      if (!node.isMesh || Array.isArray(node.material)) return;
      const geometry = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
      geometry.applyMatrix4(node.matrixWorld);
      if (!buckets.has(node.material)) buckets.set(node.material, []);
      buckets.get(node.material).push(geometry);
    });
    const merged = new THREE.Group();
    buckets.forEach((geometries, bucketMaterial) => {
      const attributes = ['position', 'normal', 'uv'];
      const total = geometries.reduce((sum, geometry) => sum + geometry.attributes.position.count, 0);
      const output = new THREE.BufferGeometry();
      attributes.forEach((name) => {
        const size = name === 'uv' ? 2 : 3;
        const array = new Float32Array(total * size);
        let offset = 0;
        geometries.forEach((geometry) => {
          const attribute = geometry.attributes[name];
          if (attribute) array.set(attribute.array, offset);
          offset += geometry.attributes.position.count * size;
        });
        output.setAttribute(name, new THREE.BufferAttribute(array, size));
      });
      output.computeBoundingSphere();
      merged.add(mesh(output, bucketMaterial));
    });
    return merged;
  }

  // Floating text sprite (district names, pedestal captions, quest markers)
  function textSprite(text, { width = 8, color = '#ffffff', background = 'rgba(17, 15, 26, 0.78)', font = 'bold 44px Segoe UI, Arial, sans-serif' } = {}) {
    const texture = labelTexture(text, { bg: background, fg: color, width: 512, height: 128, font });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(width, width / 4, 1);
    sprite.raycast = () => {}; // Labels never block the 3D cursor
    return sprite;
  }

  // A box whose front face (+z) shows a texture
  // Box with a picture on its front face. A plain box (not the rounded one):
  // the rounded box keeps its UVs in thirds, so a sign on it only showed the
  // middle third of the picture (cut-off logos and names)
  const facedGeometryCache = new Map();
  function facedBox(w, h, d, bodyMaterial, frontMaterial, x, y, z) {
    const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
    if (!facedGeometryCache.has(key)) facedGeometryCache.set(key, new THREE.BoxGeometry(w, h, d));
    const materials = [bodyMaterial, bodyMaterial, bodyMaterial, bodyMaterial, frontMaterial, bodyMaterial];
    return mesh(facedGeometryCache.get(key), materials, x, y, z);
  }

  // Invisible spot you can sit on (E) for seats drawn as merged or instanced meshes
  function seat(x, y, z, label = 'Seat', rotationY = 0) {
    const spot = new THREE.Object3D();
    spot.position.set(x, y, z);
    spot.rotation.y = rotationY;
    return interactive(spot, 'sit', label);
  }

  function animate(object, update) {
    object.userData.animate = update;
    animatedObjects.push(object);
  }

  // A laptop with a code editor on screen; press E next to it to start working
  function laptop(x, y, z, rotationY = 0) {
    const computer = new THREE.Group();
    computer.add(box(0.7, 0.04, 0.48, material('#b0b7c3', { metalness: 0.7, roughness: 0.3 }), 0, 0.02, 0));
    const lid = new THREE.Group();
    lid.add(box(0.7, 0.46, 0.03, material('#b0b7c3', { metalness: 0.7, roughness: 0.3 }), 0, 0.23, 0));
    lid.add(box(0.64, 0.4, 0.01, new THREE.MeshBasicMaterial({ map: codeScreenTexture('main.js') }), 0, 0.23, 0.02));
    lid.position.z = -0.23;
    lid.rotation.x = -0.25;
    computer.add(lid);
    computer.position.set(x, y, z);
    computer.rotation.y = rotationY;
    return interactive(computer, 'laptop', 'Laptop');
  }

  // --------------------------------------------------------------------------
  // Orientation: props are modeled facing +z, then turned toward the map center
  // --------------------------------------------------------------------------
  function orientation(block, w, d, thinOnly) {
    const [px, , pz] = block.position;
    let axis;
    if (thinOnly) {
      axis = w < d ? 'x' : 'z';
    } else {
      axis = Math.abs(px) > Math.abs(pz) ? 'x' : 'z';
    }
    if (axis === 'z') {
      return { rotationY: pz > 0.01 ? Math.PI : 0, w, d };
    }
    return { rotationY: px > 0.01 ? -Math.PI / 2 : Math.PI / 2, w: d, d: w };
  }

  // --------------------------------------------------------------------------
  // Builders (each receives the block bounding box: w along x, h, d along z)
  // --------------------------------------------------------------------------
  const builders = {
    floor(group, { w, h, d, color, type }) {
      let floorMaterial = material(color, { roughness: 0.9 });
      if (/grid_base|sandbox_land|somnium/.test(type)) {
        const lines = /sandbox/.test(type) ? shade(color, -0.18) : shade(color, 0.12);
        floorMaterial = new THREE.MeshStandardMaterial({ map: repeated(gridTexture(color, lines), w / 8, d / 8), roughness: 0.85 });
      } else if (/aluminum/.test(type)) {
        floorMaterial = material(color, { roughness: 0.3, metalness: 0.6 });
      } else if (/carpet/.test(type)) {
        floorMaterial = new THREE.MeshStandardMaterial({ map: repeated(carpetTexture(color), w / 2, d / 2), roughness: 1 });
      } else if (/concrete/.test(type)) {
        floorMaterial = new THREE.MeshStandardMaterial({ map: repeated(concreteTexture(color), w / 4, d / 4), roughness: 0.9 });
      } else if (/office|pavilion|mall|museum/.test(type)) {
        floorMaterial = new THREE.MeshStandardMaterial({ map: repeated(gridTexture(color, shade(color, -0.06), 2), w / 3, d / 3), roughness: 0.7 });
      } else if (/^floor$/.test(type) && new THREE.Color(color).getHSL({}).l < 0.2) {
        floorMaterial = new THREE.MeshStandardMaterial({ map: repeated(gridTexture(color, shade(color, 0.12), 4), w / 4, d / 4), roughness: 0.8 });
      }
      group.add(box(w, h, d, floorMaterial));
    },

    slab(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color, { roughness: 0.6 })));
      const railMaterial = material('#9fb4c7', { transparent: true, opacity: 0.45, roughness: 0.1 });
      group.add(box(w, 1, 0.08, railMaterial, 0, h / 2 + 0.5, d / 2));
      group.add(box(0.08, 1, d, railMaterial, w / 2, h / 2 + 0.5, 0));
    },

    balcony(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color)));
      const glass = material('#bcd7ec', { transparent: true, opacity: 0.4, roughness: 0.05 });
      group.add(box(w, 1.1, 0.08, glass, 0, h / 2 + 0.55, d / 2));
      for (let x = -w / 2 + 2; x < w / 2; x += 6) group.add(cylinder(0.25, 0.25, 5.2, material('#ced6e0'), x, -2.6 - h / 2, d / 2 - 0.5));
    },

    road(group, { w, h, d, color, type }) {
      const alongX = w > d;
      const length = alongX ? w : d;
      // Warm paved promenades (Decentraland style) instead of asphalt with lane markings
      const texture = repeated(cobbleTexture('#d9a877'), alongX ? length / 6 : w / 6, alongX ? d / 6 : length / 6);
      const roadMaterial = /walkway/.test(type)
        ? material(color, { roughness: 0.8, surface: 'stone' })
        : /freeway/.test(type)
          ? new THREE.MeshStandardMaterial({ map: repeated(asphaltTexture('#3d3f43'), alongX ? length / 5 : w / 5, alongX ? d / 5 : length / 5), roughness: 0.95 })
          : new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
      group.add(box(w, h, d, roadMaterial));
      if (/walkway/.test(type)) {
        const edge = glow('#39d353', 0.6);
        group.add(box(alongX ? w : 0.12, 0.05, alongX ? 0.12 : d, edge, alongX ? 0 : -w / 2, h / 2, alongX ? -d / 2 : 0));
        group.add(box(alongX ? w : 0.12, 0.05, alongX ? 0.12 : d, edge, alongX ? 0 : w / 2, h / 2, alongX ? d / 2 : 0));
      }
    },

    water(group, { w, h, d, color }) {
      const water = box(w, h, d, material(color, { transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.2 }));
      water.castShadow = false;
      group.add(water);
      animate(water, (time) => { water.position.y = Math.sin(time * 0.8) * 0.03; });
    },

    waterfall(group, { w, h, d, color }) {
      const texture = repeated(stripeTexture(color), 2, 1);
      const fall = box(w, h, d, new THREE.MeshStandardMaterial({ map: texture, transparent: true, opacity: 0.85, emissive: color, emissiveIntensity: 0.25 }));
      group.add(fall);
      const pool = cylinder(w * 0.9, w, 0.4, material(color, { transparent: true, opacity: 0.7 }), 0, -h / 2, 0.6, 20);
      group.add(pool);
      animate(fall, (time) => { texture.offset.y = time * 0.8; });
    },

    floatingIsland(group, { w, h, color }) {
      const radius = w / 2;
      group.add(cylinder(radius, radius * 0.96, h * 0.3, material(color, { roughness: 1 }), 0, h / 2 - h * 0.15, 0, 28));
      group.add(cylinder(radius * 0.96, radius * 0.8, h * 0.5, material('#8d6e63', { roughness: 1 }), 0, h / 2 - h * 0.55, 0, 28));
      const rock = mesh(new THREE.ConeGeometry(radius * 0.8, h * 3.5, 14), material('#6d4c41', { roughness: 1, flatShading: true }), 0, h / 2 - h * 0.8 - h * 1.75, 0);
      rock.rotation.x = Math.PI;
      group.add(rock);
      // Cherry blossom trees and stone lanterns around the temple
      [[-8, -7], [8, -8], [-9, 6], [9, 7], [-4, 9]].forEach(([x, z]) => {
        group.add(cylinder(0.25, 0.35, 2.2, material('#5d4037'), x, h / 2 + 1.1, z, 8));
        group.add(mesh(new THREE.IcosahedronGeometry(1.6, 0), material('#ff9ff3', { flatShading: true }), x, h / 2 + 2.8, z));
      });
    },

    spawnPad(group, { w, h, color }) {
      group.add(cylinder(w / 2, w / 2, h, material('#24212f'), 0, 0, 0, 32));
      group.add(cylinder(w / 2 - 0.3, w / 2 - 0.3, h + 0.04, glow(color, 0.7), 0, 0, 0, 32));
      const ring = mesh(new THREE.TorusGeometry(w / 2 - 0.4, 0.08, 8, 48), glow('#ffffff', 1));
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      animate(ring, (time) => { ring.position.y = 0.6 + Math.sin(time * 2) * 0.5; ring.scale.setScalar(0.85 + Math.sin(time * 2) * 0.1); });
    },

    hologram(group, { w, h, color }) {
      const beam = cylinder(w / 2, w / 2, h, glow(color, 1.2, { transparent: true, opacity: 0.55 }), 0, 0, 0, 20);
      beam.castShadow = false;
      group.add(beam);
      group.add(cylinder(w, w * 1.1, 0.4, material('#2c2a38'), 0, -h / 2 + 0.2, 0, 20));
      for (let i = 0; i < 3; i++) {
        const ring = mesh(new THREE.TorusGeometry(w * 1.4 + i * 0.4, 0.06, 8, 40), glow(color, 1.4));
        ring.rotation.x = Math.PI / 2;
        group.add(ring);
        animate(ring, (time) => { ring.position.y = -h / 2 + ((time * 1.5 + i * (h / 3)) % h); });
      }
    },

    monolith(group, { w, h, d, color }) {
      const body = box(w, h, d, material(color, { roughness: 0.3, metalness: 0.4 }));
      group.add(body);
      const edge = glow(shade(color, 0.25), 1.2);
      group.add(box(w + 0.06, 0.12, d + 0.06, edge, 0, h / 2 - 0.4, 0));
      group.add(box(w + 0.06, 0.12, d + 0.06, edge, 0, -h / 2 + 0.6, 0));
      group.add(cylinder(w, w * 1.2, 0.5, material('#2c3e50'), 0, -h / 2 - 0.05, 0, 6));
    },

    nftFrame(group, { w, h, d, color, block }) {
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      inner.add(box(o.w, h, o.d, material(color)));
      inner.add(facedBox(o.w * 0.8, h * 0.6, 0.06, material('#ffffff'), material('#ffffff', { map: artTexture(7) }), 0, h * 0.05, o.d / 2 + 0.03));
      inner.add(box(o.w * 1.6, 0.4, o.w * 1.2, material('#2d3436'), 0, -h / 2 + 0.2, 0));
      group.add(inner);
    },

    palmTrunk(group, { w, h, color }) {
      for (let i = 0; i < 4; i++) {
        const segment = cylinder(w * 0.42 - i * 0.04, w * 0.5 - i * 0.04, h / 4, material(color, { flatShading: true }), Math.sin(i * 0.4) * 0.25, -h / 2 + h / 8 + (i * h) / 4, 0, 7);
        segment.rotation.z = -0.06 * i;
        group.add(segment);
      }
    },

    palmLeaves(group, { w, h, color }) {
      const leafMaterial = material(color, { flatShading: true, side: THREE.DoubleSide });
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2;
        const leaf = mesh(new THREE.ConeGeometry(0.45, w * 0.75, 4), leafMaterial);
        leaf.position.set(Math.cos(angle) * w * 0.3, 0, Math.sin(angle) * w * 0.3);
        leaf.rotation.set(0, -angle, Math.PI / 2 + 0.35);
        leaf.scale.set(1, 1, 0.25);
        group.add(leaf);
      }
      [[0.3, 0], [-0.2, 0.25], [0, -0.3]].forEach(([x, z]) => group.add(sphere(0.22, material('#6d4c41'), x, -h * 0.3, z, 8)));
    },

    beachChair(group, { w, h, d, color }) {
      const frame = material('#ffffff');
      group.add(box(w, 0.12, d * 0.65, material(color), 0, 0, d * 0.15));
      const back = box(w, 0.12, d * 0.4, material(color), 0, 0.35, -d * 0.32);
      back.rotation.x = 0.7;
      group.add(back);
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => group.add(box(0.08, h, 0.08, frame, (sx * w) / 2.3, -h / 4, (sz * d) / 2.6)));
    },

    umbrellaPole(group, { h }) {
      group.add(cylinder(0.08, 0.08, h, material('#ffffff')));
    },

    umbrellaTop(group, { w, h, color }) {
      const canopy = mesh(new THREE.ConeGeometry(w / 2, h, 8, 1, true), material(color, { side: THREE.DoubleSide, flatShading: true }));
      group.add(canopy);
      group.add(sphere(0.12, material('#ffffff'), 0, h / 2, 0, 8));
    },

    poolTable(group, { w, h, d }) {
      const wood = material('#5d3a1a');
      group.add(box(w, h * 0.35, d, wood, 0, h * 0.32, 0));
      group.add(box(w - 0.3, 0.06, d - 0.3, material('#1e8449', { roughness: 1 }), 0, h / 2 + 0.03, 0));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => group.add(box(0.35, h * 0.7, 0.35, wood, (sx * (w - 0.6)) / 2, -h * 0.15, (sz * (d - 0.6)) / 2)));
      const ballColors = ['#ffffff', '#f1c40f', '#2980b9', '#c0392b', '#8e44ad', '#e67e22', '#27ae60', '#111111'];
      ballColors.forEach((ballColor, index) => {
        const row = Math.floor(Math.sqrt(index * 2));
        group.add(sphere(0.11, material(ballColor, { roughness: 0.2 }), (index % 3) * 0.24 - 0.24 + row * 0.05, h / 2 + 0.17, -d * 0.2 + row * 0.22, 10));
      });
      const cue = cylinder(0.03, 0.05, d * 0.7, material('#d7b98e'), 0.6, h / 2 + 0.2, d * 0.15, 6);
      cue.rotation.x = Math.PI / 2;
      group.add(cue);
    },

    poolRails(group, { w, h, d, color }) {
      const rail = material(color);
      group.add(box(w, h, 0.3, rail, 0, 0, d / 2 - 0.15));
      group.add(box(w, h, 0.3, rail, 0, 0, -d / 2 + 0.15));
      group.add(box(0.3, h, d, rail, w / 2 - 0.15, 0, 0));
      group.add(box(0.3, h, d, rail, -w / 2 + 0.15, 0, 0));
      [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
        group.add(cylinder(0.14, 0.14, h + 0.02, material('#111111'), (sx * (w - 0.5)) / 2, 0.01, (sz * (d - 0.5)) / 2, 10)));
    },

    arcadeCabinet(group, { w, h, d, color, label, block }) {
      const o = orientation(block, w, d, false);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const body = material(color);
      inner.add(box(o.w, h, o.d * 0.7, body, 0, 0, -o.d * 0.15));
      inner.add(box(o.w, h * 0.45, o.d * 0.3, body, 0, -h * 0.275, o.d * 0.35));
      const panel = box(o.w, 0.12, o.d * 0.35, material('#1e1e2e'), 0, -h * 0.03, o.d * 0.33);
      panel.rotation.x = 0.25;
      inner.add(panel);
      inner.add(cylinder(0.05, 0.05, 0.3, material('#222'), -o.w * 0.2, 0.12 - h * 0.03, o.d * 0.33, 8));
      inner.add(sphere(0.1, material('#e74c3c'), -o.w * 0.2, 0.3 - h * 0.03, o.d * 0.33, 8));
      ['#f1c40f', '#3498db', '#2ecc71'].forEach((buttonColor, index) =>
        inner.add(cylinder(0.07, 0.07, 0.06, glow(buttonColor, 0.6), o.w * (0.05 + index * 0.12), 0.06 - h * 0.03, o.d * 0.33, 10)));
      const screen = box(o.w * 0.8, h * 0.32, 0.05, new THREE.MeshBasicMaterial({ map: arcadeScreenTexture(label || 'arcade', (color.length * 47) % 360) }), 0, h * 0.18, o.d * 0.2 + 0.03);
      inner.add(screen);
      inner.add(facedBox(o.w, h * 0.12, 0.1, body, new THREE.MeshBasicMaterial({ map: labelTexture(label || 'ARCADE', { bg: '#120f24', fg: '#ffe600', border: color }) }), 0, h * 0.44, o.d * 0.2 + 0.05));
      interactive(inner, 'arcade', label || 'Arcade');
      group.add(inner);
    },

    arcadeScreen(group, { w, h, d, color }) {
      group.add(box(w, h, d, glow(color, 0.9)));
    },

    kanban(group, { w, h, d, label, block }) {
      const title = (label || 'Kanban').replace(/^Kanban:\s*/, '');
      const texture = canvasTexture(`kanban|${title}`, 512, 420, (ctx, cw, ch) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = '#212529';
        ctx.font = 'bold 44px Segoe UI, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(title.toUpperCase(), cw / 2, 56);
        ctx.strokeStyle = '#adb5bd';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(20, 80); ctx.lineTo(cw - 20, 80); ctx.stroke();
        ctx.setLineDash([12, 10]);
        ctx.beginPath(); ctx.moveTo(cw / 2, 95); ctx.lineTo(cw / 2, ch - 20); ctx.stroke();
      });
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const frame = material('#495057', { metalness: 0.4 });
      inner.add(facedBox(o.w, h * 0.72, o.d, material('#dee2e6'), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.4 }), 0, h * 0.14, 0));
      inner.add(box(o.w + 0.2, 0.12, o.d + 0.1, frame, 0, h * 0.5, 0));
      inner.add(box(o.w + 0.2, 0.12, o.d + 0.1, frame, 0, -h * 0.22, 0));
      [-1, 1].forEach((side) => {
        inner.add(box(0.12, h, 0.12, frame, (side * (o.w + 0.1)) / 2, 0, 0));
        inner.add(box(0.12, 0.08, 1.2, frame, (side * (o.w + 0.1)) / 2, -h / 2 + 0.04, 0));
      });
      inner.add(box(o.w * 0.6, 0.08, 0.25, frame, 0, -h * 0.25, o.d / 2 + 0.12));
      [['#f03e3e', -0.15], ['#1971c2', 0], ['#2f9e44', 0.15]].forEach(([markerColor, offset]) =>
        inner.add(box(0.08, 0.08, 0.35, material(markerColor), o.w * offset, -h * 0.2, o.d / 2 + 0.15)));
      group.add(inner);
    },

    stickyNote(group, { w, h, d, color, label, block }) {
      const texture = labelTexture(label || '', { bg: color, fg: '#343a40', width: 256, height: 256, font: 'bold 30px Comic Sans MS, Segoe Print, cursive' });
      const o = orientation(block, w, d, true);
      const note = facedBox(o.w, h, o.d, material(color), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 }));
      note.rotation.set(0, o.rotationY, ((label || '').length % 5 - 2) * 0.03);
      group.add(note);
    },

    display(group, { w, h, d, color, label, type, block }) {
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      let screenTexture;
      if (/burndown/.test(type)) screenTexture = chartScreenTexture(label || 'Burndown');
      else if (/terminal/.test(type)) screenTexture = codeScreenTexture(label || 'Terminal');
      else screenTexture = codeScreenTexture(label || 'Station');
      const bezel = material(/terminal/.test(type) ? '#d0d3d8' : '#1d1d1f', { metalness: 0.5, roughness: 0.3 });
      inner.add(box(o.w, h * 0.85, o.d, bezel, 0, h * 0.075, 0));
      inner.add(box(o.w * 0.94, h * 0.75, 0.04, new THREE.MeshBasicMaterial({ map: screenTexture }), 0, h * 0.08, o.d / 2 + 0.02));
      if (/rgb/.test(type)) {
        const strip = box(o.w * 1.02, 0.06, o.d * 1.05, glow(color, 1.5), 0, -h * 0.35, 0);
        inner.add(strip);
        animate(strip, (time) => { strip.material = glow(`hsl(${Math.floor((time * 60) % 360)}, 90%, 60%)`, 1.5); });
      }
      inner.add(box(o.w * 0.08, h * 0.15, o.d * 0.6, bezel, 0, -h * 0.42, -o.d * 0.2));
      inner.add(box(o.w * 0.35, 0.06, Math.max(o.d * 2, 0.6), bezel, 0, -h / 2 + 0.03, 0));
      group.add(inner);
    },

    signPost(group, { w, h }) {
      group.add(cylinder(w / 2, w / 2, h, material('#dfe6e9', { metalness: 0.5 }), 0, 0, 0, 8));
      group.add(cylinder(w * 1.4, w * 1.6, 0.2, material('#636e72'), 0, -h / 2 + 0.1, 0, 8));
    },

    signBoard(group, { w, h, d, color, label, block }) {
      const o = orientation(block, w, d, true);
      const texture = labelTexture(label || '', { bg: '#14121f', fg: '#ffffff', border: color, font: 'bold 40px Segoe UI, Arial, sans-serif' });
      const face = new THREE.MeshBasicMaterial({ map: texture });
      const board = mesh(new THREE.BoxGeometry(o.w, h, o.d), [material(color), material(color), material(color), material(color), face, face]);
      board.rotation.y = o.rotationY;
      group.add(board);
    },

    desk(group, { w, h, d, color, label, block }) {
      const o = orientation(block, w, d, false);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      // Reception style desk: solid front, top slab, monitors and a lit logo strip
      inner.add(box(o.w, h * 0.92, o.d * 0.5, material(color), 0, -h * 0.04, o.d * 0.2));
      inner.add(box(o.w + 0.2, 0.08, o.d, material(shade(color, 0.2), { roughness: 0.3 }), 0, h / 2, 0));
      inner.add(box(o.w * 0.9, 0.12, 0.04, glow('#39d353', 1), 0, h * 0.15, o.d * 0.45 + 0.02));
      [-0.25, 0.25].forEach((offset) => {
        inner.add(box(0.9, 0.55, 0.06, material('#111'), o.w * offset, h / 2 + 0.4, -o.d * 0.15));
        { const added = box(0.84, 0.48, 0.02, new THREE.MeshBasicMaterial({ map: codeScreenTexture(label || 'Desk') }), o.w * offset, h / 2 + 0.4, -o.d * 0.15 - 0.04); added.rotation.y = Math.PI; inner.add(added); }
        inner.add(box(0.08, 0.2, 0.08, material('#111'), o.w * offset, h / 2 + 0.1, -o.d * 0.15));
      });
      inner.add(laptop(o.w * 0.35, h / 2 + 0.04, o.d * 0.05, Math.PI));
      group.add(inner);
    },

    battlestation(group, { w, h, d, color }) {
      group.add(box(w, 0.12, d, material(color), 0, h / 2 - 0.06, 0));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => group.add(box(0.12, h - 0.12, 0.12, material('#111'), (sx * (w - 0.3)) / 2, -0.06, (sz * (d - 0.3)) / 2)));
      group.add(box(0.8, 0.05, 0.3, material('#222'), 0, h / 2 + 0.03, d * 0.15));
      group.add(laptop(-w * 0.3, h / 2, d * 0.1, 0.3));
      const chair = new THREE.Group();
      chair.add(box(0.8, 0.12, 0.8, material('#e84118'), 0, 0, 0));
      chair.add(box(0.8, 1.2, 0.12, material('#e84118'), 0, 0.6, 0.4));
      chair.add(cylinder(0.06, 0.06, 0.6, material('#222'), 0, -0.3, 0, 8));
      chair.position.set(0, -h / 2 + 0.6, d * 0.8);
      group.add(chair);
    },

    table(group, { w, h, d, color }) {
      const top = material(color, { roughness: 0.4 });
      group.add(box(w, Math.min(0.15, h), d, top, 0, h / 2 - 0.07, 0));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => group.add(box(0.15, h, 0.15, material('#2d3436'), (sx * (w - 0.4)) / 2, -0.07, (sz * (d - 0.4)) / 2)));
      // Chairs around the long sides
      const chairMaterial = material('#2d3436');
      const along = w > d ? 'x' : 'z';
      const length = Math.max(w, d);
      const count = Math.max(2, Math.floor(length / 1.6));
      for (let i = 0; i < count; i++) {
        const t = -length / 2 + (length / count) * (i + 0.5);
        [-1, 1].forEach((side) => {
          const seat = box(0.7, 0.1, 0.7, chairMaterial);
          const offset = (along === 'x' ? d : w) / 2 + 0.6;
          if (along === 'x') seat.position.set(t, -h * 0.1, side * offset); else seat.position.set(side * offset, -h * 0.1, t);
          group.add(interactive(seat, 'sit', 'Chair'));
          // A laptop in front of every other seat, ready for simulated work
          if ((i + (side > 0 ? 1 : 0)) % 2 === 0) {
            const inset = (along === 'x' ? d : w) / 2 - 0.45;
            const facing = along === 'x' ? (side > 0 ? 0 : Math.PI) : (side > 0 ? Math.PI / 2 : -Math.PI / 2);
            group.add(along === 'x' ? laptop(t, h / 2, side * inset, facing) : laptop(side * inset, h / 2, t, facing));
          }
        });
      }
    },

    counter(group, { w, h, d, color }) {
      group.add(box(w, h - 0.1, d, material('#dcdde1'), 0, -0.05, 0));
      group.add(box(w + 0.1, 0.1, d + 0.1, material(color, { roughness: 0.2, surface: 'stone' }), 0, h / 2 - 0.05, 0));
      group.add(interactive(box(0.3, 0.35, 0.3, material('#57606f', { metalness: 0.6 }), 0, h / 2 + 0.17, -d * 0.3), 'coffee', 'Coffee machine'));
      group.add(cylinder(0.12, 0.1, 0.3, material('#e84118'), 0, h / 2 + 0.15, d * 0.2, 10));
    },

    sofa(group, { w, h, d, color, block }) {
      const o = orientation(block, w, d, false);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const fabric = material(color, { roughness: 1, surface: 'fabric' });
      inner.add(box(o.w, h * 0.45, o.d, fabric, 0, -h * 0.27, 0));
      inner.add(box(o.w, h * 0.9, o.d * 0.25, fabric, 0, -h * 0.05, -o.d * 0.38));
      [-1, 1].forEach((side) => inner.add(box(o.d * 0.2, h * 0.65, o.d, fabric, (side * (o.w - o.d * 0.2)) / 2, -h * 0.17, 0)));
      for (let i = 0; i < 3; i++) inner.add(interactive(box(o.w * 0.28, h * 0.15, o.d * 0.6, material(shade(color, 0.08), { roughness: 1, surface: 'fabric' }), -o.w * 0.3 + i * o.w * 0.3, h * 0.03, o.d * 0.05), 'sit', 'Sofa'));
      group.add(inner);
    },

    stairStep(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color)));
      group.add(box(w, 0.06, 0.2, material(shade(color, 0.2)), 0, h / 2, d / 2 - 0.1));
    },

    escalator(group, { w, h, d, color }) {
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const stepHeight = (h / steps) * (i + 1);
        group.add(box(w * 0.7, stepHeight, d / steps, material('#a4b0be', { metalness: 0.5 }), 0, -h / 2 + stepHeight / 2, d / 2 - (d / steps) * (i + 0.5)));
      }
      [-1, 1].forEach((side) => {
        const rail = box(0.25, 0.9, Math.hypot(d, h), material(color, { metalness: 0.4 }), (side * w) / 2.3, 0.4, 0);
        rail.rotation.x = Math.atan2(h, d);
        group.add(rail);
      });
    },

    wall(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color)));
      const alongX = w > d;
      const glassMaterial = material('#a8d8ff', { transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.3 });
      const length = alongX ? w : d;
      for (let t = -length / 2 + 3; t < length / 2 - 2; t += 4) {
        const pane = box(alongX ? 2.6 : w + 0.04, h * 0.3, alongX ? d + 0.04 : 2.6, glassMaterial, alongX ? t : 0, h * 0.12, alongX ? 0 : t);
        pane.castShadow = false;
        group.add(pane);
      }
      group.add(box(alongX ? w : w + 0.1, 0.3, alongX ? d + 0.1 : d, material(shade(color, 0.15)), 0, h / 2 - 0.15, 0));
    },

    glassFacade(group, { w, h, d, color }) {
      const glass = box(w * 0.6, h, d * 0.98, material('#d6eaf8', { transparent: true, opacity: 0.35, roughness: 0.02, metalness: 0.6 }));
      glass.castShadow = false;
      group.add(glass);
      const frame = material(color, { metalness: 0.8, roughness: 0.25 });
      for (let t = -d / 2; t <= d / 2 + 0.01; t += d / 4) group.add(box(w, h, 0.15, frame, 0, 0, t));
      group.add(box(w, 0.2, d, frame, 0, h / 2, 0));
    },

    gate(group, { w, h, d, color, label, block }) {
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const stone = material(color);
      inner.add(box(o.w * 0.18, h, o.d, stone, -o.w * 0.41, 0, 0));
      inner.add(box(o.w * 0.18, h, o.d, stone, o.w * 0.41, 0, 0));
      inner.add(box(o.w, h * 0.2, o.d * 1.2, stone, 0, h * 0.4, 0));
      const sign = new THREE.MeshBasicMaterial({ map: labelTexture(label || 'GENESIS PLAZA', { bg: '#14121f', fg: '#4dabf7', font: 'bold 54px Segoe UI, Arial, sans-serif' }) });
      inner.add(facedBox(o.w * 0.6, h * 0.12, 0.1, stone, sign, 0, h * 0.4, o.d * 0.6 + 0.05));
      inner.add(box(o.w * 0.64, 0.08, 0.08, glow('#1877f2', 1.4), 0, h * 0.3, o.d * 0.6 + 0.05));
      group.add(inner);
    },

    neonPillar(group, { w, h, color }) {
      group.add(cylinder(w * 0.45, w * 0.5, h, material('#1a1a2e', { metalness: 0.6 }), 0, 0, 0, 8));
      for (let i = 0; i < 4; i++) {
        const ring = cylinder(w * 0.55, w * 0.55, 0.15, glow(color, 1.8), 0, -h / 2 + (i + 0.5) * (h / 4), 0, 8);
        group.add(ring);
        animate(ring, (time) => { ring.material = glow(color, 1.2 + Math.sin(time * 4 + i) * 0.8); });
      }
      group.add(cylinder(w * 0.7, w * 0.7, 0.3, glow(color, 1.5), 0, h / 2, 0, 8));
    },

    serverRack(group, { w, h, d, color }) {
      const units = 3;
      for (let i = 0; i < units; i++) {
        const rackWidth = w / units - 0.15;
        const x = -w / 2 + (i + 0.5) * (w / units);
        group.add(box(rackWidth, h, d, material('#0b0b14', { metalness: 0.6 })));
        group.children[group.children.length - 1].position.x = x;
        group.add(box(rackWidth * 0.9, h * 0.92, 0.05, material(color, { metalness: 0.3 }), x, 0, d / 2 + 0.02));
        for (let led = 0; led < 10; led++) {
          const light = box(0.12, 0.06, 0.05, glow(led % 3 ? '#00ffcc' : '#ff007f', 1.5), x - rackWidth * 0.3, -h / 2 + 0.3 + led * (h / 11), d / 2 + 0.06);
          group.add(light);
          animate(light, (time) => { light.visible = Math.sin(time * (3 + led) + i * 2) > -0.3; });
        }
      }
    },

    castleTower(group, { w, h, d, color }) {
      const stone = material(color, { flatShading: true });
      group.add(box(w, h, d, stone));
      const merlonSize = w / 5;
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          if ((i === 0 || i === 4 || j === 0 || j === 4) && (i + j) % 2 === 0) {
            group.add(box(merlonSize, merlonSize, merlonSize, stone, -w / 2 + merlonSize * (i + 0.5), h / 2 + merlonSize / 2, -d / 2 + merlonSize * (j + 0.5)));
          }
        }
      }
      const flagPole = cylinder(0.08, 0.08, 4, material('#ddd'), 0, h / 2 + 2, 0, 6);
      group.add(flagPole);
      const flag = box(1.6, 1, 0.05, glow('#00d2ff', 0.6), 0.8, h / 2 + 3.4, 0);
      group.add(flag);
      animate(flag, (time) => { flag.rotation.y = Math.sin(time * 2) * 0.3; });
      for (let y = -h / 2 + 2; y < h / 2 - 1; y += 3) group.add(box(0.8, 1.2, 0.1, glow('#f9ca24', 0.8), 0, y, d / 2 + 0.05));
    },

    bridge(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color, { flatShading: true })));
      const railMaterial = material(shade(color, -0.15));
      for (let x = -w / 2; x <= w / 2 + 0.01; x += 1.5) {
        group.add(box(0.2, 1, 0.2, railMaterial, x, h / 2 + 0.5, d / 2 - 0.1));
        group.add(box(0.2, 1, 0.2, railMaterial, x, h / 2 + 0.5, -d / 2 + 0.1));
      }
      group.add(box(w, 0.15, 0.15, railMaterial, 0, h / 2 + 1, d / 2 - 0.1));
      group.add(box(w, 0.15, 0.15, railMaterial, 0, h / 2 + 1, -d / 2 + 0.1));
    },

    pedestal(group, { w, h, d, color, label }) {
      group.add(box(w, h * 0.9, d, material('#21262d', { roughness: 0.4 }), 0, -h * 0.05, 0));
      group.add(box(w * 1.05, h * 0.1, d * 1.05, glow(color, 0.8), 0, h * 0.45, 0));
      // Floating repository artifact: a file / folder / branch token spinning above the pedestal
      const isFolder = /\/$/.test(label || '');
      const isBranch = /^(feature|fix)\//.test(label || '');
      let artifact;
      if (isBranch) {
        artifact = new THREE.Group();
        artifact.add(cylinder(0.12, 0.12, 1.6, glow(color, 0.9), 0, 0, 0, 8));
        artifact.add(sphere(0.3, glow(color, 0.9), 0, 0.8, 0));
        artifact.add(sphere(0.3, glow(color, 0.9), 0, -0.8, 0));
        const branch = cylinder(0.1, 0.1, 0.9, glow(color, 0.9), 0.35, 0.2, 0, 8);
        branch.rotation.z = -0.8;
        artifact.add(branch);
        artifact.add(sphere(0.25, glow('#ffffff', 0.6), 0.7, 0.55, 0));
      } else if (isFolder) {
        artifact = box(1.4, 1, 0.3, glow(color, 0.7));
      } else {
        artifact = facedBox(1, 1.3, 0.15, glow(color, 0.5), new THREE.MeshBasicMaterial({ map: codeScreenTexture(label || 'file') }));
      }
      artifact.position.y = h / 2 + 1.4;
      group.add(artifact);
      animate(artifact, (time) => { artifact.rotation.y = time * 0.8; artifact.position.y = h / 2 + 1.4 + Math.sin(time * 2) * 0.15; });
      const caption = textSprite(label || '', { width: 4.5, color: '#ffffff', background: 'rgba(13, 17, 23, 0.85)', font: 'bold 40px Consolas, monospace' });
      caption.position.y = h / 2 + 3;
      group.add(caption);
    },

    commitWall(group, { w, h, d, color, label, block }) {
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      inner.add(box(o.w, h, o.d, material(color)));
      inner.add(box(o.w * 0.94, h * 0.55, 0.05, new THREE.MeshBasicMaterial({ map: contributionTexture() }), 0, -h * 0.05, o.d / 2 + 0.03));
      inner.add(facedBox(o.w * 0.94, h * 0.18, 0.05, material(color), new THREE.MeshBasicMaterial({ map: labelTexture(label || 'Commits', { bg: '#0d1117', fg: '#39d353' }) }), 0, h * 0.35, o.d / 2 + 0.03));
      group.add(inner);
    },

    contributionBlock(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color, { roughness: 0.4 })));
      group.add(box(w + 0.04, 0.06, d + 0.04, glow(color, 1.2), 0, h / 2, 0));
    },

    contributionGraph(group, { w, d }) {
      // A full year of contributions as instanced voxels (7 days x N weeks)
      const levels = ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'];
      const weeks = Math.floor(w / 0.6);
      const days = 7;
      const geometry = new THREE.BoxGeometry(0.45, 1, 0.45);
      geometry.translate(0, 0.5, 0);
      const voxels = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.4 }), weeks * days);
      const matrix = new THREE.Matrix4();
      const tint = new THREE.Color();
      let index = 0;
      for (let week = 0; week < weeks; week++) {
        for (let day = 0; day < days; day++) {
          const level = (week * 7 + day * 3 + (week % 5) * day + (week * day) % 4) % 5;
          matrix.makeScale(1, 0.15 + level * 0.45, 1);
          matrix.setPosition(-w / 2 + week * 0.6 + 0.3, 0, -d / 2 + day * (d / days) + d / 14);
          voxels.setMatrixAt(index, matrix);
          voxels.setColorAt(index, tint.set(levels[level]));
          index++;
        }
      }
      voxels.castShadow = true;
      voxels.receiveShadow = true;
      group.add(voxels);
    },

    stage(group, { w, h, d, color, type, block }) {
      const o = orientation(block, w, d, false);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      inner.add(box(o.w, h, o.d, material('#1e1e24')));
      inner.add(box(o.w + 0.1, 0.08, o.d + 0.1, glow(color, 0.8), 0, h / 2, 0));
      for (let i = 0; i < 3; i++) inner.add(box(o.w * 0.3, h * (i + 1) / 4, 0.5, material('#2d3436'), 0, -h / 2 + (h * (i + 1)) / 8, o.d / 2 + 0.25 + (2 - i) * 0.5));
      // Truss with stage lights and a backdrop screen
      const truss = material('#b2bec3', { metalness: 0.7 });
      [-1, 1].forEach((side) => inner.add(box(0.25, 5, 0.25, truss, (side * o.w) / 2.1, h / 2 + 2.5, -o.d / 2 + 0.3)));
      inner.add(box(o.w, 0.25, 0.25, truss, 0, h / 2 + 5, -o.d / 2 + 0.3));
      ['#ff7675', '#74b9ff', '#55efc4', '#ffeaa7'].forEach((lightColor, index) => {
        const light = cylinder(0.2, 0.3, 0.5, glow(lightColor, 1.5), -o.w * 0.35 + index * o.w * 0.23, h / 2 + 4.6, -o.d / 2 + 0.6, 8);
        inner.add(light);
        animate(light, (time) => { light.rotation.x = 0.6 + Math.sin(time * 1.5 + index) * 0.3; });
      });
      const backdrop = /show|music/.test(type) ? artTexture(3) : labelTexture(/horizon/.test(type) ? 'Keynote' : 'Live', { bg: '#0b0b14', fg: color });
      inner.add(box(o.w * 0.8, 3.2, 0.1, new THREE.MeshBasicMaterial({ map: backdrop }), 0, h / 2 + 2.6, -o.d / 2 + 0.2));
      [-1, 1].forEach((side) => inner.add(box(0.8, 1.6, 0.8, material('#111'), (side * o.w) / 2.6, h / 2 + 0.8, o.d / 2 - 0.6)));
      group.add(inner);
    },

    lounge(group, { w, h, d, color }) {
      const radius = Math.min(w, d) / 2;
      group.add(cylinder(radius, radius, h, material(color, { roughness: 1 }), 0, 0, 0, 32));
      group.add(cylinder(radius * 0.25, radius * 0.25, 0.6, material('#ffffff', { roughness: 0.3 }), 0, h / 2 + 0.3, 0, 16));
      const seats = 6;
      for (let i = 0; i < seats; i++) {
        const angle = (i / seats) * Math.PI * 2;
        group.add(sphere(0.55, material(shade(color, (i % 2 ? 0.15 : -0.1)), { roughness: 1 }), Math.cos(angle) * radius * 0.7, h / 2 + 0.35, Math.sin(angle) * radius * 0.7, 10));
      }
    },

    aiAvatar(group, { w, h, color }) {
      const bodyMaterial = glow(color, 0.5, { transparent: true, opacity: 0.9 });
      group.add(cylinder(w * 0.3, w * 0.4, h * 0.5, bodyMaterial, 0, -h * 0.05, 0, 12));
      const head = sphere(w * 0.3, glow('#ffffff', 0.7), 0, h * 0.35, 0, 16);
      group.add(head);
      group.add(cylinder(w * 0.6, w * 0.7, 0.2, material('#2d3436'), 0, -h / 2 + 0.1, 0, 16));
      const halo = mesh(new THREE.TorusGeometry(w * 0.5, 0.05, 8, 32), glow(color, 1.5));
      halo.rotation.x = Math.PI / 2;
      group.add(halo);
      animate(halo, (time) => { halo.position.y = Math.sin(time * 2) * h * 0.3; });
      animate(head, (time) => { head.position.y = h * 0.35 + Math.sin(time * 3) * 0.08; });
    },

    questZone(group, { w, h, color, label }) {
      group.add(cylinder(w / 2, w / 2, h, glow(color, 0.6), 0, 0, 0, 24));
      const marker = textSprite('!', { width: 3, color: '#f1c40f', background: 'rgba(0,0,0,0)', font: 'bold 120px Arial, sans-serif' });
      marker.position.y = 3;
      group.add(marker);
      animate(marker, (time) => { marker.position.y = 3 + Math.sin(time * 3) * 0.3; });
      // Quest giver NPC
      const npc = new THREE.Group();
      npc.add(box(0.7, 1.2, 0.5, material('#e67e22'), 0, 0.8, 0));
      npc.add(box(0.6, 0.6, 0.6, material('#f5cba7'), 0, 1.7, 0));
      npc.add(box(0.25, 0.8, 0.25, material('#2c3e50'), -0.18, 0.05, 0));
      npc.add(box(0.25, 0.8, 0.25, material('#2c3e50'), 0.18, 0.05, 0));
      npc.position.y = h / 2 - 0.2;
      group.add(npc);
      if (label) npc.userData.label = label;
    },

    altar(group, { w, h, d, color }) {
      for (let tier = 0; tier < 3; tier++) {
        const scale = 1 - tier * 0.25;
        group.add(box(w * scale, h / 3, d * scale, material(shade(color, -tier * 0.05)), 0, -h / 2 + (tier + 0.5) * (h / 3), 0));
      }
      const bonsai = new THREE.Group();
      bonsai.add(cylinder(0.12, 0.18, 0.8, material('#5d4037'), 0, 0.4, 0, 6));
      bonsai.add(mesh(new THREE.IcosahedronGeometry(0.6, 0), material('#2ed573', { flatShading: true }), 0, 1, 0));
      bonsai.position.y = h / 2;
      group.add(bonsai);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const lantern = new THREE.Group();
        lantern.add(box(0.3, 1, 0.3, material('#b2bec3'), 0, 0.5, 0));
        lantern.add(box(0.45, 0.35, 0.45, glow('#ffa502', 1.2), 0, 1.2, 0));
        lantern.add(box(0.6, 0.12, 0.6, material('#636e72'), 0, 1.45, 0));
        lantern.position.set((sx * w) / 2 + sx * 0.6, -h / 2, (sz * d) / 2 + sz * 0.6);
        group.add(lantern);
      });
    },

    building(group, { w, h, d, color, label, type, block }) {
      const o = orientation(block, w, d, false);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const wallTexture = windowsTexture(color);
      const sideMaterial = new THREE.MeshStandardMaterial({ map: repeated(wallTexture, Math.max(1, Math.round(o.w / 4)), Math.max(1, Math.round(h / 6))), roughness: 0.7 });
      const roofMaterial = new THREE.MeshStandardMaterial({ map: repeated(concreteTexture(shade(color, -0.08)), Math.max(1, o.w / 5), Math.max(1, o.d / 5)), roughness: 0.9 });
      inner.add(mesh(new THREE.BoxGeometry(o.w, h, o.d), [sideMaterial, sideMaterial, roofMaterial, roofMaterial, sideMaterial, sideMaterial]));
      inner.add(box(o.w + 0.3, 0.3, o.d + 0.3, material(shade(color, 0.12)), 0, h / 2 + 0.15, 0));

      const isShop = /shop|boutique|fashion|wearable/.test(type);
      const isCasino = /vegas|casino|east_district/.test(type);
      const isCyber = /aetheria|west_district/.test(type);
      const signColor = isCasino ? '#ffd32a' : isCyber ? '#00f0ff' : '#ffffff';

      if (isShop || h <= 3.5) {
        // Glass storefront, door and awning on the ground floor
        const storefront = box(o.w * 0.8, Math.min(2.4, h * 0.6), 0.08, material('#bcd7ec', { transparent: true, opacity: 0.55, roughness: 0.05 }), 0, -h / 2 + Math.min(1.2, h * 0.3), o.d / 2 + 0.04);
        storefront.castShadow = false;
        inner.add(storefront);
        if (isShop) {
          const awning = box(o.w * 0.85, 0.12, 1.4, material(isCasino ? '#c0392b' : '#1877f2'), 0, -h / 2 + 2.7, o.d / 2 + 0.7);
          awning.rotation.x = 0.25;
          inner.add(awning);
        }
      } else {
        inner.add(box(1.8, 2.4, 0.1, material('#2d3436'), 0, -h / 2 + 1.2, o.d / 2 + 0.05));
      }

      if (label) {
        const signText = label.split(/ - |\(/)[0].replace(/^Private Lot:\s*/, '').trim();
        const signWidth = Math.min(o.w * 0.9, 9);
        const sign = facedBox(signWidth, signWidth / 4, 0.15, material('#14121f'), new THREE.MeshBasicMaterial({ map: labelTexture(signText, { bg: '#14121f', fg: signColor, border: isCasino || isCyber ? signColor : null }) }), 0, Math.min(h / 2 - signWidth / 8 - 0.4, 2.5), o.d / 2 + 0.1);
        inner.add(sign);
      }
      if (isCasino) {
        const marquee = box(o.w * 0.9, 0.18, 0.18, glow('#ff3f34', 1.6), 0, h / 2 - 0.2, o.d / 2 + 0.12);
        inner.add(marquee);
        animate(marquee, (time) => { marquee.material = glow(Math.sin(time * 6) > 0 ? '#ff3f34' : '#ffd32a', 1.6); });
      }
      if (isCyber) {
        inner.add(cylinder(0.08, 0.08, 4, material('#dfe6e9'), o.w * 0.3, h / 2 + 2, 0, 6));
        const beacon = sphere(0.25, glow('#00f0ff', 2), o.w * 0.3, h / 2 + 4.1, 0, 8);
        inner.add(beacon);
        animate(beacon, (time) => { beacon.visible = Math.sin(time * 4) > 0; });
        inner.add(box(0.15, h * 0.9, 0.15, glow('#00f0ff', 1.2), -o.w / 2, 0, o.d / 2));
        inner.add(box(0.15, h * 0.9, 0.15, glow('#ff2d7a', 1.2), o.w / 2, 0, o.d / 2));
      }
      group.add(inner);
    },

    house(group, { w, h, d, color, label, type, block }) {
      const o = orientation(block, w, d, false);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      const locked = /unminted|locked/.test(type);
      const wallMaterial = locked
        ? material(color, { transparent: true, opacity: 0.35 })
        : new THREE.MeshStandardMaterial({ map: repeated(windowsTexture(color), 2, 1), roughness: 0.8 });
      inner.add(box(o.w, h * 0.65, o.d, wallMaterial, 0, -h * 0.175, 0));
      const roof = mesh(new THREE.ConeGeometry(Math.max(o.w, o.d) * 0.75, h * 0.45, 4), material(locked ? '#95a5a6' : '#c0392b', { flatShading: true, transparent: locked, opacity: locked ? 0.45 : 1 }), 0, h * 0.375, 0);
      roof.rotation.y = Math.PI / 4;
      inner.add(roof);
      inner.add(box(1.1, 1.8, 0.1, material('#5d4037'), 0, -h / 2 + 0.9, o.d / 2 + 0.05));
      const signText = locked ? 'FOR MINT' : 'MINTED';
      const sign = new THREE.Group();
      sign.add(box(0.1, 1.6, 0.1, material('#ecf0f1'), 0, 0.8, 0));
      sign.add(facedBox(1.8, 0.7, 0.08, material('#ecf0f1'), new THREE.MeshBasicMaterial({ map: labelTexture(signText, { bg: locked ? '#f39c12' : '#27ae60', fg: '#ffffff', font: 'bold 64px Segoe UI, Arial, sans-serif' }) }), 0, 1.6, 0.05));
      sign.position.set(o.w / 2 + 0.8, -h / 2, o.d / 2 + 0.8);
      inner.add(sign);
      if (locked) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(o.w, h * 0.65, o.d)), new THREE.LineBasicMaterial({ color: '#f39c12' }));
        edges.position.y = -h * 0.175;
        inner.add(edges);
      }
      group.add(inner);
    },

    galleryWall(group, { w, h, d, color, block }) {
      const o = orientation(block, w, d, true);
      const inner = new THREE.Group();
      inner.rotation.y = o.rotationY;
      inner.add(box(o.w, h, o.d, material(color)));
      const frames = Math.max(2, Math.floor(o.w / 3.5));
      for (let i = 0; i < frames; i++) {
        for (let row = 0; row < 2; row++) {
          const x = -o.w / 2 + (i + 0.5) * (o.w / frames);
          const y = row === 0 ? h * 0.15 : -h * 0.2;
          inner.add(box(2.4, 2, 0.12, material('#2d3436'), x, y, o.d / 2 + 0.06));
          inner.add(box(2.1, 1.7, 0.05, new THREE.MeshBasicMaterial({ map: artTexture(i * 2 + row + 11) }), x, y, o.d / 2 + 0.13));
        }
      }
      group.add(inner);
    },

    plant(group, { w, h, color, type }) {
      // Trees ("round_tree", "pine_tree"...) are realistic leafy trees standing on the ground
      if (/tree/.test(type || '')) {
        const tree = realisticTree(/pine|conifer|fir/.test(type) ? 'pine' : 'broadleaf', Math.max(3, h * 1.15));
        tree.position.y = -h / 2;
        group.add(tree);
        return;
      }
      group.add(cylinder(w * 0.35, w * 0.28, h * 0.3, material('#dfe4ea'), 0, -h * 0.35, 0, 10));
      group.add(mesh(new THREE.IcosahedronGeometry(w * 0.55, 0), material(color, { flatShading: true }), 0, h * 0.1, 0));
      group.add(mesh(new THREE.IcosahedronGeometry(w * 0.4, 0), material(shade(color, 0.08), { flatShading: true }), 0, h * 0.38, 0));
    },

    rug(group, { w, h, d, color }) {
      group.add(box(w, h, d, new THREE.MeshStandardMaterial({ map: repeated(carpetTexture(color), Math.max(1, w / 2), Math.max(1, d / 2)), roughness: 1 })));
    },

    beanbags(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color, { roughness: 1, surface: 'carpet' })));
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], index) =>
        group.add(sphere(0.6, material(['#ff6b6b', '#4dabf7', '#ffd43b', '#69db7c'][index], { roughness: 1, surface: 'fabric' }), (sx * w) / 3.5, h / 2 + 0.35, (sz * d) / 3.5, 10)));
      group.add(cylinder(0.5, 0.5, 0.5, material('#ffffff'), 0, h / 2 + 0.25, 0, 12));
    },

    platform(group, { w, h, d, color }) {
      if (Math.abs(w - d) < 0.5) {
        group.add(cylinder(w / 2, w / 2, h, material(color, { roughness: 0.5 }), 0, 0, 0, 40));
        const ring = mesh(new THREE.TorusGeometry(w / 2 - 0.4, 0.07, 6, 48), glow('#ffffff', 0.8));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h / 2 + 0.02;
        group.add(ring);
      } else {
        group.add(box(w, h, d, material(color)));
      }
    },

    fallback(group, { w, h, d, color }) {
      group.add(box(w, h, d, material(color, { roughness: 0.5 })));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), new THREE.LineBasicMaterial({ color: shade(color, -0.2) }));
      group.add(edges);
    }
  };

  // Ordered type matchers: first match wins
  const typeRules = [
    [/waterfall/, 'waterfall'],
    [/water/, 'water'],
    [/floating_island/, 'floatingIsland'],
    [/teleport|spawn/, 'spawnPad'],
    [/hologram/, 'hologram'],
    [/nft_display/, 'nftFrame'],
    [/monolith/, 'monolith'],
    [/road|street|walkway|freeway/, 'road'],
    [/balcony|terrace/, 'balcony'],
    [/slab/, 'slab'],
    [/palm_trunk/, 'palmTrunk'],
    [/palm_leaves/, 'palmLeaves'],
    [/beach_chair/, 'beachChair'],
    [/umbrella_top/, 'umbrellaTop'],
    [/beach_umbrella/, 'umbrellaPole'],
    [/pool_table_base/, 'poolTable'],
    [/pool_table_edge/, 'poolRails'],
    [/arcade_cabinet/, 'arcadeCabinet'],
    [/arcade_screen/, 'arcadeScreen'],
    [/kanban/, 'kanban'],
    [/sticky_note/, 'stickyNote'],
    [/screen|monitor|terminal/, 'display'],
    [/wayfinding_board|sign_board/, 'signBoard'],
    [/wayfinding_sign|sign_post/, 'signPost'],
    [/battlestation/, 'battlestation'],
    [/desk/, 'desk'],
    [/table/, 'table'],
    [/counter/, 'counter'],
    [/sofa/, 'sofa'],
    [/stairs/, 'stairStep'],
    [/escalator/, 'escalator'],
    [/glass_facade/, 'glassFacade'],
    [/gate/, 'gate'],
    [/wall$|_wall|^wall/, 'wall'],
    [/neon_pillar|pillar/, 'neonPillar'],
    [/server_rack/, 'serverRack'],
    [/castle/, 'castleTower'],
    [/bridge/, 'bridge'],
    [/pedestal/, 'pedestal'],
    [/commit_monument/, 'commitWall'],
    [/contribution_graph/, 'contributionGraph'],
    [/grid_block/, 'contributionBlock'],
    [/stage|podium/, 'stage'],
    [/lounge|circle/, 'lounge'],
    [/retro_corner/, 'beanbags'],
    [/ai_avatar/, 'aiAvatar'],
    [/quest|npc/, 'questZone'],
    [/altar/, 'altar'],
    [/property/, 'house'],
    [/gallery/, 'galleryWall'],
    [/plant|tree/, 'plant'],
    [/rug/, 'rug'],
    [/genesis_plaza|plaza_disc/, 'platform'],
    [/floor|ground|land_base|base_land|grid_base|carpet/, 'floor'],
    [/tower|shop|district|private_land|block|boutique|store|building/, 'building']
  ];

  function builderFor(type) {
    const rule = typeRules.find(([pattern]) => pattern.test(type));
    return builders[rule ? rule[1] : 'fallback'];
  }

  function toVector(value, fallback) {
    if (Array.isArray(value) && value.length === 3) return value;
    if (typeof value === 'number') return [value, value, value];
    return [fallback, fallback, fallback];
  }

  const SEAT_TYPES = /bench|sofa|chair|stool|couch|beanbag|lounge|picnic|bleacher|cushion|hammock|throne|swing/;

  // Builds one map block as a group positioned at its JSON coordinates
  function buildBlock(blockData) {
    const [w, h, d] = toVector(blockData.scale, 1);
    const [x, y, z] = toVector(blockData.position, 0);
    const type = blockData.type || 'block';
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.userData = { blockType: type, label: blockData.label || null };

    builderFor(type)(group, {
      w, h, d,
      color: blockData.color || '#cccccc',
      label: blockData.label || '',
      type,
      block: { position: [x, y, z] },
      data: blockData
    });
    if (typeof blockData.rotationY === 'number') group.rotation.y = blockData.rotationY;
    // Grain, relief and roughness maps for every material the builder made
    enhanceSurfaces(group);
    // Roblox-style: anything that looks like a seat can be sat on (E)
    if (SEAT_TYPES.test(type)) {
      let hasSeat = false;
      group.traverse((node) => { if (node !== group && node.userData.interactable) hasSeat = true; });
      if (!hasSeat) interactive(group, 'sit', blockData.label || type.replace(/_/g, ' '));
    }
    return group;
  }

  // Lets other files (landmarks.js) add builders for new block types
  function registerBuilder(pattern, name, builder) {
    builders[name] = builder;
    typeRules.unshift([pattern, name]);
  }

  const kit = {
    material, glow, shade, mesh, box, cylinder, sphere, facedBox, animate, orientation, textSprite, seat, roundedBoxGeometry,
    labelTexture, windowsTexture, gridTexture, roadTexture, repeated, codeScreenTexture, artTexture, canvasTexture,
    cobbleTexture, brickTexture, plankTexture, stuccoTexture, roofTileTexture, roundedSlab,
    concreteTexture, metalRoofTexture, metalTexture, asphaltTexture, fabricTexture, carpetTexture, marbleTexture, graniteTexture,
    sandTexture, grassTexture, waterNormals, surfaceStats, windowLightsFor, enhanceSurfaces, applyGrain, roundedUnitBox, mergeByMaterial, laptop, interactive,
    treeMaterial, realisticTreeGeometry, realisticTree
  };

  return { buildBlock, registerBuilder, kit, textSprite, material, glow, animatedObjects, interactables };
})();

// ============================================================================
// FIRE LIGHTS: FLICKERING FIRELIGHT AND SHADOWS AROUND FIREPITS AND CAMPFIRES
// ============================================================================
// Every fire registers here. Each one gets a warm pool of light painted on the
// ground (cheap, always on, brighter at night). On top of that a small pool of
// real point lights follows the fires nearest to the camera: they flicker like
// flames, and at night the closest one also casts soft shadows of the benches,
// logs and cursors around it (a point light shadow renders the scene six
// times, so only one fire casts them). By day the fires barely light anything.
const FireLights = (() => {
  const fires = [];
  const lights = [];
  const LIGHT_COUNT = 2;
  const RANGE = 70;
  const probe = new THREE.Vector3();
  let glowTexture = null;
  let scene = null;

  function groundGlowTexture() {
    if (glowTexture) return glowTexture;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(255, 170, 80, 1)');
    gradient.addColorStop(0.25, 'rgba(255, 120, 40, 0.55)');
    gradient.addColorStop(0.6, 'rgba(200, 70, 20, 0.16)');
    gradient.addColorStop(1, 'rgba(120, 40, 10, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    glowTexture = new THREE.CanvasTexture(canvas);
    return glowTexture;
  }

  // group: the fire (its origin is the center of the fire, on the ground)
  function register(group, { radius = 9, height = 1.2, strength = 1 } = {}) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.MeshBasicMaterial({ map: groundGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, polygonOffset: true, polygonOffsetFactor: -4 }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    glow.raycast = () => {};
    glow.renderOrder = 1;
    group.add(glow);
    fires.push({ group, glow, height, strength, phase: Math.random() * 10 });
  }

  function ensureLights() {
    if (lights.length || !scene) return;
    for (let i = 0; i < LIGHT_COUNT; i++) {
      const light = new THREE.PointLight('#ff8a3d', 0, 26, 2);
      light.shadow.mapSize.set(512, 512);
      light.shadow.bias = -0.004;
      light.shadow.radius = 4;
      light.shadow.camera.near = 0.3;
      light.shadow.camera.far = 26;
      light.userData.shadowCapable = false; // the quality governor leaves it alone
      scene.add(light);
      lights.push(light);
    }
  }

  function init(targetScene) {
    scene = targetScene;
  }

  // night: 0 by day, 1 at night; quality: 0 (minimum) .. 3 (high)
  function update(camera, time, night, quality = 2) {
    if (!scene) return;
    ensureLights();
    const flickerOf = (fire) => 0.78 + Math.sin(time * 9.7 + fire.phase) * 0.09 + Math.sin(time * 23.3 + fire.phase * 1.7) * 0.07 + Math.sin(time * 3.1 + fire.phase * 0.6) * 0.06;
    // Ground glow on every fire (stronger at night)
    const nearby = [];
    fires.forEach((fire) => {
      if (!fire.group.parent) return;
      const flicker = flickerOf(fire);
      fire.glow.material.opacity = Math.min(1, (0.12 + night * 0.85) * flicker * fire.strength);
      fire.glow.scale.setScalar(0.94 + flicker * 0.08);
      fire.group.getWorldPosition(probe);
      const distance = probe.distanceTo(camera.position);
      if (distance < RANGE) nearby.push({ fire, distance, position: probe.clone(), flicker });
    });
    nearby.sort((a, b) => a.distance - b.distance);
    // castShadow only flips at dusk and dawn (flipping it recompiles the shaders);
    // with no fire nearby the shadow map simply stops updating
    const castShadows = night > 0.5 && quality >= 2;
    lights.forEach((light, index) => {
      const entry = nearby[index];
      light.castShadow = castShadows && index === 0;
      light.shadow.autoUpdate = Boolean(entry) && light.castShadow;
      if (!entry) { light.intensity = 0; return; }
      const { fire, position, flicker } = entry;
      // The light dances a little with the flames
      light.position.set(position.x + Math.sin(time * 6.3 + fire.phase) * 0.12, position.y + fire.height + Math.sin(time * 8.1 + fire.phase) * 0.08, position.z + Math.cos(time * 5.7 + fire.phase) * 0.12);
      light.color.setHSL(0.07 + Math.sin(time * 4 + fire.phase) * 0.01, 1, 0.55);
      light.intensity = (0.25 + night * 4.2) * flicker * fire.strength;
      light.distance = 14 + night * 18;
    });
  }

  return { init, register, update };
})();
