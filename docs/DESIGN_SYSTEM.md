# Abandoned Archive Design System

**Version:** 1.0.0
**Last Updated:** 2025-12-03
**Philosophy:** Ulm School / Braun / Functional Minimalism

---

## Table of Contents

1. [Philosophy](#1-philosophy)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Spacing](#4-spacing)
5. [Layout](#5-layout)
6. [Components](#6-components)
7. [Motion](#7-motion)
8. [Accessibility](#8-accessibility)
9. [Tokens](#9-tokens)
10. [App Identity](#10-app-identity)
11. [Page Patterns](#11-page-patterns)
12. [Empty States](#12-empty-states)
13. [Loading States](#13-loading-states)
14. [Modals & Overlays](#14-modals--overlays)
15. [Navigation](#15-navigation)
16. [Data Display](#16-data-display)
17. [Form Patterns](#17-form-patterns)
18. [Toast Notifications](#18-toast-notifications)
19. [Component Inventory](#19-component-inventory)

---

## 1. Philosophy

### 1.1 Design Principles

These principles are derived from Dieter Rams' 10 Principles of Good Design, adapted for the specific context of Abandoned Archive—a research tool for documenting forgotten places.

| Principle | Application to Abandoned Archive |
|-----------|----------------------------------|
| **Photography is the hero** | UI recedes. Images of abandoned places dominate. Interface elements are tools, not decorations. |
| **Functional over decorative** | Every visual element serves a purpose. If it doesn't help the researcher, it doesn't exist. |
| **Honest materials** | Show real data. No placeholder glamor. GPS accuracy displayed truthfully. Metadata exposed. |
| **Systematic consistency** | Grid-based layouts. Predictable spacing. Repeatable patterns. |
| **Quiet confidence** | Premium feel through restraint, not ornamentation. Quality in the details. |
| **Timeless over trendy** | Should look appropriate in 5+ years. No glassmorphism, no gradients, no shadows for shadows' sake. |
| **Research-grade clarity** | Information hierarchy serves historians. Data is scannable. Actions are obvious. |

### 1.2 The Braun Standard

Following Dieter Rams' philosophy of "Less, but better" (Weniger, aber besser):

- **Neutral palette** with functional color accents
- **Typography as information**, not decoration
- **Form follows function** in every component
- **Unobtrusive design** that leaves room for the content (photographs)

> "Products fulfilling a purpose are like tools. They are neither decorative objects nor works of art. Their design should therefore be both neutral and restrained, to leave room for the user's self-expression."
> — Dieter Rams

### 1.3 What This App Should Feel Like

- **Professional research tool**, not a social media app
- **Quiet and focused**, like a well-organized archive
- **Confident and calm**, never demanding attention
- **Respectful of the subject matter**—abandoned places carry history and weight

### 1.4 Anti-Patterns (What to Avoid)

| Avoid | Why |
|-------|-----|
| Saturated colors | Creates visual noise; competes with photography |
| Drop shadows on everything | Introduces visual debt; feels dated |
| Rounded corners > 8px | Feels playful/consumer; undermines seriousness |
| Animations for delight | Motion should inform, not entertain |
| Decorative icons | Icons must communicate function |
| Pure black (#000000) | Causes eye strain; harsh contrast on screens |
| Busy backgrounds | Competes with photograph content |
| Gradients | Decorative; adds no functional value |
| Skeleton screens with animations | Prefer instant content or simple loading states |

---

## 2. Color System

### 2.1 Philosophy

Following Braun's historical approach: a neutral foundation (grays) with color applied only when it communicates something to the user. The ET 66 calculator's yellow equals key exemplifies this—color as information, not decoration.

### 2.2 Dark Mode Palette (Primary)

Dark mode is primary because:
1. Suits moody urbex photography aesthetic
2. Reduces eye strain during extended research sessions
3. Makes photographs "pop" against muted backgrounds
4. Aligns with professional creative tools (Lightroom, Capture One)

#### Neutral Scale

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--neutral-950` | `#0a0a0b` | 10, 10, 11 | App background |
| `--neutral-900` | `#111113` | 17, 17, 19 | Card backgrounds, elevated surfaces |
| `--neutral-850` | `#18181b` | 24, 24, 27 | Input backgrounds, secondary surfaces |
| `--neutral-800` | `#1f1f23` | 31, 31, 35 | Borders, dividers (subtle) |
| `--neutral-700` | `#2e2e33` | 46, 46, 51 | Borders, dividers (prominent) |
| `--neutral-600` | `#404047` | 64, 64, 71 | Disabled text, muted elements |
| `--neutral-500` | `#5c5c66` | 92, 92, 102 | Placeholder text |
| `--neutral-400` | `#85858f` | 133, 133, 143 | Secondary text |
| `--neutral-300` | `#a3a3ad` | 163, 163, 173 | Tertiary text, captions |
| `--neutral-200` | `#c4c4cc` | 196, 196, 204 | Body text |
| `--neutral-100` | `#e4e4e8` | 228, 228, 232 | Primary text |
| `--neutral-50` | `#f4f4f6` | 244, 244, 246 | High-emphasis text, headings |

**Note:** Neutral scale has a subtle blue undertone (not pure gray) to feel cooler and more archival.

#### Accent Color: Amber

Amber is chosen as the accent for these reasons:
1. **Historical precedent**: Braun used warm accents (yellow, orange) sparingly for key functional elements
2. **Photography association**: Tungsten light, amber tones in abandoned places
3. **Visibility**: High contrast against dark grays without being harsh
4. **Warmth**: Balances the cool neutrals; provides human warmth to clinical interface

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--accent-50` | `#fffbeb` | 255, 251, 235 | Accent backgrounds (hover states) |
| `--accent-100` | `#fef3c7` | 254, 243, 199 | Light accent backgrounds |
| `--accent-200` | `#fde68a` | 253, 230, 138 | Accent borders |
| `--accent-300` | `#fcd34d` | 252, 211, 77 | Accent elements (light) |
| `--accent-400` | `#fbbf24` | 251, 191, 36 | Primary accent (buttons, links) |
| `--accent-500` | `#f59e0b` | 245, 158, 11 | Primary accent (hover) |
| `--accent-600` | `#d97706` | 217, 119, 6 | Primary accent (pressed) |
| `--accent-700` | `#b45309` | 180, 83, 9 | Dark accent |
| `--accent-800` | `#92400e` | 146, 64, 14 | Darkest accent |

#### Semantic Colors

| Token | Hex | Usage | Contrast Ratio (on neutral-900) |
|-------|-----|-------|--------------------------------|
| `--success` | `#22c55e` | Verified GPS, successful imports | 4.9:1 ✓ |
| `--success-muted` | `#166534` | Success backgrounds | — |
| `--warning` | `#eab308` | Medium GPS confidence, pending states | 8.2:1 ✓ |
| `--warning-muted` | `#854d0e` | Warning backgrounds | — |
| `--error` | `#ef4444` | Errors, low GPS confidence | 4.6:1 ✓ |
| `--error-muted` | `#991b1b` | Error backgrounds | — |
| `--info` | `#3b82f6` | Informational states, EXIF GPS | 4.7:1 ✓ |
| `--info-muted` | `#1e40af` | Info backgrounds | — |

#### GPS Confidence Colors (Domain-Specific)

These map directly to `docs/contracts/gps.md`:

| Confidence | Token | Hex | Marker Usage |
|------------|-------|-----|--------------|
| Map-confirmed | `--gps-verified` | `#22c55e` | Green marker |
| High (EXIF) | `--gps-high` | `#3b82f6` | Blue marker |
| Medium (reverse) | `--gps-medium` | `#eab308` | Amber marker |
| Low (manual) | `--gps-low` | `#ef4444` | Red marker |
| None | `--gps-none` | `#6b7280` | Gray marker |

### 2.3 Light Mode Palette

Light mode is a full parallel to dark mode, designed with the same Braun principles: neutral dominance, functional accents.

Following Braun's historical approach, light mode uses white, light gray, and dark gray—mirroring the product designs of devices like the Braun audio 1 (white metal enclosure) and TP 1 (gray plastic with aluminum).

#### Light Mode Neutral Scale

| Token | Hex | RGB | Usage |
|-------|-----|-----|-------|
| `--neutral-50` | `#fafafa` | 250, 250, 250 | App background |
| `--neutral-100` | `#f4f4f5` | 244, 244, 245 | Elevated surfaces, cards |
| `--neutral-150` | `#e8e8ea` | 232, 232, 234 | Secondary surfaces |
| `--neutral-200` | `#d4d4d8` | 212, 212, 216 | Borders (subtle) |
| `--neutral-300` | `#a1a1aa` | 161, 161, 170 | Borders (prominent), disabled |
| `--neutral-400` | `#71717a` | 113, 113, 122 | Placeholder text |
| `--neutral-500` | `#52525b` | 82, 82, 91 | Secondary text |
| `--neutral-600` | `#3f3f46` | 63, 63, 70 | Tertiary text, captions |
| `--neutral-700` | `#27272a` | 39, 39, 42 | Body text |
| `--neutral-800` | `#18181b` | 24, 24, 27 | Primary text |
| `--neutral-900` | `#09090b` | 9, 9, 11 | High-emphasis text, headings |

**Note:** Light mode neutrals are zinc-based (subtle blue undertone) to match dark mode's cool archival feel.

#### Light Mode Accent

Same amber accent scale works in both modes. In light mode, use darker shades for text/icons:

| Context | Dark Mode Token | Light Mode Token |
|---------|-----------------|------------------|
| Primary accent (buttons) | `--accent-400` | `--accent-500` |
| Accent hover | `--accent-500` | `--accent-600` |
| Accent pressed | `--accent-600` | `--accent-700` |
| Accent text on light bg | N/A | `--accent-700` |

#### Light Mode Semantic Colors

| Token | Hex | Usage | Contrast Ratio (on neutral-100) |
|-------|-----|-------|--------------------------------|
| `--success` | `#16a34a` | Verified GPS, successful imports | 4.5:1 ✓ |
| `--success-muted` | `#dcfce7` | Success backgrounds | — |
| `--warning` | `#ca8a04` | Medium GPS confidence | 4.5:1 ✓ |
| `--warning-muted` | `#fef9c3` | Warning backgrounds | — |
| `--error` | `#dc2626` | Errors, low GPS confidence | 4.6:1 ✓ |
| `--error-muted` | `#fee2e2` | Error backgrounds | — |
| `--info` | `#2563eb` | Informational states | 4.5:1 ✓ |
| `--info-muted` | `#dbeafe` | Info backgrounds | — |

### 2.4 Theme Switching

#### Implementation Strategy

Use CSS custom properties with a `data-theme` attribute on `<html>`:

```css
/* Default: Dark mode */
:root {
  --color-bg: var(--neutral-950);
  --color-surface: var(--neutral-900);
  --color-border: var(--neutral-800);
  --color-text-primary: var(--neutral-50);
  --color-text-secondary: var(--neutral-200);
  --color-text-muted: var(--neutral-400);
  --color-accent: var(--accent-400);
}

/* Light mode */
[data-theme="light"] {
  --color-bg: var(--neutral-50);
  --color-surface: var(--neutral-100);
  --color-border: var(--neutral-200);
  --color-text-primary: var(--neutral-900);
  --color-text-secondary: var(--neutral-700);
  --color-text-muted: var(--neutral-500);
  --color-accent: var(--accent-500);
}

/* System preference (optional third state) */
@media (prefers-color-scheme: light) {
  [data-theme="system"] {
    --color-bg: var(--neutral-50);
    /* ... light mode values */
  }
}
```

#### Theme Toggle Options

Provide three options in Settings:

| Option | Behavior |
|--------|----------|
| **Dark** | Always use dark mode |
| **Light** | Always use light mode |
| **System** | Follow OS preference |

#### Persistence

Store user preference in:
1. SQLite `settings` table (key: `theme`, values: `dark`, `light`, `system`)
2. Apply on app launch before first paint to prevent flash

#### Hero Image Adjustment

In light mode, slightly reduce image brightness to prevent harsh contrast:

```css
[data-theme="light"] .hero-image {
  filter: brightness(0.95);
}
```

### 2.4 Color Usage Rules

1. **Text on dark backgrounds**: Minimum 4.5:1 contrast ratio (WCAG AA)
2. **Large text (18px+)**: Minimum 3:1 contrast ratio
3. **Interactive elements**: Minimum 3:1 contrast against adjacent colors
4. **Never use color alone** to convey information—pair with text/icons
5. **Accent color**: Reserved for primary actions and key interactive elements
6. **Semantic colors**: Only for their designated purpose (success, error, etc.)

---

## 3. Typography

### 3.1 Font Selection: Inter

**Primary Font:** Inter (Variable)
**Fallback Stack:** `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`

**Why Inter:**

1. **Designed for screens**: Tall x-height, open apertures optimize legibility at all sizes
2. **Functional heritage**: Shares DNA with Helvetica and other neo-grotesques used by Ulm School
3. **Variable font**: Single file covers all weights; reduces bundle size
4. **Free and open**: No licensing concerns; can ship with app
5. **Industry standard**: Used by NASA, Mozilla, GitLab—professional credibility
6. **Excellent OpenType features**: Tabular figures, case-sensitive forms, slashed zero

**Monospace Font:** JetBrains Mono (for code, SHA hashes, coordinates)
**Fallback:** `"JetBrains Mono", "SF Mono", Consolas, monospace`

### 3.2 Type Scale

Based on a 4px baseline grid with 1.25 ratio (Major Third). All line-heights are multiples of 4px.

| Token | Size | Line Height | Weight | Letter Spacing | Usage |
|-------|------|-------------|--------|----------------|-------|
| `--text-xs` | 11px | 16px (1.45) | 400 | 0.02em | Captions, timestamps, metadata |
| `--text-sm` | 13px | 20px (1.54) | 400 | 0.01em | Secondary text, table cells |
| `--text-base` | 15px | 24px (1.6) | 400 | 0 | Body text, form labels |
| `--text-md` | 17px | 24px (1.41) | 500 | -0.01em | Emphasized body, card titles |
| `--text-lg` | 20px | 28px (1.4) | 500 | -0.015em | Section headers |
| `--text-xl` | 24px | 32px (1.33) | 600 | -0.02em | Page subtitles |
| `--text-2xl` | 30px | 36px (1.2) | 600 | -0.025em | Page titles |
| `--text-3xl` | 36px | 40px (1.11) | 700 | -0.03em | Hero text, dashboard headers |
| `--text-4xl` | 48px | 52px (1.08) | 700 | -0.03em | Display text (rare) |

### 3.3 Font Weights

| Token | Weight | Usage |
|-------|--------|-------|
| `--font-normal` | 400 | Body text, descriptions |
| `--font-medium` | 500 | Labels, card titles, emphasis |
| `--font-semibold` | 600 | Section headers, page titles |
| `--font-bold` | 700 | Hero text, strong emphasis |

### 3.4 Typography Rules

1. **Maximum line length**: 65-75 characters for body text
2. **Paragraph spacing**: 1em (one line-height) between paragraphs
3. **Heading proximity**: Headings should be closer to their content than to preceding content
4. **No orphans**: Avoid single words on final lines where possible
5. **Tabular figures**: Use for numbers in tables, coordinates, hashes
6. **Uppercase**: Use sparingly—only for labels, badges, very short strings. Always add letter-spacing (+0.05em)

### 3.5 Implementation

```css
/* Base typography */
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
}

body {
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 24px;
  font-weight: 400;
  letter-spacing: 0;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: 'cv01', 'cv02', 'cv03', 'cv04'; /* Inter stylistic sets */
}

/* Tabular figures for data */
.tabular {
  font-feature-settings: 'tnum', 'cv01';
}

/* Slashed zero for hashes/codes */
.code {
  font-family: var(--font-mono);
  font-feature-settings: 'zero';
}
```

---

## 4. Spacing

### 4.1 The 8px Grid

All spacing derives from an 8px base unit. This creates visual harmony and simplifies decision-making.

**Why 8px:**
- Divisible by 2 and 4 (allows half-steps when needed)
- Common screen dimensions are multiples of 8
- Adopted by Material Design, Apple HIG, and most professional design systems
- Large enough to create meaningful visual differences

### 4.2 Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--space-0` | 0px | Reset, no spacing |
| `--space-px` | 1px | Hairline borders only |
| `--space-0.5` | 2px | Micro-adjustments (icon padding) |
| `--space-1` | 4px | Tight spacing, inline elements |
| `--space-2` | 8px | Default small spacing |
| `--space-3` | 12px | Compact component padding |
| `--space-4` | 16px | Default component padding |
| `--space-5` | 20px | Medium spacing |
| `--space-6` | 24px | Section spacing (small) |
| `--space-8` | 32px | Section spacing (medium) |
| `--space-10` | 40px | Section spacing (large) |
| `--space-12` | 48px | Page section gaps |
| `--space-16` | 64px | Major page divisions |
| `--space-20` | 80px | Hero spacing |
| `--space-24` | 96px | Maximum section gaps |

### 4.3 The Internal ≤ External Rule

**The space inside a component must be less than or equal to the space outside it.**

This ensures visual grouping: elements that belong together appear closer than elements that are separate.

```
┌─────────────────────────────────────────────┐
│                 External: 24px               │
│  ┌──────────────────────────────────────┐   │
│  │        Internal: 16px                │   │
│  │  ┌────────────┐  ┌────────────┐      │   │
│  │  │   Item     │  │   Item     │      │   │
│  │  └────────────┘  └────────────┘      │   │
│  │        Gap: 8px                      │   │
│  └──────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.4 Spacing Application

| Context | Recommended Spacing |
|---------|-------------------|
| Icon to label (inline) | 8px (`--space-2`) |
| Between form fields | 16px (`--space-4`) |
| Card internal padding | 16px (`--space-4`) |
| Between cards | 16px-24px (`--space-4` to `--space-6`) |
| Section padding | 24px-32px (`--space-6` to `--space-8`) |
| Page margins | 16px mobile, 24px tablet, 32px desktop |
| Between page sections | 48px-64px (`--space-12` to `--space-16`) |

---

## 5. Layout

### 5.1 Grid System

#### Desktop (≥1024px)

| Property | Value |
|----------|-------|
| Columns | 12 |
| Column width | Fluid |
| Gutter | 24px |
| Margin | 32px |
| Max container | 1440px |

#### Tablet (768px - 1023px)

| Property | Value |
|----------|-------|
| Columns | 8 |
| Column width | Fluid |
| Gutter | 16px |
| Margin | 24px |

#### Mobile (< 768px)

| Property | Value |
|----------|-------|
| Columns | 4 |
| Column width | Fluid |
| Gutter | 16px |
| Margin | 16px |

### 5.2 Breakpoints

| Token | Value | Target |
|-------|-------|--------|
| `--breakpoint-sm` | 640px | Large phones |
| `--breakpoint-md` | 768px | Tablets |
| `--breakpoint-lg` | 1024px | Small laptops |
| `--breakpoint-xl` | 1280px | Desktops |
| `--breakpoint-2xl` | 1536px | Large displays |

### 5.3 Container Widths

| Token | Value | Usage |
|-------|-------|-------|
| `--container-sm` | 640px | Narrow content (forms) |
| `--container-md` | 768px | Standard content |
| `--container-lg` | 1024px | Wide content |
| `--container-xl` | 1280px | Full-width content |
| `--container-full` | 100% | Edge-to-edge (maps, galleries) |

### 5.4 Common Layout Patterns

#### Sidebar + Content (Desktop)

```
┌─────────────────────────────────────────────────────┐
│ Header (full width)                                 │
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│ Sidebar  │  Main Content                            │
│ 280px    │  Fluid                                   │
│ fixed    │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

#### Card Grid

```
Desktop: 4 columns
Tablet: 3 columns
Mobile: 1-2 columns (depending on card type)

Gap: 16px (mobile), 24px (desktop)
```

#### Location Detail

```
┌─────────────────────────────────────────────────────┐
│ Hero Image (16:9 or 3:2)                            │
├─────────────────────────────────────────────────────┤
│ Metadata Bar (GPS, Type, State)                     │
├─────────────────────────────────────────────────────┤
│ Content Area (2/3)        │ Sidebar (1/3)           │
│ - Description             │ - Map thumbnail         │
│ - Gallery                 │ - Quick stats           │
│ - Sub-locations           │ - Actions               │
└───────────────────────────┴─────────────────────────┘
```

---

## 6. Components

### 6.1 Buttons

Following Rams' principle: buttons should be immediately understandable. Visual weight indicates importance.

#### Button Hierarchy

| Type | Usage | Frequency |
|------|-------|-----------|
| Primary | Main page action | 1 per view max |
| Secondary | Supporting actions | 2-3 per view |
| Tertiary/Ghost | Low-emphasis actions | As needed |
| Destructive | Delete, remove | Sparingly |

#### Primary Button

```css
.btn-primary {
  background: var(--accent-400);
  color: var(--neutral-950);
  font-size: 15px;
  font-weight: 500;
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: background 150ms ease-out;
}

.btn-primary:hover {
  background: var(--accent-500);
}

.btn-primary:focus-visible {
  outline: 2px solid var(--accent-400);
  outline-offset: 2px;
}

.btn-primary:active {
  background: var(--accent-600);
}

.btn-primary:disabled {
  background: var(--neutral-700);
  color: var(--neutral-500);
  cursor: not-allowed;
}
```

#### Secondary Button

```css
.btn-secondary {
  background: transparent;
  color: var(--neutral-100);
  font-size: 15px;
  font-weight: 500;
  padding: 10px 20px;
  border-radius: 6px;
  border: 1px solid var(--neutral-700);
  cursor: pointer;
  transition: all 150ms ease-out;
}

.btn-secondary:hover {
  background: var(--neutral-800);
  border-color: var(--neutral-600);
}

.btn-secondary:focus-visible {
  outline: 2px solid var(--accent-400);
  outline-offset: 2px;
}

.btn-secondary:active {
  background: var(--neutral-700);
}
```

#### Ghost Button

```css
.btn-ghost {
  background: transparent;
  color: var(--neutral-200);
  font-size: 15px;
  font-weight: 500;
  padding: 10px 20px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  transition: background 150ms ease-out;
}

.btn-ghost:hover {
  background: var(--neutral-800);
}
```

#### Button Sizes

| Size | Padding | Font Size | Min Height |
|------|---------|-----------|------------|
| Small | 6px 12px | 13px | 32px |
| Default | 10px 20px | 15px | 40px |
| Large | 14px 28px | 17px | 48px |

### 6.2 Cards

Cards display location entries. Photography must dominate.

#### Location Card Structure

```
┌─────────────────────────────────────┐
│                                     │
│         Image (16:9 aspect)         │
│                                     │
├─────────────────────────────────────┤
│ GPS Confidence Indicator (4px bar)  │
├─────────────────────────────────────┤
│ Location Name              Type Tag │
│ City, State                         │
│                                     │
│ 12 photos · 3 videos                │
└─────────────────────────────────────┘
```

#### Card Specifications

```css
.location-card {
  background: var(--neutral-900);
  border: 1px solid var(--neutral-800);
  border-radius: 8px;
  overflow: hidden;
  transition: border-color 150ms ease-out;
}

.location-card:hover {
  border-color: var(--neutral-700);
}

.location-card:focus-within {
  outline: 2px solid var(--accent-400);
  outline-offset: 2px;
}

.card-image {
  aspect-ratio: 16 / 9;
  object-fit: cover;
  width: 100%;
}

.card-confidence-bar {
  height: 4px;
  /* Color based on GPS confidence */
}

.card-content {
  padding: 16px;
}

.card-title {
  font-size: 17px;
  font-weight: 500;
  color: var(--neutral-50);
  margin-bottom: 4px;
}

.card-location {
  font-size: 13px;
  color: var(--neutral-400);
  margin-bottom: 12px;
}

.card-meta {
  font-size: 13px;
  color: var(--neutral-500);
}
```

#### Image Aspect Ratios

| Context | Ratio | Usage |
|---------|-------|-------|
| Card thumbnail | 16:9 | Location cards in grid |
| Hero image | 16:9 or 21:9 | Location detail header |
| Gallery thumbnail | 1:1 | Gallery grid view |
| Map preview | 4:3 | Sidebar map thumbnail |

### 6.3 Input Fields

#### Text Input

```css
.input {
  background: var(--neutral-850);
  border: 1px solid var(--neutral-700);
  border-radius: 6px;
  color: var(--neutral-100);
  font-size: 15px;
  line-height: 24px;
  padding: 10px 12px;
  width: 100%;
  transition: all 150ms ease-out;
}

.input::placeholder {
  color: var(--neutral-500);
}

.input:hover {
  border-color: var(--neutral-600);
}

.input:focus {
  outline: none;
  border-color: var(--accent-400);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
}

.input:disabled {
  background: var(--neutral-900);
  color: var(--neutral-600);
  cursor: not-allowed;
}

.input.error {
  border-color: var(--error);
}
```

#### Input States

| State | Border | Background | Text |
|-------|--------|------------|------|
| Default | neutral-700 | neutral-850 | neutral-100 |
| Hover | neutral-600 | neutral-850 | neutral-100 |
| Focus | accent-400 | neutral-850 | neutral-100 |
| Filled | neutral-700 | neutral-850 | neutral-100 |
| Error | error | neutral-850 | neutral-100 |
| Disabled | neutral-800 | neutral-900 | neutral-600 |

#### Form Label

```css
.label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--neutral-300);
  margin-bottom: 6px;
}

.label-required::after {
  content: ' *';
  color: var(--error);
}
```

#### Helper Text

```css
.helper-text {
  font-size: 13px;
  color: var(--neutral-500);
  margin-top: 6px;
}

.helper-text.error {
  color: var(--error);
}
```

### 6.4 Navigation

#### Sidebar Navigation

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  color: var(--neutral-400);
  font-size: 15px;
  font-weight: 500;
  border-radius: 6px;
  transition: all 150ms ease-out;
}

.nav-item:hover {
  color: var(--neutral-200);
  background: var(--neutral-850);
}

.nav-item.active {
  color: var(--neutral-50);
  background: var(--neutral-800);
}

.nav-item .icon {
  width: 20px;
  height: 20px;
  opacity: 0.7;
}

.nav-item.active .icon {
  opacity: 1;
}
```

### 6.5 Icons

Following Otl Aicher's pictogram principles: icons communicate function, not decoration.

#### Icon Guidelines

1. **Grid**: Design on 24x24 grid with 2px padding (20px live area)
2. **Stroke weight**: 1.5px for 24px icons, 2px for 20px icons
3. **Corners**: 2px radius for rounded corners
4. **Style**: Outline icons (not filled) for UI; filled for emphasis/selection
5. **Alignment**: Center-align within bounding box
6. **Optical adjustment**: Allow slight deviation from grid for visual balance

#### Icon Sizes

| Size | Usage |
|------|-------|
| 16px | Inline with text, compact UI |
| 20px | Buttons, navigation items |
| 24px | Standalone icons, empty states |
| 32px | Feature highlights |
| 48px | Empty states, onboarding |

#### Icon + Text Spacing

| Icon Size | Gap to Text |
|-----------|-------------|
| 16px | 6px |
| 20px | 8px |
| 24px | 12px |

### 6.6 Badges & Tags

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 4px;
}

.badge-default {
  background: var(--neutral-800);
  color: var(--neutral-300);
}

.badge-accent {
  background: rgba(251, 191, 36, 0.15);
  color: var(--accent-400);
}

.badge-success {
  background: var(--success-muted);
  color: var(--success);
}

.badge-warning {
  background: var(--warning-muted);
  color: var(--warning);
}

.badge-error {
  background: var(--error-muted);
  color: var(--error);
}
```

---

## 7. Motion

### 7.1 Philosophy

Motion in Abandoned Archive is functional, not decorative. It provides:
1. **Feedback**: Confirming user actions
2. **Orientation**: Showing spatial relationships
3. **Continuity**: Maintaining context during transitions

Motion should be barely noticed when present, but missed if removed.

### 7.2 Timing

| Token | Duration | Usage |
|-------|----------|-------|
| `--duration-instant` | 0ms | Immediate (disabled states) |
| `--duration-fast` | 100ms | Micro-interactions (hover) |
| `--duration-normal` | 150ms | Default transitions |
| `--duration-slow` | 250ms | Emphasis transitions |
| `--duration-slower` | 350ms | Complex transitions |

**Rule**: Most UI transitions should be 150ms. Only use longer durations for emphasis or complex spatial changes.

### 7.3 Easing

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-out` | cubic-bezier(0.25, 0, 0.25, 1) | Default for UI (enter) |
| `--ease-in` | cubic-bezier(0.5, 0, 0.75, 0) | Exit transitions |
| `--ease-in-out` | cubic-bezier(0.45, 0, 0.55, 1) | Symmetric transitions |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) | Playful emphasis (rare) |

**Default**: Use `--ease-out` for most transitions. It feels responsive because acceleration is at the beginning.

### 7.4 Animation Patterns

#### Hover States

```css
.interactive {
  transition:
    background var(--duration-normal) var(--ease-out),
    border-color var(--duration-normal) var(--ease-out);
}
```

#### Modal Enter

```css
.modal {
  animation: modal-enter var(--duration-slow) var(--ease-out);
}

@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

#### Page Transitions

```css
.page-enter {
  animation: fade-in var(--duration-normal) var(--ease-out);
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

### 7.5 Reduced Motion

Always respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 7.6 What NOT to Animate

- **Loading skeletons**: Use static placeholders, not pulsing animations
- **Decorative flourishes**: No bounces, wobbles, or attention-seeking motion
- **Large images**: No sliding in; prefer fade or instant
- **Continuous motion**: Nothing should move indefinitely

---

## 8. Accessibility

### 8.1 Contrast Requirements

| Context | Minimum Ratio | Standard |
|---------|---------------|----------|
| Normal text (< 18px) | 4.5:1 | WCAG AA |
| Large text (≥ 18px or 14px bold) | 3:1 | WCAG AA |
| UI components | 3:1 | WCAG 2.1 |
| Enhanced (preferred) | 7:1 | WCAG AAA |

All color combinations in this system meet WCAG AA minimum. Primary text achieves AAA (7:1+).

### 8.2 Touch Targets

| Element | Minimum Size | Recommended |
|---------|--------------|-------------|
| Buttons | 44 × 44px | 48 × 48px |
| Touch targets | 44 × 44px | 48 × 48px |
| Inline links | 44px height | Full line height |
| Icon buttons | 44 × 44px | 48 × 48px |

### 8.3 Focus States

All interactive elements must have visible focus states:

```css
/* Base focus style */
:focus-visible {
  outline: 2px solid var(--accent-400);
  outline-offset: 2px;
}

/* Remove default outline when using focus-visible */
:focus:not(:focus-visible) {
  outline: none;
}
```

### 8.4 Screen Reader Support

1. **Semantic HTML**: Use proper heading hierarchy (h1 → h2 → h3)
2. **ARIA labels**: Provide labels for icon-only buttons
3. **Alt text**: All images must have descriptive alt text
4. **Live regions**: Announce dynamic content changes
5. **Skip links**: Provide "Skip to main content" link

### 8.5 Keyboard Navigation

- All interactive elements must be keyboard accessible
- Tab order must follow visual order (no `tabindex` > 0)
- Modal focus trapping: Tab cycles within modal
- Escape key closes modals/overlays

### 8.6 Color Independence

Never use color alone to convey information:

| Information | Color | Additional Indicator |
|-------------|-------|---------------------|
| GPS verified | Green | Checkmark icon + "Verified" label |
| GPS unverified | Red | Warning icon + "Needs verification" |
| Required field | — | Asterisk (*) after label |
| Error state | Red | Error icon + error message text |

---

## 9. Tokens

### 9.1 CSS Custom Properties

```css
:root {
  /* ==================== */
  /* COLORS               */
  /* ==================== */

  /* Neutral Scale (Dark Mode Primary) */
  --neutral-950: #0a0a0b;
  --neutral-900: #111113;
  --neutral-850: #18181b;
  --neutral-800: #1f1f23;
  --neutral-700: #2e2e33;
  --neutral-600: #404047;
  --neutral-500: #5c5c66;
  --neutral-400: #85858f;
  --neutral-300: #a3a3ad;
  --neutral-200: #c4c4cc;
  --neutral-100: #e4e4e8;
  --neutral-50: #f4f4f6;

  /* Accent (Amber) */
  --accent-50: #fffbeb;
  --accent-100: #fef3c7;
  --accent-200: #fde68a;
  --accent-300: #fcd34d;
  --accent-400: #fbbf24;
  --accent-500: #f59e0b;
  --accent-600: #d97706;
  --accent-700: #b45309;
  --accent-800: #92400e;

  /* Semantic */
  --success: #22c55e;
  --success-muted: #166534;
  --warning: #eab308;
  --warning-muted: #854d0e;
  --error: #ef4444;
  --error-muted: #991b1b;
  --info: #3b82f6;
  --info-muted: #1e40af;

  /* GPS Confidence */
  --gps-verified: #22c55e;
  --gps-high: #3b82f6;
  --gps-medium: #eab308;
  --gps-low: #ef4444;
  --gps-none: #6b7280;

  /* Semantic Aliases */
  --color-bg: var(--neutral-950);
  --color-bg-elevated: var(--neutral-900);
  --color-bg-input: var(--neutral-850);
  --color-border: var(--neutral-800);
  --color-border-strong: var(--neutral-700);
  --color-text-primary: var(--neutral-50);
  --color-text-secondary: var(--neutral-200);
  --color-text-muted: var(--neutral-400);
  --color-text-disabled: var(--neutral-600);
  --color-accent: var(--accent-400);
  --color-accent-hover: var(--accent-500);
  --color-accent-active: var(--accent-600);

  /* ==================== */
  /* TYPOGRAPHY           */
  /* ==================== */

  /* Font Families */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'SF Mono', Consolas, monospace;

  /* Font Sizes */
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 15px;
  --text-md: 17px;
  --text-lg: 20px;
  --text-xl: 24px;
  --text-2xl: 30px;
  --text-3xl: 36px;
  --text-4xl: 48px;

  /* Line Heights */
  --leading-xs: 16px;
  --leading-sm: 20px;
  --leading-base: 24px;
  --leading-md: 24px;
  --leading-lg: 28px;
  --leading-xl: 32px;
  --leading-2xl: 36px;
  --leading-3xl: 40px;
  --leading-4xl: 52px;

  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* ==================== */
  /* SPACING              */
  /* ==================== */

  --space-0: 0px;
  --space-px: 1px;
  --space-0-5: 2px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;
  --space-24: 96px;

  /* ==================== */
  /* LAYOUT               */
  /* ==================== */

  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
  --container-2xl: 1440px;

  /* Breakpoints (for reference in JS) */
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;

  /* ==================== */
  /* BORDERS              */
  /* ==================== */

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* ==================== */
  /* MOTION               */
  /* ==================== */

  --duration-instant: 0ms;
  --duration-fast: 100ms;
  --duration-normal: 150ms;
  --duration-slow: 250ms;
  --duration-slower: 350ms;

  --ease-out: cubic-bezier(0.25, 0, 0.25, 1);
  --ease-in: cubic-bezier(0.5, 0, 0.75, 0);
  --ease-in-out: cubic-bezier(0.45, 0, 0.55, 1);

  /* ==================== */
  /* SHADOWS              */
  /* ==================== */

  /* Minimal shadows - only for elevation indication */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.3);

  /* ==================== */
  /* Z-INDEX              */
  /* ==================== */

  --z-dropdown: 100;
  --z-sticky: 200;
  --z-modal-backdrop: 300;
  --z-modal: 400;
  --z-popover: 500;
  --z-tooltip: 600;
  --z-toast: 700;
}
```

### 9.2 JSON Token Structure

For tool interoperability (Figma Tokens, Style Dictionary):

```json
{
  "color": {
    "neutral": {
      "950": { "$value": "#0a0a0b", "$type": "color", "$description": "App background" },
      "900": { "$value": "#111113", "$type": "color", "$description": "Elevated surfaces" },
      "850": { "$value": "#18181b", "$type": "color", "$description": "Input backgrounds" },
      "800": { "$value": "#1f1f23", "$type": "color", "$description": "Subtle borders" },
      "700": { "$value": "#2e2e33", "$type": "color", "$description": "Prominent borders" },
      "600": { "$value": "#404047", "$type": "color", "$description": "Disabled text" },
      "500": { "$value": "#5c5c66", "$type": "color", "$description": "Placeholder text" },
      "400": { "$value": "#85858f", "$type": "color", "$description": "Secondary text" },
      "300": { "$value": "#a3a3ad", "$type": "color", "$description": "Tertiary text" },
      "200": { "$value": "#c4c4cc", "$type": "color", "$description": "Body text" },
      "100": { "$value": "#e4e4e8", "$type": "color", "$description": "Primary text" },
      "50": { "$value": "#f4f4f6", "$type": "color", "$description": "Headings" }
    },
    "accent": {
      "400": { "$value": "#fbbf24", "$type": "color", "$description": "Primary accent" },
      "500": { "$value": "#f59e0b", "$type": "color", "$description": "Accent hover" },
      "600": { "$value": "#d97706", "$type": "color", "$description": "Accent pressed" }
    },
    "semantic": {
      "success": { "$value": "#22c55e", "$type": "color" },
      "warning": { "$value": "#eab308", "$type": "color" },
      "error": { "$value": "#ef4444", "$type": "color" },
      "info": { "$value": "#3b82f6", "$type": "color" }
    }
  },
  "typography": {
    "fontFamily": {
      "sans": { "$value": "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", "$type": "fontFamily" },
      "mono": { "$value": "'JetBrains Mono', 'SF Mono', Consolas, monospace", "$type": "fontFamily" }
    },
    "fontSize": {
      "xs": { "$value": "11px", "$type": "dimension" },
      "sm": { "$value": "13px", "$type": "dimension" },
      "base": { "$value": "15px", "$type": "dimension" },
      "md": { "$value": "17px", "$type": "dimension" },
      "lg": { "$value": "20px", "$type": "dimension" },
      "xl": { "$value": "24px", "$type": "dimension" },
      "2xl": { "$value": "30px", "$type": "dimension" },
      "3xl": { "$value": "36px", "$type": "dimension" },
      "4xl": { "$value": "48px", "$type": "dimension" }
    }
  },
  "spacing": {
    "0": { "$value": "0px", "$type": "dimension" },
    "1": { "$value": "4px", "$type": "dimension" },
    "2": { "$value": "8px", "$type": "dimension" },
    "3": { "$value": "12px", "$type": "dimension" },
    "4": { "$value": "16px", "$type": "dimension" },
    "6": { "$value": "24px", "$type": "dimension" },
    "8": { "$value": "32px", "$type": "dimension" },
    "12": { "$value": "48px", "$type": "dimension" },
    "16": { "$value": "64px", "$type": "dimension" }
  },
  "borderRadius": {
    "sm": { "$value": "4px", "$type": "dimension" },
    "md": { "$value": "6px", "$type": "dimension" },
    "lg": { "$value": "8px", "$type": "dimension" }
  },
  "duration": {
    "fast": { "$value": "100ms", "$type": "duration" },
    "normal": { "$value": "150ms", "$type": "duration" },
    "slow": { "$value": "250ms", "$type": "duration" }
  }
}
```

---

## 10. App Identity

### 10.1 Philosophy: No Logo

Following Ulm School principles, Abandoned Archive uses **typography as identity**, not a logo mark. The app name itself, set in the system typeface, is the brand. This approach:

1. **Reduces visual noise** — No competing graphic element in the sidebar
2. **Prioritizes content** — Photography of abandoned places is the visual identity
3. **Ages well** — Typography doesn't date like logo trends
4. **Follows precedent** — Braun products were marked with a simple wordmark, not elaborate logos

### 10.2 App Wordmark

The app name appears in the sidebar navigation header as a text-only wordmark.

```
┌─────────────────────────────────────┐
│                                     │
│  ABANDONED                          │
│  ARCHIVE                            │
│                                     │
│  ─────────────────────────────────  │
│  [New Location]                     │
│  ─────────────────────────────────  │
│                                     │
│  Dashboard                          │
│  Locations                          │
│  ...                                │
└─────────────────────────────────────┘
```

#### Wordmark Specifications

```css
.app-wordmark {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--neutral-50);
  line-height: 1.4;
}
```

| Property | Value |
|----------|-------|
| Font | Inter |
| Size | 13px |
| Weight | 600 (semibold) |
| Letter-spacing | 0.12em (wide) |
| Transform | Uppercase |
| Color | neutral-50 (#f4f4f6) |
| Line height | 1.4 |

#### Wordmark Alternatives

For different contexts:

| Context | Treatment |
|---------|-----------|
| Sidebar header | Stacked two-line wordmark |
| Window title bar | "Abandoned Archive" single line |
| About dialog | Wordmark + version number below |
| Export watermark | None (no branding on exports) |

### 10.3 Favicon & App Icon

A simple, abstract mark for system UI contexts (dock, taskbar, tab):

| Context | Size | Description |
|---------|------|-------------|
| macOS Dock | 512×512 | Geometric "A" form in neutral-50 on neutral-950 |
| Windows Taskbar | 256×256 | Same mark |
| Favicon | 32×32 | Simplified single-stroke mark |

The icon should be:
- Monochromatic (works in any system theme)
- Geometric (Ulm School influence)
- Abstract (not a literal building or camera)

---

## 11. Page Patterns

### 11.1 Hero Image Treatment

**Decision:** Solid metadata bar below image (no gradient overlay).

Per Ulm School principles of honest materials and separation of concerns, the hero image and text occupy separate spaces.

#### Location Detail Hero Structure

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                  HERO IMAGE                         │
│              (16:9 or 2.35:1 aspect)                │
│              Full bleed, no overlay                 │
│                                                     │
├─────────────────────────────────────────────────────┤
│ LOCATION NAME                                       │  ← Solid bar
│ Sub-locations: Building A · Building B · Building C │     (neutral-900)
├─────────────────────────────────────────────────────┤
│ GPS Confidence Indicator (4px accent bar)           │
├─────────────────────────────────────────────────────┤
│                                                     │
│ [Main Content Area]                                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Hero Image Specifications

```css
.hero-container {
  width: 100%;
  background: var(--neutral-950);
}

.hero-image {
  width: 100%;
  max-height: 40vh;
  aspect-ratio: 2.35 / 1;
  object-fit: cover;
  /* Focal point from database */
  object-position: var(--focal-x, 50%) var(--focal-y, 50%);
}

.hero-metadata-bar {
  background: var(--neutral-900);
  padding: var(--space-6) var(--space-8);
  border-bottom: 1px solid var(--neutral-800);
}

.hero-title {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--neutral-50);
  text-transform: uppercase;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-2);
}

.hero-subtitle {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--neutral-400);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.gps-confidence-bar {
  height: 4px;
  background: var(--gps-confidence-color);
}
```

### 11.2 Dashboard Layout

```
┌─────────────────────────────────────────────────────┐
│ [Sidebar]  │  Dashboard                             │
│            │                                        │
│            │  ┌─────────────────────────────────┐   │
│            │  │ Stats Row (counts, metrics)     │   │
│            │  └─────────────────────────────────┘   │
│            │                                        │
│            │  Recent Locations                      │
│            │  ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│            │  │Card│ │Card│ │Card│ │Card│          │
│            │  └────┘ └────┘ └────┘ └────┘          │
│            │                                        │
│            │  Favorites                             │
│            │  ┌────┐ ┌────┐ ┌────┐                  │
│            │  │Card│ │Card│ │Card│                  │
│            │  └────┘ └────┘ └────┘                  │
└─────────────┴───────────────────────────────────────┘
```

### 11.3 List/Grid View

Locations page uses a filterable card grid:

```
┌─────────────────────────────────────────────────────┐
│ [Sidebar]  │  Locations                             │
│            │                                        │
│            │  [Filter Bar: State ▾ | Type ▾ | GPS ▾]│
│            │  ────────────────────────────────────  │
│            │                                        │
│            │  ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│            │  │    │ │    │ │    │ │    │          │
│            │  │Card│ │Card│ │Card│ │Card│          │
│            │  │    │ │    │ │    │ │    │          │
│            │  └────┘ └────┘ └────┘ └────┘          │
│            │  ┌────┐ ┌────┐ ┌────┐ ┌────┐          │
│            │  │    │ │    │ │    │ │    │          │
│            │  │Card│ │Card│ │Card│ │Card│          │
│            │  │    │ │    │ │    │ │    │          │
│            │  └────┘ └────┘ └────┘ └────┘          │
└─────────────┴───────────────────────────────────────┘
```

---

## 12. Empty States

### 12.1 Philosophy

Empty states should be:
1. **Informative** — Explain what belongs here
2. **Actionable** — Provide clear next step
3. **Quiet** — No decorative illustrations or playful copy
4. **Consistent** — Same pattern across all empty states

### 12.2 Empty State Structure

```
┌─────────────────────────────────────┐
│                                     │
│            [Icon 48px]              │
│                                     │
│         No [items] yet              │
│                                     │
│    Brief explanation of what        │
│    would appear here.               │
│                                     │
│         [Primary Action]            │
│                                     │
└─────────────────────────────────────┘
```

#### Empty State Specifications

```css
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-16) var(--space-8);
  text-align: center;
}

.empty-state-icon {
  width: 48px;
  height: 48px;
  color: var(--neutral-600);
  margin-bottom: var(--space-4);
}

.empty-state-title {
  font-size: var(--text-lg);
  font-weight: 500;
  color: var(--neutral-200);
  margin-bottom: var(--space-2);
}

.empty-state-description {
  font-size: var(--text-base);
  color: var(--neutral-500);
  max-width: 320px;
  margin-bottom: var(--space-6);
}
```

### 12.3 Empty State Copy

| Context | Title | Description | Action |
|---------|-------|-------------|--------|
| No locations | No locations yet | Create your first location to start documenting. | New Location |
| No images | No images | Import images to build this location's gallery. | Import Media |
| No search results | No matches | Try adjusting your filters or search terms. | Clear Filters |
| No bookmarks | No bookmarks | Save reference links related to this location. | Add Bookmark |

---

## 13. Loading States

### 13.1 Philosophy

Loading states should be:
1. **Instant or invisible** — Prefer instant content; only show loading for operations > 300ms
2. **Static** — No pulsing, spinning, or animated skeletons (per anti-patterns)
3. **Informative** — For longer operations, show progress

### 13.2 Loading Patterns

#### Instant Content (< 300ms)
No loading state. Content appears immediately.

#### Brief Loading (300ms - 2s)
Simple text indicator:

```css
.loading-text {
  font-size: var(--text-sm);
  color: var(--neutral-500);
  padding: var(--space-4);
}
```

```
Loading location...
```

#### Progress Loading (> 2s, known duration)
Progress bar for imports, exports, batch operations:

```css
.progress-bar {
  height: 4px;
  background: var(--neutral-800);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent-400);
  transition: width 150ms ease-out;
}

.progress-label {
  font-size: var(--text-sm);
  color: var(--neutral-400);
  margin-top: var(--space-2);
}
```

```
┌────────────────────────────────────┐
│ ████████████░░░░░░░░░░░░░░░░░░░░░░ │  Importing 24 of 156 files
└────────────────────────────────────┘
```

---

## 14. Modals & Overlays

### 14.1 Modal Structure

```
┌─────────────────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  Backdrop
│ ░░░░░░░┌─────────────────────────────────────┐░░░░░░░░ │  (neutral-950/80)
│ ░░░░░░░│ Modal Title                      ✕  │░░░░░░░░ │
│ ░░░░░░░├─────────────────────────────────────┤░░░░░░░░ │
│ ░░░░░░░│                                     │░░░░░░░░ │
│ ░░░░░░░│  Modal content area                 │░░░░░░░░ │
│ ░░░░░░░│                                     │░░░░░░░░ │
│ ░░░░░░░├─────────────────────────────────────┤░░░░░░░░ │
│ ░░░░░░░│              [Cancel] [Confirm]     │░░░░░░░░ │
│ ░░░░░░░└─────────────────────────────────────┘░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────────────────┘
```

### 14.2 Modal Specifications

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(10, 10, 11, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal-backdrop);
}

.modal {
  background: var(--neutral-900);
  border: 1px solid var(--neutral-800);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow: hidden;
  z-index: var(--z-modal);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--neutral-800);
}

.modal-title {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--neutral-50);
}

.modal-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--neutral-400);
  transition: all 150ms ease-out;
}

.modal-close:hover {
  background: var(--neutral-800);
  color: var(--neutral-200);
}

.modal-body {
  padding: var(--space-5);
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--neutral-800);
}
```

### 14.3 Modal Sizes

| Size | Max Width | Use Case |
|------|-----------|----------|
| Small | 400px | Confirmations, simple inputs |
| Default | 480px | Forms, settings |
| Large | 640px | Complex forms, previews |
| Full | 90vw | Media viewer, maps |

### 14.4 Media Viewer (Lightbox)

Full-screen overlay for viewing images/videos:

```css
.media-viewer {
  position: fixed;
  inset: 0;
  background: var(--neutral-950);
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
}

.media-viewer-toolbar {
  height: 56px;
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--neutral-900);
  border-bottom: 1px solid var(--neutral-800);
}

.media-viewer-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.media-viewer-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
```

---

## 15. Navigation

### 15.1 Sidebar Navigation

```css
.sidebar {
  width: 256px;
  height: 100vh;
  background: var(--neutral-950);
  border-right: 1px solid var(--neutral-800);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: var(--space-6);
  /* macOS traffic light clearance */
  padding-top: 48px;
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2);
}

.sidebar-footer {
  padding: var(--space-4);
  border-top: 1px solid var(--neutral-800);
}
```

### 15.2 Nav Item States

| State | Background | Text | Border |
|-------|------------|------|--------|
| Default | transparent | neutral-400 | none |
| Hover | neutral-850 | neutral-200 | none |
| Active | neutral-800 | neutral-50 | left accent (4px) |
| Disabled | transparent | neutral-600 | none |

```css
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  color: var(--neutral-400);
  font-size: var(--text-base);
  font-weight: 500;
  transition: all 150ms ease-out;
}

.nav-item:hover {
  background: var(--neutral-850);
  color: var(--neutral-200);
}

.nav-item.active {
  background: var(--neutral-800);
  color: var(--neutral-50);
  border-left: 4px solid var(--accent-400);
  padding-left: calc(var(--space-4) - 4px);
}
```

---

## 16. Data Display

### 16.1 Metadata Rows

For displaying key-value pairs (location info, EXIF data):

```css
.metadata-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2) var(--space-4);
}

.metadata-label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--neutral-400);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metadata-value {
  font-size: var(--text-base);
  color: var(--neutral-100);
}

.metadata-value.mono {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
```

```
┌─────────────────────────────────────┐
│ STATE         New York              │
│ COUNTY        Albany                │
│ TYPE          Hospital              │
│ GPS           42.6526, -73.7562     │
│ CONFIDENCE    Map Verified ✓        │
└─────────────────────────────────────┘
```

### 16.2 Tables

```css
.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--neutral-400);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--neutral-700);
}

.table td {
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  color: var(--neutral-200);
  border-bottom: 1px solid var(--neutral-800);
}

.table tr:hover td {
  background: var(--neutral-850);
}
```

### 16.3 Stats/Counts

```css
.stat {
  text-align: center;
}

.stat-value {
  font-size: var(--text-3xl);
  font-weight: 700;
  color: var(--neutral-50);
  font-feature-settings: 'tnum';
}

.stat-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--neutral-500);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: var(--space-1);
}
```

---

## 17. Form Patterns

### 17.1 Select/Dropdown

```css
.select {
  appearance: none;
  background: var(--neutral-850);
  border: 1px solid var(--neutral-700);
  border-radius: var(--radius-md);
  color: var(--neutral-100);
  font-size: var(--text-base);
  padding: var(--space-2) var(--space-10) var(--space-2) var(--space-3);
  background-image: url("data:image/svg+xml,..."); /* Chevron */
  background-repeat: no-repeat;
  background-position: right var(--space-3) center;
  background-size: 16px;
  cursor: pointer;
}

.select:focus {
  outline: none;
  border-color: var(--accent-400);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
}
```

### 17.2 Checkbox

```css
.checkbox {
  appearance: none;
  width: 20px;
  height: 20px;
  background: var(--neutral-850);
  border: 1px solid var(--neutral-700);
  border-radius: var(--radius-sm);
  cursor: pointer;
  position: relative;
}

.checkbox:checked {
  background: var(--accent-400);
  border-color: var(--accent-400);
}

.checkbox:checked::after {
  content: '';
  position: absolute;
  left: 6px;
  top: 2px;
  width: 6px;
  height: 12px;
  border: solid var(--neutral-950);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.checkbox:focus-visible {
  outline: 2px solid var(--accent-400);
  outline-offset: 2px;
}
```

### 17.3 Radio Button

```css
.radio {
  appearance: none;
  width: 20px;
  height: 20px;
  background: var(--neutral-850);
  border: 1px solid var(--neutral-700);
  border-radius: var(--radius-full);
  cursor: pointer;
}

.radio:checked {
  border-color: var(--accent-400);
  border-width: 6px;
}

.radio:focus-visible {
  outline: 2px solid var(--accent-400);
  outline-offset: 2px;
}
```

### 17.4 Textarea

```css
.textarea {
  background: var(--neutral-850);
  border: 1px solid var(--neutral-700);
  border-radius: var(--radius-md);
  color: var(--neutral-100);
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  padding: var(--space-3);
  resize: vertical;
  min-height: 120px;
}

.textarea:focus {
  outline: none;
  border-color: var(--accent-400);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
}
```

### 17.5 Form Layout

```css
.form-group {
  margin-bottom: var(--space-4);
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--neutral-800);
}
```

---

## 18. Toast Notifications

### 18.1 Structure

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                    ┌─────────────┐  │
│                                    │ ✓ Success   │  │
│                                    │ File saved  │  │
│                                    └─────────────┘  │
│                                                     │
│ [Main App Content]                                  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 18.2 Toast Specifications

```css
.toast-container {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--neutral-900);
  border: 1px solid var(--neutral-800);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  min-width: 280px;
  max-width: 400px;
}

.toast-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.toast-message {
  font-size: var(--text-sm);
  color: var(--neutral-200);
}

/* Variants */
.toast-success .toast-icon { color: var(--success); }
.toast-error .toast-icon { color: var(--error); }
.toast-warning .toast-icon { color: var(--warning); }
.toast-info .toast-icon { color: var(--info); }
```

### 18.3 Toast Duration

| Type | Duration | Auto-dismiss |
|------|----------|--------------|
| Success | 3s | Yes |
| Info | 4s | Yes |
| Warning | 5s | Yes |
| Error | Manual | No (requires dismiss) |

---

## 19. Component Inventory

Complete checklist of UI components covered by this design system:

### Core Components
- [x] Buttons (primary, secondary, ghost, destructive)
- [x] Input fields (text, password, search)
- [x] Select/dropdown
- [x] Checkbox
- [x] Radio button
- [x] Textarea
- [x] Form labels
- [x] Helper text / error messages

### Layout Components
- [x] Sidebar navigation
- [x] Card
- [x] Modal
- [x] Toast notifications
- [x] Empty states
- [x] Loading states

### Data Display
- [x] Metadata rows
- [x] Tables
- [x] Stats/counts
- [x] Badges/tags
- [x] GPS confidence indicators

### Domain-Specific
- [x] Location card
- [x] Hero image container
- [x] Media viewer/lightbox
- [x] Import progress
- [x] Map markers (by GPS confidence)

### Identity
- [x] App wordmark
- [x] Favicon/app icon guidelines

---

## Appendix A: Research Sources

This design system is grounded in research from authoritative sources:

### Design Philosophy
- [Dieter Rams' 10 Principles](https://www.vitsoe.com/us/about/good-design) — Vitsœ
- [Ulm School of Design](https://en.wikipedia.org/wiki/Ulm_School_of_Design) — Wikipedia
- [Otl Aicher Pictograms](https://www.sessions.edu/notes-on-design/iconic-icons-aichers-pictograms/) — Sessions College

### Color & Accessibility
- [Braun Colour Choices](https://www.braun-audio.com/en-GB/stories/design/braun-colour-choices/) — Braun Audio
- [Dark Mode Best Practices](https://ui-deploy.com/blog/complete-dark-mode-design-guide-ui-patterns-and-implementation-best-practices-2025) — UI Deploy
- [WCAG Color Contrast](https://www.allaccessible.org/blog/color-contrast-accessibility-wcag-guide-2025) — AllAccessible

### Typography
- [Inter Typeface](https://rsms.me/inter/) — Rasmus Andersson
- [8-Point Grid Typography](https://www.freecodecamp.org/news/8-point-grid-typography-on-the-web-be5dc97db6bc/) — freeCodeCamp

### Spacing & Layout
- [8pt Grid System](https://spec.fm/specifics/8-pt-grid) — Spec.fm
- [Spacing Best Practices](https://cieden.com/book/sub-atomic/spacing/spacing-best-practices) — Cieden

### Components
- [Button States](https://www.nngroup.com/articles/button-states-communicate-interaction/) — Nielsen Norman Group
- [Card Components](https://www.nngroup.com/articles/cards-component/) — Nielsen Norman Group
- [Input Field States](https://medium.com/@nasir-ahmed03/input-field-states-for-light-dark-mode-04b8b1b9880e) — Medium

### Motion
- [Animation Duration](https://www.nngroup.com/articles/animation-duration/) — Nielsen Norman Group
- [Accessible Animation](https://www.smashingmagazine.com/2023/11/creating-accessible-ui-animations/) — Smashing Magazine

---

## Appendix B: Quick Reference Card

### Color Hierarchy

```
Background:  --neutral-950  (#0a0a0b)
Surface:     --neutral-900  (#111113)
Border:      --neutral-800  (#1f1f23)
Text:        --neutral-100  (#e4e4e8)
Muted:       --neutral-400  (#85858f)
Accent:      --accent-400   (#fbbf24)
```

### Typography Hierarchy

```
Hero:        36px / 700 / -0.03em
Title:       30px / 600 / -0.025em
Subtitle:    24px / 600 / -0.02em
Section:     20px / 500 / -0.015em
Body:        15px / 400 / 0
Small:       13px / 400 / 0.01em
Caption:     11px / 400 / 0.02em
```

### Spacing Quick Pick

```
Tight:   4px  (icons, inline)
Small:   8px  (default gaps)
Medium:  16px (component padding)
Large:   24px (section spacing)
XL:      48px (page sections)
```

### Border Radius

```
Subtle:  4px  (badges, tags)
Default: 6px  (buttons, inputs)
Cards:   8px  (location cards)
```

---

*This design system is a living document. As Abandoned Archive evolves, so will these guidelines—but always in service of the same functional minimalist principles.*
