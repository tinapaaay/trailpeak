---
version: alpha
name: TrailPeak
description: Find joiner hikes and group climbs across the Philippines, see the mountain, the difficulty, the meetup schedule, pick-up points and the event fee, and reserve a slot with a down payment.

colors:
  primary: "#234E39"
  primary-hover: "#1B3B2B"
  primary-deep: "#14291E"
  secondary: "#4E5A50"
  tertiary: "#2C5D73"
  tertiary-tint: "#DCE9EE"
  neutral: "#ECEAE3"
  surface: "#FDFCF9"
  canvas: "#F4F2EC"
  card: "#FDFCF9"
  hairline: "#ECE7DC"
  on-surface: "#1C2A21"
  border: "#E3E0D8"
  blaze-easy: "#2F6B47"
  blaze-moderate: "#D9A441"
  blaze-hard: "#A6432A"
  error: "#93361F"

typography:
  display:
    fontFamily: Bricolage Grotesque
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: -0.03em
  headline-xl:
    fontFamily: Bricolage Grotesque
    fontSize: 40px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Bricolage Grotesque
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Bricolage Grotesque
    fontSize: 24px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Bricolage Grotesque
    fontSize: 20px
    fontWeight: 700
    lineHeight: 1.3
  body-lg:
    fontFamily: Source Sans 3
    fontSize: 20px
    fontWeight: 400
    lineHeight: 1.5
  body-md:
    fontFamily: Source Sans 3
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.6
  body-strong:
    fontFamily: Source Sans 3
    fontSize: 17px
    fontWeight: 700
    lineHeight: 1.6
  body-sm:
    fontFamily: Source Sans 3
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.5
  label-field:
    fontFamily: Source Sans 3
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.3
  label-caps:
    fontFamily: Source Sans 3
    fontSize: 13px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0.06em
  label-chip:
    fontFamily: Source Sans 3
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "'tnum' 1"
  price:
    fontFamily: Bricolage Grotesque
    fontSize: 30px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: -0.01em
  data-lg:
    fontFamily: Source Sans 3
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "'tnum' 1"
  data-md:
    fontFamily: Source Sans 3
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.3
    fontFeature: "'tnum' 1"

rounded:
  none: 0px
  sm: 12px
  md: 20px
  lg: 28px
  full: 9999px

spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  xxl: 64px
  gutter: 24px
  margin: 48px

components:
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  header:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-caps}"
    height: 64px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.surface}"
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  button-disabled:
    backgroundColor: "{colors.border}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  input-error:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.error}"
    typography: "{typography.body-sm}"
  search-omnibar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.sm}"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  filter-chip-selected:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  choice-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  choice-card-selected:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  page-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.on-surface}"
  card-divider:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.on-surface}"
  tour-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.on-surface}"
    typography: "{typography.body-md}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  tour-card-title:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-md}"
  text-meta:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.body-sm}"
  trail-spec:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md}"
  badge-easy:
    backgroundColor: "{colors.blaze-easy}"
    textColor: "{colors.surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-moderate:
    backgroundColor: "{colors.blaze-moderate}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-hard:
    backgroundColor: "{colors.blaze-hard}"
    textColor: "{colors.surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  badge-expert:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  tag-elevation:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.data-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  tag-new:
    backgroundColor: "{colors.tertiary-tint}"
    textColor: "{colors.tertiary}"
    typography: "{typography.label-chip}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  tag-source:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-chip}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  tag-demo:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.label-chip}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  chip-spots:
    backgroundColor: "{colors.tertiary-tint}"
    textColor: "{colors.tertiary}"
    typography: "{typography.label-chip}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xs}"
  calendar-day:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md}"
    rounded: "{rounded.md}"
    size: 44px
  calendar-day-selected:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.surface}"
    typography: "{typography.data-md}"
    rounded: "{rounded.md}"
    size: 44px
  star-rating:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.secondary}"
    typography: "{typography.data-lg}"
    rounded: "{rounded.sm}"
    size: 44px
  star-rating-selected:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    typography: "{typography.data-lg}"
    rounded: "{rounded.sm}"
    size: 44px
  button-google:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  stats-ribbon:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.data-lg}"
    padding: "{spacing.lg}"
  booking-bar:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.body-strong}"
    padding: "{spacing.md}"
  button-on-dark:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.label-caps}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  booking-meta:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.border}"
    typography: "{typography.body-sm}"
  stepper:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.data-md}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs}"
  stepper-button:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    size: 40px
  timeline-time:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.data-md}"
  avatar-guide:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    size: 40px
  tooltip:
    backgroundColor: "{colors.on-surface}"
    textColor: "{colors.surface}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "{spacing.sm}"
  hero-lead:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.body-lg}"
  hero-display:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.display}"
  section-heading:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-lg}"
  subheading:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    typography: "{typography.headline-sm}"
---

# TrailPeak

## Overview

TrailPeak helps people find a joiner hike or group climb in the Philippines (Mt. Batulao, Mt. Mariglem, Mt. Ulap, Mt. Pulag and others), check whether they can handle it, pick a date, and claim a slot. Most users live in Metro Manila and join open groups organised around a van and a guide: they meet in Cubao or Ortigas between 10 PM and 3 AM, ride out, and summit before the heat. They plan on a phone, often on mobile data, and read the page again at the jump-off in bright sun. The two questions they need answered fast are "can I do this?" and "is there a slot on the day I want?"

**Local conventions the interface follows:** prices in pesos (₱1,499), shown as the **event fee** plus the **down payment (DP)** to reserve, with inclusions and exclusions listed; elevation in **MASL**; difficulty as the Pinoy Mountaineer **1–9 score** that local hikers already know (e.g. `4/9`); availability as **slots**; times in 12-hour format ("Sat, Nov 7 · 2:00 AM") with the **pick-up points** listed (Cubao, Greenfield, MOA…); **organizers** named on every trip; and "day hike" vs "major climb" as the trip length vocabulary.

The direction is **Trail Map**: the visual language of topographic maps and national park trail signage. Pine green and warm map-paper, condensed lettering for labels like the names printed along a contour line, and difficulty shown the way trail markers show it, with a color *and* a shape. Photography does the emotional work; the interface around it behaves like a good trail sign: plain, sturdy, easy to read at a glance.

What this gives up, deliberately: **visual effects**. No glass header, no gradients on UI, no floating shadows. Corners are soft and continuous, like river-worn stones, but surfaces stay flat. TrailPeak should feel like well-made gear you trust, not a lifestyle feed. The trade buys legibility outdoors and a brand that doesn't look like every other booking site.

There is no pure white and no pure black anywhere in the system.

## Colors

Every color comes from the trail: the forest, map paper, and painted trail blazes.

- **Primary (#234E39):** *Pine.* The deep evergreen of a conifer stand in shade. The only color for interaction: buttons, links, focus, active states. It is dark enough (8.8:1 on paper) that white-on-pine and pine-on-paper both work, so interaction never needs a second green.
- **Primary-hover (#1B3B2B):** *Pine in shadow.* Hover and pressed state only. Hover gets darker, not lighter, so it reads as "pressed into the page".
- **Primary-deep (#14291E):** *Forest at dusk.* Dark surfaces: hero overlays, the stats ribbon, the sticky booking bar, the elevation tag on photos. Never used for buttons.
- **Secondary (#4E5A50):** *Lichen grey.* Metadata: duration, distance, review counts, captions. A green-tinted grey so it sits with the palette instead of looking like stock grey.
- **Tertiary (#2C5D73) and Tertiary-tint (#DCE9EE):** *Alpine lake.* The only cool color in the system, with exactly one job: **availability and schedule**. "3 spots left", the selected departure date, open slots in the calendar. Spots left is information, not a warning, so it uses calm lake blue rather than alarm red. Urgency comes from the number itself. Using red to pressure people into booking is a dark pattern this system refuses.
- **Canvas (#F4F2EC), Surface (#FDFCF9) and Neutral (#ECEAE3):** *Clean, Apple-style surfaces.* Every page sits on the soft warm-gray canvas; cards, panels, inputs, menus and the header are near-white surface (never pure #FFFFFF); neutral is only a light tint for selected states, secondary buttons and steppers. No beige: the November 2026 clean-up replaced the map-paper and card-stock beiges so the trail photos carry the color.
- **Card (#FDFCF9) and Hairline (#ECE7DC):** trip cards use the same near-white as surface, with no border or shadow, and a faint hairline divider inside.
- **Border (#E3E0D8):** *Contour line,* now a neutral warm gray. Hairline rules and the disabled-button fill.
- **On-surface (#1C2A21):** *Map ink.* Body text and the Expert badge. A green-black, not #000.
- **Blaze colors:** the paint on trail markers. **Easy (#2F6B47)** moss green, **Moderate (#D9A441)** ochre, **Hard (#A6432A)** clay red, and **Expert** uses map ink (`on-surface`). The four levels group the 1–9 score: **Easy 1–3, Moderate 4–5, Hard 6–7, Expert 8–9**. These four colors are reserved for difficulty. Nothing else may use them, so a hiker learns the code once and can trust it everywhere.
- **Error (#93361F):** *Oxidised iron.* A darker step of the clay family, so form errors look like they belong to the same world. Distinct from Hard (#A6432A) in value, and always paired with an icon and a message.

Every text/background pair in the components passes WCAG AA (4.5:1). Moderate ochre is the one light blaze, so it takes ink text, not white.

## Typography

Two families. Bricolage Grotesque carries the brand; Source Sans 3 does everything else. (A third, condensed font, Archivo Narrow, was dropped in November 2026: condensed text at reading size made the cards feel cramped.)

**Bricolage Grotesque** is the voice: hero, section and card headings, and prices (`price`, 30px), the number joiners compare first after the photo. A grotesque with slightly irregular, hand-cut curves and an optical-size axis, so it stays sturdy at 64px without looking corporate. It gives TrailPeak character without needing decoration. Fallback: `"Bricolage Grotesque", "Archivo", Arial, sans-serif`.

**Numbers and labels** (MASL, hours, x/9, dates, times, slots, badges, buttons) use Source Sans 3 with tabular figures (`'tnum' 1`), so "12.4 km" and "5:30 AM" line up across cards without a condensed font. Caps labels (`label-caps`) are Source Sans bold with 0.06em tracking.

**Source Sans 3** is the reading text: descriptions, itineraries, reviews. A humanist sans with open letterforms that stay clear in sunlight. Body is **17px**, larger than the usual 15–16px, because people read this on phones outdoors.

The scale runs 13 → 64px: display 64, headline-xl 40 (titles of tool pages like the organizer form, 32 on phones), headline-lg 32, headline-md 24, headline-sm 20, body-lg 20 (hero lead only), body 17, body-sm 15, label 13. On phones each heading drops one step (display 40, headline-lg 24). The display size is pushed up by hand so the hero feels like a summit, not a step. The one size outside the scale is the 22px wordmark in the header logo, which is a brand mark, not text. Tracking tightens on large headings (−0.02em, the hero at line height 1.05 so the words breathe) and opens on small uppercase labels (+0.06em). **Caps are rationed:** `label-caps` is for badges, eyebrows, nav and buttons only. Form field labels use `label-field` (15px bold, sentence case, ink): when every label is in caps, nothing reads as important and the page looks templated. This applies to every form (sign-in, organizer sign-up, post a trip, reserve, the review and move-date panels, add date, ask the organizer), each with 8px between a label and its input. The header nav, the search bar labels, the difficulty filters and the dark booking panel's labels (Date, Joiners, Pick-up; paper-colored on dark) use sentence case too. Caps stay on buttons and on data labels that work like badges: difficulty badges, slots chips, dashboard tiles, the trip stats ribbon and My trips facts. Page titles on these tool pages use `headline-xl` (40px, 32 on phones). Only two weights exist: **400 and 700**. Hierarchy comes from family and size, not from a ladder of 500/600 weights.

All three are open-source Google Fonts and should be self-hosted.

## Layout

A **12-column grid**, 24px gutters, 48px outer margins on desktop; 16px margins and a single column below 768px. Tour cards sit 3-across on desktop, 2 on tablet, 1 on phone. Body text in descriptions and itineraries is capped at **68 characters** per line.

Spacing is on an **8px base** with a 4px half-step for inside badges and chips. Nothing sits off the scale.

Density changes with the job. Search results are compact: cards, specs and badges sit close together so people can compare. The tour detail page is generous: big photos, wide spacing, unhurried itinerary. The shift tells you whether you're browsing or deciding.

Headings and text are flush-left. Only the hero headline may sit over a centered photo.

**Imagery:** authentic, natural-light outdoor photography: misty pine valleys, alpine lakes, sunlit ridges, real hikers in real gear. Tour card photos are **3:2**. Hero photos get a `primary-deep` gradient on the bottom 40% so white text always has contrast. No stock-looking posed shots, no heavy filters, no illustrations standing in for photos.

**Icons:** thin-line (1.5px stroke) outdoor icons: boot, mountain, compass, clock, backpack, sun. Single color, inheriting the text color. No duotone, no icons in tinted circles.

**Motion:** quick and plain, 150–200ms ease-out, only for hover, focus, and opening menus or the calendar. Photos don't zoom on hover, sections don't fade in on scroll, and nothing bounces.

## Elevation & Depth

TrailPeak is almost flat. Depth comes from:

1. **Tonal layering:** a card in `neutral` on a page in `surface`. A card is a different paper stock, not a floating object.
2. **Hairline rules:** 1px in `border`, between rows, list items, and itinerary steps.
3. **Photography:** the strongest depth in the product is the landscape in the photos. The interface stays flat so it doesn't compete.

**One shadow is allowed**, only on things that sit above the page: the sticky booking bar, dropdowns, the date picker and modals. It is `0 -2px 12px rgba(20, 41, 30, 0.12)` (pine-tinted, never neutral black), with light coming from above. Cards never get a shadow.

The header is a **solid** `surface` bar with a bottom hairline, not frosted glass. Glass blur over photos hurts legibility and is the most overused effect in booking sites.

## Shapes

Corners are **soft and continuous**, the Apple-style "squircle": the curve eases out of the straight edge gradually instead of starting abruptly like a quarter-circle. It reads as smooth and hand-held, like a river stone or a well-worn trail sign.

Every rounded element uses `corner-shape: squircle` (CSS). Browsers without support fall back to an ordinary `border-radius` of the same size, which is acceptable. The only exceptions are `corner-shape: round` on things that must be true circles: guide avatars and the Easy blaze dot.

Radius is hierarchical and **concentric**: an inner corner = outer corner − the gap between them, so nested curves run parallel.

- `12px` (`sm`) badges, chips, the elevation tag. They sit 16px inside a 28px card corner (28 − 16 = 12).
- `20px` (`md`) buttons, inputs, filter chips, calendar days, tooltips. The search button sits 8px inside the 28px omnibar (28 − 8 = 20).
- `28px` (`lg`) tour cards, card photos, the search omnibar, gallery photos.
- `9999px` (`full`) guide avatars only, with a round corner shape.

Nothing gets a radius outside this scale. When nesting something new, compute its radius with the concentric rule, then round to the nearest token.

**Difficulty shapes:** each badge has a small marker icon before the label, borrowed from trail rating signs, so difficulty never relies on color alone: **Easy ●** circle, **Moderate ■** square, **Hard ◆** diamond, **Expert ◆◆** double diamond.

Borders are 1px `border` at rest and 1px `primary` on focus. Focus rings are 2px `primary` with a 2px offset on light surfaces, and 2px `surface` on dark ones (`primary-deep` panels: stats ribbon, booking panel, phone bar). A pine ring on a dark-pine panel is invisible. Inputs in error get a 1px `error` border. (The format has no border-color token, so these rules live here.)

## Components

**Header.** Solid `surface`, 64px tall, hairline bottom. Pine logo with a mountain mark on the left; nav (Day hikes and Major climbs, which filter the trip list, then Post a trip) in 16px bold Source Sans, sentence case, with a 2px `primary` underline on hover and on the current page; the account slot on the right (see Accounts). No control appears before it works: saved trips and other sections stay out of the menu until they exist. Below 1024px the nav hides and a `button-secondary` "Post a trip" sits in the header instead, so organizers can always reach the form.

**Search omnibar.** One `surface` bar with a 1px `border`, 28px squircle corners, four segments split by vertical hairlines: *Where* (mountain or province), *When* (a choice: Any date, This weekend, Next weekend, Next 30 days, or Pick a date…, which reveals a date box; weekends run Friday to Sunday because many vans leave on Friday night, and each weekend option shows its dates, e.g. "This weekend · Nov 6–8"; past dates never show), *Joiners* (group size, 1–10), *Pick-up* (Cubao, Greenfield, MOA, Alabang…). A trip shows only if one departure matches the date, has at least that many slots left, and stops at that pick-up. Difficulty lives in the filter chips below, not in the bar. The **Find trips** button is `button-primary` at the right end. On phones the bar uses two columns to save height: *Where* and *Pick-up* full width, *When* and *Joiners* side by side, then a full-width button. The first trip card must start within about one screen of the top.

**Filter chips.** 15px bold sentence case, with the score range in tabular figures. One row of toggle buttons above results (on phones it scrolls sideways rather than wrapping) (All, Easy, Moderate, Hard, Expert). `filter-chip` at rest has a 1px `border`; `filter-chip-selected` switches to `neutral` fill with a 1px `primary` border. Difficulty chips show the small blaze shape in its blaze color before the word. Use `aria-pressed` for the selected state.

**Tour card.** Apple-clean: a near-white `card` fill on the `canvas` page (home, organizer profiles), 28px squircle corners, no border, no shadow; the photo carries the color. The divider above the price is a `hairline`. Where a card sits on plain `surface` (the post-a-trip preview), it gets a 1px `hairline` ring so its edge shows. (Until November 2026 cards were `neutral` beige, which read as yellow and dull next to the photos.) The photo is clipped by the card, so its top corners match.
- *Photo:* 3:2, difficulty badge top-left, `tag-elevation` (e.g. `811 MASL`) top-right.
- *Body:* `chip-spots` in sentence case (`label-chip`) with the slots for the next date ("3 of 14 slots left"; the date itself is in the meetup line, never twice), mountain name in Bricolage at 26px with the town and province under it in `text-meta` ("Nasugbu, Batangas"), then a specs row in `trail-spec` with icons: `4/9` · `Day hike · 5–6 hrs` · `★ 4.8 (212)`. Under it, two `text-meta` rows with icons: meetup (`Sat, Nov 7 · 2:00 AM`) and pick-up points (`Cubao · Greenfield · Alabang`).
- *Organizer line:* a 28px round initials avatar (`avatar-guide` colors on a `surface` fill) and "by" + the organizer's name in `body-sm`. When the organizer is marked ID verified, a second line shows the verification claim (see below). Unverified organizers show no claim; never a warning color.

**Verification claim** (`claimBadge()` in `auth.js`, used on cards, the trip page, the organizer profile and the dashboard). TrailPeak has no real ID-check service yet, so a claim never appears alone: a `primary` check icon, the claim in 15px bold ink ("ID verified" or "Business verified"), and right beside it a `tag-demo` reading **"Demo: not a real check"** (`neutral` fill, `secondary` text, 14px bold sentence case, 12px corners). The tag sits next to the claim, never only in a footer, and it's in the first HTML the page draws, not added later by a script. ID and business are always two separate claims; one never implies the other. Wherever an organizer's checks are listed (trip page, organizer profile), one `text-meta` line says what an ID check can't tell you: guide experience, permits, gear or emergency plans. The neutral tag is deliberately calm: it's a fact about the prototype, not a warning about the organizer. Share images and Facebook text make no verification claim at all.
- *Footer:* hairline above; price in `price` (Bricolage, `₱1,499`) with one `text-meta` line under it ("event fee · ₱500 to reserve"), and a `button-primary` "View & join" in 16px bold sentence case, the one button that isn't in caps, to keep the card calm. Never write "all-in": most trips have exclusions.

**Organizer form** (`organize.html`, and `organize.html?edit=<trip id>` to edit a trip you published). Form on the left, a sticky live preview on the right (400px; below the form on tablets and phones). The preview uses the exact search-page card, so organizers see what joiners will see.
- *Page title* in `headline-xl` (40px, 32 on phones), clearly above the section titles. A `label-caps` eyebrow ("Posting as Batangas Trail Co.") shows only for signed-in organizers.
- *Sections* are numbered groups (1 Mountain … 8 Cancellation policy), each a `headline-sm` (20px) title with its step number at the same size in `secondary`, separated by hairlines. Labels above fields are `label-field`; help text is `text-meta`.
- *Spacing rhythm* (law of proximity: related things sit closer): label to its input 8px (`sm`), field to field 16px (`md`), group to group 24px (`lg`), and 40px (`xl`) above and below each section's hairline. Never one gap for everything.
- *Field widths match the answer:* a date box is about 200px, slots 96–112px, max joiners 160px, a time 136–180px, money 220px. Only free text (mountain, pick-up place) runs full width.
- *Facts from the mountain list:* choosing a mountain fills a `neutral` strip with MASL, x/9 + level, and place, labelled "From TrailPeak's mountain list". Organizers never type heights or scores.
- *Inputs* follow `input`: 44px minimum height, 20px corners, a 2px `primary` focus ring. Money fields show a ₱ prefix inside the field and use tabular figures.
- *Choice cards* (`choice-card` / `choice-card-selected`) for single choices like trip type and policy: a bold name and one `text-meta` line; selected = `neutral` fill + `primary` border.
- *Toggle chips* for multi-picks (included, not included, who can join) use the `filter-chip` tokens with a `primary` tick when on; a text field + `button-secondary` "Add" lets organizers add their own.
- *Repeating rows* (dates + slots, pick-up place + time) with a 44px remove button (× in `secondary`) and a `button-secondary` "+ Add" under them.
- *Photo upload:* a dashed 1px `secondary` drop zone with 28px corners. When photos are added, a required rights checkbox appears. No photos is fine: the mountain's default photo is used, credited.
- *Errors:* checked on Publish. Each failing section shows one `input-error` line with an alert icon and a plain sentence of what to fix; bad fields get an `error` border; the page scrolls to the first problem. Never color alone.
- *Editing:* the same form, filled in, titled "Edit Mt. Batulao", with a `button-primary` "Save changes". Dates aren't edited here: section 2 lists the upcoming dates and points to the dashboard, where dates change one at a time. A line says joiners who already booked keep the price and DP they paid. Saving shows "Changes saved" with links to the trip page and the dashboard.
- *Dates* start from today: the date boxes don't allow past days, and new forms suggest the next two Saturdays.
- *Published:* a `neutral` panel with "Your trip is live", a 1200 × 630 share image for the Facebook post (the trip photo cropped to fill, a pine fade on the left, and in paper-colored type: LOOKING FOR JOINERS, the mountain, place · MASL · x/9, up to three dates, the fee and DP, and the organizer) with a Download image button, the ready-to-post Facebook text in a read-only box (plain text, no Unicode bold or emoji, ends with the reserve link), a `button-primary` "Copy text" and a `button-secondary` "View trip page".

**Accounts (mock).** Sign-in and organizer sign-up are prototypes: the account lives in the viewer's browser and every account page carries a `proto-note` (a `neutral` strip with an alert icon) saying nothing is sent or saved.
- *Dashboard button (organizers):* a `button-secondary` "Dashboard" sits left of the initials avatar on every page and every width, so organizers never have to open the menu to find it; on phones it replaces "Post a trip" (which stays in the nav, the dashboard and the menu). When there is unread activity it carries a count: a 22px `primary` pill with `surface` text ("2", or "99+"), read by screen readers as "Dashboard, 2 new". On the dashboard itself it has a 2px `primary` inset ring and `aria-current="page"`, and the tab title starts with the count ("(2) Dashboard"). Joiners never see it.
- *Header account slot:* signed out, a `button-secondary` "Sign in". Signed in, a 44px round initials avatar that opens a small menu (`surface`, 1px `border`, 28px corners, the one raised shadow): name, role ("Joiner", "Joiner · organizer application in review", or "Organizer · name · ID verified (Demo: not a real check)"), one next action ("Application status" while an application is pending), and "Sign out". Escape or a click outside closes it. On phones under 480px, signed out, "Post a trip" hides so "Sign in" fits.
- *Sign-in page:* one column of steps, left-aligned, with a trail photo beside it on desktop only. First step offers three ways, each a full-width button with an icon: Continue with Facebook (`button-primary`, most joiners already use it), mobile number, email. Mobile numbers use a fixed "+63" prefix and 10 digits starting with 9; codes are 6 digits in `data-lg` with wide tracking and `autocomplete="one-time-code"`. *Continue with Google* (`button-google`: `surface` fill, 1px `border` ring, ink text, Google's four-color "G" mark, which keeps its own brand colors because it's a logo, not a UI color) sits first and leads once Google sign-in is turned on in Supabase; the page asks Supabase which methods are on, so the button never shows before it works, and the email button steps down to `button-secondary`. Google gives the name, so the profile step opens with it filled in and asks only for the mobile number. With email, there is no code to type: after "Email me a link" the page says "Check your email" with the address, a `button-secondary` "Resend link" that counts down 60 seconds first (the email service has a limit), and "Use a different email". If the link opens in another tab of the same browser, this tab finishes too. New accounts end on a short profile: first and last name, mobile number, and a privacy-notice checkbox.
- *Organizer version of sign-in* (`signin.html?as=organizer`, where organizer sign-up sends signed-out visitors): never the same screen as joiner sign-in. A `label-caps` "Organizer sign-up" eyebrow and the 4-step progress bar with step 1 (Account) current sit above the heading "Become an organizer", the lead says what comes after signing in (organizer name, ID, payouts), the tab title is "Organizer sign-up", and the bottom link swaps to "Just joining hikes? Sign in as a joiner". The email link keeps this mode, so organizer sign-up continues even if the link opens in a new tab.
- *Organizer sign-up:* a real 4-step sequence (Account, ID, Business, Payout; "ID", not "Verify ID", because nothing is verified automatically), shown as a numbered progress bar of four 4px rounded segments: done and current in `primary`, upcoming in `border`. Business is optional ("Skip for now"). The payout name must match the ID name. The finish screen lists each check with an icon: `primary` tick for done, `tertiary` clock for in review, `secondary` cross for not added. A "Why we ask" `neutral` panel sits beside the steps on desktop. Its intro, ID and business copy never promise a verified badge; they say a badge would carry the demo tag. The offline demo's instant "ID verified" row carries `tag-demo` too.
- *Application received* (with the live database): sign-up never makes anyone an organizer or verified on the spot; the TrailPeak owner approves each one. The finish screen is titled "Application received", a `body` lead says approval is by hand and usually takes 1–2 working days and that we'll text them, then the same status list: `tertiary` clocks for "Waiting for approval" and "ID in review" (and business documents if added), a `primary` tick only for what is truly done (payout saved). One action: `button-primary` "Browse trips", since they can't post yet. Opening sign-up again while pending shows "Application received" with the same message instead of the form; a revoked account sees "Organizer access is off". Never show "ID verified" or a tick for a check nobody has done. The offline demo keeps the instant mock finish screen.
- *Already an organizer:* opening organizer sign-up again shows "You're already an organizer" with Go to dashboard and Post a trip, not the form.
- *On the sign-in pages* the header doesn't offer "Sign in" again.
- *Sign-in gates:* Reserve sends signed-out joiners to sign in and brings them back to the same trip. Publish asks non-organizers to create an organizer account, but anyone can fill in the form first.

**Booking flow** (`reserve.html`, then `mytrips.html`). Reserve on a trip page saves the chosen date, joiners and pick-up, asks signed-out joiners to sign in, then opens the reserve page.
- *Reserve page:* pay form on the left, an order summary on the right (on top, with a short 3:1 photo, below 1024px). The summary lists date, meetup, joiners, event fee × joiners, Pay on meetup day, and **Pay now (DP)** in bold under a hairline. The form: GCash or Maya as choice cards, wallet number with the +63 prefix, optional names of the group, a policy checkbox that states the no-refund rule in plain words, and a full-width `button-primary` "Pay ₱1,500 DP" with the exact amount. While paying: a clock icon and "Waiting for GCash to approve ₱1,500…".
- *Confirmation:* a `primary` "DP paid" seal, "You're going to Mt. Daraitan" in `headline-lg`, the booking number in `data-lg` with wide tracking, and a ticked list of what happens next (DP sent to whom, meetup time and place, balance to bring, the organizer's text 2 days before).
- *My trips:* one card per booking, soonest first: photo, status pill (Confirmed = `tertiary`, Cancelled = `error` outline, Done = `neutral`), a lake-blue countdown ("In 10 days"), and the facts in two columns. Move date and Cancel follow the policy: moving is free once and only 7+ days before; cancelling always shows a red-bordered inline warning that the DP isn't refunded, and offers a free move instead when one is allowed. Below the upcoming trips, two separate sections, newest first: **Past trips** (Done) and **Cancelled**, so a finished hike never reads as cancelled. Done and cancelled cards drop "Bring for balance", which no longer applies.
- *Reviews:* once a trip's date has passed, its card shows a `button-secondary` "Write a review". It opens an inline `neutral` panel: five 44px stars as a real radio group (`star-rating`: outline stars ☆ in `secondary`, dark enough to see; every star up to the chosen one becomes a filled ★ in `primary` as `star-rating-selected`, so shape shows the choice as well as color; each has screen-reader text like "4 stars", and arrow keys move between them), a text box, a line saying the name other joiners will see ("Shown on the trip page as Ana R."), and `button-primary` "Post review". One review per booking. Afterwards the card shows "Your review" with the stars and text instead of the button.
- *Joiner details* (reserve, and "Add details" in My trips): a "Who's joining" group, then "Emergency contact", each a `headline-sm` legend with one `text-meta` line on why it's asked. Joiner 1 is the booker, shown in a `neutral` strip ("Joiner 1 You, Ana Reyes"). Each other joiner gets a bold "Joiner 2" line and a row of full name (wide), age as a select ("18 or older" / "Under 18", 150px) and an optional mobile (200px), stacked on phones. A checkbox, "Some names aren't ready yet", allows blank names; typed names are kept. Emergency contact: name, relationship, mobile, all but relationship required. When names are missing, My trips shows a `neutral` reminder with an alert icon ("Add 1 joiner's details by Wed, Nov 25") and the card's main button becomes `button-primary` "Add details". Names are due 3 days before the trip, and these details are deleted 30 days after it.
- *Slots:* every booking lowers the slots shown on the search and trip pages for that date.

**Organizer profile** (`org.html#<organizer>`, linked as "View profile" from every trip's organizer card). A 96px initials avatar and the name in `headline-lg`, the ID verification claim under it when marked, one line on where they go and where they pick up, and three `data-lg` stats (trips run, average rating with count, trips listed). Three `card` tiles: ID, business, cancellation policy. A marked ID or business check shows its `tag-demo` under the title and says no real check service exists yet; business in review gets a `secondary` clock; an unchecked one gets a `secondary` cross and a plain "Book with care" line, never a warning color. Under the tiles, the line on what an ID check can't tell you. Then their upcoming trips as search cards, and all reviews from their trips, newest first, each naming the trip.

**Organizer dashboard** (`dashboard.html`). Money first, then trips by date, then the joiner list for the chosen date.
- *Signed out or a joiner:* a short explanation with `button-primary` "Create organizer account" and `button-secondary` "Use the sample account" (for demos and interviews).
- *Money tiles:* four `neutral` tiles: Joiners booked, DPs received, Sent to your wallet, To collect on meetup day. Values in `data-lg`, a `label-caps` label and one `text-meta` line. Only the payout tile is `primary-deep`, because that's the number organizers care about most. Four across on desktop, two on tablets, one on phones.
- *Trip block:* 1px `border`, 28px corners; a `neutral` header with a thumbnail, name, fee and DP, and `button-secondary` actions on `surface` (Edit trip, for trips this account published; View trip page; Copy Facebook text). One row per date: date and meetup time, a booked bar (8px, `primary` fill on a `border` track, labelled "11 of 14 booked"), a status pill, and actions. The selected date gets a `neutral` fill with a 3px `primary` edge.
- *Date states* are the same five words everywhere (dashboard and trip page), from one shared `dateState()` in `auth.js`: **Open**, **Full** (no slots left), **Closed** (the organizer stopped new bookings; existing bookings stay; Reopen undoes it), **Cancelled** (final; joiners are offered another date or a refund), **Completed** (the date has passed). Only open, closed and cancelled are stored; full and completed are worked out from the slots and the date.
- *Status pills* (13px caps, 12px corners): Open = `tertiary` on `tertiary-tint` (availability), Full = ink on `neutral`, Closed = ink on `border`, Cancelled = `error` text with an `error` outline, Completed = ink on `neutral`. A completed date keeps only its Joiners button: it can't be changed. A cancelled date has no actions. Never blaze colors.
- *Change slots* (a text button beside Close): opens an inline `surface` panel in the row with a 120px number field ("Slots on Sat, Nov 14"), a `button-secondary` "Save slots", a "Cancel" text button, and one `text-meta` hint that says how many slots are taken and so the lowest number allowed, and the most (the trip's group size). Going below the slots taken shows an `error` line under the field ("5 slots are already taken, so choose 5 or more. To stop new bookings, close the date instead."), marks the field invalid and keeps the old number. The database checks again on save, so a booking made a moment earlier is never squeezed out. After saving, the row's note says the change ("Slots changed from 14 to 7. 2 open.") and focus returns to Change slots.
- *Cancel for weather* is a red text button. It opens an inline confirm panel with an `error` border that says how many joiners will be texted and what they're offered, with a red "Cancel this date" and a "Keep the date" button. No browser pop-ups.
- *Joiner list:* a real table (caption, column headers) that scrolls sideways inside its own box on phones and never widens the page. Columns: checked-in box (44px tap area), name (the booker in bold, then each person in the group with an "UNDER 18" caps tag, and "1 name still to come" when the booker hasn't added everyone), joiners, pick-up, mobile, emergency contact (name, relationship, number), DP paid, amount to collect, with a totals row. The subtitle counts names still to come. "Copy joiner list" turns it into plain text with one line per hiker, for registration at the jump-off and for the van.
- *Outside bookings* (Messenger, in person, other; recorded by the organizer): in the joiner list they sit with the TrailPeak bookings, the name followed by a `tag-source` ("Messenger", "In person", "Other": `neutral` fill, ink text, 14px bold sentence case, 12px corners). DP paid says "Not recorded" and the amount to collect is a dash, because entering a booking never means a DP arrived; a `text-meta` row under the totals says outside bookings aren't in the money totals. They count in Joiners booked and in the booked bar, never in DPs received, Sent to your wallet, To collect or Payouts (those tiles add "outside bookings not included" when any exist). The copied list marks them "Messenger booking · DP not recorded".
- *Add outside booking* (a `button-secondary` beside Copy joiner list, for the selected date): opens an inline `surface` panel (1px `border`, 20px corners) titled "Add an outside booking · Sat, Nov 14" in `headline-sm`, a `text-meta` line saying it uses slots right away (with the number left) and doesn't record a DP, then booker's name, joiners (1 up to the slots left), pick-up (the trip's own pick-up points) and mobile (optional) in a grid that stacks on phones, and "Booked through" as three radio buttons in a fieldset. `button-primary` "Add booking" (it reads "Adding…" and is disabled while saving, so a double click can't add two) and a "Cancel" text button. Errors appear as an `error` line in the panel with the field marked invalid and focused. A closed, full, cancelled or completed date shows one sentence instead of the form, saying why and what to do (reopen it, or change its slots). After adding, the date row's note says who was added, how many slots are left and "No DP recorded", and focus returns to the button.
- *Payouts:* a hairline list of DP payouts per date with the amount after commission.

**Policy pages** (`privacy.html`, `terms.html`). One column capped at 68 characters a line, `headline-lg` title, the last-updated date in `text-meta`, then a `neutral` "In short" panel with 28px corners that sums the page up in two or three sentences before the details. Section titles in `headline-md`, plain bullet lists, no legal capitals. They describe what the site really does (what's simulated, who sees what), and every footer that has room links both.

**Empty search.** When nothing matches, the grid shows one `neutral` panel with a `headline-md` line ("No trips match yet"), one `text-meta` line suggesting what to change (date, pick-up, fewer joiners), and a `button-secondary` "Clear search". Never a blank grid.

**Difficulty badges.** `badge-easy`, `badge-moderate`, `badge-hard`, `badge-expert`. Always shape icon + uppercase word, 12px squircle corners. The exact 1–9 score always appears nearby (in the specs row or the filter chip), because local hikers compare by score. Use the same four levels everywhere: search filter, cards, detail page.

**Buttons.** Primary: `primary` fill, paper text, `label-caps`. Hover darkens to `primary-hover`; no lift or scale. Secondary: `neutral` fill with pine text, for "Save" or "Share". Disabled: `border` fill with `secondary` text, plus `cursor: not-allowed`. There's no ghost or tertiary button; a third action is a text link.

**Trip page** (`trip.html#<trip-id>`, one page that loads any trip from the shared trip data). Top to bottom:
- *Breadcrumb* in `text-meta` (Day hikes / Batangas / Mt. Batulao), then the difficulty badge + `chip-spots` for the selected date, the mountain name in `display` (40px on phones), and a meta row: place, rating, organizer line.
- *Gallery:* 3-photo mosaic (one large left, two stacked right; on phones one wide on top, two below), 28px squircle corners, 440px tall on desktop.
- *Stats ribbon:* `primary-deep` band with 4–5 stats (a stat with no sourced value, like an unknown trail class, is left out, never shown as "n/a"), each a `label-caps` label, a `data-lg` value and a `text-meta` note: Peak (MASL), Difficulty (x/9), Trail class, Hike time, Group size. Dividers between stats are 1px `secondary`. 5 across on desktop, 3 on tablet, 2 on phones.
- *Two columns on desktop:* content on the left, booking panel on the right (380px, sticky 88px from the top). One column below 1024px.
- *Choose a date:* a month calendar of 44px day cells, opening on the month of the first open date. Previous/next month buttons (44px, chevron icons) step only between months that have departures and dim at either end. A day with a departure is `calendar-day` with a 1px `border` ring and a lake-blue dot under the number; the chosen day is `calendar-day-selected` (lake fill, paper text, paper dot). A full day is struck through in `secondary` and disabled. A closed day has a 1px dashed `secondary` outline; a cancelled day has the dashed outline and is struck through; both are disabled and their screen-reader labels say "closed: the organizer isn't taking new bookings" or "cancelled". The legend under the calendar names each mark (slots open, full, closed, cancelled), wrapping on phones. A closed or cancelled date sent to the reserve page shows "That date is closed for booking" or "That date was cancelled" with a link back to choose another. Days with no departure, and departures whose date has passed, are plain `secondary` numbers, not buttons. If a trip has no date from today on, the calendar and booking panel say "No upcoming dates" and point to Ask the organizer, and the phone bar hides. A legend sits under it. Next to the calendar, a `neutral` panel repeats the chosen date in `headline-md`, the slots in `chip-spots`, the meetup time, and the lead guide (`avatar-guide` + name + one line of experience).
- *Itinerary timeline:* a 1px `border` line with 9px round markers; times right-aligned in `timeline-time`, the step in `body-strong`, a detail line in `text-meta`. Key moments (meetup, summit) get a filled `primary` marker; the rest are hollow.
- *What the fee covers:* two lists side by side. Included items use a `primary` tick; Not included items use a `secondary` cross and `secondary` text. Never blaze colors here: green and red already mean difficulty.
- *Pick-up points:* a table with hairline rows: place, pick-up time, drop-off time (times right-aligned in `data-md`).
- *Who's going:* under the date picker, for the chosen date. Everyone sees the count and mix ("13 going · 6 solo, 3 groups"). Only joiners booked on that same date see names, and only of joiners who opted in at Reserve: first name + last initial and solo/group size, in `neutral` 20px squircle chips (`rounded.md`) with a 32px initials avatar; your own chip has a 1px `primary` ring and "(you)". Unlisted bookings are counted ("and 3 bookings not listed"). Never phone numbers or full names.
- *Ask the organizer:* a `button-secondary` in the organizer card that opens a `neutral` panel with a ready message (trip, date, joiners, pick-up) in an editable box, the organizer's mobile number, and Copy message / Copy number. The prototype doesn't link to a real chat.
- *Trail notice:* when a mountain has a rule joiners must know before booking (a seasonal opening like Mt. Halcon's Feb 1 – May 31, or a closure), a `tertiary-tint` strip with a `tertiary` icon sits between the title and the photos. It states the rule and what it means for booking. No notice for ordinary open trails.
- *Reviews:* after the organizer. The average in `data-lg`, stars in `primary` (unfilled ones as outline stars ☆ in `secondary`, so they stay visible; "5 out of 5 stars" for screen readers), the count, and "only joiners who went can review". Each review: name, stars, date, and the text capped at 68 characters a line, separated by hairlines. A new trip says "No reviews yet" instead of showing 0.0.
- *New trips* (published from the post form): "New trip" instead of a rating, one wide photo, and no itinerary, packing or guide section until the organizer adds them. Empty sections are left out, never shown blank.
- *What to bring* (one paragraph), *Cancellation policy* (a `neutral` panel with 4 rules: weather/closure, organizer cancels, joiner cancels 7+ days before, late cancel or no-show), and *Your organizer* (56px avatar, name and trip count, then the ID claim and the business status on separate lines, the line on what an ID check can't tell you, and a `button-secondary` "Ask the organizer").
- *Booking panel:* `primary-deep`, 28px corners. Price in `data-lg` with "event fee per joiner"; the chosen date; a joiner `stepper` (minus and plus buttons, capped at the slots left, with "N slots left on this date" under it); a pick-up select with times; a breakdown (`booking-meta` labels): event fee × joiners, **Pay on meetup day**, and **Pay now to reserve** in bold. The button is `button-on-dark` "Reserve with GCash or Maya", followed by one line saying where the DP goes and that refunds follow the policy.
- *Phone bar:* below 1024px (phones and tablets, wherever the side panel is gone) a `primary-deep` bar is fixed to the bottom with the DP total, the date, and a `button-on-dark` "Reserve" that jumps to the booking panel. It carries the one allowed raised shadow.

**Inputs.** `surface` fill, 1px `border`, 20px squircle corners, `body-md` at 17px (no iOS zoom on focus). Errors: `error` border and text, plus icon and message.

**Tooltip.** `on-surface` fill with paper text. 150ms delay in, none out.

**Accessibility baseline** (checked against WCAG 2.1 AA on all three pages):
- Every tap target is at least 44 × 44px: nav links, icon buttons, inputs, steppers, breadcrumbs, chips.
- Every page starts with a "Skip to content" link, visible on first Tab, that jumps to `main`.
- Icons never carry meaning alone. Numbers get hidden screen-reader words ("Difficulty 4/9", "Rated 4.8 from 212 reviews"), and repeated buttons get unique names ("View and join Mt. Batulao").
- Form errors are announced: a live line names the sections to fix, focus moves to the first one, and each section is linked to its error text only while the error shows.
- When a control changes a total off-screen (the joiner stepper), a hidden live line says the result ("3 joiners. Pay ₱1,500 now, ₱2,997 on meetup day.").
- Never label the same thing twice: if the visible text already says "Meetup", the icon next to it stays silent.
- Previews of real components are `inert`, so keyboard users can't tab into a fake button.
- Photo overlays for text use the `primary-deep` gradient at 40% or more at its lightest, so white text holds contrast on bright photos.

**Voice and words.** Calm, plain English with the local hiking words joiners already use: *joiners*, *slots*, *DP*, *pick-up*, *event fee*, *meetup*, *jump-off*, *MASL*. One word per idea everywhere: a hike someone books is a **trip** (not tour, event or climb), its day is a **date**, money paid up front is the **DP** and the rest is paid **on meetup day**. Buttons start with a verb and say what happens ("Find trips", "Reserve with GCash or Maya", "Publish trip", "Copy text"). Errors say what to do, not what went wrong in system terms ("Enter an event fee and a DP above ₱0"). Success is modest ("Your trip is live"). No caps-lock urgency, no "Book na!", no exclamation marks.

## Do's and Don'ts

- **Do** show difficulty with color *and* shape every time (● ■ ◆ ◆◆). About 1 in 12 men can't tell green from red.
- **Don't** use the blaze colors (moss, ochre, clay) for anything except difficulty. Not for success messages, highlights or decoration.
- **Do** use lake blue (`tertiary`) only for availability and schedule. If it appears anywhere else, it stops meaning "you can book this".
- **Don't** use red or flashing elements to push people to book ("Only 2 left!!"). State the number calmly in `chip-spots`.
- **Do** set every number (MASL, hrs, x/9 scores, dates, times) with tabular figures, and prices in Bricolage Grotesque. Never a condensed font at reading size.
- **Don't** add a frosted-glass header or card shadows. Depth comes from paper tones, hairlines and photos.
- **Do** use squircle corners from the radius scale on every rounded element, and nest them concentrically (inner = outer − gap). Don't mix sharp and rounded corners in the same view.
- **Do** keep every interactive element at 44 × 44px or larger, and test new pages with the keyboard alone.
- **Don't** add a 500 or 600 font weight. If something needs more emphasis, give it more size or space.
- **Do** keep body text at 17px or larger; people read this outdoors on a phone.
- **Don't** use pure `#FFFFFF` or `#000000`; use `surface` and `on-surface`.
- **Do** put a `primary-deep` gradient under any text placed on a photo.
- **Don't** animate photos or sections on scroll. Only hover, focus and opening menus animate.
- **Do** use the same four difficulty levels (Easy, Moderate, Hard, Expert) in search, cards and detail pages, always mapped from the 1–9 score the same way.
- **Do** show the event fee and the down payment, and say what is and isn't included. Hidden add-ons (environmental fee, guide fee) at checkout break trust with joiners.
- **Do** show the meetup time and place, not only the hike date. A "Saturday" hike often means a Friday-night meetup.


## Direct DP records (TP-010)

The organizer dashboard uses the existing inline `out-form` surface for Record DP and Correct DP / history. It appears above the joiner table, with a labelled whole-peso cumulative amount (zero up to expected DP), method, Philippine received time, required note/correction reason, Save DP record and Cancel. The form explains that a correction replaces the total, never adds another payment, and that zero undoes an incorrect record without issuing a refund. History retains the amount, method, received time, actor, recorded time and reason. Errors stay in the form with alert semantics and focus; saving disables conflicting actions and retries retain the same request id.

DP pending, Partial DP and DP received are text states, not verification badges. The table, dashboard totals and My trips calculate remaining balance from the booking's price snapshot minus the latest receipt. New and legacy connected bookings start with zero received; old simulated DP values remain expected DP only. Unknown receipt data says Unavailable and disables receipt entry rather than showing invented money. No online surface claims a TrailPeak payout. The table scroll container establishes a positioned containing block so off-screen accessible labels do not widen the mobile page.


## Demo and pilot separation (TP-004)

`demo.html` reuses TrailPeak's existing paper colors, type scale, form fields, buttons and spacing. It is a narrow sample booking exercise, labelled Demo only before and after submission. It has no account UI or data connection. Its example hike, prices, pick-up and six slots are explicitly sample data. The simulator reports sample amounts, rejects groups that do not fit and has a Reset demo action. It cannot create a real booking or receipt. Seeded trip cards carry a Demo sample note; their trip/reserve action points to this separate demo. Legacy sample reservations in My trips say Sample only / no DP due. Real reservations say DP pending until the organizer records a direct payment.


## Activity and contact checks (November 2026)

**Activity** sits at the top of the organizer dashboard, above the money tiles: a `section-title` ("Activity · 2 new" when there is unread activity), a "Mark all as read" text button, and a `card` list (28px corners, `hairline` dividers) of the ten latest events on the organizer's trips: a joiner booked (with the DP still pending and a nudge to send payment details), cancelled, or moved a date. Each row is one plain sentence, then a `text-meta` line with the time; unread rows put the sentence in bold and start the meta line with a `tag-new` ("New": `tertiary-tint` fill, `tertiary` text, 14px bold sentence case, 12px corners, the same calm information color as availability). A `button-secondary` "View joiners" opens that date's joiner list. While the dashboard is open it checks for new activity every minute; when something new arrives, a `tertiary-tint` strip above the list names it and offers "Refresh bookings", because a new booking also changes slots and the joiner list. Activity is in-app only for now: no email, text or Messenger alert is sent.

**Transaction reference.** The Record DP form has an optional "Transaction reference" field (up to 40 characters, `data` font) for the GCash, Maya or bank reference number. It appears in the receipt history ("₱1,000 · GCash · ref 1012 345 678 · received…") and in the joiner's My trips note, so both sides can match the transfer. It is the organizer's note, not a verification.

**Mobile numbers.** Every mobile field (outside booking, joiner details, emergency contact) accepts 0917…, 917… or +63 917… with spaces or dashes, and anything else gets the same `error` line: "The mobile number must be a Philippine mobile number: 10 digits starting with 9, like 0917 123 4567.", with the field marked invalid and focused. Numbers are never cut short to make them fit. Saved numbers are shown as "+63 917 123 4567"; an older outside booking whose number fails the check shows it with "(check this number)".


## DP hold, reference and expiry (TP-011)

**DP states** use one set of words everywhere (`dpState()` in `auth.js`): *DP pending* (slots held until a deadline), *DP sent, waiting for organizer* (the joiner entered the reference), *Partial DP*, *DP received*, *Expired: DP not sent*. A deadline is always written out in Manila time ("Wed, Nov 11, 8:30 PM"), never as a countdown alone, so it reads the same on every device.

**My trips.** A booking with a running hold shows a `due` line with a `secondary` clock icon: "Send the ₱1,000 DP to Batangas Trail Co. by Wed, Nov 11, 8:30 PM, then enter the reference here. With no reference by then, your slots are released." Under it an inline form, open by default: "GCash or Maya reference number" (`data` font, up to 40 characters), a `button-primary` "I've sent the DP" (disabled with "Saving…" while it saves), and a `text-meta` hint on why it's asked. Once sent, a `text-meta` line gives the time and reference and says the slots stay held, with a "Change reference" text button. An expired booking moves to the cancelled section with an "Expired" pill and a `due` line (alert icon) saying the slots were released and that a late payer should contact the organizer to be rebooked or refunded.

**Reserve page.** The lead says how long the slots will be held (the shorter hold named as "shorter because the trip is soon"), and the confirmation's first line gives the exact deadline.

**Dashboard.** The DP column adds "· ref 1012 345 678" to a sent DP and "· held until …" to a running hold. Under the joiner table, **Expired holds · DP not sent** lists each lapsed booking (name, joiners, when it expired) with a `button-secondary` "Rebook", under a `text-meta` line: "Paid after the deadline? Rebook if slots remain; otherwise refund the DP under your policy." A refused rebook shows as an `error` line there. Expired bookings never count toward slots or money.

## Edit and cancel outside bookings (TP-009)

In the joiner list each outside booking has two text buttons under its name: "Edit" and a red "Cancel". Both open the same inline `surface` panel as Add outside booking, above the list. **Edit** is the add form prefilled, plus a required "Reason for the change" field, a `text-meta` line on what adding or removing joiners does (with the slots left), `button-primary` "Save changes" ("Saving…" while it saves) and a "Cancel" text button. **Cancel** has an `error` border, says how many slots open again and that any recorded DP stays on record (refunds happen outside TrailPeak), asks for a reason, and offers a red "Cancel booking" and "Keep booking". Both show a collapsible "History (n)" with each change's time, what changed (before → after) and the reason. Errors appear as an `error` line in the panel, the form keeps what was typed and the booking is unchanged. Cancelled outside bookings stay listed under the joiner table ("Cancelled outside bookings": name, joiners, source, when and why) and never count toward slots.

## Booking help and organizer contact (TP-018)

**How booking works** is a `policy`-style `card` section on the trip page, right before Cancellation policy: six numbered steps, each a bold lead-in and one plain sentence (Reserve, Send the DP to the organizer, The organizer confirms, Rain or a closure, Cancelling, Questions). It is plain HTML, so it reads correctly before any script runs and never names a fixed number of hours (the exact deadline appears after reserving). The reserve page carries the same six steps in a collapsed `neutral` "How paying, rain and cancelling work" disclosure above the prototype note.

**Booking panel.** The breakdown's last line reads "DP to reserve" and the button just "Reserve": nothing is paid on TrailPeak. Under it, one `fine` line: "You send the DP directly to (organizer) by GCash or Maya." with a link to How booking works (offline demo: "Demo: no money moves.").

**Organizer contact.** Post a trip has a step "Contact for joiners" (step 5): one mobile field, prefilled from the organizer's profile, checked with the shared Philippine-mobile rule and its `error` line. It appears under Ask the organizer on the trip page ("Mobile: +63 917 123 4567" with Copy number); a trip without one says "Shared in My trips after you reserve". In My trips, an upcoming booking lists "Organizer" with the number as a tap-to-call link (`data` font).


## Joiner details due date (TP-014)

Dates for this rule are always Manila calendar days. On the reserve page, a booking before the due date keeps the "Some names aren't ready yet. I'll add them in My trips before Wed, Nov 18." checkbox (the date is written out). From the due date on, the checkbox is replaced by one bold `jd-hint` line, "This trip is 3 days away or less, so add every joiner's full name now.", and a missing name gets the `error` line "Enter joiner 3's full name: this trip is too soon to add names later." In My trips, the `due` line says "Add 2 joiners' details before Wed, Nov 18." and, once the due date has passed, "1 joiner's details were due Wed, Nov 11. Add them now: the organizer needs every name to register your group."
