# Audit Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rule out a launch-blocking build-config failure, close the two ship blockers, gate the repo with CI, then remove the duplication the chat redesign introduced.

**Architecture:** Five phases in dependency order. Phase 0 checks build configuration — found last, but potentially the most severe. Phase 1 makes revenue failures loud and render errors survivable. Phase 2 adds CI so every later phase is verified by machine rather than assertion. Phase 3 removes ~165 duplicated lines from the chat threads. Phase 4 tokenizes two invented palettes, types the Supabase client, and fixes three known bugs. Phase 5 is a pre-launch gate.

**Tech Stack:** Expo SDK 56 (`~56.0.16`), React Native 0.85.3, React 19.2.3, expo-router `~56.2.15`, TypeScript, Jest + jest-expo, Supabase (Postgres + Deno edge functions), TanStack Query v5, Reanimated 4, `@gorhom/bottom-sheet`.

**Source:** `AUDIT.md` at repo root, revised 2026-07-24 after grilling. Section references below (§2a, §3a…) point into it.

## Global Constraints

- **Branch off `origin/main`, not local `main`.** Local `main` is stale (behind `origin/main`). Start with `git fetch origin && git switch -c chore/audit-remediation origin/main`. This keeps the work independent of the unverified event-sheet commits on `feat/event-sheet-redesign`, so a device regression has exactly one candidate cause.
- **Read the versioned docs.** `https://docs.expo.dev/versions/v56.0.0/` before writing any Expo-facing code. Expo has changed; do not write from memory.
- **Component tests are impossible.** Reanimated 4 initialises its worklets runtime on import and throws under Jest, taking out every suite. Jest is scoped to `src/utils` and `src/services`. **Never add a test that imports a component.** Test logic by extracting it into a plain function — see `participationMutations` in `useEventParticipation.ts` for the established pattern.
- **`supabase/functions/**` has no test runner.** It is Deno; Jest does not cover it. Tasks touching it verify by typecheck and inspection, and say so.
- **Never hardcode a colour.** Use `COLORS` from `@/constants/colors`. `src/constants/*.ts` are the legitimate home for palette definitions; screens are not.
- **Never hardcode a font family.** Use `FONTS`. Font sizes use `TYPE_SIZE`.
- **Buttons: exactly three variants** — `primary` (coral, major CTAs only), `secondary` (black, default workhorse), `tertiary` (white, low-stakes). No pill buttons.
- **Check `src/components/ui/` before building any UI.** If a primitive is close but missing something, **add the prop — do not fork it.**
- **Query keys live in `src/constants/queryKeys.ts`** when more than one file touches them. A hand-typed key drifts **silently**.
- **Verification baseline, must not regress:**
  - `npm run typecheck` → **0 errors**
  - `npm test` → **142 passing, 10 suites**
  - `npm run lint` → **92 errors / 16 warnings** (all pre-existing; do not add)
- **Re-measure before trusting any number.** `AUDIT.md`'s figures were correct when written and some were stale within hours — `EventBottomSheet.tsx` grew 500 lines mid-session. Verify counts at the moment you act on them.
- **Do not mix a refactor with a redesign.** If one commit changes both structure and appearance, nobody can bisect a regression.
- **Commit messages** state *why*, not what the diff already says. End with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- **Phase 3 requires a device pass on both platforms.** `tsc` passing does not mean the UI is right, and there is no screen-test coverage.

---

# Phase 0 — Build configuration

Found last, and possibly the most severe thing in the plan. Neither task touches source code.

---

### Task 1: Rule out a production build with no environment

`eas.json`'s `production` profile has **no `env` block**. `development`, `preview` and `ios-simulator` all define `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `src/services/supabase.ts:134-135` reads both with a non-null assertion:

```ts
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
```

If those are undefined in a production build, **the app cannot reach its backend at all** — and the `!` means TypeScript never warns.

**This is not proven broken.** EAS also serves environment variables from the dashboard, which never appear in `eas.json`. This task is a five-minute check that either closes the question or finds the worst bug in the repo.

**Files:**
- Possibly modify: `eas.json`

**Interfaces:** none — configuration only.

- [ ] **Step 1: Check the EAS dashboard**

```bash
npx eas env:list --environment production
```

If the CLI is not authenticated, run `npx eas login` first. Alternatively check **expo.dev → your project → Environment variables**.

- [ ] **Step 2: Decide based on what you find**

**If `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are present for the production environment:** the configuration is fine. **Stop — do not add them to `eas.json`.** Dashboard-managed variables are the better pattern, and duplicating them into a tracked file would commit credentials that are currently only server-side. Record the finding in `AUDIT.md` §5 item 0 as ruled out, and move to Task 2.

**If they are absent:** this is a launch-blocking bug. Continue to Step 3.

- [ ] **Step 3: Only if absent — add them to the production profile**

Prefer setting them in the EAS dashboard (`npx eas env:create --environment production`). Only if you deliberately want them in the repo, mirror the `preview` profile in `eas.json`:

```json
    "production": {
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://vtrsagvueljzbbtpeenu.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "sb_publishable_-DZwjVLqXcAY7GL--bzZ_Q_PmM76PTQ",
        "GOOGLE_MAPS_IOS_KEY": "<from the dashboard, see Task 2>",
        "GOOGLE_MAPS_ANDROID_KEY": "<from the dashboard, see Task 2>"
      }
    }
```

The Supabase anon key is `sb_publishable_` — public by design, safe in a repo. **The Maps keys are not** — see Task 2 before committing them anywhere.

- [ ] **Step 4: Make the failure loud regardless of the outcome**

Whatever Step 2 found, the non-null assertions are lying. In `src/services/supabase.ts`, replace lines 134-135:

```ts
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
```

with:

```ts
// `!` asserted these were always present, which is exactly the thing that was
// never verified for production builds. A missing URL here is not a degraded
// experience — nothing in the app works — so it should fail at startup with a
// name, rather than surfacing as every query failing for no stated reason.
function requiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Check the EAS environment for this build profile.`
    );
  }
  return value;
}

const supabaseUrl = requiredEnv(
  'EXPO_PUBLIC_SUPABASE_URL',
  process.env.EXPO_PUBLIC_SUPABASE_URL
);
const supabaseAnonKey = requiredEnv(
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);
```

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm test
```

Expected: `0` errors; `142 passing, 10 suites`.

Then `npx expo start -c` and confirm the app still signs in — `.env` supplies these locally, so behaviour must be unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/services/supabase.ts eas.json
git commit -m "$(cat <<'EOF'
fix(config): a missing Supabase URL fails by name, not by everything

The production EAS profile defines no environment, unlike every other
profile, and supabase.ts asserted both variables were present with `!`.
If the dashboard does not supply them, a production build cannot reach
the backend at all — and nothing in the types or the build says so.

Whether or not the dashboard has them, the assertion was unearned. This
throws with the variable's name at startup instead of leaving every query
to fail separately and silently.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Restrict or rotate the committed Maps keys

`eas.json` is tracked by git and contains `GOOGLE_MAPS_IOS_KEY` and `GOOGLE_MAPS_ANDROID_KEY` in plaintext, on a GitHub remote. Google Maps keys are billable — an unrestricted leaked key can be used by anyone at your expense.

The Supabase key beside them is **fine**: `sb_publishable_` is designed to be public and is protected by row-level security. Do not rotate it in a panic.

**Files:**
- Possibly modify: `eas.json`

**Interfaces:** none — configuration only.

- [ ] **Step 1: Establish exposure**

Determine whether `https://github.com/ameyayeole/mello` is public or private. If **private**, the risk is limited to people with repo access and this task is optional — restricting the keys is still good practice, rotating is not urgent.

If **public**, the keys have been readable by anyone for as long as they have been committed, and are in git history regardless of what you change now. **Rotation, not just restriction, is required.**

- [ ] **Step 2: Restrict the keys in Google Cloud Console**

In **APIs & Services → Credentials**, for each key set an **Application restriction**:
- iOS key → iOS apps → the bundle identifier
- Android key → Android apps → the package name + SHA-1 certificate fingerprint

And an **API restriction** limiting each to only the Maps SDKs actually used.

A restricted key is worth far more than a secret one here: these keys ship inside the app binary and can always be extracted, so restriction — not secrecy — is the real control.

**Note:** the bundle identifier is still the placeholder (Phase 1, Task 4). Restrict to the placeholder now and revisit when the real identifier exists, or restrict by API only until then. Record which you chose.

- [ ] **Step 3: Rotate if the repo is public**

Create replacement keys, apply the Step 2 restrictions to them, update wherever they are configured, and delete the old keys. Verify the map still renders on both platforms before deleting.

- [ ] **Step 4: Commit only if a file changed**

If keys moved out of `eas.json`:

```bash
git add eas.json
git commit -m "$(cat <<'EOF'
chore(config): the Maps keys stop living in the repo

They are in a tracked file on a remote, and Maps keys are billable. The
Supabase key beside them stays — sb_publishable_ is public by design and
row-level security is what protects it.

Restriction matters more than secrecy here: these keys ship inside the
binary and can always be extracted, so they are restricted by bundle id
and API as well as moved.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

If only the Google Cloud console changed, there is nothing to commit — note it in `AUDIT.md` at Task 12 instead.

---

# Phase 1 — Safety

Nothing here needs a device or a new dependency.

---

### Task 3: Delete the dead Expo scaffold

`App.tsx` is the untouched Expo template (`"Open up App.tsx to start working on your app!"`). It is imported only by `index.ts`, which is itself unreferenced — `package.json`'s `main` is `expo-router/entry`, and the real root is `app/_layout.tsx`. See §3d.

This goes before Task 5 because that task adds an error boundary "at the root", and `App.tsx` is a trap that looks like the root.

**Files:**
- Delete: `App.tsx`
- Delete: `index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. A pure deletion.

- [ ] **Step 1: Prove both files are unreferenced**

```bash
node -e "console.log(require('./package.json').main)"
```

Expected: `expo-router/entry`

```bash
grep -rn "from './App'\|require('./App')\|from './index'" . \
  --include='*.ts' --include='*.tsx' --include='*.js' | grep -v node_modules
```

Expected: exactly one line — `index.ts:3:import App from './App';`. Nothing imports `index.ts` itself.

**If anything else appears, STOP** and report. The deletion is only safe because this island is closed.

- [ ] **Step 2: Delete both files**

```bash
git rm App.tsx index.ts
```

- [ ] **Step 3: Verify nothing broke**

```bash
npm run typecheck && npm test
```

Expected: `0` typecheck errors; `142 passing, 10 suites`.

- [ ] **Step 4: Verify the app still boots**

```bash
npx expo start -c
```

Expected: bundles and reaches the splash/sign-in screen. `-c` clears the bundler cache — required, because the entry point is what changed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: delete the Expo scaffold the router replaced

App.tsx was still the untouched template. package.json's main is
expo-router/entry, so index.ts — the only thing importing App.tsx — was
never the entry point either. A closed orphaned island.

Deleting it because it is also a trap: App.tsx looks like the root
component, so a provider or error boundary added "at the root" by reading
filenames lands somewhere that never runs.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Make a missing IAP bundle ID fail loudly

§2a. `verify-iap/index.ts:40` and `verify-boost/index.ts:40` both read:

```ts
const bundleId = () => Deno.env.get('IAP_BUNDLE_ID') ?? 'com.yourcompany.mello';
```

The bundle ID **is** the receipt check. With the placeholder, the store charges the customer and verification then rejects their genuine receipt — billed, granted nothing, nothing in the logs.

The real identifier does not exist yet (stores not registered). So this task does the durable half: **remove the fallback so a missing secret is impossible to ship**, and mark the one place the value goes later.

**Files:**
- Modify: `supabase/functions/verify-iap/index.ts:40` (and the comment at `:27`)
- Modify: `supabase/functions/verify-boost/index.ts:40` (and the comment at `:25`)
- Modify: `app.config.ts:12`, `app.config.ts:30`

**Interfaces:**
- Consumes: nothing.
- Produces: `bundleId(): string` in both edge functions — same name and signature, now throwing instead of returning a placeholder. No caller changes.

**No test runner covers `supabase/functions/**` (Deno, not Jest).** Verification is inspection plus typecheck. Do not fabricate a Jest test for these files.

- [ ] **Step 1: Replace the fallback in `verify-iap`**

In `supabase/functions/verify-iap/index.ts`, replace line 40 with:

```ts
// No fallback, deliberately. The bundle id IS the receipt check: a wrong one
// means the store charges the customer and verification then rejects their
// genuine receipt — billed, granted nothing, and nothing in the logs. A
// missing secret must break the deploy, not a customer's purchase.
const bundleId = (): string => {
  const id = Deno.env.get('IAP_BUNDLE_ID');
  if (!id) {
    throw new Error(
      'IAP_BUNDLE_ID is not set. Set it with: supabase secrets set IAP_BUNDLE_ID=<the real bundle id>'
    );
  }
  return id;
};
```

- [ ] **Step 2: Update the secrets comment in `verify-iap`**

Replace line 27:

```ts
//   IAP_BUNDLE_ID                com.yourcompany.mello (shared by both stores)
```

with:

```ts
//   IAP_BUNDLE_ID                the real bundle id from App Store Connect /
//                                Play Console, shared by both stores. Required —
//                                the function throws without it.
```

- [ ] **Step 3: Apply the identical change to `verify-boost`**

`supabase/functions/verify-boost/index.ts` line 40 carries the same expression. Replace it with the **exact same** `bundleId` implementation from Step 1, comment included. Then update its secrets comment at line 25 the same way as Step 2.

- [ ] **Step 4: Mark the two app config sites**

In `app.config.ts`, line 12:

```ts
    // PLACEHOLDER — not yet registered with App Store Connect. This must match
    // the IAP_BUNDLE_ID Supabase secret exactly; the pair is what verifies a
    // receipt. Replace both together, and set the secret in the same change.
    bundleIdentifier: 'com.yourcompany.mello',
```

And line 30:

```ts
    // PLACEHOLDER — see the note on ios.bundleIdentifier above. Same value.
    package: 'com.yourcompany.mello',
```

- [ ] **Step 5: Verify the placeholder survives in exactly three marked places**

```bash
grep -rn "com.yourcompany.mello" app.config.ts supabase/functions/
```

Expected: **3 lines, all in `app.config.ts`**. **Zero hits in `supabase/functions/`** — if any remain, Step 1 or 3 was missed.

- [ ] **Step 6: Verify the app is unaffected**

```bash
npm run typecheck
```

Expected: `0` errors. (`tsc` does not cover Deno files, so this only proves the app side is untouched — which is the point.)

- [ ] **Step 7: Commit**

```bash
git add app.config.ts supabase/functions/verify-iap/index.ts supabase/functions/verify-boost/index.ts
git commit -m "$(cat <<'EOF'
fix(iap): a missing bundle id breaks the deploy, not a purchase

Both verify functions defaulted to Expo's placeholder when IAP_BUNDLE_ID
was unset. The bundle id is the receipt check, so that default is the
worst possible failure: the store charges, verification rejects the
genuine receipt, and nothing is logged.

The real identifier does not exist yet, so this does the half that can be
done now — remove the fallback, and mark the two app.config sites that
must change together with the secret.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Add an error boundary

§2a. `Sentry`, `ErrorBoundary` and `ErrorUtils` return **zero hits**. A render error in production is a white screen.

**expo-router has this built in — no dependency required.** `expo-router/build/useScreens.js:141-155` wraps any route that exports `ErrorBoundary` in `<Try catch={ErrorBoundary}>`. Exporting it from `app/_layout.tsx` covers the whole app.

**Files:**
- Create: `src/components/AppErrorBoundary.tsx`
- Modify: `app/_layout.tsx` (one re-export line)

**Interfaces:**
- Consumes: `ErrorBoundaryProps` from `expo-router` — `{ error: Error; retry: () => Promise<void> }`.
- Produces: `AppErrorBoundary(props: ErrorBoundaryProps): JSX.Element`, re-exported from `app/_layout.tsx` as the named export `ErrorBoundary`. Task 13 adds a Sentry call inside it.

This is a component, so **it cannot have a Jest test**. Verification is a deliberate thrown error on a device.

- [ ] **Step 1: Create the boundary component**

Create `src/components/AppErrorBoundary.tsx`:

```tsx
import { StyleSheet, Text, View } from 'react-native';
import type { ErrorBoundaryProps } from 'expo-router';
import { COLORS } from '@/constants/colors';
import { FONTS, TYPE_SIZE } from '@/constants/typography';
import { SPACING } from '@/constants/spacing';
import { Button } from '@/components/ui';

// The last line of defence. expo-router wraps any route exporting
// `ErrorBoundary` in its <Try> (see expo-router/build/useScreens.js), so
// re-exporting this from app/_layout.tsx covers every screen.
//
// `retry` re-renders the route by clearing the caught error — it is not a
// reload, so a crash caused by bad cached data will simply throw again. That
// is the honest behaviour: offer the retry, don't promise a fix.
export function AppErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.body}>
        That screen ran into a problem. You can try again — if it keeps
        happening, restarting the app usually clears it.
      </Text>

      {/* Dev only. In production the message is noise to the user and can leak
          internals into a screenshot. */}
      {__DEV__ ? <Text style={styles.detail}>{error.message}</Text> : null}

      <Button label="Try again" variant="secondary" onPress={retry} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[6],
    gap: SPACING[3],
    backgroundColor: COLORS.background,
  },
  title: {
    fontFamily: FONTS.heading,
    fontSize: TYPE_SIZE.titleLg,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: TYPE_SIZE.bodyMd,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  detail: {
    fontFamily: FONTS.regular,
    fontSize: TYPE_SIZE.bodySm,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
```

**Before writing this, open `src/constants/colors.ts` and `src/constants/typography.ts` and confirm every token used above exists.** If a name differs, use the real one — do not invent a token, and do not hardcode a value.

- [ ] **Step 2: Wire it up in the root layout**

Add to `app/_layout.tsx`, near the top-level imports:

```tsx
// expo-router picks this up by name and wraps the whole tree in it.
export { AppErrorBoundary as ErrorBoundary } from '@/components/AppErrorBoundary';
```

- [ ] **Step 3: Verify it compiles**

```bash
npm run typecheck && npm run lint
```

Expected: `0` typecheck errors; lint no worse than `92 errors / 16 warnings`.

- [ ] **Step 4: Prove it catches — temporarily**

Add a deliberate throw at the top of the component in `app/(tabs)/explore.tsx`:

```tsx
throw new Error('boundary smoke test');
```

Run `npx expo start -c`, open the Explore tab.

Expected: the "Something went wrong" screen with the message visible (dev build), **not** a red box and **not** a white screen. Tap "Try again" — it re-renders and throws again, which is correct.

**Then remove the throw.** Do not commit it.

- [ ] **Step 5: Confirm the throw is gone**

```bash
grep -rn "boundary smoke test" app src
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/AppErrorBoundary.tsx app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat: catch render errors instead of showing a white screen

A render error in production was a white screen with no telemetry — you
found out from an App Store review.

No dependency needed: expo-router wraps any route that exports
ErrorBoundary in its own <Try>, so re-exporting one from the root layout
covers every screen. The error message is dev-only; in production it is
noise to the user and can leak internals into a screenshot.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — The gate

---

### Task 6: CI

§2c. `typecheck`, `lint` and `test` all pass and **nothing runs them** — which is why the counts in `CLEANUP.md` drifted unnoticed. ~20 lines.

`lint` is **non-gating** on purpose: 92 pre-existing errors mean a gating lint job fails on arrival and gets ignored, which is worse than no job.

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: the `typecheck`, `test` and `lint` scripts already in `package.json`.
- Produces: a `ci` workflow. No source symbol.

- [ ] **Step 1: Confirm the scripts exist as referenced**

```bash
node -e "const s=require('./package.json').scripts;console.log(s.typecheck,'|',s.test,'|',s.lint)"
```

Expected: `tsc --noEmit | jest | eslint .`

- [ ] **Step 2: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      # ci, not install: the lockfile is the point. An install that silently
      # resolves a different tree would make a green run meaningless.
      - run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      # Non-gating. 92 errors are pre-existing, so a gating lint job would fail
      # on every run from day one and be ignored within a week. Reporting keeps
      # the number visible without training anyone to skip a red check.
      - name: Lint
        run: npm run lint
        continue-on-error: true
```

- [ ] **Step 3: Verify locally what CI will run**

```bash
npm ci && npm run typecheck && npm test
```

Expected: clean install, `0` typecheck errors, `142 passing, 10 suites`.

`npm ci` deletes and reinstalls `node_modules` from the lockfile. If it fails, the lockfile has drifted — **fix that before committing**, because CI will hit the same wall.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "$(cat <<'EOF'
ci: run the checks that already existed

typecheck, test and lint all passed and nothing ran them, which is how
the counts in CLEANUP.md drifted without anyone noticing.

Lint is non-gating: 92 errors are pre-existing, so a gating job would be
red from the first run and ignored by the second week.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Confirm it actually runs**

Push and open the PR, then check the Actions tab (or `gh run list --limit 3` if the GitHub CLI is installed).

Expected: a `CI` run with `Typecheck` and `Test` green. **A workflow that has never run is not CI.**

---

# Phase 3 — Duplication

> **This phase changes behaviour-bearing animation code with zero screen-test coverage.** `tsc` cannot see a broken gesture. It should land as its own PR so a regression can be bisected away from Phases 0–2.

---

### Task 7: Extract the duplicated thread physics

§3a. `app/(tabs)/chats/[eventId].tsx` (1,107 lines) and `app/(tabs)/chats/dm/[friendId].tsx` (727 lines) share **165 identical non-trivial lines**, ~44% of the DM screen.

`git log -S` shows this is copy-paste at authoring time: `1a48261` added the rubber-band drag to **both files in one commit**, and `98d9d94` did the same for the send kick.

**The two gesture blocks are byte-for-byte identical**, comments included — verified during the audit. So this is a mechanical move, not a merge of two behaviours. `TIME_GUTTER` and `SPRING_BACK` are *already* shared imports; only `RUBBER` is a stray local constant.

These two screens have already been bitten by exactly this once (`CLEANUP.md` §1: attachment failures handled in one, swallowed in the other).

**Files:**
- Create: `src/utils/threadDrag.ts`
- Create: `src/utils/__tests__/threadDrag.test.ts`
- Create: `src/hooks/useThreadPhysics.ts`
- Modify: `app/(tabs)/chats/[eventId].tsx`
- Modify: `app/(tabs)/chats/dm/[friendId].tsx`

**Interfaces:**
- Consumes: `TIME_GUTTER` and `SPRING_BACK` from the shared modules both screens already import.
- Produces:
  - `rubberBandOffset(rawTranslationX: number, gutter: number): number` in `src/utils/threadDrag.ts` — pure, testable, no Reanimated import.
  - `useThreadPhysics()` in `src/hooks/useThreadPhysics.ts`, returning at minimum `{ revealX, revealPan }` to match the existing local names. **Confirm the exact shape against the real implementation as you extract**; both screens must consume an identical shape.

- [ ] **Step 1: Confirm the two copies are still identical**

```bash
set -f
diff <(sed -n '/const revealX = useSharedValue/,/^  });$/p' "app/(tabs)/chats/[eventId].tsx") \
     <(sed -n '/const revealX = useSharedValue/,/^  });$/p' "app/(tabs)/chats/dm/[friendId].tsx")
```

Expected: **no output** — identical.

**If they differ, STOP and report the difference before merging them.** A silent divergence is a behaviour change hiding inside a refactor, and picking one arbitrarily is how the last bug in these files happened.

- [ ] **Step 2: Write the failing test**

Create `src/utils/__tests__/threadDrag.test.ts`:

```ts
import { rubberBandOffset } from '../threadDrag';

const GUTTER = 64;

describe('rubberBandOffset', () => {
  it('tracks the finger one-to-one before the gutter', () => {
    expect(rubberBandOffset(-20, GUTTER)).toBeCloseTo(-20);
    expect(rubberBandOffset(-GUTTER, GUTTER)).toBeCloseTo(-GUTTER);
  });

  it('does not move for a rightward drag', () => {
    expect(rubberBandOffset(30, GUTTER)).toBeCloseTo(0);
  });

  it('resists past the gutter instead of tracking', () => {
    const past = rubberBandOffset(-2 * GUTTER, GUTTER);
    expect(Math.abs(past)).toBeGreaterThan(GUTTER);
    expect(Math.abs(past)).toBeLessThan(2 * GUTTER);
  });

  it('is continuous at the gutter — no kink where resistance starts', () => {
    const before = rubberBandOffset(-GUTTER + 0.01, GUTTER);
    const after = rubberBandOffset(-GUTTER - 0.01, GUTTER);
    expect(Math.abs(after - before)).toBeLessThan(0.1);
  });

  it('keeps resisting harder the further it is pulled', () => {
    const a = Math.abs(rubberBandOffset(-2 * GUTTER, GUTTER));
    const b = Math.abs(rubberBandOffset(-4 * GUTTER, GUTTER));
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeLessThan(GUTTER);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

```bash
npx jest src/utils/__tests__/threadDrag.test.ts
```

Expected: FAIL — `Cannot find module '../threadDrag'`.

- [ ] **Step 4: Extract the formula**

Create `src/utils/threadDrag.ts`. The body must reproduce the screens' expression exactly — copy it from `[eventId].tsx` rather than trusting this listing:

```ts
// The share of travel past the gutter that still moves the thread.
const RUBBER = 0.5;

// How far the thread actually moves for a given finger travel.
//
// Up to the gutter it tracks the finger exactly. Past it, resistance grows with
// distance so the thread never runs away — a peek at the time, not a toy.
//
// Driven off the gesture's own total translation rather than accumulated
// deltas: accumulating and then clamping puts a kink in the motion at the
// moment resistance starts, and you can feel it.
//
// Pure and Reanimated-free so it can be tested at all — the worklet runtime
// throws under Jest, so anything importing Reanimated is untestable here.
export function rubberBandOffset(rawTranslationX: number, gutter: number): number {
  const raw = Math.min(0, rawTranslationX);
  const past = -raw - gutter;
  return past <= 0
    ? raw
    : // Asymptotic: every further pixel of pull moves it less than the last, so
      // it never quite reaches the end and never stops dead.
      -(gutter + (past * RUBBER) / (1 + past / gutter));
}
```

- [ ] **Step 5: Run the tests**

```bash
npx jest src/utils/__tests__/threadDrag.test.ts
```

Expected: **5 passing.** If the continuity test fails, the extracted expression does not match the original — fix the extraction, not the test.

- [ ] **Step 6: Commit the pure extraction**

```bash
git add src/utils/threadDrag.ts src/utils/__tests__/threadDrag.test.ts
git commit -m "$(cat <<'EOF'
refactor(chat): one rubber-band formula, and a test for it

The drag resistance was written into both thread screens by the same
commit (1a48261), with RUBBER declared separately in each while
TIME_GUTTER came from a shared module — two halves of one formula on
opposite sides of a copy-paste boundary.

Extracted pure and Reanimated-free so it is testable at all; the worklet
runtime throws under Jest. The continuity case is the one that matters:
it is what makes the pull feel like rubber rather than a wall.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Build the shared hook**

Create `src/hooks/useThreadPhysics.ts`, moving the gesture and shared values out of the event-chat screen **unchanged**, calling `rubberBandOffset` for the drag maths. Keep the existing comments — they explain why `activeOffsetX` / `failOffsetY` are set as they are, and that reasoning is not reconstructible from the code.

Do not redesign the API while moving it. The goal is one copy of today's behaviour.

- [ ] **Step 8: Adopt it in the event chat**

Replace the inlined physics in `app/(tabs)/chats/[eventId].tsx` with `useThreadPhysics()`.

```bash
npm run typecheck && npm test
```

Expected: `0` errors; `147 passing` (142 + the 5 new).

- [ ] **Step 9: Device-verify the event chat before touching the DM screen**

`npx expo start -c`, open an event chat, on **both iOS and Android**:

- Drag left → times slide in from the gutter, resisting past it, no kink where resistance starts
- Release → springs back, settles without wobbling; a flick and a slow let-go return at **different** speeds
- Drag vertically → the list scrolls; the drag does **not** steal the gesture
- Send a message → the send button dips and springs back, and the bubble leaves as one event with it

**Only proceed once this matches the behaviour before the change.** One screen converted and verified is a safe stopping point; two converted and unverified is not.

- [ ] **Step 10: Adopt it in the DM chat**

Replace the duplicated physics in `app/(tabs)/chats/dm/[friendId].tsx` with the same hook, deleting its local `RUBBER` and its pan gesture.

- [ ] **Step 11: Verify the duplication is actually gone**

```bash
set -f
comm -12 \
  <(grep -v "^import\|^\s*$" "app/(tabs)/chats/[eventId].tsx" | sed 's/^[[:space:]]*//' | awk 'length($0)>25' | sort -u) \
  <(grep -v "^import\|^\s*$" "app/(tabs)/chats/dm/[friendId].tsx" | sed 's/^[[:space:]]*//' | awk 'length($0)>25' | sort -u) | wc -l
```

Was **165**. Expected: substantially lower. Some overlap is legitimate — both render a composer and a list, and shared JSX shape is not duplicated logic. **Report the new number; do not chase it to zero** by extracting things that only look alike.

```bash
grep -rn "const RUBBER" app/ src/
```

Expected: **exactly one hit**, in `src/utils/threadDrag.ts`.

- [ ] **Step 12: Verify**

```bash
npm run typecheck && npm test && npm run lint
```

Expected: `0` errors; `147 passing`; lint no worse than `92 / 16`.

- [ ] **Step 13: Device-verify the DM chat**

Repeat Step 9's checklist in a DM thread, **both platforms**. Then check the two screens **against each other** — the drag and the send should now feel identical, because they are now literally the same code.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(chat): both threads share one set of physics

The drag, the send kick and the gesture config were written into both
thread screens by the same two commits. 165 identical non-trivial lines —
about 44% of the DM screen — and the gesture blocks were byte-for-byte
identical, comments included.

These two files have been bitten by this exact pattern before: attachment
failures were handled in one and swallowed in the other. Same shape, same
files, so it is worth closing rather than tidying.

Behaviour is unchanged by construction — the code moved, it was not
rewritten. Verified on iOS and Android in both threads.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 4 — Correctness

---

### Task 8: Tokenize the two invented palettes

§3c. Two complete semantic colour families are living in screens, against `AGENTS.md`'s "never hardcode a colour".

**Files:**
- Modify: `src/constants/colors.ts`
- Modify: `app/(tabs)/chats/[eventId].tsx` (11 occurrences)
- Modify: `src/components/events/EventBottomSheet.tsx` (the safety-popup variants)
- Modify: `src/components/wrap/WrapSheet.tsx:128`

**Interfaces:**
- Consumes: nothing.
- Produces: new `COLORS` entries. Name them by **role, not hue** — `announce*`, not `amber*`. A colour named for its appearance gets reused for the wrong meaning.

> **Re-locate the safety-popup literals before editing.** They were at `EventBottomSheet.tsx:573-616` when audited; that file has since grown by 500 lines. Find them with the grep in Step 3 rather than trusting the line numbers.

- [ ] **Step 1: Add the announcement family**

Add to `src/constants/colors.ts`, matching the file's existing naming and grouping:

```ts
  // The announcement state in event chat — a host's pinned message. Named for
  // the role, not the hue: this is "announcement", not "amber", so it cannot be
  // reused for a warning it has nothing to do with.
  announceInk: '#B4690E',
  announceFill: '#FFF6E9',
  announceBorder: 'rgba(180,105,14,0.25)',
  announceBorderSoft: 'rgba(180,105,14,0.2)',
  announceAccent: '#E8940A',
```

- [ ] **Step 2: Adopt them in the event chat**

Replace all occurrences in `app/(tabs)/chats/[eventId].tsx`:

```bash
set -f
grep -n "#B4690E\|#FFF6E9\|#E8940A\|180,105,14" "app/(tabs)/chats/[eventId].tsx"
```

Expected after the edit: no output.

- [ ] **Step 3: Add the safety-popup variants**

Locate them:

```bash
grep -n "#7C5CE0\|#F0ECFC\|#C8791E\|#FBF0E2\|#D6478E\|#FBE7F1" src/components/events/EventBottomSheet.tsx
```

Add to `COLORS`, named for the variant each marks:

```ts
  // The three pre-join safety popups. Each pair is a glyph accent and its
  // backing tint; they mark which advisory it is, so they are named for that.
  safetyWomenAccent: '#7C5CE0',
  safetyWomenTint: '#F0ECFC',
  safetyHeadsUpAccent: '#C8791E',
  safetyHeadsUpTint: '#FBF0E2',
  safetyNightAccent: '#D6478E',
  safetyNightTint: '#FBE7F1',
```

Then replace the literals at the lines the grep reported.

- [ ] **Step 4: Fix the `WrapSheet` literal**

`src/components/wrap/WrapSheet.tsx:128` has a raw `rgba(255,255,255,0.10)`. Use the existing on-dark fill token — check `COLORS` for `fillOnDark` (named in `DESIGN.md` §3) and use it if it matches. **If no token matches, add one** rather than leaving the literal.

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm test && npm run lint
```

Expected: `0` errors; `147 passing`; lint no worse than `92 / 16`.

- [ ] **Step 6: Device-check**

The colours must be **identical** — this is a token swap, not a redesign. Check a host announcement in event chat, all three safety popups, and the wrap sheet.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(colors): the announcement and safety palettes get tokens

Two complete semantic colour families were living in screens — eleven
occurrences of the announcement colours in event chat, and three
accent/tint pairs for the safety popups.

Named for role rather than hue (announceInk, not amber) so they cannot be
reused for a warning they have nothing to do with. Values are unchanged;
this is a swap, not a retune.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Generate and adopt Supabase types

§2c. `createClient()` is untyped — the root cause of Task 11's bad cast being expressible at all.

**Files:**
- Create: `src/types/database.ts` (generated — do not hand-edit)
- Modify: `src/services/supabase.ts`
- Modify: `package.json` (a regeneration script)

**Interfaces:**
- Consumes: nothing.
- Produces: the `Database` type; `supabase` becomes `SupabaseClient<Database>`.

- [ ] **Step 1: Generate the types**

The project id is `vtrsagvueljzbbtpeenu` (from `eas.json`'s Supabase URL):

```bash
npx supabase gen types typescript --project-id vtrsagvueljzbbtpeenu > src/types/database.ts
```

If the CLI is not linked, run `npx supabase login` first.

- [ ] **Step 2: Add a regeneration script**

The types go stale the moment a migration lands, and a stale generated file is worse than none. Add to `package.json` `scripts`:

```json
"types:db": "supabase gen types typescript --project-id vtrsagvueljzbbtpeenu > src/types/database.ts"
```

- [ ] **Step 3: Type the client**

In `src/services/supabase.ts`:

```ts
import type { Database } from '@/types/database';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  /* existing options unchanged */
});
```

- [ ] **Step 4: See what this catches**

```bash
npm run typecheck
```

**Expect NEW errors — that is the point of the task.** Each is a real mismatch that was invisible before. Fix them one at a time; **do not silence any with `as any`.** If one is genuinely unfixable here, leave it, report it, and do not commit a suppression.

Record the error count before and after so the change is measurable.

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm test
```

Expected: back to `0` errors; `147 passing`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: type the Supabase client from the schema

createClient() was untyped, which is why a cast to NearbyEvent[] over
unselected columns compiled cleanly. This turns that class of bug into a
compile error.

The types are generated — npm run types:db regenerates them. A stale
generated file is worse than none, so the script ships with it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Fix the DM conversation preview

§2b. `dm.service.ts:179-189` fetches the **300 most recent DMs globally**, then walks them newest-first taking the first per friend:

```ts
  const { data: mdata } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(300);
```

Once a few busy threads fill those 300, a quiet conversation gets **no preview at all** — and sorts to the bottom, because its missing timestamp reads as `0`.

Raising the limit only moves the threshold, and one query per friend is N round trips. The correct fix is `DISTINCT ON`, which needs an RPC. This is in pattern: the repo has 43 migrations and 14 `.rpc()` call sites.

**Files:**
- Create: `supabase/migrations/044_dm_conversation_previews.sql`
- Modify: `src/services/dm.service.ts:179-189`

**Interfaces:**
- Consumes: `Database` from Task 9 (regenerate after the migration).
- Produces: RPC `dm_conversation_previews(p_user_id uuid)` returning one row per counterpart — the full latest `direct_messages` row plus `other_id`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/044_dm_conversation_previews.sql`:

```sql
-- One preview per conversation, instead of "the newest 300 messages overall".
--
-- getFriendConversations used to fetch a global page of messages and pick the
-- first per counterpart client-side. That works right up until a few busy
-- threads fill the page, at which point quiet conversations show no preview and
-- sort to the bottom. Raising the page size only moves where it breaks.
--
-- DISTINCT ON gives exactly one row per counterpart in a single query, and the
-- ORDER BY is what picks *which* row: the counterpart groups the rows, and
-- created_at DESC makes the newest the one kept.
create or replace function dm_conversation_previews(p_user_id uuid)
returns table (
  other_id uuid,
  id uuid,
  sender_id uuid,
  recipient_id uuid,
  body text,
  created_at timestamptz,
  read_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (other_id)
    case when m.sender_id = p_user_id then m.recipient_id else m.sender_id end as other_id,
    m.id,
    m.sender_id,
    m.recipient_id,
    m.body,
    m.created_at,
    m.read_at
  from direct_messages m
  where m.sender_id = p_user_id or m.recipient_id = p_user_id
  order by other_id, m.created_at desc;
$$;

-- security invoker, so the caller's row-level security still applies — this
-- function must not become a way to read messages you could not already read.
grant execute on function dm_conversation_previews(uuid) to authenticated;
```

**Before applying, confirm the real column list:**

```bash
grep -rn "direct_messages" supabase/migrations/*.sql | head
```

`body`, `read_at` and the timestamp type must match the actual table. **Adjust the `returns table` block to the real schema** — a mismatch here fails at runtime, not at deploy.

- [ ] **Step 2: Apply it**

```bash
npx supabase db push
```

- [ ] **Step 3: Regenerate the types**

```bash
npm run types:db
```

The new function must appear under `Functions` in `src/types/database.ts`. If it does not, the migration did not apply.

- [ ] **Step 4: Use it**

In `src/services/dm.service.ts`, replace the query at lines 179-189 with:

```ts
  // One row per conversation from the database, rather than a global page of
  // messages filtered down here — see migration 044. Still best-effort: if the
  // function is missing (migration not applied), the friend list is returned
  // without previews rather than failing outright.
  const lastByFriend = new Map<string, DirectMessage>();
  const { data: mdata } = await supabase.rpc('dm_conversation_previews', {
    p_user_id: userId,
  });

  for (const row of (mdata ?? []) as (DirectMessage & { other_id: string })[]) {
    lastByFriend.set(row.other_id, row);
  }
```

The `for` loop no longer needs its `if (!lastByFriend.has(other))` guard — the RPC returns one row per counterpart already. Delete the old loop at lines 186-189.

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm test
```

Expected: `0` errors; `147 passing`.

- [ ] **Step 6: Device-check**

With an account that has several conversations: every conversation shows its last message, **including old quiet ones**, and the list is ordered by most recent activity. This is the bug — verify it against an account with real volume, not a fresh one.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/044_dm_conversation_previews.sql src/services/dm.service.ts src/types/database.ts
git commit -m "$(cat <<'EOF'
fix(dm): a quiet conversation keeps its preview

getFriendConversations fetched the newest 300 messages overall and picked
the first per friend client-side. Once a few busy threads filled that
page, quiet conversations showed no preview and sorted to the bottom,
because a missing timestamp reads as zero.

DISTINCT ON returns one row per counterpart in a single query, so the
result no longer depends on how much anyone else has been talking.
Raising the page size would only have moved the point where it breaks.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Fix the two remaining known bugs

§2b. Unrelated to each other — **two separate commits**.

**Files:**
- Modify: `src/services/events.service.ts:80`
- Modify: `supabase/functions/didit-create-session/index.ts:5`

**Interfaces:**
- Consumes: `Database` from Task 9.
- Produces: no new public symbols.

- [ ] **Step 1: Fix the `NearbyEvent` cast**

`events.service.ts:80` casts `as unknown as NearbyEvent[]` while not selecting 4 of `NearbyEvent`'s required fields — `undefined` at runtime, invisible to `tsc`.

Compare the `select()` against the `NearbyEvent` type. **Either** add the missing columns **or** narrow the return type to what is actually fetched. Prefer narrowing: fetching columns nobody reads is a cost on every call.

The `as unknown as` must be gone. If a cast is still genuinely needed, comment why.

- [ ] **Step 2: Verify and commit**

```bash
npm run typecheck && npm test
```

```bash
git add src/services/events.service.ts
git commit -m "fix(events): stop casting over columns the query never selected

The cast asserted four required fields that were not in the select — they
were undefined at runtime and tsc could not see it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Move the KYC workflow id to env**

`didit-create-session/index.ts:5` hardcodes `WORKFLOW_ID`. Follow Task 4's shape — required, throws when absent:

```ts
const workflowId = (): string => {
  const id = Deno.env.get('DIDIT_WORKFLOW_ID');
  if (!id) {
    throw new Error(
      'DIDIT_WORKFLOW_ID is not set. Set it with: supabase secrets set DIDIT_WORKFLOW_ID=<id>'
    );
  }
  return id;
};
```

Replace `workflow_id: WORKFLOW_ID` at `:36` with `workflow_id: workflowId()`.

**Set the secret before deploying**, or KYC breaks:

```bash
supabase secrets set DIDIT_WORKFLOW_ID=b1a71b6b-62be-407f-8d09-5f8651a56009
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/didit-create-session/index.ts
git commit -m "fix(kyc): the workflow id comes from the environment

Hardcoded, so staging and production could not differ. Throws when unset,
matching the IAP functions — a missing secret should break the deploy
rather than a user's verification.

Requires: supabase secrets set DIDIT_WORKFLOW_ID=<id>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Reconcile the docs

`CLEANUP.md`'s header still reads *"Branch `cleanup/design-system-and-tests` (18 commits, **not pushed**, `main` untouched)"*. That work is **merged**. It reads as pending work awaiting review.

**Do this last**, so the numbers recorded are the ones this plan actually produced.

**Files:**
- Modify: `CLEANUP.md`
- Modify: `AUDIT.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Measure the real numbers**

```bash
npm run typecheck; npm test; npm run lint 2>&1 | tail -3
```

**Do not copy the values from this plan** — they were true when it was written and Tasks 7–11 have moved them.

- [ ] **Step 2: Fix the header**

Replace `CLEANUP.md`'s opening block: the cleanup work **shipped and is in `main`**, and `AUDIT.md` holds the current state.

- [ ] **Step 3: Correct the stale numbers**

| Line | Was | Now |
| --- | --- | --- |
| `npm test` | 64 passing, 6 suites | measured in Step 1 |
| `npm run lint` | 95 errors / 16 warnings | measured in Step 1 |
| `catch (e: any)` | 8 | 2 |

- [ ] **Step 4: Record outcomes**

Update `AUDIT.md` §5 — mark items 0–8 done, **only those actually completed.** An audit that overstates its own progress is worse than no audit. In particular record what Task 1 found: whether the production environment was already configured, or was genuinely missing.

Add to §7 that CI now runs these checks, so the next drift is caught by machine.

- [ ] **Step 5: Commit**

```bash
git add CLEANUP.md AUDIT.md
git commit -m "$(cat <<'EOF'
docs: CLEANUP.md said the work was unpushed; it shipped

The header read as a branch awaiting review, which is the most misleading
thing in the repo for anyone picking this up. Corrects that, the test and
lint counts that drifted while nothing ran them, and records what this
pass actually closed.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5 — Pre-launch gate

---

### Task 13: Add Sentry

Task 5's boundary stops the white screen but tells *you* nothing. This adds the reporting half.

**Deliberately last.** It adds a dependency, an external account and a native rebuild, and there are no users yet — a crash reporter with no users reports nothing. But wiring it *during* launch week is worse, so it is a gate before release, not an afterthought.

**Before starting, read `https://docs.expo.dev/guides/using-sentry/` for SDK 56.** The steps below are the shape of the change; the doc is authoritative on the current package name, config-plugin entry and wizard behaviour.

**Files:**
- Modify: `package.json`, `app.config.ts`, `app/_layout.tsx`, `src/components/AppErrorBoundary.tsx`

**Interfaces:**
- Consumes: `AppErrorBoundary` from Task 5.
- Produces: a module-scope `Sentry.init(...)` in `app/_layout.tsx`; `AppErrorBoundary` gains a `useEffect` calling `Sentry.captureException(error)`.

- [ ] **Step 1: Install via the wizard**

```bash
npx @sentry/wizard@latest -i reactNative
```

- [ ] **Step 2: Review exactly what the wizard changed**

```bash
git diff
```

The wizard is opinionated and may touch `app.config.ts`, `package.json`, `metro.config.js` and add source-map upload config. **Read every hunk.** Revert anything unrelated to crash reporting — in particular do not let it reformat files, since Prettier is deliberately not enforced here and a reformat would bury the real change.

- [ ] **Step 3: Confirm the init landed in the real root**

`Sentry.init` must be in `app/_layout.tsx`, module scope, above the component — **not** in an `App.tsx`, which Task 3 deleted precisely because it looks like the root and is not.

```ts
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  // Errors only. Performance tracing is a separate decision with its own quota
  // cost — YAGNI until there is a performance question to answer.
  tracesSampleRate: 0,
});
```

Add `EXPO_PUBLIC_SENTRY_DSN` to the EAS environment for every profile that ships (see Task 1 — production is the one that was missing an env block).

- [ ] **Step 4: Report errors the boundary catches**

In `src/components/AppErrorBoundary.tsx`:

```tsx
import { useEffect } from 'react';
import * as Sentry from '@sentry/react-native';
```

and inside the component, before the `return`:

```tsx
  // The boundary swallows the error, so nothing else will report it. Keyed on
  // the error itself: `retry` re-renders and may throw a *new* error, which
  // should be reported as its own event rather than deduped into the first.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
```

- [ ] **Step 5: Verify**

```bash
npm run typecheck && npm test && npm run lint
```

Expected: `0` errors; tests at whatever Task 12 recorded; lint no worse than `92 / 16`.

- [ ] **Step 6: Prove an error arrives**

Re-add the temporary throw from Task 5 Step 4, run a **native** build (`npx expo run:ios` — the native module does not work in Expo Go), trigger it, and confirm the event appears in the Sentry dashboard. Then remove the throw and confirm it is gone.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: report crashes instead of only catching them

The error boundary stopped the white screen but told nobody. Sentry
reports from the boundary explicitly, since a caught error never reaches
a global handler.

Traces are off. Performance sampling is a separate decision with its own
quota cost, and there is no performance question to answer yet.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Deferred, deliberately

Recorded so nobody treats their absence as an oversight.

- **Splitting `EventBottomSheet`.** The strongest case for deferring anything in this plan. It fixes no bug, carries the highest regression risk, and **the symbols a plan would have to protect changed during the session that audited it** — `revealDist` and `secondSnapPx` went to zero occurrences when `ad05b6a` replaced three stops with two. The file also grew 500 lines between two measurements hours apart. Do the split inside the next change that touches the sheet, when the geometry is already in your head and already being device-tested.
- **The 52 React Compiler lint errors.** Real signal (mutating props, refs read during render, `set-state-in-effect`), but each needs individual triage against the render it sits in. A bulk fix would be a bulk behaviour change with no test coverage.
- **39 × `react/no-unescaped-entities`.** Cosmetic and `--fix`-able. Not bundled: it touches many files and would bury the real diffs.
- **`edit/[eventId].tsx`'s 12-`setState` effect.** `CLEANUP.md` §3e's plan — split the form into a child keyed by `event.id` — is still right, and still ~450 lines of JSX on a screen with no coverage. Its own isolated batch.
- **`CreateEventFlow.tsx` (1,376 lines).** Entangled with the pin animation and the `useImperativeHandle` contract `map.tsx` calls into. Needs a device, not a refactor.
- **`notificationCopy.ts` vs `send-push-notification`.** A 16-case switch duplicated across a network boundary, already drifted in the default case. The fix is a shared-source decision that deserves its own design.
- **`<Card>` / `<Chip>` / `<ListRow>` / `<Divider>` primitives.** `CLEANUP.md` §3d measured these: 51 "cards", **51 distinct**. The duplicates were not there.
- **A general tokenization sweep.** Hex outside `src/constants` is **232, versus 232 at the cleanup merge** — no regression.

---

## Self-review

**Spec coverage** — every `AUDIT.md` §5 item maps to a task:

| `AUDIT.md` §5 | Task |
| --- | --- |
| 0. Production env verification | Task 1 |
| 1. Maps key restriction | Task 2 |
| 2. IAP fallback throws | Task 4 |
| 3. Error boundary | Task 5 |
| 4. CI | Task 6 |
| 5. Chat de-duplication | Task 7 |
| 6. Tokenize invented palettes | Task 8 |
| 7. Supabase generated types | Task 9 |
| 8. Remaining known bugs | Tasks 10, 11 |
| 9. Sentry (pre-launch) | Task 13 |
| §3d dead scaffold | Task 3 |
| §1 stale docs | Task 12 |
| §3b sheet split | **Deferred** — see above |

**Values the executor must supply**, each marked inline rather than assumed:
- The real bundle identifier (Task 4) — does not exist yet by design; the task ships the fallback removal regardless.
- The Sentry DSN (Task 13) — from the Sentry project after the wizard runs.
- Supabase project id — **resolved**: `vtrsagvueljzbbtpeenu`, filled in at Tasks 9 and 10.

**Type consistency:** `bundleId(): string` keeps its name and signature in both edge functions (Task 4). `AppErrorBoundary` is defined in Task 5 and extended in Task 13. `rubberBandOffset(rawTranslationX, gutter)` is defined in Task 7 Step 4 and used by the tests in Step 2 and the hook in Step 7. `Database` is produced in Task 9 and consumed in Tasks 10 and 11. `dm_conversation_previews(p_user_id uuid)` is created in Task 10 Step 1 and called in Step 4 with the matching parameter name.

**Two known soft spots, both with a stop condition:**
- `useThreadPhysics`'s exact return shape (Task 7) is specified as `{ revealX, revealPan }` to match the current locals, but must be confirmed during extraction. Step 1 exists to surface divergence *before* any code moves, and instructs a stop.
- The `044` migration's `returns table` column list (Task 10) is written from the audit's reading of `dm.service.ts`, not from the schema. Step 1 instructs verifying it against the real `direct_messages` table first, because a mismatch fails at runtime rather than at deploy.
