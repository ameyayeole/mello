# The wrap itself (Phase 4) — device sheet

Migrations **077** and **078** must be applied first — see
`wrap-recap-phase-4-sql.md`. ⚠️ rows check reasoning, not an observed bug.

> **Status when written:** code complete, `tsc` 0, 552 tests green, lint level
> with `main`. The migrations were **written but not applied** (no DB access from
> the build environment), so every row here is unobserved.

## 0. Migrations landed
| | Result |
|---|---|
| ⚠️ Every old like became a heart — the two counts in SQL step A1 match | |
| ⚠️ `mismatched` is 0 in SQL step A2 — `like_count` agrees with the rows | |
| ⚠️ Comment count = distinct id count (SQL step B1) — no row lost its identity | |

## 1. The private half (highest risk — a leak looks like a working page)
| | iOS | Android |
|---|---|---|
| ⚠️ Two accounts, same event: shared half **identical** | | |
| ⚠️ Two accounts, same event: private half **differs** | | |
| ⚠️ Nobody can see who thumbed whom, anywhere | | |
| ⚠️ Notes shown are only ones written **to** the viewer | | |
| ⚠️ Notes shown are only from **this** event, not the whole inbox | | |
| ⚠️ Event feedback appears nowhere on this page | | |
| A viewer with no thumbs and no notes sees no "Yours" heading | | |

## 2. Reactions
| | iOS | Android |
|---|---|---|
| All four emoji react | | |
| ⚠️ Picking a second emoji **replaces** the first, never stacks | | |
| ⚠️ Swapping emoji leaves the total unchanged; only add/remove moves it | | |
| Tapping your own emoji removes it | | |
| Counts match the number of people | | |
| ⚠️ Old likes survived as ❤️ | | |
| ⚠️ Community shared-wrap cards still show six photos, ordered sensibly | | |
| ⚠️ The **public** wrap (`app/wrap/[eventId].tsx`, from Explore) still shows six | | |
| ⚠️ Reacting notifies the photo's owner — the new trigger, not the dead one | | |
| ⚠️ Changing your emoji does **not** re-notify | | |
| ⚠️ A photo-reaction notification says "reacted", not "liked" | | |

## 3. Comment threads
| | iOS | Android |
|---|---|---|
| Two people can comment on the same photo | | |
| One person can comment twice | | |
| ⚠️ Existing pre-migration comments still render | | |
| You can delete your own comment; the bin does not appear on others' | | |
| ⚠️ Deleting does not remove the wrong comment (keys are ids now, not photo+user) | | |
| Mentions still highlight | | |

## 4. Awards
| | iOS | Android |
|---|---|---|
| ⚠️ A category with fewer than 3 votes renders **nothing**, not a blank card | | |
| Winners show name and avatar | | |
| ⚠️ Awards cards legible on the hardcoded dark page in **both** themes | | |

## 5. Android-specific
| | Android |
|---|---|
| ⚠️ ReactionBar usable over a photo on the flat-glass path | |
| ⚠️ Long thread scrolls without trapping the photo pager | |
| ⚠️ The delete bin is a large enough tap target next to comment text | |

## 6. Deviations from the plan worth a second opinion
These were judgement calls made during the build; none is a bug, each is a place
someone might reasonably disagree.

| | Verdict |
|---|---|
| Kept the local `AwardCard` instead of `SuperlativeBadge`. The page hardcodes `#141018`; `SuperlativeBadge` uses themed light-surface colours and would read as a white card on near-black. | |
| Kept the three stat cards rather than the plan's single stat line — same numbers, existing visual language, no redesign smuggled into a feature change. | |
| `photo_reactions` got an **UPDATE** RLS policy the plan omitted; the upsert path is `INSERT … ON CONFLICT DO UPDATE`, which RLS checks against UPDATE. Without it the *second* tap fails, not the first. | |
| The count trigger branches on `TG_OP` instead of `COALESCE(NEW…, OLD…)`; `NEW` is unassigned on DELETE. | |
| Added `photo_reactions_notify`. `photo_liked` fired from a trigger on `wrap_photo_likes`, which nothing writes to after 077. | |
