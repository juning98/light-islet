# 光屿 · Design QA

final result: passed

This historical review refers to local QA captures in `output/`. Repository screenshots are in [`screenshots/`](screenshots/).

## Comparison targets

- Source visual target: [`docs/visual-reference.png`](visual-reference.png).
- Final implementation capture: `output/desktop-final.jpg`.
- Verified artifact: [`光屿.html`](../%E5%85%89%E5%B1%BF.html), served at `http://127.0.0.1:4173/%E5%85%89%E5%B1%BF.html`.
- Desktop CSS viewport: 1487 × 1058. Reference and final screenshot are both exactly 1487 × 1058 pixels; 1:1 comparison, no density rescaling.
- State: 横向波纹、磨砂开启、离屏 8 mm、纹理尺度 1.2×、散射 24%、极光、灯光播放与自动漂移开启。
- The concept has no fixed animation timestamp. LED colors and the current sheet position are dynamic; compare the square source geometry, optical behavior, UI layout and control states rather than matching one generated light pattern pixel-for-pixel.
- Full-view side-by-side evidence: `output/comparison-final.jpg`.
- Focused control comparison: `output/comparison-controls.jpg` (same 480 × 800 source and implementation regions).
- Mobile CSS viewport and exact viewport capture: 390 × 844, `output/mobile-viewport.jpg` (390 × 844 pixels). The supplementary full-page capture `output/mobile.jpg` is 374 × 1206; it is not used for pixel-accurate width judgments. DOM measurements confirmed inner width, client width and scroll width all equal 390.

## Findings

No remaining actionable P0/P1/P2 findings.

- Fonts and typography: Chinese system sans serif and Segoe UI preserve the reference hierarchy. The large title, material headings, slider labels and values remain readable. Some glyph proportions and label sizes differ from the generated reference; classified as P3, not a new visual direction.
- Spacing and layout rhythm: the dark viewport is approximately 757 × 757 CSS pixels at the comparison size, with the material grid and inspector aligned on the right. All controls and the footer fit the 1487 × 1058 comparison viewport. The narrower mobile view stacks the simulator and controls without horizontal overflow.
- Colors and tokens: warm white base, charcoal type, sage controls and muted dividers match the selected direction. The corrected dark board has no olive contour artifacts.
- Image quality and asset fidelity: five generated glass thumbnails are present and embedded in the single HTML. Their exact microstructures differ slightly from the concept; material types remain recognizable. The actual light field is a requested live WebGL simulation, not a substituted raster asset. It contains exactly 16 × 16 square sources and narrow connected grid gaps.
- Copy and content: the selected Chinese headline, material names, descriptions and controls are retained. The frosting rule is reflected in the UI: no switch for no mask or plain frosting, a working switch for every structured mask.
- Interactions and accessibility: controls use native buttons and range inputs, named switches and aria-pressed selections. The light field accepts pointer dragging and keyboard input. The explanatory dialog opens and closes, and the layout supports keyboard and narrow-screen use. Reduced-motion preference disables initial automatic movement in code; an OS-level preference toggle was not changed during this session.

## Comparison history

1. Initial comparison — `output/comparison-initial.jpg`, with `output/desktop-initial.jpg` (1472 × 1047) and the reference composed together at their natural scale. The initial browser capture did not exactly match the requested pixel dimensions, so no pixel-level findings were based on that small difference.
   - P2: the oversized left viewport and excessive heading spacing pushed the bottom controls below the reference fold.
   - P2: low-precision dark radiance encoding produced visible olive contour regions around the board.
   - P3: the initial icon weight made the brand mark look like a filled square.
2. Fixes: adjusted the desktop column proportions, left-stage inset and vertical spacing; corrected vignette edge order; encoded radiance with a square-root transfer in RGBA8 and decoded before filter-kernel accumulation; selected the regular dot icon. Larger-screen inspector text was increased for readability.
3. Final comparison — `output/comparison-final.jpg` and `output/comparison-controls.jpg`, with exact 1487 × 1058 capture. The earlier P2 issues are resolved. The real-time source has a soft square emission profile, preserving the user's square faces and narrow grid gaps.
4. During asset optimization a development hot refresh briefly requested new WebP paths before the files were written. A fresh load after generation resolved all images. Final standalone validation confirmed all five embedded images were decoded successfully and had nonzero dimensions.

## Functional verification

- Loaded all five materials in the real browser with an active WebGL 2 canvas.
- No mask: only the disabled auto-drift switch remains; no frosting switch; distance, scale and scattering controls disabled.
- Plain frost: no frosting switch, scattering enabled, texture scale disabled, fixed-on description present.
- Wave: frosting toggle changes the rendered optical result and enables/disables the scattering slider. Returning to the material preserves the chosen off state.
- Grid cones: initially clear, independently enabled frosting and changed strength to 100%. Evidence: `output/cones-frost-off.jpg`, `output/cones-frost-100.jpg`.
- Honeycomb: initially clear even after cones were frosted; independent switch worked. Evidence: `output/honeycomb-frost-on.jpg`.
- Wave frosting comparison: `output/wave-frost-on.jpg` and `output/wave-frost-off.jpg` show preserved structured refraction with changed edge softness.
- Dragged the mask while the source animation was paused. The sheet moved, the exposed squares stayed fixed, and the transmitted image changed. Evidence: `output/mask-dragged.jpg`.
- Home key restored the sheet position; reset restored distance, scale and roughness.
- Selected all four source patterns. Evidence includes `output/pattern-breathe.jpg`, `output/pattern-ripple.jpg`, and `output/single-point-wave-24mm.jpg`. The single square source produces multiple refracted images through the wave sheet at 24 mm.
- Toggled the original/masked comparison view and observed both labels and the split state.
- Changed texture scale to 2.5× and 0.5×, then restored 1.2×. Evidence: `output/scale-large.jpg`.
- On the mobile viewport, selected honeycomb and operated its frosting switch. No horizontal page overflow was found.
- Opened and closed the optical-model dialog.
- Opened the built single HTML in the browser. Confirmed all five material sources are embedded data URLs; frosting controls operated correctly; the light field initialized successfully.
- Final standalone console check: zero errors and zero warnings after navigation to the final artifact.
- Final artifact state: wave + frosting on, aurora playing, auto-drift on, all images loaded, no horizontal overflow. Temporary viewport override removed and the preview tab retained as a deliverable.

## Build and packaging

- `npm run build`: passed.
- `node scripts/export-standalone.mjs`: passed.
- Single HTML: 381,803 bytes (about 373 KiB), five embedded WebP assets, zero external script tags and zero external stylesheet tags.
- Original raster assets retained in `docs/generated-assets/`; optimized thumbnails in `public/assets/`.
- The single HTML was browser-tested over local HTTP, not separately navigated with `file://`. Its inline code and embedded resource inventory were checked for the standalone handoff.
- No production deployment requested or performed.

## Open questions / validation limits

No unresolved input blocks the requested prototype. The optical model is a documented real-time approximation, not a measurement of a particular real mask. See `README.md` for the transport model and omitted effects. Actual touchscreen hardware and browsers other than the current in-app Chromium surface were not tested.

## Follow-up polish

- P3: the generated cone and honeycomb swatches have finer facet detail than the selected concept.
- P3: system font rasterization and some local type proportions differ from the generated reference.

## Implementation checklist

- [x] Selected layout and square narrow-gap matrix implemented.
- [x] Material-specific frosting rules and optical response verified.
- [x] Motion, source patterns, parameters and responsive layout verified.
- [x] Source and implementation compared together, including a focused control crop.
- [x] Final build and standalone artifact verified; preview retained locally.
