# 光屿 · Acrylic revision QA

Result: implementation and interaction checks passed. Physical specimen matching remains uncalibrated.

This revision log refers to local QA captures in `output/`. Repository screenshots are in [`docs/screenshots/`](docs/screenshots/).

## Scope and acceptance

The user rejected the first optical result, particularly its frosting, and requested acrylic, an air gap up to 200 mm, adjustable thickness, clear/opal material, and single/double frosting. The first UI review is archived in `docs/qa-initial-prototype.md`; its pass did not establish physical fidelity and is superseded by this revision.

The selected white/sage visual direction remains `docs/visual-reference.png`. The new controls intentionally extend that reference. Square LEDs, narrow connected gaps, five mask geometries, per-geometry frosting switches, and graceful independent mask/source motion remain requirements.

## Visual comparison

- Reference and final desktop capture are both exactly 1487 × 1058 pixels, without scaling. Final: `output/acrylic-desktop-final.jpg`.
- Side-by-side comparison: `output/acrylic-reference-comparison.jpg`. Focused control comparison: `output/acrylic-controls-comparison.jpg`.
- Final state: horizontal waves, clear acrylic, 3 mm base, single-side frost, 8 mm air gap, 1.2× texture, 24% roughness, aurora and automatic drift playing.
- The source is a generated concept with no fixed simulation timestamp. Colors and sheet position are not a pixel-identical target. Updated light transport follows the user's correction rather than preserving the concept's painted glow.
- Main dark viewport remains approximately 757 × 757 CSS pixels. The final document has inner/client/scroll widths of 1487; footer bottom is 1054.34 in the 1058 px viewport. All controls fit without horizontal overflow.
- The material area uses the same sage switches, pale segments, subdued dividers and whitespace. Typography is slightly smaller in the expanded inspector. This is a deliberate accommodation for the additional controls; no unresolved P0/P1/P2 layout defect was observed.
- Mobile tested at 390 × 844. Client width and scroll width both 375 with a 15 px desktop-browser scrollbar; no horizontal overflow. Evidence: `output/acrylic-mobile-controls.jpg`, `output/acrylic-mobile-top.jpg`.

## Optical verification

- Removed the 24 fixed rough-normal ray copies. Surface scattering now integrates every square emitter continuously with normalized Gaussian weights. Macro refraction remains live and geometry-dependent.
- Confirmed flat frost at 0 mm preserves the square source; at 200 mm it spreads into a continuous dim field. Single-side reference frosting retains a small ballistic core; double-side reduces it further and expands the field. Evidence: `output/acrylic-clear-single-0mm.jpg`, `output/acrylic-clear-single-200mm.jpg`, `output/acrylic-clear-double-200mm.jpg`, and the same-scale `output/acrylic-distance-comparison.jpg`.
- Clear and opal are distinct transport modes. With surface frost off, 3 mm opal retains diffuse color mixing at 8 mm and becomes much more uniform and dimmer at 200 mm. Evidence: `output/acrylic-opal-unfrosted-8mm.jpg`, `output/acrylic-opal-unfrosted-200mm.jpg`.
- Tested opal thickness at 0.5 and 20 mm. The thin reference has a visible direct component; the thick reference mixes more light and transmits less. Evidence: `output/acrylic-opal-0.5mm.jpg`, `output/acrylic-opal-20mm.jpg`.
- Cones with double frosting and honeycomb with opal/double frosting render successfully. Evidence: `output/acrylic-cones-double.jpg`, `output/acrylic-honeycomb-opal.jpg`.
- Dark broad fields use half-float buffers when supported and stable display dither. Visible coarse rings from low precision were reduced without adding animated noise.
- Seven numerical tests pass. They check integrated emitter flux, an independent quadrature reference, distance and second-face response, finite-board irradiance, opal thickness/ballistic behavior, no artificial haze in clear smooth acrylic, and upload-weight bounds/symmetry.
- The finite-board kernel is compared with an exact Lambertian rectangle integral at 30 distance/position combinations. The largest absolute error is 0.515 percentage points. This is a numerical approximation check, not measured accuracy against real acrylic.

## Interaction checks

- Selected all five geometries. No mask disables optical parameters and has no frost switch. Plain frost has no switch and stays on; structured geometries have independent switches.
- Enabled cones frosting, switched to honeycomb and observed its separate off state, enabled it, then returned to cones and observed its on state preserved.
- Changed transparent/opal, single/double faces, 0.5–20 mm thickness, 0–200 mm air gap, texture scale and frosting strength. Tested both direct numeric input and range keyboard Home/End.
- Disabled frosting preserves opal bulk scattering and disables the surface-only face/strength controls.
- Reset restores transparent acrylic, 3 mm, single face, 8 mm, 1.2×, 24%, and the sheet position.
- Dragged the mask with source animation paused. The exposed board stayed fixed while the sheet and transmitted pattern moved. Evidence: `output/acrylic-dragged.jpg`.
- Original/masked comparison mode operates. Playback and drift remain independent; both were restored on in the final preview.
- The model dialog opens and closes and describes single-face orientation, air-gap measurement, emitter assumptions and calibration limits.
- On mobile, changed opal/double frosting and entered a 50 mm gap. Controls remained usable and the page did not overflow horizontally.
- Current in-app Chromium observed approximately 57–60 FPS during the checked states. This is not a performance guarantee for other GPUs or browsers.

## Build and artifact

- `npm run test:optics`: 7/7 passed.
- `npm run build`: passed.
- `node scripts/export-standalone.mjs`: passed.
- `光屿.html`: 393,179 bytes, five embedded WebP material images. Built code and styles are inline.
- The standalone artifact was opened at `http://127.0.0.1:4173/%E5%85%89%E5%B1%BF.html` and exercised in the browser, not merely checked as source.
- All five images were loaded and used data URLs. Final standalone console check returned no warnings or errors.
- A development export caused the Vite development page to reload during an intermediate check. Final distance screenshots and the main interaction pass were repeated on the finished standalone artifact; stale captures were replaced.
- Preview tab retained; viewport override restored. Local only, no publication.

## Remaining physical limits

No measured acrylic sample, haze curve, angular distribution, source size or LED emission data was supplied. The model assumes a 160 mm panel with 10 mm pitch and 9.2 mm square emitting faces. Surface scattering uses a paraxial Gaussian approximation around macro refraction; opal uses a normalized diffuse kernel and an explicit thickness-dependent reference preset. These choices correct the discrete-copy behavior and separate the physical mechanisms, but do not prove that a purchased sheet will look identical.

No complete rough-dielectric multiple scattering, recursive internal reflection, structure sidewalls, polarization, diffraction or spectral transport is solved. Numerical checks and browser screenshots validate the implementation within these assumptions. Physical fidelity requires measurements of the particular LED panel and sheet.

Follow-up visual polish remains minor: generated cone/honeycomb thumbnails have finer detail than the reference, and system-font glyphs differ slightly. Neither blocks the requested controls or optical exploration.
