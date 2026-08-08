# Wrap contribution flow (Phase 2a) — device sheet

Phase 1 migrations 074 + 075 must be applied. Tick per platform.
⚠️ rows check reasoning rather than an observed bug — those are worth the time.

Nothing on this sheet has been run. Every row below is reasoning from the
source, not an observation: there is no component or screen test coverage in
this project (Reanimated 4 throws on import under Jest), so `tsc` passing says
nothing about whether any of this renders.

## 1. The marker (the whole point — everything else is cosmetic)
| | iOS | Android |
|---|---|---|
| ⚠️ Finishing the flow adds you to the hub's contributor row **immediately** | | |
| ⚠️ Running the flow twice does not double-count you | | |
| ⚠️ Abandoning mid-flow writes nothing — you are not a contributor | | |
| ⚠️ Enough people finishing flips the recap from locked to open with no reload | | |

## 2. Step navigation
| | iOS | Android |
|---|---|---|
| Guest sees 5 dots; host sees 4 | | |
| ⚠️ Host never reaches the feedback step | | |
| Back from step 1 leaves the flow | | |
| ⚠️ Leaving and reopening starts at photos, not where you left off | | |
| ⚠️ Opening a *different* event's flow does not resume the first one's step | | |
| ⚠️ A background refetch mid-flow does not throw you back to step one | | |

## 3. Moved screens still work
| | iOS | Android |
|---|---|---|
| Photos pick, upload, tag | | |
| ⚠️ Post-upload "Continue" advances instead of jumping to the gallery | | |
| ⚠️ With no photos at all, the footer offers "Skip for now" and the step still advances | | |
| ⚠️ With photos already in the pool, the footer offers Continue, not a dead upload button | | |
| Deck swipes, stamps, undo | | |
| Awards castable, labelled **Awards** not "superlatives" | | |
| ⚠️ Voting **zero** awards still completes the rating step | | |
| ⚠️ An event where you were the only attendee still advances past the deck | | |
| ⚠️ Hub checklist shows 3 rows (guest) / 2 (host) — no awards row | | |
| ⚠️ Checklist summary count matches the number of rows shown | | |
| Photos row reads "Up to 5", not "Up to 4" | | |
| ⚠️ Checklist rows are in the same order the flow walks them | | |
| Rewind writes an encore; Skip does not | | |
| ⚠️ Rewind's count matches the hub's for the same event | | |
| Feedback advances on a rating alone, with no note | | |
| ⚠️ Feedback already sent on an earlier run shows the sent state, not a second ask | | |

## 4. Every door opens the flow
| | iOS | Android |
|---|---|---|
| Hub checklist rows push the flow, not the old per-step screens | | |
| Chat's WrapSheet rows push the flow | | |
| ⚠️ The old routes (`/events/wrap/rate/<id>` etc.) still load if deep-linked | | |

## 5. Icons
| | iOS | Android |
|---|---|---|
| Thumbs up/down render as Solar glyphs, no emoji anywhere | | |
| ⚠️ Both thumbs are the same weight (both in BOLD_DEFAULTS) | | |
| Rewind glyph renders (RewindBack), chat banner shows a camera glyph | | |

## 6. Android-specific
| | Android |
|---|---|
| ⚠️ Step transitions do not flash white between steps | |
| ⚠️ The gesture deck still works inside the flow's frame | |
| ⚠️ The progress rail's off-state dots are visible in **both** themes | |
| ⚠️ The gradient blobs render behind every step (no flat grey floor) | |
| ⚠️ KeyboardAvoidingView on photos/feedback behaves (behavior is undefined on Android by design) | |
