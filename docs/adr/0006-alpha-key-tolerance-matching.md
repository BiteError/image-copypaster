---
status: accepted
---

# Alpha Key matching gains a configurable RGB-distance tolerance

Today, `Bitmap.make_color_transparent` (`src/bitmap.js`) strips a pixel to transparent only on exact RGB equality with the Alpha Key. This misses anti-aliased or slightly-off pixels near the edge of a flat-color region a user is trying to key out — a screenshot's solid background rarely renders as one single RGB value at every pixel along its edge. We're extending matching to catch pixels *near* the Alpha Key, not just identical to it.

## Decision

`make_color_transparent(color, tolerance = 0)` gains an optional `tolerance` parameter. A pixel matches (and is zeroed to alpha 0) when its plain Euclidean RGB distance to `color` — `sqrt(dr² + dg² + db²)` — is less than or equal to `tolerance`, converted from a normalized 0–100 value exposed in the UI (0 → distance 0, 100 → distance ≈441.67, the maximum possible per-channel distance `sqrt(3 × 255²)`). Matching stays binary: within tolerance the pixel becomes fully transparent, outside it the pixel is untouched — no partial/graduated alpha.

`tolerance = 0` is the default and is bit-for-bit identical to today's exact-match behavior (`bitmap.test.js:109-116` keeps passing unchanged), so every existing call site that doesn't pass a tolerance is unaffected.

The UI adds a "Tolerance" slider (0–100, default 10) next to the existing Alpha Paste checkbox. It is always visible, disabled (not hidden) while no Alpha Key is set, matching the toolbar's existing pattern of persistent-but-conditionally-inert controls. The value lives only in memory for the session — the app has no persistence layer anywhere (`localStorage`/`sessionStorage` are unused in `src/`) — and is read at Paste time in `ImageModel.pasteIntoSelection`, same timing as the Alpha Key itself.

## Considered options

- **Perceptual color distance** (weighted RGB or Lab deltaE) instead of plain Euclidean RGB distance. Rejected for now: meaningfully more complexity (color-space conversion, likely a new dependency) for a use case — cleaning up AA fringe near a picked color — where perceptual accuracy buys little. Plain RGB distance is consistent with the rest of this codebase's un-color-managed pixel handling.
- **Graduated/feathered alpha** proportional to distance, instead of a binary cutoff. Rejected: nobody asked for soft edges, and it adds a falloff curve to tune on top of the threshold itself. Revisit only if binary cutoffs produce visibly hard edges in practice.
- **A separate method** (e.g. `make_similar_colors_transparent`) instead of extending `make_color_transparent`. Rejected: there's one call site (`ImageModel.pasteIntoSelection`), and a second method would just be a near-duplicate of the same pixel-scan loop with a looser comparison.
- **Exposing the raw 0–441.67 distance** directly in the UI instead of normalizing to 0–100. Rejected: the raw number isn't meaningful to a user and would leak the specific distance formula into the UI's contract.

## Explicitly out of scope

Resize interpolation currently bleeds RGB from transparent pixels into their opaque neighbors: `make_color_transparent` only zeroes the alpha channel, leaving the RGB channels of a "transparent" pixel untouched, and `ImageModel.pasteIntoSelection` runs `make_color_transparent` *before* `Bitmap.resize`. Jimp's resize interpolation blends those stale RGB values into nearby opaque pixels across the transparent/opaque boundary, producing color fringing after resize. Tolerance matching shrinks that boundary band (fewer near-key pixels are left un-keyed going into resize) but does not fix the underlying bleed — a pixel just outside tolerance still carries un-premultiplied RGB into the interpolation. This is a separate root cause (missing alpha premultiplication before resize, or resize/color-key ordering) and is deliberately not addressed here.

## Future tuning knobs

If this needs revisiting, these are the specific levers, in order of likely payoff:

- **Distance metric** — swap Euclidean RGB for a perceptual metric if plain-RGB tolerance mismatches human color perception on specific source images (e.g. skin tones, subtle gradients).
- **Normalization curve** — the 0–100 → 0–441.67 mapping is currently linear; a non-linear curve could give finer control at low tolerances where most real usage will sit.
- **Feathering** — graduated alpha falloff by distance, if binary cutoffs prove visually harsh on real pasted images.
- **Resize RGB-bleed fix** (separate from this ADR) — premultiply RGB by alpha (or otherwise zero RGB on transparent pixels) before `Bitmap.resize` runs, or reorder resize before color-keying, to stop interpolation from smearing stale color data across transparent/opaque boundaries.

Do not use this tolerance mechanism as a substitute for fixing the resize RGB-bleed issue — they are independent bugs with independent fixes.
