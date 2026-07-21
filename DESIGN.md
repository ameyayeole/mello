# Mello — visual direction

The target look, taken from the `Mello Home Standalone.html` mockup (home screen,
2026-07-21). **Every number below is read straight out of that file's inline CSS,
not estimated.** Where the app currently differs, §7 says so — read that before
assuming something is already built.

This is the *look*. `AGENTS.md` is still the law on which component to use and
what not to hardcode; nothing here overrides it.

---

## 1. The idea in one line

Frosted glass floating over a soft, slowly-moving colour field — every surface
is translucent white with a blur behind it and a bright 1px edge, so the app
reads as panes of glass stacked over a living background, not cards on paper.

## 2. The background

Not a flat fill. The mockup specifies three layers:

```
base   linear-gradient(180deg, #EEF1F7 0%, #F4F2F8 55%, #F8F6F9 100%)
blob A 240x240, top:-40 right:-60, blur(70px), rgba(140,160,240,0.28)   // periwinkle
blob B 230x230, bottom:180 left:-70, blur(72px), rgba(249,120,120,0.20) // coral
```

**We ship the base and blob A only, and softer than the numbers above.** Two
deliberate departures, both made after looking at it on a device:

- **Blob B (coral) is cut.** On a phone it did not read as a hint of colour at
  the lower left; it read as a pink wash over the bottom third of every screen,
  strong enough to tint the frosted rows sitting on it.
- **Blob A peaks at alpha 0.26, not 0.28 flat.** It is drawn as a radial
  gradient rather than a blurred circle (see `AppBackground`), and a radial
  gradient concentrates its colour at the centre in a way a Gaussian blur does
  not — so the same number is markedly heavier. 0.26 at the centre, 0.10 at 55%,
  0 at the edge.

It drifts on a slow 20s loop, translating ~40px and scaling 1.0→1.18,
`ease-in-out`, reversing. Slow enough that you never catch it moving; it just
stops the screen feeling dead.

## 3. The glass recipe

The single most repeated thing in the design. Three tiers by how much the
surface should assert itself:

| Tier | Fill | Blur | Border | Contents |
| --- | --- | --- | --- | --- |
| Chrome (nav bar) | `rgba(255,255,255,0.72)` | `blur(30px)` light | `1px rgba(255,255,255,0.95)` | ink |
| Panel (rows, search, header buttons) | `rgba(255,255,255,0.68)` | `blur(28px)` light | `1px rgba(255,255,255,0.95)` | ink |
| On-photo (pills, buttons over images) | `rgba(15,24,44,0.46)` | `blur(22px)` **dark** | `1px rgba(255,255,255,0.18)` | **white** |

**On-photo glass is dark, not the mockup's translucent white.** A white pill
either disappears into a bright photo or reads as a hole punched in a dark one;
smoked glass sits on top of anything. It is the one tier whose contents are
white — put ink on the other two and white on this one, or the text vanishes
into the fill. The light hairline border is what keeps it reading as glass
rather than as a flat black chip.

Shadows are wide, soft and **blue-black, never neutral**:
`0 10–20px 26–44px -18/-20px rgba(40,50,80,0.4–0.5)`. On photo cards they go
warmer and deeper: `0 26px 52px -24px rgba(90,45,50,0.5)`.

**The scrim trick, worth stealing:** the gradient over a photo card is itself a
`backdrop-filter: blur(17px) saturate(1.2)` layer with
`mask-image: linear-gradient(180deg, transparent 0%, #000 34%)` — so the blur
*fades in* down the image instead of starting at a hard line. That is what makes
the caption legible without flattening the photo.

**We do not do this.** The nearby cards use a single frosted band with a
**hard top edge**, sitting directly above the host row:

| Layer | Extent | Value |
| --- | --- | --- |
| Frost | the caption block | `tint="dark" intensity={34}` |
| Gradient | the caption block | ink, `0.36 → 0.74` |

A straight edge reads as a deliberate surface — the same pane of glass the
search bar and plan rows are made of — where a fade reads as an effect applied
to the photo. It is also one native blur per card rather than several, which
matters on a row that renders **all** of its children.

**Both layers are `absoluteFill` children of the caption block**, not siblings
sized against the card. That is what makes the band hug its content: no measure
pass, no first-frame flicker, and the top edge stays a fixed cushion above the
host row whether the title runs to one line or two. An earlier version pinned
the band to a constant height and left ~80pt of empty frost above the host row
on short titles.

A stepped two-band fade was tried first, to approximate the mask. Even tuned it
left a visible seam across busy photos, and cost twice the blur views.

## 4. Colour

| Role | Mockup | In `COLORS` |
| --- | --- | --- |
| Coral / primary | `#F95B5B` | ✅ `primary` |
| Ink | `#1a1d24` | ✅ `accent` / `textPrimary` |
| Muted heading | `#9198a6` | ✅ `textEyebrow` |
| Secondary text | `#6d7280` | ✅ `textSecondary` |
| Placeholder / inactive glyph | `#a2a8b4` | ✅ `placeholder` (tab bar now uses it) |
| Meta text | `#8a8f9c` | ✅ `textMuted` |
| "Attending" blue | `#4C8DF6` | ✅ `attending` |

**The neutral ramp was retuned from warm grey to cool blue-grey**, in place, in
`COLORS` — this used to be the single biggest colour delta. Every screen moved
at once; that is what the token is for. Note the two lower rungs also got
*darker* (`textSecondary` 54%→39% lightness), so meta text gained contrast.

Glass fills, borders, the two shadow colours and the background gradient/blob
colours are all tokens too — see the `glass*`, `bg*` and `shadowWarm` entries.
`SHADOWS.glass` and `SHADOWS.photoCard` are the two elevation steps this design
adds.

## 5. Type

Already correct in the app — `FONTS` maps to exactly these two families.

- **Bricolage Grotesque 800** — screen titles (29px, `-0.025em`), section headers (23px, `-0.02em`)
- **Bricolage Grotesque 700** — card titles (16–16.5px, `line-height:1.14`, `text-wrap:balance`)
- **Plus Jakarta Sans 700** — buttons, labels, "See all" (13–14px)
- **Plus Jakarta Sans 400/500** — body, meta (12–15px)

Eyebrow labels are 10.5–12.5px, weight 700–800, `letter-spacing 0.05–0.08em`,
uppercase, often preceded by a 6px status dot.

## 6. Shape

| Element | Radius |
| --- | --- |
| Photo cards, bottom nav | 24 (`RADIUS['3xl']` / `['2xl']`) |
| List rows | 20 (`RADIUS['2xl']`) |
| FAB | 18 (`RADIUS.xl`) |
| Search bar | 16 (`RADIUS.lg`) |
| Row thumbnails, nav active chip | 15 (**off-scale** — nearest are `md` 14 / `lg` 16) |
| Buttons | 12 (`RADIUS.sm`) |
| Pills, dots | `999` |

## 7. Shipped vs. still aspirational

**Already built and matching:**

- Bottom nav geometry is essentially this design — mockup says height 66,
  radius 24, side 18, bottom 22, active chip 50×44 r15 on `rgba(26,29,36,0.06)`.
  We ship 64 / 20 / 16 / ~27 / 52×46 r16 on `inkSubtle` (7% ink). Close enough
  that the differences are taste, not error.
- Both fonts, and coral `#F95B5B`.
- [x] **The background.** `<AppBackground>` — gradient plus one drifting blob
      (§2 explains why one), mounted once behind the tab navigator in
      `app/(tabs)/_layout.tsx`. Tab screens run transparent over it.
      **The blobs are radial gradients, not blurred circles.** A blur pass over
      a hard-edged circle would be a full-screen backdrop filter every frame,
      and there is no cheap one on Android; a radial gradient with an alpha
      falloff is the same image for free. `chats` is the one tab that stays
      opaque — it is a white list surface by design.
- [x] **The glass recipe, as one component.** `<Glass tier radius>` in `ui/`
      implements all three tiers from §3. The tab bar, search bar, header
      buttons, plan rows and the on-photo pills all go through it.
- [x] Cool-grey neutral ramp (§4).
- [x] `attending` `#4C8DF6`, used by `EventRow`'s eyebrow.
- [x] **No FAB on the home screen.** Creating an event starts from the map,
      which is where the flow lives anyway. This sidesteps the coral-FAB
      question below for home; explore and map still carry it.

- [x] **The frosted scrim on photo cards** — a hard-edged band rather than a
      mask; §3 has the layer table and why.
- [x] **Nearby cards are 280×300**, not the mockup's 206×298, and the photo is
      the point of them. Split is **~60% photo / 40% caption**.

      The caption band is a fixed pixel height driven by its contents, so
      **shrinking the card raises the band's share** — height is what the photo
      gets, and width keeps titles on one line. Both were learned the hard way:
      an earlier pass shrank the card to make the photo dominant and achieved
      the opposite.

      The band packs four facts into three rows — host + attendee stack share a
      line, then the title, then time + Join. Every row removed is ~20pt of
      photo.
- [x] **Coral `Join` on the nearby cards.** Deliberately against the letter of
      the "one coral CTA per screen" rule: a row of cards shows the *same*
      action repeated, not competing ones, so they read as one offer. Nothing
      else on home is coral bar the location pin and the hosting dot.

      Three states, three colours — the colour *is* the status:

      | State | Fill | Meaning |
      | --- | --- | --- |
      | Join | `primary` + glow | on offer |
      | Requested | `rgba(255,255,255,0.22)` | waiting on the host |
      | Going | `success` | settled |

      Only Join keeps the glow. `success` is used solid rather than as the
      `successTint` chip the white cards use: that tint is a near-white fill
      designed for paper, and on the dark caption band it reads louder than the
      coral it should be calmer than.

**Not built — the remaining deltas:**

- [ ] **True masked blur** on the photo-card scrim. Deliberately not built —
      the hard edge is now the intended look, not a compromise. Revisit only if
      the fade is wanted back; it needs
      `@react-native-masked-view/masked-view`, a new dependency.
- [ ] **The FAB is coral on explore and map; the mockup's is ink `#1a1d24`.**
      Less pressing now the coral blob is gone from the background, but explore
      still has a coral FAB over coral `Join` buttons. Decide, don't drift.
- [ ] **Android has no real glass.** `<Glass>` falls back to a flat translucent
      fill there, because expo-blur's `dimezisBlurView` re-renders the tree
      beneath every frame and these surfaces live inside scrolling lists. Layout,
      edge and shadow are identical; the blur is absent. **Untested on a
      physical Android device.**

## 8. Using this

When a design change comes in, check it against §3 first — if a new surface
isn't one of the three glass tiers, that's a decision worth naming rather than
inventing a fourth, and `<Glass>` is where the fourth would have to go. Add the
number here when you ship one, and tick the box in §7 so the next session knows
what's real.
