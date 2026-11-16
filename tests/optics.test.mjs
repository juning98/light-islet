import test from 'node:test';
import assert from 'node:assert/strict';
import { opticalProfile, squareAxisWeight, squareResponse, lambertRectangle,
  DIFFUSION_NODES, DIFFUSION_WEIGHTS, buildWeightTable } from '../src/optics/transport.js';

const preset = { gap: 8, thickness: 3, roughness: .24, doubleSided: 0, opal: 0 };
const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) < tolerance,
  `${message}: ${actual} vs ${expected}`);

test('integrating a square emitter redistributes flux instead of creating energy', () => {
  for (const sigma of [.12, 1.4, 10, 30, 170]) {
    const limit = 4.6 + 7 * sigma;
    const step = 2 * limit / 18000;
    let integral = 0;
    for (let i = 0; i < 18000; i++) integral += squareAxisWeight(-limit + (i + .5) * step, 0, sigma) * step;
    near(integral * integral, 9.2 ** 2, .001, `integrated 2D power at sigma ${sigma}`);
  }
});

test('analytic square weights agree with independent numerical quadrature', () => {
  for (const [x, sigma] of [[0, 1.4], [4.6, .2], [10, 8], [70, 30], [0, 200]]) {
    let numerical = 0;
    const step = 9.2 / 10000;
    for (let i = 0; i < 10000; i++) {
      const delta = -4.6 + (i + .5) * step - x;
      numerical += Math.exp(-(delta ** 2) / (2 * sigma ** 2)) / (Math.sqrt(2 * Math.PI) * sigma) * step;
    }
    near(squareAxisWeight(x, 0, sigma), numerical, 5e-7, 'finite-area integral');
  }
});

test('continuous frost broadens with gap and a second surface, lowering the single-LED peak', () => {
  let previousPeak = Infinity;
  for (const gap of [0, 8, 50, 100, 200]) {
    const single = opticalProfile({ ...preset, gap });
    const double = opticalProfile({ ...preset, gap, doubleSided: 1 });
    const peak = squareResponse(0, 0, single.sigmas[0]);
    assert.ok(peak < previousPeak);
    assert.ok(double.sigmas[0] >= single.sigmas[0]);
    assert.ok(double.haze >= single.haze && double.haze <= 1);
    previousPeak = peak;
  }
});

test('Lambertian mixture matches exact finite-board irradiance through 200 mm', () => {
  let worstError = 0;
  for (const d of [1, 8, 25, 50, 100, 200]) {
    for (const x of [0, 30, 50, 80, 120]) {
      const exact = lambertRectangle(-80 - x, 80 - x, -80, 80, d);
      const approximate = DIFFUSION_NODES.reduce((sum, node, i) =>
        sum + DIFFUSION_WEIGHTS[i] * squareResponse(x, 0, d / Math.sqrt(2 * node), 160), 0);
      worstError = Math.max(worstError, Math.abs(exact - approximate));
      near(approximate, exact, .006, `irradiance at d=${d}, x=${x}`);
    }
  }
  near(lambertRectangle(-80, 80, -80, 80, 200), .16815354295598753, 1e-12, '200 mm view factor');
  console.log(`Maximum absolute finite-board irradiance error: ${(worstError * 100).toFixed(3)} percentage points`);
});

test('opal bulk transport remains with surface frosting disabled and decreases with thickness', () => {
  let previousTransmission = 1;
  let previousBallistic = 1;
  for (const thickness of [.5, 3, 10, 20]) {
    const p = opticalProfile({ ...preset, opal: 1, roughness: 0, thickness });
    assert.equal(p.haze, 0);
    assert.ok(p.ballistic > 0 && p.ballistic < previousBallistic);
    assert.ok(p.bulkTransmission > 0 && p.bulkTransmission < previousTransmission);
    assert.ok(p.sigmas[1] > p.sigmas[0]);
    previousBallistic = p.ballistic;
    previousTransmission = p.bulkTransmission;
  }
});

test('smooth transparent acrylic does not acquire haze with distance or a saved second face', () => {
  for (const gap of [0, 8, 200]) {
    for (const doubleSided of [0, 1]) {
      const p = opticalProfile({ ...preset, gap, doubleSided, roughness: 0 });
      assert.equal(p.haze, 0);
    }
  }
});

test('uploaded finite-source weights are bounded, symmetric and cover sampled sheet positions', () => {
  const profile = opticalProfile({ ...preset, gap: 200, opal: 1, doubleSided: 1 });
  const size = 128;
  const tables = buildWeightTable(profile, size);
  for (const table of tables) {
    for (const w of table) assert.ok(Number.isFinite(w) && w >= 0 && w <= 1);
    for (let cell = 0; cell < 16; cell++) for (let x = 0; x < size; x++) for (let channel = 0; channel < 4; channel++) {
      near(table[(cell * size + x) * 4 + channel],
        table[((15 - cell) * size + size - 1 - x) * 4 + channel], 1e-7, 'reciprocal square integration');
    }
  }
  assert.ok(profile.extent >= 160 + 8 * profile.sigmas[0]);
});
