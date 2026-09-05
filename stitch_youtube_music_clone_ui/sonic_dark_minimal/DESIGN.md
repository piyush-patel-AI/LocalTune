---
name: Sonic Dark Minimal
colors:
  surface: '#141313'
  surface-dim: '#141313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353434'
  on-surface: '#e5e2e1'
  on-surface-variant: '#ebbbb4'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#b18780'
  outline-variant: '#603e39'
  surface-tint: '#ffb4a8'
  primary: '#ffb4a8'
  on-primary: '#690100'
  primary-container: '#ff5540'
  on-primary-container: '#5c0000'
  inverse-primary: '#c00100'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#c8c6c5'
  on-tertiary: '#303030'
  tertiary-container: '#929090'
  on-tertiary-container: '#2a2a2a'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdad4'
  primary-fixed-dim: '#ffb4a8'
  on-primary-fixed: '#410000'
  on-primary-fixed-variant: '#930100'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1b1c1c'
  on-tertiary-fixed-variant: '#474746'
  background: '#141313'
  on-background: '#e5e2e1'
  surface-variant: '#353434'
  surface-base: '#030303'
  surface-card: '#181818'
  surface-card-alt: '#212121'
  surface-elevated: '#282828'
  surface-overlay: rgba(19, 19, 19, 0.88)
  text-primary: '#FFFFFF'
  text-secondary: '#AAAAAA'
  text-tertiary: '#717171'
  border-subtle: '#333333'
  border-chip: rgba(255, 255, 255, 0.15)
  chip-active-bg: '#FFFFFF'
  chip-active-text: '#030303'
  chip-inactive-bg: '#212121'
  player-scrubber-track: rgba(255, 255, 255, 0.2)
  player-scrubber-fill: '#FF0000'
typography:
  display-lg:
    fontFamily: robotoFlex
    fontSize: 32px
    fontWeight: '800'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: robotoFlex
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: robotoFlex
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: robotoFlex
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: robotoFlex
    fontSize: 15px
    fontWeight: '500'
    lineHeight: 20px
  body-md:
    fontFamily: robotoFlex
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: robotoFlex
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: robotoFlex
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-md:
    fontFamily: robotoFlex
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  label-xs:
    fontFamily: robotoFlex
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.5rem
  space-2xl: 2rem
  space-3xl: 2.5rem
  screen-edge: 1rem
  carousel-gap: 0.75rem
  list-item-gap: 0.75rem
  mini-player-height: 4rem
  bottom-nav-height: 3.5rem
---

## Brand & Style

The design system delivers an immersive, media-first streaming experience tailored for dynamic music exploration and deep listening sessions. The brand voice balances understated utilitarianism with electric, high-energy punctuation. It retreats into deep darkness to let album cover artwork, dynamic artist imagery, and playback states take immediate visual primacy. 

The design movement combines **Minimalism** and **Modern Dark UI** with high-contrast functional accents:
- **Atmospheric Void:** True black and near-black surfaces eliminate light bleed and eye strain during nighttime consumption while optimizing OLED power efficiency.
- **Media-Centric Hierarchy:** UI chrome never competes with album art. Functional controls, metadata typography, and tracklists use muted, disciplined tones.
- **Kinetic Focus:** The iconic YouTube Red accent is reserved strictly for high-value interactive anchors, active playback indicators, and notification badges, driving laser-sharp user orientation.

## Colors

The palette establishes an OLED-grade dark canvas where hue directly communicates interactive status and hierarchy:

- **Primary (`#FF0000`):** Pure YouTube Red serves as the focal beacon. It is applied exclusively to brand identifiers, active progress scrubbers, playback indicators, live broadcasts, and urgent notification dots.
- **Secondary (`#FFFFFF`):** High-contrast absolute white for high-priority track titles, section headers, active bottom navigation icons, and active pill chips.
- **Tertiary (`#212121`):** Mid-tone charcoal neutral used for unselected filter pills, subtle surface card boundaries, and container backgrounds.
- **Neutral (`#030303`):** Pitch black canvas foundational to all screens, anchoring the app without pure `#000000` crushing when displaying graded UI layers.
- **Secondary Text (`#AAAAAA`):** Used consistently for artist names, playback counters, durations, and secondary descriptors to establish effortless scannability without visual noise.
- **Borders (`#333333`):** Low-contrast dividers and card perimeters keeping modules organized without creating hard, distracting grid lines.

## Typography

The type system utilizes `robotoFlex` across all tiers to maintain clinical clarity, high legibility at micro scales, and signature Android platform ergonomics.

- **Hierarchical Contrast:** Category and section titles (`headline-lg`, `headline-md`) are set in bold weights (`700`), instantly anchoring the eye as horizontal carousels scroll beneath them.
- **Track & Content Titles:** Primary track and playlist titles use `body-lg` at weight `500` to `600` with absolute white `#FFFFFF`.
- **Metadata Treatment:** Artist names, view counts, release years, and playlist counts default to `body-md` or `body-sm` rendered in `#AAAAAA`. Explicit tags and time stamps utilize `label-xs` with uppercase tracking.
- **Truncation Philosophy:** Song and album titles truncate at 1 line in horizontal lists, or 2 lines in 2-column album grids, ensuring structural stability throughout fluid scrolling sessions.

## Layout & Spacing

The layout is built on a tight 4px/8px modular scale engineered for touch-screen velocity and dense information architecture:

- **Horizontal Bleed & Carousels:** Content rails (Quick picks, Speed dial, New releases) align with a `16px` (`1rem`) screen-edge margin and overflow horizontally off the viewport edge, signaling continuous swipeability.
- **Vertical Rhythm:** Vertical spacing between major section blocks is set to `32px` (`2rem`). Within lists, track rows maintain `12px` gaps with touch targets strictly meeting or exceeding `48px` vertically.
- **App Chrome Offsets:** Every scrollable view includes safe area padding at the bottom equal to `mini-player-height` (64px) + `bottom-nav-height` (56px) + system navigation safe inset, ensuring zero occlusion of list contents by persistent playback chrome.
- **Grid Layouts:** Category and genre explore cards conform to a 2-column fluid grid with an `8px` gap, maintaining equal aspect ratios.

## Elevation & Depth

Visual hierarchy does not rely on drop shadows; instead, it is articulated through **tonal layering**, **selective translucency**, and **subtle surface borders**:

- **Ground Level (`#030303`):** Canvas background housing the primary scroll streams and page rails.
- **Card Tier 1 (`#181818` to `#212121`):** Applied to composite cards (e.g., "Mixed for you", Explore tiles), subtly framed by a 1px border of `#333333` or tinted gradients derived from the playlist art.
- **Floating Chrome Tier 2 (`#282828` / `#212121`):** Reserved for the persistent mini-player and action sheets. Sits above general content with a high-performance frosted blur (`backdrop-filter: blur(20px)`) and a sharp top border of `1px solid rgba(255, 255, 255, 0.08)`.
- **Modal & Player Tier 3:** Full Now Playing overlay occupies a dynamic vertical gradient backdrop sampled from dominant cover colors falling off into `#030303` at the bottom.

## Shapes

The interface balances sharp, clean media presentation with organic, thumb-friendly interaction points:

- **Filter & Mood Chips:** Full pill geometry (`border-radius: 9999px`) for smooth swipeability and tap recognition.
- **Album & Media Artwork:** Standard album thumbnails use an 8px radius (`rounded-md`). Large hero playlist cards and Now Playing artwork employ a 12px to 16px radius (`rounded-lg` / `rounded-xl`).
- **Interactive Buttons:** Secondary and tertiary utility buttons (Play, Bookmark, Like) use circular silhouettes (`border-radius: 9999px`), while category cards adopt an 8px or 12px smooth corner.
- **Mini-Player:** Floating capsule with an 8px or 12px perimeter radius, floating 8px above the bottom navigation bar.

## Components

### 1. Filter Chips
- **Inactive:** `#212121` background, 1px border of `rgba(255, 255, 255, 0.15)`, text `#FFFFFF` in `label-lg`, fully rounded pill (`border-radius: 9999px`), height 36px, horizontal padding 14px.
- **Active:** Pure white (`#FFFFFF`) background, `#030303` text, borderless, font weight `600`.

### 2. Track & Media Rows
- Horizontal flex layout with a 48px × 48px album thumbnail (8px radius) on the left.
- Middle stack containing track title (`body-lg`, `#FFFFFF`, single-line ellipsis) and metadata subtitle (`body-md`, `#AAAAAA`, including explicit badge if applicable).
- Right trailing actions: Contextual 3-dot overflow icon button (`#AAAAAA`, 40px touch area) and drag handle for editable queues.

### 3. Mixed / Speed Dial Modular Cards
- Large container (`#181818` to `#212121`) with 16px corner radius.
- Includes a 2×2 composite collage artwork thumbnail, section header, 3 nested track preview rows, and a circular playback FAB button (`#FFFFFF` or `#282828` with `#FFFFFF` play icon).

### 4. Floating Mini-Player
- Positioned docked directly above the bottom navigation bar with an 8px horizontal inset.
- Height: 56px to 64px, background `#212121` with `backdrop-filter: blur(16px)`, radius 10px.
- Features: 40px × 40px left-aligned thumbnail, compact track title and artist in horizontal lockup, right-aligned Cast and Play/Pause icon buttons.
- Bottom progress bar: 2px track at bottom edge with primary `#FF0000` fill indicating playback percentage.

### 5. Persistent Bottom Navigation Bar
- Fixed at screen bottom, height 56px, background `#030303` with a top divider line (`#212121`).
- 4 to 5 tab items (Home, Samples, Explore, Library, Upgrade).
- Inactive tabs: `#AAAAAA` icon and text label in `label-md`.
- Active tab: `#FFFFFF` icon and label with subtle white glow or high-contrast accentuation.

### 6. Now Playing Full-Screen Player
- Top app bar: Down-chevron dismiss button, title header indicating current playlist/station, cast icon, and menu icon.
- Central stage: Large square album artwork (aspect ratio 1:1, radius 16px, subtle drop glow).
- Scrubbing control: Interactive horizontal slider bar with `#FF0000` active fill, `#FFFFFF` scrubber handle knob, and elapsed/remaining duration in `label-xs` `#AAAAAA`.
- Primary controls: Oversized circular Play/Pause button (64px, `#FFFFFF` with `#030303` glyph), flanked by Previous/Next icons in `#FFFFFF`, and outer Like/Shuffle controls in `#AAAAAA`.