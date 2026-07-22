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

### The full-bleed sheet (profile)

The profile screen is the one place a glass pane fills the screen rather than
floating on it: a 4:5 photo pinned to the top, and the whole page below it a
single `onPhoto` pane that scrolls up over the image.

| Layer | Value |
| --- | --- |
| Photo | 4:5 (`width × 1.25`), **inside** the scroll layer, clipped by a window |
| Photo motion | parallax at ½ scroll speed; Ken Burns 1 → 1.07 over 24s, alternating |
| Top fade | ink `0.5 → 0`, 150pt, rides with the photo |
| Sheet | `<Glass tier="onPhoto" radius={32} edge="top" backdrop={…}>` |
| Sheet top | photo height − 32pt, so the corners sit over the image |
| Sheet frost | the **same photo again**, `blurRadius={60}`, + `COLORS.inkVeil` |

**The sheet frosts itself — it does not blur what is behind it.** This is the
one place in the app that departs from the backdrop-blur model, and it is worth
understanding why, because the same trap is waiting on any full-bleed surface.

A backdrop blur renders whatever happens to be behind it, so wherever *that*
changes, the blur's output changes with it and prints the boundary as a hard
line across the glass. Two versions were lost to this:

- Photo running under the sheet's top 32pt → a line straight across the pane at
  the photo's bottom edge.
- Photo clipped flat at the sheet's edge to avoid that → the rounded corners
  then had nothing behind them, and leaked the layer below as two bright wedges.

You cannot have rounded corners over a hard-edged photo *and* a uniform
backdrop; one of the two always shows. `backdrop` breaks the dependency: the
pane composites its own blurred copy, so what sits behind it stops mattering and
the photo can run under the corners freely.

It also means **iOS and Android finally render the same thing** — an image blur
is ordinary image processing, where `backdrop-filter` has no Android equivalent
(§7). The caller owns positioning: here the frost is counter-translated by the
sheet's own scroll offset, so it stays pinned to the screen instead of dragging
its own reflection along with the surface.

The veil is `inkVeil` (0.28), not `scrim` (0.45): the point is for the photo's
colour to carry through the glass, and 0.45 kills it.

**Both ends of the scroll are padded against the rubber band.** The photo window
is 250pt taller than the photo and the sheet's fill is drawn 500pt past its own
content, each cancelled by an equal negative margin — so they cost no scroll
distance, and overscrolling reveals more of the same surface rather than what is
behind it. `transformOrigin: 'bottom'` on the photo keeps its bottom edge welded
to the sheet through the pull-down scale.

`edge="top"` is a `<Glass>` prop, not a style override: a pane that runs off the
bottom of the screen rounds its top corners only and carries the hairline on the
top edge alone. A corner down there reads as the surface stopping short.

Contents are the inverted ramp — `white`, `textOnDark`, `textOnDarkMuted`, on
`fillOnDark` / `borderOnDark`. **Cards nested in the sheet are not a second
sheet of glass**: they are a translucent white lift on a surface that is already
blurred. A blur inside a blur is a native view per row and reads as mud.
`EventRow` carries this as `onDark`.

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
      falloff is the same image for free. **Every tab runs transparent over
      it**, `chats` included — it used to be the one opaque white list, and the
      messages mockup reversed that: the Inbox and both threads are frosted
      cards over the same drifting field as everything else.

      **A nested stack needs the theme, not `contentStyle`.** `chats` is the one
      tab whose routes sit under their own `<Stack>`, and a native stack hands
      react-native-screens a container colour straight off the navigation theme
      — `nativeContainerStyle={{ backgroundColor: colors.background }}`. That
      container is *below* anything a screen can style, so setting
      `contentStyle: 'transparent'` uncovered iOS's grouped-background grey
      rather than the field, and drawing a second `<AppBackground>` inside the
      layout did nothing because the stack paints on top of it. The fix is a
      `<ThemeProvider>` around that stack with `colors.background:
      'transparent'`. Any future tab that grows a nested layout will hit this.
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
- [x] **The profile sheet** — §3 "The full-bleed sheet" has the layer table and
      the two failed versions that led to `backdrop`. Seen on an iPhone;
      **untested on Android**, though `backdrop` is the one glass surface that
      should look the same there.
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

- [x] **Full-screen overlays that hand an element over.** Notifications, search
      (from home *and* from the Inbox) and settings are transparent full-screen
      routes rather than modal cards,
      and each one takes an element off the page beneath and flies it into
      place. Reanimated 4 has no shared-element transitions, so it is built by
      hand.

      | Piece | What it does |
      | --- | --- |
      | Route | `presentation: 'transparentModal'`, `animation: 'none'` |
      | The original | **hidden outright** the whole time the route exists |
      | The flying copy | from its **measured** rect to where it belongs |
      | Home | recedes — opacity 1→0, scale 1→0.94, translateY 0→−14 |
      | Tab bar | **slides down** off the screen and back (`useTabBarSlide`) |
      | Content | rises and fades in behind it, staggered |

      **Four hooks, and a screen supplies only the shape it flies.** Everything
      else is identical across them, and was written twice for about an hour
      before it wasn't.

      Two pages fly a search field, so there are two keys — `search` and
      `chatSearch` — landing on the same route. The key is what tells a page
      which of *its* elements to hide while the copy is out; sharing one would
      blank both fields.

      | Hook | On | Does |
      | --- | --- | --- |
      | `useOverlayScreen()` | the overlay | `travel`, `content`, `handoff`, `dismiss` |
      | `useOpenOverlay()` | the page | measure the element, hand the rect over, push |
      | `useOverlayRecede()` | the page | the style that steps the page back |
      | `useHandedOver()` | the page | which element to hide while it is out |

      | Overlay | Flies | Into |
      | --- | --- | --- |
      | Notifications | the bell chip, 46×46 glass circle | the back button at `(20, top+12)`, bell cross-fading to chevron across the middle of the flight |
      | Search | the search bar, full-width glass panel | the search field at the same left inset, **narrowed** by a close button's width, its resting label cross-fading into a live input |
      | Chat search | the Inbox's field, the same panel | the same place. What it *reaches* differs — the chats you're in, and people — not what it looks like |
      | Settings | profile's gear chip, 46×46 **`onPhoto`** circle | the back button at `(20, top+12)`, gear → chevron, and the pane cross-fading `onPhoto` → `panel` |

      **One chip size across the app: 46 with a 23 radius.** Home's header
      buttons, profile's gear and the back button every overlay lands are all
      this. Profile's was 40; it moved, rather than the flight resizing it —
      a hand-off should be the same object arriving, not a copy adjusted to the
      destination's taste.

      Settings is the one that changes *tier* mid-flight. Profile's chip is
      smoked glass with a white glyph because it sits on the user's photo; it
      lands on a light backdrop, where that reads as a black button rather than
      as glass. Two stacked panes cross-fade, because a `<Glass>` tier is a
      fill, a blur and a border together — not a colour you can animate.

      **Settings is also the one overlay that brings its own backdrop.** Tab
      screens run transparent over the single `<AppBackground>` behind the
      navigator, so when home dissolves the living gradient is simply revealed.
      The profile tab is the exception — it paints `accent` as its floor so the
      user's photo can own the screen — and an overlay over it was landing its
      glass rows and ink type on near-black. `useOverlayBackdrop()` fades a
      second `<AppBackground>` in exactly as profile recedes.

      That is the one sanctioned second instance of §2's "mount it once", and it
      is safe for a specific reason: profile's opaque floor means the shared one
      is never visible at the same time, so the two blobs sitting at different
      points in their 20s drift can never show as a cross-fade. It has to *fade*
      rather than be opaque from frame one — otherwise it hides the page before
      the page has had a chance to step back, and the recede is the part you
      watch.

      The status bar flips light → dark at 70% of the recede. The OS draws it
      and it cannot cross-fade with the backdrop underneath, so switching any
      earlier puts dark glyphs on near-black while profile is still there.

      Search narrows rather than scaling: the box is the only thing that should
      change size, and `scaleX` would take the icon and the placeholder with it.
      Position is a transform (no layout); width and height are animated as the
      layout props they are, and both legs are interpolated from the hand-off
      even where the two screens' metrics happen to match today.

      Timings are in **`OVERLAY_TRANSITION`** (`constants/motion.ts`), not split
      between the files that use them. This is motion across three places — the
      overlay, the page beneath, the tab bar — and none of them can be timed
      without the other two. The first version's numbers did not agree.

      A page can carry more than one of these elements — home has two — so the
      store's hand-off names **which one** is out (`handoff.key`). Only that
      element hides; everything else recedes with the page.

      **The tab bar's slide is general, not part of this screen.**
      `useTabBarSlide(hidden)` in `ui/TabBar.tsx` drives every reason the bar
      steps aside — an open chat thread and the in-map create flow included —
      off the same `scene*` timings the page recedes on, so the whole scene
      moves as one. It was `display: 'none'` before: one frame, no motion, in
      the middle of a half-second transition.

      It is the one place in the app that uses **legacy `Animated`** rather than
      Reanimated, and deliberately: the view is React Navigation's own and
      reaches us only through `tabBarStyle`, which is typed
      `Animated.WithAnimatedValue<…>` precisely so a value like this can be
      handed to it. A Reanimated style means nothing to a view Reanimated does
      not own.

      ```
      in    0     the original vanishes; the flying copy takes over its pixels
            0–300 home lifts, shrinks, dissolves; the tab bar slides down
            0–460 the element flies to its new home, changing on the way
          190–570 the overlay's content rises in behind it
      out   0–170 content drops away first, and fast
           40–420 the element flies back
          110–400 home and the tab bar return — after the list has cleared,
                  never through it
              420 route pops; the original reappears where the copy was
      ```

      **Three things this got wrong first time, all of them visible:**

      - **The original must be hidden, not faded.** It was fading with the rest
        of the page over 420ms while the copy flew for 460 — so for most of the
        journey you saw both, one of them ghosting in place. A hand-off has
        exactly one copy of the object on screen.
      - **The two directions are not mirror images.** Going out, home clears
        fast so the content arrives on an empty stage. Coming back, home
        *waits* — the content has to be gone before home reappears under it or
        they cross-fade through each other, which read as the screen lagging.
      - **Two shared values, not sub-ranges of one.** With one, the easing curve
        decided the choreography and the exit inherited a slow start it should
        never have had. `travel` and `content` start at different moments and
        run different lengths in both directions; only the content's own three
        blocks stagger off sub-ranges, where a shared curve is the point.

      The chip's start position is **measured** (`measureInWindow`, stashed in
      `uiStore`), not computed. It depends on the safe-area inset and on the
      greeting's line count, and re-deriving that on the other screen would be
      the same layout written twice.

      With the native animation off, the exit has to be played before anything
      pops the route — `router.back()` runs in the chip's timing callback, not
      on tap.

      Two deliberate departures: the back button **keeps its glass fill** where
      `NavButton` is a bare glyph (an object that dissolves halfway through its
      own journey has not moved anywhere), and there is no veil or second
      `<AppBackground>` — home dissolving reveals the one already drifting
      behind the tab navigator.

- [x] **Unread is a 3pt coral rail**, inset from the corners down a row's
      leading edge. It replaced a pale `#FFF6F5` fill, which on a translucent
      panel over a drifting background read as a tint *on the glass* rather
      than as a state.

- [x] **The messages surfaces**, from the second mockup. The Inbox is a title
      at `display`, a glass field, "Active now", and `panel` rows at radius 20;
      threads are a `chrome` bar top and bottom with the messages between.

      | Piece | Value |
      | --- | --- |
      | Their bubble | `glassPanel` fill + `glassBorder`, r20, bottom-left 6 |
      | Your bubble | **`accent`** — ink, not coral — r20, bottom-right 6 |
      | Bubble text | `bodyMd` / 20 |
      | Timestamp | **outside** the bubble, `nano` in `textMuted`, with the ticks |
      | Avatar | 26, on the **last** message of a run; a spacer holds the column otherwise |
      | Day divider | `panel` chip, `full` radius, centred |
      | Composer | `chrome` bar; field `glassPanel` r18, send an ink r16 square |

      **The bubbles are not `<Glass>`.** A blurred pane per message is a native
      blur view per message inside a scrolling list — the "blur inside a blur"
      cost §3 warns about — so they take the fill and the hairline without the
      blur pass. At bubble size there is nothing legible behind them to blur
      anyway.

      **Your bubbles went coral → ink.** Coral is a screen's one real decision,
      and a column of it down the right of every thread is the opposite of
      that. The send button moved with them, for the same reason.

**Not built — the remaining deltas:**

- [ ] **True masked blur** on the photo-card scrim. Deliberately not built —
      the hard edge is now the intended look, not a compromise. Revisit only if
      the fade is wanted back; it needs
      `@react-native-masked-view/masked-view`, a new dependency.
- [ ] **The FAB is coral on explore and map; the mockup's is ink `#1a1d24`.**
      Less pressing now the coral blob is gone from the background, but explore
      still has a coral FAB over coral `Join` buttons. Decide, don't drift.
- [ ] **Android has no real glass** — except where `backdrop` is used.
      `<Glass>` otherwise falls back to a flat translucent fill there, because
      expo-blur's `dimezisBlurView` re-renders the tree beneath every frame and
      these surfaces live inside scrolling lists. Layout, edge and shadow are
      identical; the blur is absent. **Untested on a physical Android device.**

      `backdrop` (§3) is the way out where it applies: composite a blurred copy
      of the thing you meant to frost instead of filtering what is behind. It
      only works when you know what the surface sits on — true of the profile
      photo, not of a row floating over an arbitrary feed — so it is a targeted
      fix, not a replacement for the tiers.

## 8. Using this

When a design change comes in, check it against §3 first — if a new surface
isn't one of the three glass tiers, that's a decision worth naming rather than
inventing a fourth, and `<Glass>` is where the fourth would have to go. Add the
number here when you ship one, and tick the box in §7 so the next session knows
what's real.
