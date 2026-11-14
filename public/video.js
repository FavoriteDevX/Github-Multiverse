// ============================================================================
// VIDEO SCREENS: OFFICIAL YOUTUBE EMBEDS PLAYING INSIDE THE 3D WORLD
// ============================================================================
// Screens register here with the YouTube embed they should play. When the
// avatar gets close and nothing blocks the view, a CSS3D iframe is placed
// exactly over the screen and autoplays muted (browsers only allow muted
// autoplay); click the video to turn the sound on. Far away it is removed.
const VideoScreens = (() => {
  const PIXEL_WIDTH = 1280;
  const ACTIVATE_DISTANCE = 70;
  const screens = [];
  let cssRenderer = null;
  let cssScene = null;
  let lastOcclusionCheck = 0;
  let soundOn = false;
  let audible = null; // the nearest active screen (the only one with sound)
  const occlusionRay = new THREE.Raycaster();
  const worldPosition = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const worldScale = new THREE.Vector3();

  // YouTube embed that autoplays muted and loops a list of official videos
  function youtubeEmbed(videoIds) {
    const [first, ...rest] = videoIds;
    const playlist = [first, ...rest].join(',');
    return `https://www.youtube.com/embed/${first}?autoplay=1&mute=1&loop=1&playlist=${playlist}&playsinline=1&rel=0&modestbranding=1`;
  }

  // Embed of a channel's uploads (UU + channel id without the leading UC)
  function channelUploadsEmbed(channelId) {
    return `https://www.youtube.com/embed/videoseries?list=UU${channelId.slice(2)}&autoplay=1&mute=1&loop=1&playsinline=1&rel=0`;
  }

  // `spatial` screens play with sound on their own, louder as you get closer:
  // full volume within `full` meters (inside the venue), silent at `fade`
  function register(anchor, width, height, source, { distance = ACTIVATE_DISTANCE, spatial = null } = {}) {
    const screen = { anchor, width, height, source, distance, spatial, volume: -1, object: null, visible: true };
    screens.push(screen);
    return {
      setSource(next) {
        screen.source = next;
        if (screen.object) { removeIframe(screen); }
      }
    };
  }

  function createIframe(screen) {
    const element = document.createElement('div');
    element.style.width = `${PIXEL_WIDTH}px`;
    element.style.height = `${Math.round(PIXEL_WIDTH * screen.height / screen.width)}px`;
    element.style.backfaceVisibility = 'hidden';
    element.style.pointerEvents = 'auto';
    element.style.background = '#000';
    const iframe = document.createElement('iframe');
    // Only the nearest screen plays sound, so streams never overlap. Spatial
    // screens start unmuted at volume 0 and are driven by distance (YouTube's
    // player API through postMessage)
    if (screen.spatial) {
      iframe.src = `${screen.source.replace('mute=1', 'mute=0')}&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
      screen.volume = -1;
      iframe.addEventListener('load', () => { screen.volume = -1; command(screen, 'setVolume', [0]); });
    } else iframe.src = soundOn && screen === audible ? screen.source.replace('mute=1', 'mute=0').replace('muted=true', 'muted=false') : screen.source;
    iframe.title = 'Video screen';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'width:100%;height:100%;border:0;';
    element.appendChild(iframe);
    screen.object = new THREE.CSS3DObject(element);
    cssScene.add(screen.object);
  }

  function command(screen, func, args = []) {
    const iframe = screen.object && screen.object.element.querySelector('iframe');
    if (iframe && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), '*');
  }
  // Volume from distance: 100 inside, a smooth fade to 0 at the edge
  function spatialVolume(screen, distance) {
    if (screen !== audible || (typeof Sound !== 'undefined' && !Sound.isEnabled())) return 0;
    const { full, fade } = screen.spatial;
    if (distance <= full) return 100;
    const t = Math.min(1, (distance - full) / Math.max(1, fade - full));
    return Math.round(100 * (1 - t) * (1 - t));
  }

  function removeIframe(screen) {
    cssScene.remove(screen.object);
    screen.object.element.remove();
    screen.object = null;
  }

  function init(container) {
    cssScene = new THREE.Scene();
    cssRenderer = new THREE.CSS3DRenderer();
    cssRenderer.setSize(window.innerWidth, window.innerHeight);
    const element = cssRenderer.domElement;
    element.id = 'video-layer';
    element.style.position = 'absolute';
    element.style.inset = '0';
    element.style.pointerEvents = 'none';
    container.prepend(element);
    window.addEventListener('resize', () => cssRenderer.setSize(window.innerWidth, window.innerHeight));
  }

  function update(camera, avatarPosition, collidables) {
    if (!cssRenderer) return;
    const now = performance.now();
    const checkOcclusion = now - lastOcclusionCheck > 400;
    if (checkOcclusion) lastOcclusionCheck = now;
    // Which active screen is the nearest one (re-checked twice a second)
    if (checkOcclusion) {
      let nearest = null;
      let best = Infinity;
      screens.forEach((screen) => {
        if (!screen.anchor.parent || !screen.source) return;
        screen.anchor.getWorldPosition(worldPosition);
        const distance = worldPosition.distanceTo(avatarPosition);
        if (distance < screen.distance && distance < best) { best = distance; nearest = screen; }
      });
      if (nearest !== audible) {
        const previous = audible;
        audible = nearest;
        if (soundOn) [previous, nearest].forEach((screen) => { if (screen && screen.object && !screen.spatial) removeIframe(screen); });
      }
    }
    screens.forEach((screen) => {
      if (!screen.anchor.parent || !screen.source) { if (screen.object) removeIframe(screen); return; }
      screen.anchor.getWorldPosition(worldPosition);
      const near = worldPosition.distanceTo(avatarPosition) < screen.distance;
      if (near && !screen.object) createIframe(screen);
      if (!near && screen.object) removeIframe(screen);
      if (!screen.object) return;
      screen.anchor.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
      screen.object.position.copy(worldPosition);
      screen.object.quaternion.copy(worldQuaternion);
      const pixelsToMeters = screen.width / PIXEL_WIDTH;
      screen.object.scale.set(pixelsToMeters, pixelsToMeters, pixelsToMeters);
      // Hide the iframe when a wall stands between the camera and the screen
      if (checkOcclusion) {
        const direction = worldPosition.clone().sub(camera.position);
        const distance = direction.length();
        occlusionRay.set(camera.position, direction.normalize());
        occlusionRay.far = distance - 1;
        const blocked = occlusionRay.intersectObjects(collidables(), true).some((hit) => hit.object.visible && !hit.object.isSprite && hit.object !== screen.anchor && !(hit.object.material && hit.object.material.transparent));
        screen.visible = !blocked;
      }
      screen.object.element.style.visibility = screen.visible ? 'visible' : 'hidden';
      if (screen.spatial) {
        const target = spatialVolume(screen, worldPosition.distanceTo(avatarPosition));
        if (Math.abs(target - screen.volume) >= 2 || (target === 0 && screen.volume !== 0) || (target === 100 && screen.volume !== 100)) {
          screen.volume = target;
          command(screen, target > 0 ? 'unMute' : 'mute');
          command(screen, 'setVolume', [target]);
        }
      }
    });
    cssRenderer.render(cssScene, camera);
  }

  // V toggles the sound: screens reload unmuted (a key press lets the browser
  // allow autoplay with sound). Returns the new state.
  function toggleSound() {
    soundOn = !soundOn;
    screens.forEach((screen) => { if (screen.object && !screen.spatial) removeIframe(screen); });
    return soundOn;
  }

  return { init, update, register, youtubeEmbed, channelUploadsEmbed, toggleSound };
})();
