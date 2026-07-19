# Release automation and source cleanup

Date: 2026-07-19
Status: Approved

## Problem

`web/build/` (the compiled Vite/React NUI) is force-added into the source tree past
the `web/build/` gitignore rule. Every rebuild rotates content-hashed chunk filenames,
so committing the output produces thousands of lines of churn and is fragile: a plain
`git add` stages the *deletions* of old chunks but silently skips the new ones (ignored
files need `git add -f`). PR #50 hit exactly this, landing an `index.html` that referenced
138 chunks never committed, i.e. a broken phone on a fresh clone.

## Goal

Stop tracking the build in source. Ship the compiled resource as a packaged zip attached
to GitHub Releases, built by CI. Add PR checks so every change is validated. Keep a
working distribution path available at every moment during the transition.

## Non-goals

- No change to how the NUI itself is built (`npm run build` stays `tsc --noEmit && vite build`).
- No auto-committing of build output back to the repo.
- No refactor of app/runtime code beyond a small startup guard.

## Sequencing (safety-critical)

Ordered so `main` is never left without a working distribution path:

1. Branch `ci/release-automation`: add both workflows, runtime guard, README install
   section, version bump to `0.9.0`. Build stays tracked at this stage.
2. Open a PR. The new `ci.yml` runs on that PR, self-validating build + lint + test + knip.
3. Squash-merge to `main`.
4. Cut release `v0.9.0` (`gh release create`) -> `release.yml` builds and attaches
   `sd-phone-v0.9.0.zip`. Download and verify the zip is complete.
5. Only after a verified release exists: `git rm -r --cached web/build` so `main` is
   source-only.

Rationale: `release.yml` rebuilds `web/build` from scratch, so it never depends on the
tracked copy. Untracking last means one working distribution path exists at all times.

## Components

### CI workflow: `.github/workflows/ci.yml`

- Triggers: `pull_request` and `push` to `main`. `concurrency` cancels superseded PR runs.
- Job: ubuntu, Node 22, npm cache keyed on `web/package-lock.json`, `working-directory: web`.
- Steps: `npm ci` -> `npm run build` -> `npm run lint` -> `npm run test` -> `npm run knip`.
- These match the project's existing green gates (knip-zero, 0-error eslint, vitest), so
  no existing code trips them. `npm run build` covers typecheck via `tsc --noEmit`.

### Release workflow: `.github/workflows/release.yml`

- Trigger: `release: published`. `permissions: contents: write`.
- Steps: checkout -> Node 22 -> `cd web && npm ci && npm run build` -> stage a lean
  allowlist into `dist/sd-phone/` -> zip -> upload to the triggering release.
- Allowlist (copied in): `fxmanifest.lua`, `bridge/ client/ server/ configs/ locales/
  images/`, and `web/build/` (carries `index.html`, `assets/`, `components.js`).
- Excluded: `web/src`, `node_modules`, dev configs, `.github`, `docs`, root screenshot PNGs.
- Zip name: `sd-phone-<tag>.zip`. Upload via the runner's built-in `gh release upload
  "$TAG"` using `GITHUB_TOKEN` (no third-party action).
- Explicit allowlist (not exclude-all) keeps the artifact predictable; a future runtime
  dir is a one-line addition here.

### Runtime guard: `server/main.lua`

Startup check so a missing build fails loudly instead of a blank phone:

```lua
if not LoadResourceFile(GetCurrentResourceName(), 'web/build/index.html') then
    print('^1[sd-phone] NUI build not found (web/build/index.html missing).^0')
    print('^3[sd-phone] Download the packaged release from GitHub Releases, or build it: cd web && npm ci && npm run build^0')
end
```

`LoadResourceFile` returns `nil` when the file is absent (the cloned-but-unbuilt case).

### Version bump

- `fxmanifest.lua` and `web/package.json`: `0.1.0` -> `0.9.0`.

### README

- Installation section: download the latest release zip from GitHub Releases, not the
  source "Download ZIP".
- Build-from-source note for contributors: `cd web && npm ci && npm run build`.

## Ongoing workflow after this lands

- Maintainer drafts a release in the GitHub UI (tag `vX.Y.Z` + notes); the workflow
  packages and attaches the zip.
- Contributors change source only; CI validates their PRs. `web/build` is never touched
  in source again.

## Verification

- CI green on the setup PR (proves both the gates and that `ci.yml` itself works).
- `sd-phone-v0.9.0.zip` downloaded and inspected: contains `fxmanifest.lua`, the runtime
  dirs, and a self-consistent `web/build` (every asset `index.html` references is present).
- After untracking: `git ls-files web/build` returns nothing; working tree clean.
