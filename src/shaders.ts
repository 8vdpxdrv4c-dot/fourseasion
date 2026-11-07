import {
  Color,
  type MeshStandardMaterial,
  type IUniform,
} from 'three';

export const sweepUniform = { value: 0 };
export const timeUniform = { value: 0 };

const palette = {
  springA: new Color('#6ea83a'),
  springB: new Color('#c6de78'),
  springC: new Color('#f6b9d4'),
  summerA: new Color('#3d6824'),
  summerB: new Color('#699544'),
  summerC: new Color('#f0d056'),
  autumnA: new Color('#7a4216'),
  autumnB: new Color('#bd742f'),
  autumnC: new Color('#e7a15a'),
  winterA: new Color('#b7c9dc'),
  winterB: new Color('#dbe8f5'),
  winterC: new Color('#f7fbff'),
  glow: new Color('#e6b15a'),
};

function colorUniform(color: Color) {
  return { value: color };
}

const paletteUniforms = {
  uS0a: colorUniform(palette.springA),
  uS0b: colorUniform(palette.springB),
  uS0c: colorUniform(palette.springC),
  uS1a: colorUniform(palette.summerA),
  uS1b: colorUniform(palette.summerB),
  uS1c: colorUniform(palette.summerC),
  uS2a: colorUniform(palette.autumnA),
  uS2b: colorUniform(palette.autumnB),
  uS2c: colorUniform(palette.autumnC),
  uS3a: colorUniform(palette.winterA),
  uS3b: colorUniform(palette.winterB),
  uS3c: colorUniform(palette.winterC),
  uGlow: colorUniform(palette.glow),
};

const SEASON_LIB = /* glsl */ `
uniform float uSweep;
uniform float uTime;
float gSnow;
float gSparkle;
uniform vec3 uS0a; uniform vec3 uS0b; uniform vec3 uS0c;
uniform vec3 uS1a; uniform vec3 uS1b; uniform vec3 uS1c;
uniform vec3 uS2a; uniform vec3 uS2b; uniform vec3 uS2c;
uniform vec3 uS3a; uniform vec3 uS3b; uniform vec3 uS3c;
uniform vec3 uGlow;
const float SEASON_TAU = 6.28318530718;

float seasonHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float seasonNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = seasonHash(i);
  float b = seasonHash(i + vec2(1.0, 0.0));
  float c = seasonHash(i + vec2(0.0, 1.0));
  float d = seasonHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float seasonFbm(vec2 p) {
  float v = 0.0;
  float a = 0.62;
  for (int i = 0; i < 2; i++) {
    v += a * seasonNoise(p);
    p = p * 2.05 + vec2(100.0);
    a *= 0.5;
  }
  return v;
}

float sweepHead() {
  float rev = floor(uSweep / SEASON_TAU + 0.0001);
  return uSweep - rev * SEASON_TAU;
}

vec3 seasonState(vec2 xz) {
  float point = atan(xz.x, -xz.y);
  point = mod(point + SEASON_TAU, SEASON_TAU);
  float rev = floor(uSweep / SEASON_TAU + 0.0001);
  float sw = uSweep - rev * SEASON_TAU;
  float n = (seasonNoise(xz * 1.45) - 0.5) * 0.34
    + (seasonNoise(xz * 3.8 + uTime * 0.03) - 0.5) * 0.08;
  float feather = 0.16;
  float wNew = smoothstep(-feather, feather, sw - point + n);
  float sd = point > 3.14159265 ? point - SEASON_TAU : point;
  float seamBand = 1.0 - smoothstep(feather, feather * 3.5, abs(sd));
  float seamW = smoothstep(-feather, feather, sd + n * 0.45);
  float handFar = smoothstep(0.35, 0.7, min(sw, SEASON_TAU - sw));
  wNew = mix(wNew, seamW, seamBand * handFar);
  float iNew = mod(rev, 4.0);
  float iOld = mod(rev + 3.0, 4.0);
  return vec3(wNew, iNew, iOld);
}

float seasonWeightIndex(vec2 xz, float index) {
  vec3 s = seasonState(xz);
  float w = 0.0;
  if (abs(s.y - index) < 0.5) w += s.x;
  if (abs(s.z - index) < 0.5) w += 1.0 - s.x;
  return clamp(w, 0.0, 1.0);
}

vec3 albedoFor(float idx, vec2 xz) {
  float n = seasonFbm(xz * 1.25);
  float speckle = seasonHash(floor(xz * 17.0));
  vec3 base;
  if (idx < 0.5) {
    base = mix(uS0a, uS0b, n);
    if (speckle > 0.925) base = mix(base, uS0c, 0.88);
  } else if (idx < 1.5) {
    base = mix(uS1a, uS1b, n);
    if (speckle > 0.955) base = mix(base, uS1c, 0.8);
  } else if (idx < 2.5) {
    base = mix(uS2a, uS2b, n);
    float fleck = seasonHash(floor(xz * 9.0 + 3.0));
    if (fleck > 0.78) base = mix(base, uS2c, 0.45);
    if (speckle > 0.94) base = mix(base, uS2a * 0.7, 0.55);
  } else {
    base = mix(uS3a, uS3c, n);
    base = mix(base, uS3b, 0.35);
    float shade = seasonNoise(xz * 3.2);
    base = mix(base, uS3a, smoothstep(0.55, 0.95, shade) * 0.45);
  }
  return base;
}

float terrainHeight(vec2 xz) {
  float n = seasonFbm(xz * 0.52);
  float h = (n - 0.5) * 0.065;
  float r = length(xz);
  float edge = smoothstep(3.85, 4.58, r);
  float hub = smoothstep(1.05, 0.2, r);
  float couple = smoothstep(1.2, 0.28, length(xz - vec2(0.0, 1.28)));
  h *= (1.0 - edge) * (1.0 - hub * 0.9) * (1.0 - couple);
  h += sin(clamp(r / 4.72, 0.0, 1.0) * 3.14159265) * 0.022;
  return h;
}

vec3 terrainColor(vec2 xz) {
  vec3 state = seasonState(xz);
  vec3 albedo = mix(albedoFor(state.z, xz), albedoFor(state.y, xz), state.x);
  float winter = 0.0;
  if (abs(state.y - 3.0) < 0.5) winter += state.x;
  if (abs(state.z - 3.0) < 0.5) winter += 1.0 - state.x;
  gSnow = clamp(winter, 0.0, 1.0);
  float tw = seasonHash(floor(xz * 28.0));
  float spark = smoothstep(0.78, 1.0, sin(uTime * 2.4 + tw * 36.0) * 0.5 + 0.5);
  gSparkle = spark * step(0.93, tw) * gSnow;

  float rings = abs(fract(length(xz) * 1.35) - 0.5);
  float groove = smoothstep(0.07, 0.0, rings);
  albedo = mix(albedo, albedo * 0.86, groove * 0.16 * smoothstep(1.1, 2.4, length(xz)));

  float rim = smoothstep(3.5, 4.62, length(xz));
  albedo *= mix(1.0, 0.78, rim);

  float hand = sweepHead();
  float point = mod(atan(xz.x, -xz.y) + SEASON_TAU, SEASON_TAU);
  float ahead = mod(point - hand + SEASON_TAU, SEASON_TAU);
  float behind = mod(hand - point + SEASON_TAU, SEASON_TAU);
  float shadow = smoothstep(0.58, 0.02, ahead);
  shadow *= smoothstep(0.45, 1.15, length(xz));
  albedo *= mix(1.0, 0.72, shadow * 0.85);
  float glow = smoothstep(0.5, 0.0, behind);
  glow *= smoothstep(0.35, 1.05, length(xz));
  albedo += uGlow * glow * 0.16;
  return albedo;
}

vec3 grassColor(vec2 xz, float h) {
  vec3 state = seasonState(xz);
  vec3 albedo = mix(albedoFor(state.z, xz), albedoFor(state.y, xz), state.x);
  albedo *= mix(0.68, 1.12, h);
  albedo *= 0.9 + 0.2 * seasonNoise(xz * 2.7 + 4.0);
  return albedo;
}
`;

const TERRAIN_VERT = /* glsl */ `
#include <begin_vertex>
transformed.y += terrainHeight(position.xz);
vSeasonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const GRASS_VERT = /* glsl */ `
#include <begin_vertex>
vBladeUv = uv;
vec3 gWorld;
#ifdef USE_INSTANCING
  gWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  gWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
float wWinter = seasonWeightIndex(gWorld.xz, 3.0);
float wAutumn = seasonWeightIndex(gWorld.xz, 2.0);
float hScale = mix(1.0, 0.7, wAutumn);
hScale = mix(hScale, 0.08, wWinter);
transformed.y *= hScale;
float tip = uv.y * uv.y;
float amp = mix(0.22, 0.015, wWinter);
transformed.x += sin(uTime * 1.45 + aPhase + gWorld.x * 0.45) * tip * amp;
transformed.z += cos(uTime * 1.15 + aPhase * 1.37 + gWorld.z * 0.4) * tip * amp;
#ifdef USE_INSTANCING
  vSeasonWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vSeasonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
`;

const TERRAIN_FRAG = /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= terrainColor(vSeasonWorld.xz);
`;

const GRASS_FRAG = /* glsl */ `
#include <color_fragment>
float halfW = mix(0.5, 0.045, pow(max(vBladeUv.y, 0.0), 0.8));
if (abs(vBladeUv.x - 0.5) > halfW) discard;
gSnow = 0.0;
gSparkle = 0.0;
diffuseColor.rgb *= grassColor(vSeasonWorld.xz, vBladeUv.y);
`;

const ROUGH_FRAG = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.46, clamp(gSnow, 0.0, 1.0));
`;

const EMISSIVE_FRAG = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.62, 0.74, 0.9) * gSparkle;
`;

function assignUniforms(shader: { uniforms: Record<string, IUniform> }): void {
  shader.uniforms.uSweep = sweepUniform;
  shader.uniforms.uTime = timeUniform;
  for (const [key, uniform] of Object.entries(paletteUniforms)) {
    shader.uniforms[key] = uniform;
  }
}

export function bindTerrain(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    assignUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${SEASON_LIB}\nvarying vec3 vSeasonWorld;\n`)
      .replace('#include <begin_vertex>', TERRAIN_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${SEASON_LIB}\nvarying vec3 vSeasonWorld;\n`,
      )
      .replace('#include <color_fragment>', TERRAIN_FRAG)
      .replace('#include <roughnessmap_fragment>', ROUGH_FRAG)
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAG);
  };
  material.customProgramCacheKey = () => 'season-terrain-v4';
}

export function bindGrass(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    assignUniforms(shader);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${SEASON_LIB}\nvarying vec3 vSeasonWorld;\nvarying vec2 vBladeUv;\nattribute float aPhase;\n`,
      )
      .replace('#include <begin_vertex>', GRASS_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${SEASON_LIB}\nvarying vec3 vSeasonWorld;\nvarying vec2 vBladeUv;\n`,
      )
      .replace('#include <color_fragment>', GRASS_FRAG)
      .replace('#include <roughnessmap_fragment>', ROUGH_FRAG)
      .replace('#include <emissivemap_fragment>', EMISSIVE_FRAG);
  };
  material.customProgramCacheKey = () => 'season-grass-v4';
}

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */ `
uniform vec3 uNavy;
uniform vec3 uBand;
uniform vec3 uDust;
uniform float uTime;
varying vec3 vDir;
float skyHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float skyNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(skyHash(i), skyHash(i+vec2(1.0,0.0)), u.x), mix(skyHash(i+vec2(0.0,1.0)), skyHash(i+vec2(1.0,1.0)), u.x), u.y);
}
void main() {
  vec3 dir = normalize(vDir);
  float belt = dir.x * 0.72 + dir.y * 0.55 + dir.z * 0.28;
  float milky = exp(-belt * belt * 26.0);
  float dust = skyNoise(dir.xy * 3.4 + dir.yz * 2.0);
  vec3 col = uNavy;
  col = mix(col, uBand, milky * (0.18 + dust * 0.35));
  col += uDust * milky * dust * 0.12;
  vec2 grid = dir.xy * 150.0 + dir.yz * 90.0;
  vec2 cell = floor(grid);
  vec2 gv = fract(grid) - 0.5;
  float star = skyHash(cell);
  float tw = 0.6 + 0.4 * sin(uTime * (1.1 + star * 2.0) + star * 28.0);
  float dot = smoothstep(0.07, 0.0, length(gv));
  float spark = dot * step(0.972, star);
  col += vec3(0.82, 0.88, 1.0) * spark * tw;
  col += vec3(1.0, 0.84, 0.55) * spark * step(0.7, skyHash(cell + 3.7)) * 0.55;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute float aFlare;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vFlare;
varying float vTw;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = 0.62 + 0.38 * sin(uTime * (0.85 + aPhase * 1.6) + aPhase * 18.0);
  vTw = tw;
  vColor = aColor;
  vFlare = aFlare;
  gl_PointSize = clamp(aSize * uPixelRatio * tw * (320.0 / max(1.0, -mv.z)), 1.2, 9.0);
  gl_Position = projectionMatrix * mv;
}
`;

export const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vFlare;
varying float vTw;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p);
  float circle = smoothstep(0.5, 0.08, d);
  float crossX = smoothstep(0.07, 0.0, abs(p.x)) * smoothstep(0.5, 0.12, abs(p.y));
  float crossY = smoothstep(0.07, 0.0, abs(p.y)) * smoothstep(0.5, 0.12, abs(p.x));
  float alpha = max(circle, (crossX + crossY) * vFlare);
  if (alpha < 0.04) discard;
  gl_FragColor = vec4(vColor * (0.75 + 0.25 * vTw), alpha);
}
`;

export const PARTICLE_VERT = /* glsl */ `
attribute float aSpin;
attribute float aAlpha;
attribute vec3 aColor;
attribute float aScale;
attribute float aKind;
varying float vAlpha;
varying vec3 vColor;
varying vec2 vUv;
varying float vKind;
void main() {
  vUv = uv;
  vColor = aColor;
  vAlpha = aAlpha;
  vKind = aKind;
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float s = sin(aSpin);
  float c = cos(aSpin);
  vec2 p = position.xy * aScale;
  vec2 r = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  mv.xy += r;
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAG = /* glsl */ `
varying float vAlpha;
varying vec3 vColor;
varying vec2 vUv;
varying float vKind;
void main() {
  vec2 uv = vUv - 0.5;
  float alpha = 0.0;
  if (vKind < 0.5) {
    float e = length(uv * vec2(1.15, 1.85));
    alpha = smoothstep(0.48, 0.16, e);
  } else if (vKind < 1.5) {
    float e = length(uv * vec2(1.55, 2.4));
    alpha = smoothstep(0.5, 0.18, e);
    float vein = smoothstep(0.06, 0.0, abs(uv.x));
    alpha = max(alpha * 0.85, vein * smoothstep(0.5, 0.1, abs(uv.y)));
  } else if (vKind < 2.5) {
    float e = length(uv);
    alpha = smoothstep(0.48, 0.2, e);
  } else {
    float e = length(uv);
    alpha = smoothstep(0.5, 0.0, e);
  }
  if (alpha * vAlpha < 0.03) discard;
  gl_FragColor = vec4(vColor, alpha * vAlpha);
}
`;

export const GLOW_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const GLOW_FRAG = /* glsl */ `
varying vec2 vUv;
void main() {
  float across = smoothstep(0.5, 0.02, abs(vUv.x - 0.5));
  float tip = smoothstep(0.45, 1.0, vUv.y);
  float body = smoothstep(0.0, 0.12, vUv.y) * (1.0 - tip);
  float a = across * across * (body * 0.12 + tip * 0.42);
  vec3 col = mix(vec3(0.62, 0.44, 0.16), vec3(1.0, 0.9, 0.62), tip);
  gl_FragColor = vec4(col, a);
}
`;
