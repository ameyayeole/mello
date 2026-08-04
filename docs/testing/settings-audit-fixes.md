# Settings audit — device test sheet

Covers the settings cluster fixes: ghost-mode round-trip, the `ConfirmDialog`
primitive, icon uniformity, and inline validation.

`tsc` 0 errors · 339 tests pass · lint 68 warnings (unchanged — note that
AGENTS.md's "65 pre-existing" is stale, measured 68 on clean `main`).

**None of this has been run on a device.** No screen tests exist, so everything
below is unverified. Rows marked **(reasoned)** are predictions from reading the
code, not observations — those are the ones worth someone's time.

Ordered by risk, not by feature.

| # | Check | iOS | Android |
| --- | --- | --- | --- |
| **1. Ghost mode — the actual bug (touches auth bootstrap)** ||||
| 1.1 | Turn ghost mode ON. Force-quit the app. Reopen → toggle is still ON **(reasoned — this is the bug being fixed; it was OFF before)** | ☐ | ☐ |
| 1.2 | With ghost ON and relaunched, a second account does **not** see you as online **(reasoned — the whole point; needs two devices)** | ☐ | ☐ |
| 1.3 | Turn ghost OFF, relaunch → still OFF (the fix must not pin it ON) | ☐ | ☐ |
| 1.4 | Airplane mode, flip the toggle → it flips back and an error alert shows **(reasoned)** | ☐ | ☐ |
| 1.5 | Sign out, sign in as a **different** account with ghost OFF → toggle reads OFF, not the previous user's ON **(reasoned)** | ☐ | ☐ |
| 1.6 | Cold launch while already signed in still lands on the right screen (auth bootstrap was edited — regression check) | ☐ | ☐ |
| **2. Destructive paths (irreversible — verify before shipping)** ||||
| 2.1 | Delete account → first dialog appears; tapping the backdrop does **nothing** (destructive dialogs must not dismiss on backdrop) | ☐ | ☐ |
| 2.2 | First dialog → "Delete" opens the second ("Are you absolutely sure?"); "Cancel" closes cleanly | ☐ | ☐ |
| 2.3 | Second dialog → "Keep my account" closes without deleting | ☐ | ☐ |
| 2.4 | "Delete forever" actually deletes and lands on the welcome screen **(use a throwaway account)** | ☐ | ☐ |
| 2.5 | Hardware back (Android) on either delete dialog does not delete | ☐ | ☐ |
| 2.6 | Log out dialog → confirms, signs out, lands on welcome | ☐ | ☐ |
| 2.7 | Log out with no network → error alert, still on settings **(reasoned — this path was unhandled before)** | ☐ | ☐ |
| **3. Shared primitives — regression risk beyond settings** ||||
| 3.1 | `Button` gained a `tone` prop. Spot-check buttons on home, event detail and create — all unchanged **(reasoned: `tone` defaults to `default`, which adds no style)** | ☐ | ☐ |
| 3.2 | Block-someone flow still looks right — its glyph changed from hand-drawn to Solar `ForbiddenCircle` **(reasoned)** | ☐ | ☐ |
| 3.3 | `ConfirmDialog` buttons are legible and not clipped at the longest label ("Keep my account") | ☐ | ☐ |
| 3.4 | `ConfirmDialog` on a small phone (SE-class) — title, body and buttons all fit | ☐ | ☐ |
| **4. Icon uniformity (the reported complaint)** ||||
| 4.1 | All seven settings glyphs are **outline** — the Verify shield is no longer solid | ☐ | ☐ |
| 4.2 | Ghost mode shows a ghost, not a padlock; Change email shows an envelope, not a paper plane | ☐ | ☐ |
| 4.3 | Stroke weights look like one set down the column | ☐ | ☐ |
| **5. Inline validation (replaces 5 OS alerts)** ||||
| 5.1 | Change password: short password → error under the **New password** field, no alert | ☐ | ☐ |
| 5.2 | Mismatch → error under **Confirm**; typing in that field clears it | ☐ | ☐ |
| 5.3 | Wrong current password → error under **Current password** | ☐ | ☐ |
| 5.4 | Success → confirmation copy + Done, and the new password works on next sign-in | ☐ | ☐ |
| 5.5 | Change email: malformed address, and re-entering your own address → inline errors | ☐ | ☐ |
| 5.6 | Password fields with an error still show the red border under the keyboard | ☐ | ☐ |
| **6. Blocked users** ||||
| 6.1 | Unblock now asks first; cancel leaves the person blocked | ☐ | ☐ |
| 6.2 | Confirm unblocks, the row leaves the list, and their events return to the map/Explore | ☐ | ☐ |
| 6.3 | Unblock offline → error alert, row stays **(reasoned — was silent before)** | ☐ | ☐ |

## Android specifically

`react-native`'s `SafeAreaView` is a no-op on Android, and this cluster was only
ever checked on iOS.

| # | Check | Android |
| --- | --- | --- |
| A.1 | `ConfirmDialog` scrim covers the status bar (Overlay sets `statusBarTranslucent`) | ☐ |
| A.2 | Settings screen's own `AppBackground` still reaches the top edge | ☐ |
| A.3 | Hardware back closes each dialog rather than the screen behind it | ☐ |

## Known not covered

- The `delete-account` edge function itself was not exercised; only that the
  client calls it and handles a thrown error.
- KYC (`Verify your identity`) was read but not re-tested — unchanged by this work.
- The three older confirm dialogs (block, discard, community delete) still have
  their own hand-rolled buttons; they were left alone deliberately so this batch
  does not mix a settings fix with a redesign of unrelated screens.
