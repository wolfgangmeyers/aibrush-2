# Task: Address Round 2 Review Findings — Upscale Implementation

Address ALL Should Address items and nits before committing:

1. Add `image.onerror = (e) => reject(new Error(...))` to `decodeImage` in `src/lib/imageutil.ts`
2. Move `performNanoGPTUpscale` from `augment-tool.tsx` to `src/lib/` (no UI coupling; test is already `.test.ts`)
3. Add Restore Faces visibility assertion to the fallback test (test 7) — when `nanoGPTGenerator` is absent, Restore Faces should still be hidden for nanogpt backend
4. Hide or replace `CostIndicator` for NanoGPT backend — it currently shows Horde kudos pricing unconditionally; NanoGPT users see wrong cost
5. Document the off-by-one in timeout: check fires after sleep+poll, so actual max wait is `TIMEOUT_MS + POLL_INTERVAL_MS`. Add a JSDoc note.

Nits (fix these too):
- Remove `hires_fix: false` from `performNanoGPTUpscale` call (NanoGPT ignores it)
- Fix `{ imageData } as any` fixture to use proper types
- Add comment to `count: 1` explaining it's load-bearing

After addressing:
1. Run `npm test -- --run` — all tests must pass
2. Run robot-review + pr-validate one more time
3. If no new Should Address items, commit: `feat: integrate NanoGPT upscale into augment tool`
4. Mail supervisor with commit hash and summary

## If Compacted

Re-read this TASK.md. Check which items are done. Address remaining items, re-review, commit, mail supervisor.
