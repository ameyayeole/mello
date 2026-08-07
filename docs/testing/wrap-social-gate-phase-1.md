# Wrap social gate — Phase 1 device sheet

## Found on device, 2026-08-08 — two bugs `tsc`, `jest` and `eslint` all missed

**1. The wrap hub never loaded.** `getCoAttendees` embedded `profile:profiles(*)`
off `event_participants`. The check-in feature had since given that table a
*second* foreign key to `profiles` (`checked_in_by`), so PostgREST answers
**300 PGRST201 "ambiguous embedding"** instead of 200. That rejected
`getWrapStatus`'s `Promise.all`, `status` stayed `undefined`, and the hub sat on
a spinner — no checklist, no error, nothing to act on. Fixed by naming the FK:
`profiles!user_id(*)`.

The tell was in the copy: the card read *"Finish **4** more steps"* on an event
whose viewer was the host, and a host's total is **3**. 4 is
`wrapStepTotal(undefined)`. A wrong number on screen was the only visible
evidence that the query had failed.

Two lessons worth keeping:
- **A schema change three features away can break a query with no code change.**
  Adding an FK is enough. Nothing in TypeScript, lint or the test suite can see
  it; only a real HTTP call does.
- **One new call inside a `Promise.all` can take down eight working ones.**
  `getWrapGate` now degrades to "locked" instead of throwing.

**2. `get_wrap_gate` leaked contributor lists to anyone.** Its guard asked
whether the *claimed* `p_user_id` attended — never whether the caller *was* that
user — and Postgres grants `EXECUTE` to `PUBLIC` by default, which 075 never
revoked. A plain `curl` with the shipped anon key returned names and avatar URLs
for any event. **Migration 079** asserts `auth.uid() = p_user_id` and revokes
`PUBLIC`/`anon`. Verified after: anon → 401, impersonation → raises, all six
real attendees → still fine.

Also checked and clean: the `SUPABASE_DB_URL` added to `.env` for `npm run sql`
is **not** in the shipped bundle — searched all 46 exported files binary-safe,
with a control probe to prove the search worked.


Migrations **074**, **075** and **076** must be applied before any of this.
Tick per platform. Rows marked ⚠️ are checking reasoning, not an observed bug —
they are the ones worth someone's time.

> **Status when written:** the code is complete and verified by `tsc`, `jest`
> and `eslint`. The migrations were **written but not applied** — the agent that
> built this had no CLI, no `psql` and no service-role credential, only the anon
> key, which cannot run DDL. Every row below is therefore unobserved. See
> `docs/testing/wrap-social-gate-phase-1-sql.md` for the paste-ready bundle and
> the two verification queries whose output has not yet been seen.

## 0. Before anything else — the migrations actually landed
| | Result |
|---|---|
| 074/075/076 all ran with no error | |
| ⚠️ Threshold query returns the exact table in the SQL bundle (s=2→2 … s=40→5) | |
| ⚠️ `get_wrap_gate` raises `not an attendee of this event` for an event you did not attend | |

The threshold formula was verified **arithmetically** in JS against spec §4.2 and
matches on all 13 rows. That does **not** prove Postgres agrees — integer
division and the `CEIL(...)::INT` cast are only exercised by running the query.

## 1. The deadlock (highest risk — the way this feature fails)
| | iOS | Android |
|---|---|---|
| ⚠️ 3-person event, only you contribute, <48h → recap locked, reads "Waiting on 1 more person" | | |
| ⚠️ Same event after 48h → card becomes tappable, dialog offers "Open it anyway" | | |
| ⚠️ Confirming opens the recap and does not crash on a thin/empty wrap | | |
| ⚠️ Someone who has NOT finished their own steps never sees the force-unlock, even after 48h | | |

## 2. Threshold boundaries
| | iOS | Android |
|---|---|---|
| 2-person event needs 2 | | |
| 6-person event needs 3 | | |
| 10-person event needs 5 | | |
| ⚠️ 20+ person event still needs only 5 (the cap) | | |

## 3. Contributor list
| | iOS | Android |
|---|---|---|
| Faces appear as people finish the flow | | |
| Count reads "N of M contributed" and matches the faces | | |
| ⚠️ More than 5 contributors → list caps at 5 without overflowing the row | | |
| ⚠️ A contributor with no photo renders an initial, not a blank circle | | |

## 4. The unlock notification
| | iOS | Android |
|---|---|---|
| ⚠️ Nothing fires until the threshold row lands | | |
| ⚠️ At the threshold, every contributor gets exactly one | | |
| ⚠️ A non-contributor gets **none** — the wrap is still shut for them | | |
| ⚠️ Further contributions after the threshold fire nothing | | |
| Tapping it opens the recap, not the hub | | |
| `wrap_ready`'s body no longer mentions superlatives | | |
| ⚠️ **Remote** push copy matches in-app copy — needs the edge function redeployed | | |

## 5. Regressions — the seven policies NOT changed
| | iOS | Android |
|---|---|---|
| ⚠️ Adding a photo on day 3 still works (wrap_window_open untouched) | | |
| ⚠️ Rating someone on day 3 still works | | |
| ⚠️ Requesting encore on day 3 still works | | |
| The wrap hub still loads for an event with zero contributors | | |
| A non-attendee still hits the "this wrap is for attendees" guard | | |

## 6. Android-specific
| | Android |
|---|---|
| ⚠️ Contributor row legible on flat glass (no backdrop blur on Android) | |
| ⚠️ ConfirmDialog body text not clipped at the longest copy | |
| ⚠️ The unlock notification opens the recap from a cold start | |

## 7. Known intermediate state — not a bug
Nothing in Phase 1 **writes** a `wrap_contributions` row; Phase 2a does. Until
then the count stays 0 and every wrap sits locked until the 48h escape hatch.
That is the correct state for this phase, so a locked wrap on a fresh event is
expected, not a failure of section 1.

Because of that, most of sections 1–4 cannot be exercised through the UI yet —
they need rows inserted by hand in the SQL editor (the bundle has the snippets)
or Phase 2a landed. Rows tested by hand-inserted rows should be re-run after 2a.
