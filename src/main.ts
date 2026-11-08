import './style.css';
import {
  ACESFilmicToneMapping,
  AmbientLight,
  Color,
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createAtmosphere } from './atmosphere';
import { createCharacters } from './characters';
import { createFoliage } from './foliage';
import { createIsland } from './island';
import {
  TAU,
  frontSeason,
  globalLightMix,
  seekTarget,
} from './season';
import { sweepUniform, timeUniform } from './shaders';
import { bindUi } from './ui';

const LIGHTS = [
  { key: '#ffe0c2', fill: '#f6b9d4', hemi: '#ffe8f2', keyI: 2.15, hemiI: 0.62 },
  { key: '#fff1c4', fill: '#f3f6d4', hemi: '#e7f2c8', keyI: 2.35, hemiI: 0.7 },
  { key: '#ffc592', fill: '#ffd2a8', hemi: '#f3d0ae', keyI: 2.0, hemiI: 0.58 },
  { key: '#d5e4ff', fill: '#dbe8f5', hemi: '#e4eef8', keyI: 1.7, hemiI: 0.5 },
];

const errors: string[] = [];
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function showBootError(message: string): void {
  const fallback = document.querySelector<HTMLElement>('#fallback');
  const copy = document.querySelector<HTMLElement>('#fallback-copy');
  if (copy) copy.textContent = message;
  if (fallback) fallback.hidden = false;
}

function boot(): void {
  const stage = document.querySelector<HTMLElement>('#stage');
  if (!stage) return;

  const params = new URLSearchParams(location.search);
  const narrow = window.innerWidth < 840;
  const quality = {
    grass: narrow ? 2200 : 5200,
    flowers: narrow ? 16 : 32,
    leaves: narrow ? 14 : 26,
    petals: narrow ? 12 : 22,
    stars: narrow ? 700 : 1400,
    debris: narrow ? 150 : 380,
    fireflies: narrow ? 28 : 70,
    rings: narrow ? 28 : 48,
    segments: narrow ? 64 : 96,
    bloom: !narrow && !params.has('nobloom'),
    shadow: narrow ? 512 : 1024,
    msaa: narrow ? 0 : 4,
  };

  let reduced = reducedQuery.matches;
  let playing = !reduced;
  if (params.has('pause')) playing = false;
  if (params.get('play') === '1') playing = true;
  const minSpeed = 0.25;
  const maxSpeed = 5;
  const clampSpeed = (value: number): number => Math.min(maxSpeed, Math.max(minSpeed, value));
  let speed = Number(params.get('speed') ?? '1');
  if (!Number.isFinite(speed)) speed = 1;
  speed = clampSpeed(speed);

  let sweep = TAU * 0.94;
  const sweepRaw = params.get('sweep');
  if (sweepRaw !== null && Number.isFinite(Number(sweepRaw))) sweep = Number(sweepRaw);

  const canvas = document.createElement('canvas');
  canvas.id = 'view';
  stage.prepend(canvas);
  const gl = canvas.getContext('webgl2', {
    antialias: !quality.bloom,
    alpha: false,
    powerPreference: 'high-performance',
    failIfMajorPerformanceCaveat: false,
  });
  if (!gl) {
    showBootError('这台浏览器没有点亮三维星空。换一个支持 WebGL 的浏览器，再陪我走一季。');
    return;
  }

  const renderer = new WebGLRenderer({
    canvas,
    context: gl,
    antialias: !quality.bloom,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x070d20, 1);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.debug.onShaderError = (context, _program, vertexShader, fragmentShader) => {
    const vs = context.getShaderInfoLog(vertexShader) ?? '';
    const fs = context.getShaderInfoLog(fragmentShader) ?? '';
    const message = `Shader error\n${vs}\n${fs}`;
    errors.push(message);
    console.error(message);
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(33, 1, 0.1, 220);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.15, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.62;
  controls.zoomSpeed = 0.55;
  controls.minPolarAngle = 0.48;
  controls.maxPolarAngle = 1.16;
  controls.touches = { ONE: 0, TWO: 2 };

  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.48;

  const hemi = new HemisphereLight('#ffe8f2', '#241910', 0.62);
  const key = new DirectionalLight('#ffe0c2', 2.15);
  key.position.set(4.8, 9.2, 6.2);
  key.castShadow = true;
  key.shadow.mapSize.set(quality.shadow, quality.shadow);
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 28;
  key.shadow.camera.left = -7;
  key.shadow.camera.right = 7;
  key.shadow.camera.top = 7;
  key.shadow.camera.bottom = -7;
  key.shadow.bias = -0.00025;
  key.shadow.normalBias = 0.028;
  const fill = new DirectionalLight('#f6b9d4', 0.48);
  fill.position.set(-2.5, 3.4, 8);
  const rim = new DirectionalLight('#d8b66d', 0.55);
  rim.position.set(-7, 4.5, -3);
  const ambient = new AmbientLight('#d5def0', 0.12);
  scene.add(hemi, key, key.target, fill, rim, ambient);

  const island = createIsland({ rings: quality.rings, segments: quality.segments });
  const foliage = createFoliage(quality);
  const characters = createCharacters();
  const atmosphere = createAtmosphere(quality);
  const islandRoot = island.group;
  islandRoot.add(foliage.group, characters.group, atmosphere.particles);
  scene.add(atmosphere.sky, atmosphere.stars, atmosphere.meteors, islandRoot);

  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  if (quality.bloom) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new Vector2(1, 1), 0.16, 0.28, 1.22);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    if (quality.msaa > 0) {
      composer.renderTarget1.samples = quality.msaa;
      composer.renderTarget2.samples = quality.msaa;
    }
  }

  const ui = bindUi({
    onTogglePlay: () => {
      playing = !playing;
      ui.setPlaying(playing);
    },
    onSeason: (index) => beginSeek(index),
    onSpeed: (value) => {
      speed = clampSpeed(value);
      ui.setSpeed(speed);
    },
    onFullscreen: () => {
      toggleFullscreen().catch(() => {
        ui.showFallback('全屏没有打开。可以改用浏览器自己的全屏。');
      });
    },
  });
  ui.setPlaying(playing);
  ui.setSpeed(speed);
  ui.setSeason(frontSeason(sweep));

  let userMoved = false;
  controls.addEventListener('start', () => {
    userMoved = true;
  });

  let seek: { from: number; to: number; t: number; dur: number; season: number } | null = null;

  function beginSeek(index: number): void {
    const target = seekTarget(sweep, index);
    ui.setTarget(index);
    if (reduced && !playing) {
      sweep = target;
      seek = null;
      ui.setTarget(null);
      ui.setSeason(frontSeason(sweep));
      return;
    }
    const turns = (target - sweep) / TAU;
    seek = {
      from: sweep,
      to: target,
      t: 0,
      dur: Math.min(7.2, Math.max(1.15, turns * 1.9)),
      season: index,
    };
  }

  function ease(u: number): number {
    return 1 - (1 - u) * (1 - u);
  }

  const keyColor = new Color();
  const fillColor = new Color();
  const hemiColor = new Color();
  const keyA = new Color();
  const keyB = new Color();
  const fillA = new Color();
  const fillB = new Color();
  const hemiA = new Color();
  const hemiB = new Color();

  function updateLights(): void {
    const mix = globalLightMix(sweep);
    const a = LIGHTS[mix.iOld] ?? LIGHTS[0]!;
    const b = LIGHTS[mix.iNew] ?? LIGHTS[0]!;
    keyA.set(a.key);
    keyB.set(b.key);
    fillA.set(a.fill);
    fillB.set(b.fill);
    hemiA.set(a.hemi);
    hemiB.set(b.hemi);
    key.color.copy(keyColor.copy(keyA).lerp(keyB, mix.t));
    fill.color.copy(fillColor.copy(fillA).lerp(fillB, mix.t));
    hemi.color.copy(hemiColor.copy(hemiA).lerp(hemiB, mix.t));
    key.intensity = a.keyI + (b.keyI - a.keyI) * mix.t;
    hemi.intensity = a.hemiI + (b.hemiI - a.hemiI) * mix.t;
  }

  let shaderTime = 0;
  let holdClock = false;
  let lastTick = performance.now();
  let frame = 0;
  let stopped = false;

  function fit(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dprCap = width < 840 ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    atmosphere.setPixelRatio(dpr);
    camera.aspect = width / Math.max(1, height);
    const top = ui.topEl.getBoundingClientRect().height;
    const bot = ui.dockEl.getBoundingClientRect().height;
    const usableH = Math.max(140, height - top - bot);
    const usableW = Math.max(140, width - 28);
    const vFov = (camera.fov * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const radius = 5.15;
    const distH = (radius / Math.tan(vFov / 2)) * (height / usableH);
    const distW = (radius / Math.tan(hFov / 2)) * (width / usableW);
    const focus = params.get('focus');
    const framed = Math.max(distH, distW) * (width < 840 ? 0.88 : 0.73) * (params.has('near') || focus ? 0.42 : 1);
    controls.minDistance = focus ? framed * 0.22 : framed * 0.7;
    controls.maxDistance = framed * 1.35;
    const usableCenter = top + usableH / 2;
    const shift = usableCenter - height / 2;
    camera.setViewOffset(width, height, 0, shift, width, height);
    camera.updateProjectionMatrix();
    if (!userMoved) {
      if (focus === 'tree') {
        const tx = Math.sin(1.5) * 3.55;
        const tz = -Math.cos(1.5) * 3.55;
        controls.target.set(tx, 0.85, tz);
        camera.position.set(tx + 1.15, 1.55, tz + 1.7);
      } else if (focus === 'grass') {
        controls.target.set(1.15, 0.12, 2.15);
        camera.position.set(1.35, 0.72, 3.05);
      } else if (params.has('near') || focus === 'pair') {
        controls.minDistance = 1.4;
        controls.maxDistance = 8;
        camera.position.set(0.15, 2.45, 5.85);
        controls.target.set(0, 0.72, 2.9);
        camera.lookAt(controls.target);
      } else {
        const polar = 0.98;
        camera.position.set(0, Math.cos(polar) * framed, Math.sin(polar) * framed);
        controls.target.set(0, 0.12, 0.15);
        camera.lookAt(controls.target);
      }
      if (focus === 'tree' || focus === 'grass') camera.lookAt(controls.target);
    } else {
      const offset = camera.position.clone().sub(controls.target);
      const len = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length()));
      offset.setLength(len);
      camera.position.copy(controls.target).add(offset);
    }
    controls.update();
    composer?.setPixelRatio(dpr);
    composer?.setSize(width, height);
    bloom?.setSize(width * dpr, height * dpr);
  }

  function tick(): void {
    if (stopped) return;
    const now = performance.now();
    const dt = Math.min((now - lastTick) / 1000, 0.05);
    lastTick = now;
    const ambientMotion = playing || !reduced;
    if (ambientMotion && !holdClock) shaderTime += dt;

    if (seek) {
      seek.t += dt / seek.dur;
      const u = Math.min(1, seek.t);
      sweep = seek.from + (seek.to - seek.from) * ease(u);
      if (u >= 1) {
        sweep = seek.to;
        seek = null;
        ui.setTarget(null);
      }
    } else if (playing) {
      sweep += (TAU / 22) * speed * dt;
    }

    const period = TAU * 4;
    if (sweep > period * 4) {
      const k = Math.floor((sweep - period) / period) * period;
      sweep -= k;
      if (seek) {
        seek.from -= k;
        seek.to -= k;
      }
    }

    sweepUniform.value = sweep;
    timeUniform.value = shaderTime;
    updateLights();
    const bob = ambientMotion ? Math.sin(shaderTime * 0.35) * 0.045 : 0;
    islandRoot.position.y = bob;
    island.update(sweep, shaderTime, ambientMotion);
    foliage.update(sweep, shaderTime, ambientMotion);
    characters.update(sweep, shaderTime, ambientMotion, dt, reduced);
    atmosphere.update(dt, sweep, ambientMotion, shaderTime, reduced);
    controls.update();
    if (composer) composer.render();
    else renderer.render(scene, camera);

    ui.setSeason(frontSeason(sweep));
    frame += 1;
    if (frame === 2) ui.markReady();
    requestAnimationFrame(tick);
  }

  function onKey(event: KeyboardEvent): void {
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT') return;
    if (event.code === 'Space' && tag === 'BUTTON') return;
    if (event.code === 'Space') {
      event.preventDefault();
      playing = !playing;
      ui.setPlaying(playing);
    } else if (event.key >= '1' && event.key <= '4') {
      beginSeek(Number(event.key) - 1);
    } else if (event.key === 'f' || event.key === 'F') {
      toggleFullscreen().catch(() => undefined);
    } else if (event.key === '[') {
      speed = Math.max(minSpeed, Math.round((speed - 0.25) * 20) / 20);
      ui.setSpeed(speed);
    } else if (event.key === ']') {
      speed = Math.min(maxSpeed, Math.round((speed + 0.25) * 20) / 20);
      ui.setSpeed(speed);
    }
  }

  async function toggleFullscreen(): Promise<void> {
    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (root.requestFullscreen) await root.requestFullscreen();
    else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
  }

  function onFullscreen(): void {
    ui.setFullscreen(Boolean(document.fullscreenElement));
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    stopped = true;
    ui.showFallback('三维场景中断了，刷新页面即可重来。');
  });

  reducedQuery.addEventListener('change', (event) => {
    reduced = event.matches;
    if (reduced) {
      playing = false;
      ui.setPlaying(false);
    }
  });

  window.addEventListener('resize', fit);
  window.visualViewport?.addEventListener('resize', fit);
  window.addEventListener('keydown', onKey);
  document.addEventListener('fullscreenchange', onFullscreen);

  const api = {
    ready: false,
    errors,
    getSweep: () => sweep,
    setSweep: (value: number) => {
      sweep = value;
      seek = null;
      ui.setTarget(null);
    },
    getPlaying: () => playing,
    setPlaying: (value: boolean) => {
      playing = value;
      ui.setPlaying(playing);
    },
    getSpeed: () => speed,
    setSpeed: (value: number) => {
      speed = clampSpeed(value);
      ui.setSpeed(speed);
    },
    getFrontSeason: () => frontSeason(sweep),
    getCompanion: () => characters.companion(),
    getClock: () => shaderTime,
    setClock: (value: number) => {
      shaderTime = value;
    },
    setHoldClock: (value: boolean) => {
      holdClock = value;
    },
    getSky: () => atmosphere.skyState(),
    project: (x: number, y: number, z: number) => {
      const v = new Vector3(x, y, z).project(camera);
      return [v.x, v.y, v.z];
    },
    getAzimuth: () => controls.getAzimuthalAngle(),
    getPolar: () => controls.getPolarAngle(),
    getDistance: () => camera.position.distanceTo(controls.target),
    seekTo: (index: number) => beginSeek(index),
  };
  Object.assign(window, { __turntable: api });

  fit();
  foliage.update(sweep, 0, false);
  characters.update(sweep, 0, false, 0, reduced);
  atmosphere.update(0, sweep, false, 0, reduced);
  requestAnimationFrame(() => {
    api.ready = true;
  });
  requestAnimationFrame(tick);

  const cleanup = (): void => {
    stopped = true;
    window.removeEventListener('resize', fit);
    window.removeEventListener('keydown', onKey);
    document.removeEventListener('fullscreenchange', onFullscreen);
    controls.dispose();
    composer?.dispose();
    env.dispose();
    pmrem.dispose();
    scene.traverse((obj) => {
      const mesh = obj as { geometry?: { dispose: () => void }; material?: { dispose: () => void } | { dispose: () => void }[] };
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach((item) => item.dispose());
      else mesh.material?.dispose();
    });
    renderer.dispose();
  };
  window.addEventListener('pagehide', cleanup);
  import.meta.hot?.dispose(cleanup);
}

try {
  boot();
} catch (error) {
  console.error(error);
  showBootError('三维场景没有搭起来。刷新一次，我们再走一季。');
}
