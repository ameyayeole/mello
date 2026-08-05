# Dark mode — device test sheet

The app has two palettes now, chosen in **Settings → Appearance → Dark mode**.
The dark one is not a new design: it is the treatment the **profile screen** has
always had — the app black as the background, translucent white lifts as
surfaces, white / 72% / 56% text — promoted to every screen.

**What changed, and where to look when something is wrong:**

| Area | Change |
| --- | --- |
| `constants/colors.ts` | `LIGHT` (the old palette, untouched) and `DARK`. `COLORS` is now a **Proxy** onto whichever is active, so every one of the ~1,300 `COLORS.x` reads in the app resolves live instead of at import. |
| `src/theme.ts` | `themedStyles(() => ({…}))` — `StyleSheet.create` deferred to first read and re-run when the palette changes. This is the whole migration: **149 stylesheets in 148 files**, one wrapper each, no other edits. |
| `stores/themeStore.ts` | The choice, persisted in SecureStore, read before the splash screen lifts. |
| `inkAlpha(α)` | Replaces **103** hand-written `rgba(15, 24, 44, α)` literals — the foreground wash, which was dark-on-light by construction and would have been invisible on dark. |
| Root layout | Keyed on the theme. React Navigation wraps screens in `StaticContainer`, which blocks re-renders from above, so a change has to remount to reach mounted screens. |
| Tab bar | Inverts on the dark theme everywhere, the way it already did over Profile. |
| `Glass` | Its blur **tint** now follows the theme, and its fill/border maps became functions. They were module-level `Record`s, so they had captured the light palette at import — which is why every card, header and the tab bar stayed pale after the rest of the app went dark. |
| `accent` | Lifts to a raised charcoal on dark rather than inverting to near-white. It is a *surface* in 33 places, each with white content on it; inverting made all of them white-on-white. |
| `SHADOWS`, `Button`'s label map, onboarding's two lists | Same capture bug, same fix — getters and functions. `src/__tests__/paletteCapture.test.ts` now fails the build if another one appears. |
| `ThemedStatusBar` | Replaces seven hardcoded `<StatusBar style="dark" />`. Screens whose bar sits over a *photo* still hardcode `light`, correctly. |
| The map | `userInterfaceStyle` on both `MapView`s (the map tab, and the mini map in event edit). One prop, handled natively on each platform: Apple's own dark tiles on iOS via `overrideUserInterfaceStyle`, Google's `MapColorScheme.DARK` on Android — no hand-rolled style JSON. It follows the **app's** theme, not the phone's. |

**Every row here is unverified.** The mechanism is tested (`src/__tests__/theme.test.ts`
covers the proxy, the cache and the two palettes agreeing), and `tsc` covers the
migration's shape — but no screen has been looked at in either theme.

---

## A · The switch itself

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| A1 | Settings → Appearance → **Dark mode** on | The whole app turns dark at once | Any screen still light, or half-turned | ☐ | ☐ |
| A2 | **Where you land after the toggle** | Still on Settings. The tree remounts on a theme change, and it should rehydrate from the navigation state above it — but this is the row most likely to fail. If you are dropped on Home, the remount in `app/_layout.tsx` needs replacing with per-screen subscriptions | Kicked to Home, or a blank screen | ☐ | ☐ |
| A3 | Toggle off, then on, three times quickly | Switches cleanly each time | A stuck theme, a crash, or the toggle desyncing from the app | ☐ | ☐ |
| A4 | Kill the app and reopen it in dark | Opens dark, with **no flash of light** on the first frame | A white flash before the app paints — the splash gate is not waiting for the stored theme | ☐ | ☐ |
| A5 | Fresh install, never toggled | Light, as before | Anything else | ☐ | ☐ |

## B · Every screen, in dark

The point of the sweep is **contrast**: dark text left on a dark surface. Look
for text you can barely read, dividers that vanish, and icons that disappear.

| # | Screen | Watch for | iOS | Android |
| --- | --- | --- | :-: | :-: |
| B1 | Home — greeting, nearby rail, plans, wrap card | Card fills, the photo overlays, the eyebrow labels | ☐ | ☐ |
| B2 | Map — the tiles themselves | Dark tiles: Apple's night map on iOS, Google's on Android | A light map under dark chrome | ☐ | ☐ |
| B2a | Map — pins, clusters, the friend avatars | Pins stay **white** bubbles with a coral cluster badge, deliberately: they are hardcoded rather than tokenised because a white pin is what reads on either map | Pins gone dark and lost against the tiles | ☐ | ☐ |
| B2b | Map — the search field, filter chips, the FAB, the deck's parked fan | Dark chrome over the dark map, still legible against it | ☐ | ☐ |
| B2c | Toggle the theme **from the map tab**, then come back to it | The tiles are in the new theme. On **Android** this only works because the whole tree remounts — Google reads the colour scheme from the map's *initial* props, so a live change would not re-tint an existing map. iOS updates live | An Android map stuck in the old theme until you restart | ☐ | – |
| B2d | Event **edit** → the mini map | Same treatment | ☐ | ☐ |
| B2e | The create-event flow's map | Also dark — it reuses the map tab's `MapView` rather than rendering its own | ☐ | ☐ |
| B3 | The open swipe deck — card, counter, wishlist button, action row | The card's own surface, and the white action buttons on the dim | ☐ | ☐ |
| B4 | Community — feed, composer, comments, polls | ☐ | ☐ | |
| B5 | Inbox list, an event chat, a DM | Your own bubbles are `accent` — a raised charcoal on dark, white text, the way a dark-mode chat normally looks. They must be clearly separate from the background | ☐ | ☐ |
| B6 | Profile | Should look essentially unchanged — it was already this treatment | ☐ | ☐ |
| B7 | Settings, and every row's destination | ☐ | ☐ | |
| B8 | The dealt event card, front and back | ☐ | ☐ | |
| B9 | Wishlist, notifications, search | ☐ | ☐ | |
| B10 | The create-event flow, all steps | Its steps are `React.memo`'d — if it is the one thing still light, that is why (they are behind a flow you cannot be inside while toggling, so a remount should have caught them) | ☐ | ☐ |
| B11 | Onboarding and auth (sign out to reach them) | These have the most hardcoded colours left — see D | ☐ | ☐ |
| B12 | The event wrap: recap, gallery, photos, rate, superlatives | ☐ | ☐ | |
| B13 | Sheets, dialogs, the safety popups, the SOS modal | A modal is a separate surface — check its backdrop dims *enough* on dark | ☐ | ☐ |

## C · The things a palette swap gets wrong

| # | Do | Expect | Fails if | iOS | Android |
| --- | --- | --- | --- | --- | --- |
| C1 | Anything over a **photo** in dark: profile header, event cards, the wrap gallery | Unchanged from light — white text, smoked glass. A photo is a photo in either theme | The overlay went light, or white text on a white scrim | ☐ | ☐ |
| C2 | The status bar on every screen | Light glyphs on dark. Over a photo header, still light | Dark glyphs on a dark bar — an invisible clock | ☐ | ☐ |
| C3 | Coral buttons and the tab indicator | Still coral. The brand does not invert | A washed-out or recoloured primary | ☐ | ☐ |
| C4 | Your own chat bubbles, and any secondary (black) button | A raised charcoal with white content, distinct from the background but not glowing | Invisible against the background, or white-on-white — the latter means `accent` went back to inverting | ☐ | ☐ |
| C5 | Elevation: cards, the tab bar, the dealt card | Depth now comes from the surface lift, not the shadow — a shadow is invisible on near-black. Cards should still read as separate from the background | Everything flat and indistinguishable | ☐ | ☐ |
| C6 | Toggle the theme with a **chat open** | The thread comes back in the new theme with its messages intact | Lost messages, or a thread stuck at the top | ☐ | ☐ |
| C7 | Toggle while an event card is dealt / the deck is open | Both are window-level layers mounted in the root layout — check they survive the remount rather than being left orphaned on screen | A card stuck over the app | ☐ | ☐ |

## D · Known-incomplete: the literals that are left

`inkAlpha` took the 103 foreground washes. What remains is **~155 hardcoded
colours** the migration deliberately did not guess at:

- ~45 `rgba(255,255,255,α)` — mostly correct already, since they sit on photos
  or on dark glass.
- ~72 hex literals — the amber announcement card in the event chat (`#B4690E`,
  `#FFF6E9`), onboarding's stage colours, the check-in and edit screens.
- Two places using `accent` as *ink* rather than as a surface — community's
  active tab label and the wordmark in `MelloLogo`. Both are charcoal-on-black on
  the dark theme, and both should be `textPrimary`.

| # | Do | Expect | iOS | Android |
| --- | --- | --- | :-: | :-: |
| D1 | An **announcement** in an event chat, in dark | Amber on cream — deliberately unchanged, and probably too bright. Note whether it reads as a mistake or as a highlight | ☐ | ☐ |
| D2 | Onboarding, check-in, event edit, the SOS modal | List anything that reads as light-mode debris. These are the files to convert next, in this order | ☐ | ☐ |
| D3 | Anything else that looks wrong | The fix is almost always the same: a literal that should be a token, or a token that should be `inkAlpha` | ☐ | ☐ |
