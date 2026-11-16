# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Agreed product direction

- Visual target: `docs/visual-reference.png`; an airy white/sage optical playground with a large dark viewport on the left and material controls on the right.
- Exactly 16 × 16 square emitting faces. Narrow, connected horizontal and vertical gaps form a 井-shaped grid. Do not revert to round points or wide spacing.
- No mask has no frosting switch. Plain frost is always frosted. Every structured mask has its own frosting switch and preserves its geometry when frosting changes.
- Render live optical behavior, including mask dragging and graceful automatic motion; generated images are only material-selection thumbnails.
- Keep the prototype local; publishing has not been requested.
- Acrylic controls must be independent: clear/opal, adjustable base thickness, and single/double surface frosting. Opal volume scattering remains when surface frosting is off.
- Air gap runs from 0 to 200 mm. The user rejected the original sparse 24-ray frosting as visually unrealistic; use continuous finite-emitter integration, preserving source flux and finite-panel falloff.
- Single-side frosting refers to the observer-facing surface; double-side adds frosting to the LED-facing surface. Thickness and source dimensions are explicit reference assumptions until measured hardware data is provided.
