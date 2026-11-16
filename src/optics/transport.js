// Millimetres, linear radiance. These are explicit reference presets, not
// measured BSDFs for a particular manufacturer's acrylic sheet.
export const IOR = 1.49;
export const PITCH = 10;
export const EMITTER_WIDTH = 9.2;
export const WORLD_SIZE = 185.6;
export const FIELD_SIZE = 384;

// The normalized Lambertian kernel d² / [π(d² + r²)²] is a continuous
// Gaussian mixture ∫exp(-t) G(sigma=d/sqrt(2t)) dt. Substitute u=exp(-t),
// then apply seven-point Gauss–Legendre quadrature on u∈[0,1]. This captures
// the broad tails better than direct low-order Gauss–Laguerre quadrature.
// Each term is positive and normalized. Square LED areas are integrated.
export const DIFFUSION_NODES = [
  3.671194996846199, 2.046127413487876, 1.2137624862357885,
  .6931471805599453, .3525085273921622, .13838246257543357, .02577539351044752,
];
export const DIFFUSION_WEIGHTS = [
  .06474248308443485, .1398526957446383, .19091502525255946,
  .2089795918367347, .19091502525255946, .1398526957446383, .06474248308443485,
];

export function opticalProfile({ gap, thickness, roughness, doubleSided }) {
  const r = Math.max(0, Math.min(1, roughness));
  const d = Math.max(0, gap);
  const t = Math.max(.5, thickness);
  const sides = Math.max(0, Math.min(1, doubleSided));
  // Paraxial transmitted angular standard deviation of the reference finish.
  // The observer-facing and LED-facing surfaces have different lever arms.
  const slope = (IOR - 1) * 1.2 * r;
  const variance = slope ** 2 * ((d + t / IOR) ** 2 + sides * d ** 2);
  const sigma = Math.sqrt(variance);
  const haze = 1 - Math.exp(-18 * r * (1 + sides));
  // A milky diffuser should strongly suppress the unresolved direct image:
  // this reference preset leaves 0.075% ballistic light at 3 mm, while thin
  // 0.5 mm stock remains partly see-through. It is not a measured grade.
  const scatteringDepth = 2.4 * t;
  const ballistic = Math.exp(-scatteringDepth);
  // Two-flux style transport attenuation: bulk backscatter plus absorption.
  const bulkTransmission = Math.exp(-.015 * t) / (1 + .22 * t);
  const bulkDistance = d + t * .5;
  const sigmas = [Math.max(.12, sigma), ...DIFFUSION_NODES.map(node =>
    Math.sqrt(bulkDistance ** 2 / (2 * node) + variance + (.3 * t) ** 2))];
  // The specular image can leave the board: cover its full surface lobe.
  // Bulk irradiance is queried at the visible sheet/exit point, so padding
  // the viewport for in-slab displacement suffices. Its long tails are still
  // integrated analytically, without wasting the field raster on empty space.
  const extent = Math.max(WORLD_SIZE + 4 * t, 160 + 8 * sigmas[0]);
  return { sigmas, extent, haze, ballistic, bulkTransmission };
}

// Abramowitz–Stegun 7.1.26, max absolute error 1.5e-7.
export function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + .3275911 * a);
  return sign * (1 - (((((1.061405429 * t - 1.453152027) * t)
    + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-a * a));
}

export function squareAxisWeight(position, center, sigma, width = EMITTER_WIDTH) {
  const factor = 1 / (Math.SQRT2 * Math.max(.001, sigma));
  return Math.max(0, .5 * (erf((center + width / 2 - position) * factor)
    - erf((center - width / 2 - position) * factor)));
}

export function buildWeightTable(profile, size = FIELD_SIZE) {
  const tables = [new Float32Array(size * 16 * 4), new Float32Array(size * 16 * 4)];
  for (let cell = 0; cell < 16; cell++) {
    const center = (cell - 7.5) * PITCH;
    for (let x = 0; x < size; x++) {
      const p = ((x + .5) / size - .5) * profile.extent;
      const offset = (cell * size + x) * 4;
      for (let lobe = 0; lobe < 8; lobe++) {
        tables[lobe >> 2][offset + (lobe & 3)] = squareAxisWeight(p, center, profile.sigmas[lobe]);
      }
    }
  }
  return tables;
}

export function squareResponse(x, y, sigma, width = EMITTER_WIDTH) {
  return squareAxisWeight(x, 0, sigma, width) * squareAxisWeight(y, 0, sigma, width);
}

// Exact diffuse irradiance of one axis-aligned rectangular Lambertian emitter.
// Used as an independent reference for numerical checks of the fast GPU model.
export function lambertRectangle(x0, x1, y0, y1, distance) {
  const d = Math.max(1e-9, distance);
  const corner = (x, y) => {
    const a = Math.sqrt(d * d + x * x);
    const b = Math.sqrt(d * d + y * y);
    return (x / a * Math.atan(y / a) + y / b * Math.atan(x / b)) / (2 * Math.PI);
  };
  return corner(x1, y1) - corner(x0, y1) - corner(x1, y0) + corner(x0, y0);
}
