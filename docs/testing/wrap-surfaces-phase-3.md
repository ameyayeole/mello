# Wrap surfaces (Phase 3) — device sheet

Phases 1, 2a and 2b must be in. ⚠️ rows check reasoning, not an observed bug.

Nothing here has been run. Section 1 is the highest-risk part of the whole
three-phase batch: it is the app's only uninvited full-screen moment, and the
failure mode is showing it to someone who already dismissed it.

## 1. Dealing exactly once (highest risk — it is uninvited)
| | iOS | Android |
|---|---|---|
| ⚠️ Deals on first open after an event ends | | |
| ⚠️ Dismiss, force-quit, reopen → **does not deal again** | | |
| ⚠️ Never deals for an event older than 48h | | |
| ⚠️ Never deals before the event has ended | | |
| ⚠️ Never deals to someone who already contributed (exact — reads wrap_contributions) | | |
| ⚠️ No flash of the card for a user who dismissed it (flag read before render) | | |
| Signing out and in as another user on the same phone starts over | | |
| ⚠️ Does not deal on top of the event dealt card if both would fire | | |

## 2. The turn
| | iOS | Android |
|---|---|---|
| Tapping anywhere on the face turns the card, not just the label | | |
| Turn → hold → fill reads as one motion, not three | | |
| Lands in the flow at the photos step | | |
| ⚠️ Backing out of the flow does not re-deal the card | | |
| ⚠️ Turning the card *back* before the fill starts does not fire twice | | |
| ⚠️ Swiping the card away in any direction dismisses and writes the flag | | |

## 3. Chat
| | iOS | Android |
|---|---|---|
| ⚠️ Entering an ended event's chat opens **no** sheet | | |
| Pin is present, permanent, and opens WrapSheet on tap | | |
| Contributor faces and count match the hub | | |
| Copy is "Wrap it up", then "View wrap" once contributed | | |
| ⚠️ A chat for an event that has NOT ended shows no pin and fires no wrap query | | |

## 4. Home
| | iOS | Android |
|---|---|---|
| Row renders correctly in a realistic feed | | |
| Copy flips from "Wrap it up" to "View the … wrap" at 48h | | |
| ⚠️ Subtitle switches from your steps to the group's count once yours are done | | |
| ⚠️ Row stays visible after you finish, while the recap is still locked | | |
| ⚠️ Row disappears only once the recap actually opens | | |
| Tapping goes to the flow, then to the hub once you have contributed | | |
| ⚠️ The N/total pill is hidden once your own steps are done | | |

## 5. Android-specific
| | Android |
|---|---|
| ⚠️ Root-mounted card renders above the tab bar | |
| ⚠️ Card's glass legible on the flat-fill path | |
| ⚠️ Hardware back dismisses the card and writes the flag | |
| ⚠️ CardPortal is iOS-only; confirm the card still paints over modal routes here | |
