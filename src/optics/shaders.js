import { DIFFUSION_WEIGHTS } from './transport.js';

export const vertex = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Units are millimetres. The camera is orthographic; emitters are Lambertian
// area sources at z = 0, not point lights painted with radial gradients.
const patterns = `
uniform float uTime;
uniform int uPattern;
uniform int uPreviousPattern;
uniform float uPatternMorph;
vec3 palette(float t) {
  vec3 cyan = vec3(.012, .63, .91);
  vec3 lime = vec3(.35, 1.0, .015);
  vec3 mint = vec3(.008, .9, .28);
  float f = .5 + .5 * sin(t);
  return f < .52 ? mix(cyan, mint, f / .52) : mix(mint, lime, (f - .52) / .48);
}
vec3 patternColor(vec2 cell, int kind) {
  vec2 p = (cell + .5) / 16.0;
  if (kind == 0) {
    float wave = sin(p.x * 8.5 + sin(p.y * 6.0 + uTime * .16) * 1.8 - uTime * .33)
               + .64 * cos(p.y * 9.0 - p.x * 4.5 + uTime * .22);
    return palette(wave * 2.5 + p.y * 2.4) * (.64 + .36 * sin(wave + 1.4));
  }
  if (kind == 1) return palette(p.x * 2.0 + p.y * 1.8 + uTime * .2) * (.2 + .8 * pow(.5 + .5 * sin(uTime * 1.25), 1.6));
  if (kind == 2) {
    float r = distance(p, vec2(.5));
    float ripple = pow(.5 + .5 * cos(r * 29.0 - uTime * 2.0), 5.0);
    return palette(r * 13.0 + uTime * .3) * (.035 + .965 * ripple);
  }
  return distance(cell, vec2(7.0, 8.0)) < .2 ? vec3(.48, .93, .67) : vec3(0.0);
}
vec3 sourceColor(vec2 cell) {
  return mix(patternColor(cell, uPreviousPattern), patternColor(cell, uPattern), uPatternMorph) * 2.45;
}`;

export const source = `#version 300 es
precision highp float;
out vec4 fragColor;
${patterns}
void main() { fragColor = vec4(sqrt(sourceColor(floor(gl_FragCoord.xy)) / 4.0), 1); }
`;

// Separable integration of all 256 finite square emitters. Linear radiance
// is accumulated; square-root encoding is only for the framebuffer storage.
export const horizontal = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uSource;
uniform sampler2D uWeights0;
uniform sampler2D uWeights1;
void main() {
  int x = int(gl_FragCoord.x);
  int row = int(gl_FragCoord.y) % 16;
  int lobe = int(gl_FragCoord.y) / 16;
  vec3 sum = vec3(0);
  for (int cell = 0; cell < 16; cell++) {
    vec4 w = lobe < 4 ? texelFetch(uWeights0, ivec2(x, cell), 0) : texelFetch(uWeights1, ivec2(x, cell), 0);
    vec3 e = texelFetch(uSource, ivec2(cell, row), 0).rgb;
    sum += e * e * w[lobe % 4];
  }
  fragColor = vec4(sqrt(max(sum, vec3(0))), 1);
}`;

export const field = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uHorizontal;
uniform sampler2D uWeights0;
uniform sampler2D uWeights1;
uniform bool uBulk;
const float weights[8] = float[8](1.0, ${DIFFUSION_WEIGHTS.join(', ')});
void main() {
  ivec2 pos = ivec2(gl_FragCoord.xy);
  vec3 sum = vec3(0);
  for (int row = 0; row < 16; row++) {
    vec4 w0 = texelFetch(uWeights0, ivec2(pos.y, row), 0);
    if (!uBulk) {
      vec3 h = texelFetch(uHorizontal, ivec2(pos.x, row), 0).rgb;
      sum += h * h * w0.x;
    } else {
      vec4 w1 = texelFetch(uWeights1, ivec2(pos.y, row), 0);
      for (int lobe = 1; lobe < 8; lobe++) {
        vec3 h = texelFetch(uHorizontal, ivec2(pos.x, lobe * 16 + row), 0).rgb;
        float w = lobe < 4 ? w0[lobe] : w1[lobe - 4];
        sum += h * h * w * weights[lobe];
      }
    }
  }
  fragColor = vec4(sqrt(max(sum, vec3(0))), 1);
}`;

export const scene = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
${patterns}
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform float uGap;
uniform float uThickness;
uniform float uScale;
uniform float uHaze;
uniform float uOpal;
uniform float uBallistic;
uniform float uBulkTransmission;
uniform float uFieldExtent;
uniform sampler2D uSurfaceField;
uniform sampler2D uBulkField;
uniform float uPresence;
uniform int uMaterial;
uniform int uPreviousMaterial;
uniform float uMorph;
uniform bool uCompare;

const float PI = 3.14159265359;
const float IOR = 1.49;
const float WORLD_SIZE = 185.6;

vec2 hexCell(vec2 p, float radius) {
  vec2 s = vec2(1.7320508, 3.0) * radius;
  vec2 a = mod(p, s) - s * 0.5;
  vec2 b = mod(p - s * 0.5, s) - s * 0.5;
  return dot(a,a) < dot(b,b) ? a : b;
}

float surface(vec2 p, int material) {
  float period = 7.1 * uScale;
  if (material == 2) {
    vec2 c = mod(p + period * .5, period) - period * .5;
    // Square-based cones (pyramidal microprisms).
    return .94 * (1.0 - 2.0 * max(abs(c.x), abs(c.y)) / period);
  }
  if (material == 3) return .86 * cos(p.y * 2.0 * PI / period);
  if (material == 4) {
    vec2 c = hexCell(p, period * .48);
    float radius = period * .55;
    return 1.25 * max(0.0, 1.0 - dot(c,c) / (radius * radius));
  }
  return 0.0;
}

float heightAt(vec2 p) {
  // Thin sheets cannot have relief deeper than their base. A thickness of
  // 3 mm or more uses the original reference texture relief in millimetres.
  return mix(surface(p, uPreviousMaterial), surface(p, uMaterial), uMorph) * min(1.0, uThickness / 3.0);
}

float fresnel(float cosI, float etaI, float etaT) {
  cosI = clamp(cosI, 0.0, 1.0);
  float sinT2 = (etaI * etaI) / (etaT * etaT) * (1.0 - cosI * cosI);
  if (sinT2 >= 1.0) return 1.0;
  float cosT = sqrt(1.0 - sinT2);
  float rs = (etaI * cosI - etaT * cosT) / (etaI * cosI + etaT * cosT);
  float rp = (etaT * cosI - etaI * cosT) / (etaT * cosI + etaI * cosT);
  return .5 * (rs * rs + rp * rp);
}

vec3 emission(vec2 p, float aa) {
  if (max(abs(p.x), abs(p.y)) > 80.0) return vec3(0.0);
  vec2 grid = (p + 80.0) / 10.0;
  vec2 cell = floor(grid);
  vec2 local = abs(fract(grid) - .5) * 10.0;
  // 9.2 mm square emitting face; connected 0.8 mm gaps.
  float coverage = 1.0 - smoothstep(4.6 - aa, 4.6 + aa, max(local.x, local.y));
  return sourceColor(cell) * coverage;
}

vec3 readField(sampler2D image, vec2 p) {
  vec2 uv = p / uFieldExtent + .5;
  if (any(lessThan(uv, vec2(0))) || any(greaterThan(uv, vec2(1)))) return vec3(0);
  vec3 encoded = texture(image, uv).rgb;
  return encoded * encoded * 4.0;
}

float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r;
}

void main() {
  vec2 world = (vUv - .5) * WORLD_SIZE;
  float aa = WORLD_SIZE / uResolution.x * .65;
  vec2 local = world - uOffset;
  float boundary = roundedBox(local, vec2(77.6), 3.8);
  float maskCoverage = (1.0 - smoothstep(-aa, aa, boundary)) * uPresence;
  if (uCompare && vUv.x < .5) maskCoverage = 0.0;

  vec3 backdrop = vec3(.014, .018, .013);
  float vignette = 1.0 - smoothstep(56.0, 123.0, length(world));
  backdrop *= .65 + .35 * vignette;
  vec3 direct = emission(world, aa) + backdrop;
  vec3 through = direct;

  if (maskCoverage > .001) {
    float h = uThickness + heightAt(local);
    float eps = .025;
    vec2 gradient = vec2(heightAt(local + vec2(eps,0)) - heightAt(local - vec2(eps,0)),
                         heightAt(local + vec2(0,eps)) - heightAt(local - vec2(0,eps))) / (2.0 * eps);
    vec3 macroNormal = normalize(vec3(-gradient, 1.0));
    vec3 incoming = vec3(0,0,-1);
    vec3 inside = refract(incoming, macroNormal, 1.0 / IOR);
    vec3 outgoing = refract(inside, vec3(0,0,1), IOR);
    vec3 transmitted = vec3(0);
    if (inside.z < -.001 && outgoing.z < -.001) {
      float f1 = fresnel(macroNormal.z, 1.0, IOR);
      float f2 = fresnel(-inside.z, IOR, 1.0);
      float pathLength = h / -inside.z;
      vec2 exitPoint = world + inside.xy * pathLength;
      vec2 emitterPoint = exitPoint + outgoing.xy * (uGap / -outgoing.z);
      float transmission = (1.0 - f1) * (1.0 - f2) * exp(-.001 * pathLength);
      vec3 surfaceLight = mix(emission(emitterPoint, aa), readField(uSurfaceField, emitterPoint), uHaze);
      // Bulk diffusion collects irradiance at the sheet, not at the remote
      // specular image. Turning off surface frost does not clear opal PMMA.
      vec3 bulkLight = readField(uBulkField, exitPoint);
      vec3 opalLight = mix(bulkLight, surfaceLight, uBallistic) * uBulkTransmission;
      transmitted = mix(surfaceLight, opalLight, uOpal) * transmission;
    }
    through = transmitted + backdrop;

    // Low-energy studio reflection on the *actual* surface normal;
    // independent of transmission, not a texture painted over the lights.
    vec3 reflected = reflect(vec3(0,0,-1), macroNormal);
    float softbox = pow(max(0.0, dot(reflected, normalize(vec3(-.2,.7,.65)))), 18.0);
    float surfaceFresnel = fresnel(macroNormal.z, 1.0, IOR);
    through += vec3(.60,.67,.57) * softbox * surfaceFresnel * 1.3 * (1.0 - .7 * uHaze);
    // Weak neutral ambient reflection makes unlit opal visibly milky.
    through += vec3(.025, .027, .024) * uOpal * (1.0 - uBallistic);
    float edge = exp(-abs(boundary + .32) * 2.7);
    float innerEdge = exp(-abs(boundary + 1.25) * 3.2) * .12;
    through += vec3(.2,.29,.2) * (edge + innerEdge);
  }

  vec3 color = mix(direct, through, maskCoverage);
  // A subtle cast shadow and edge when the translated sheet crosses the board.
  float outsideEdge = exp(-max(boundary, 0.0) * 1.3) * step(0.0, boundary) * uPresence;
  color *= 1.0 - outsideEdge * .14;
  // Square-root encoding preserves dark board gradients in RGBA8 buffers.
  // The post-processing kernel decodes before summing radiance.
  fragColor = vec4(sqrt(max(color, vec3(0)) / 4.0), 1.0);
}`;

export const blur = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uImage;
uniform vec2 uDirection;
vec3 readLight(vec2 uv) { vec3 encoded = texture(uImage, uv).rgb; return encoded * encoded; }
void main() {
  vec3 c = readLight(vUv) * .227027;
  c += readLight(vUv + uDirection * 1.384615) * .316216;
  c += readLight(vUv - uDirection * 1.384615) * .316216;
  c += readLight(vUv + uDirection * 3.230769) * .070270;
  c += readLight(vUv - uDirection * 3.230769) * .070270;
  fragColor = vec4(sqrt(max(c, vec3(0))),1.0);
}`;

export const composite = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uGlow;
vec3 linearToSrgb(vec3 c) {
  return mix(12.92*c, 1.055*pow(c,vec3(1.0/2.4))-.055, step(vec3(.0031308),c));
}
void main() {
  vec3 sceneEncoded = texture(uScene,vUv).rgb;
  vec3 glowEncoded = texture(uGlow,vUv).rgb;
  vec3 light = sceneEncoded * sceneEncoded * 4.0;
  vec3 glow = glowEncoded * glowEncoded * 4.0;
  // A small, normalized point-spread approximation for the camera's bloom.
  vec3 linear = mix(light,glow,.065);
  vec3 mapped = 1.0 - exp(-linear * 1.18);
  // Stable sub-LSB display dither avoids visible 8-bit bands in broad, dim
  // 200 mm light fields; this does not perturb the simulated radiance.
  float dither = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) - .5;
  fragColor = vec4(clamp(linearToSrgb(mapped) + dither / 255.0, 0.0, 1.0),1.0);
}`;
