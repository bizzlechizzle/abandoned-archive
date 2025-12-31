# Design Language — Abandoned Archive

Design decisions and patterns. Reference before any UI work.

**Full specifications:** `@docs/DESIGN_SYSTEM.md`

---

## Philosophy

**Ulm School / Braun / Functional Minimalism**

> "Less, but better." — Dieter Rams

| Principle | Application |
|-----------|-------------|
| Photography is the hero | UI recedes. Images dominate. Interface elements are tools, not decorations. |
| Functional over decorative | Every element serves a purpose. If it doesn't help the researcher, it doesn't exist. |
| Honest materials | Show real data. No placeholder glamor. Metadata exposed truthfully. |
| Systematic consistency | Grid-based layouts. Predictable spacing. Repeatable patterns. |
| Quiet confidence | Premium through restraint, not ornamentation. |
| Timeless over trendy | Should look appropriate in 5+ years. |

---

## Quick Reference

### Colors

```
Dark Mode (default):
  Background:  #0a0a0b  (--neutral-950)
  Surface:     #111113  (--neutral-900)
  Border:      #1f1f23  (--neutral-800)
  Text:        #e4e4e8  (--neutral-100)
  Muted:       #85858f  (--neutral-400)
  Accent:      #fbbf24  (--accent-400)

Light Mode:
  Background:  #fafafa  (--neutral-50)
  Surface:     #f4f4f5  (--neutral-100)
  Border:      #d4d4d8  (--neutral-200)
  Text:        #09090b  (--neutral-900)
  Muted:       #52525b  (--neutral-500)
  Accent:      #f59e0b  (--accent-500)
```

### Typography

- **Font:** Inter (variable)
- **Mono:** JetBrains Mono (hashes, coordinates)
- **Scale:** 11px / 13px / 15px / 17px / 20px / 24px / 30px / 36px

### Spacing

- **Base unit:** 8px
- **Scale:** 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px
- **Rule:** Internal padding ≤ external spacing

### Border Radius

- **Subtle:** 4px (badges)
- **Default:** 6px (buttons, inputs)
- **Cards:** 8px

---

## Anti-Patterns (Never Do)

| Avoid | Why |
|-------|-----|
| Saturated colors | Creates visual noise; competes with photography |
| Drop shadows everywhere | Visual debt; feels dated |
| Rounded corners > 8px | Feels playful; undermines seriousness |
| Animations for delight | Motion should inform, not entertain |
| Pure black (#000000) | Eye strain; harsh contrast |
| Gradients on images | Gradient overlays obscure photography |
| Decorative illustrations | Adds no functional value |
| Skeleton loading animations | Static placeholders only |

---

## Key Decisions

### No Logo

Typography-only wordmark. "ABANDONED ARCHIVE" in Inter, stacked, uppercase.

```css
.app-wordmark {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-text-primary);
}
```

### Hero Images: No Gradient

Solid metadata bar below image—not gradient overlay on image.

```
┌─────────────────────────────────────┐
│         HERO IMAGE                  │  ← Full bleed, no overlay
│         (pure photograph)           │
├─────────────────────────────────────┤
│ LOCATION NAME                       │  ← Solid bar (--color-surface)
│ Sub-locations · links               │
├─────────────────────────────────────┤
│ GPS Confidence Bar (4px)            │  ← Color indicates confidence
└─────────────────────────────────────┘
```

### Theme: User Choice

Three options in Settings:
- **Light** (default) — Clean, professional appearance
- **Dark** — Suits moody urbex photography
- **System** — Follows OS preference

### GPS Confidence Colors

| Confidence | Color | Hex |
|------------|-------|-----|
| Map-confirmed | Green | #22c55e |
| High (EXIF) | Blue | #3b82f6 |
| Medium (reverse) | Amber | #eab308 |
| Low (manual) | Red | #ef4444 |
| None | Gray | #6b7280 |

---

## Component Patterns

### Buttons

```css
/* Primary: Amber accent, dark text */
.btn-primary {
  background: var(--color-accent);
  color: var(--neutral-950);
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 500;
}

/* Secondary: Border only */
.btn-secondary {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
}

/* Ghost: No border, hover reveals */
.btn-ghost {
  background: transparent;
  color: var(--color-text-secondary);
}
```

### Cards

```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  overflow: hidden;
}

.card-image {
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.card-content {
  padding: 16px;
}
```

### Inputs

```css
.input {
  background: var(--neutral-850);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 10px 12px;
  color: var(--color-text-primary);
}

.input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
}
```

### Empty States

```
┌─────────────────────────┐
│       [Icon 48px]       │
│                         │
│    No [items] yet       │
│                         │
│    Brief explanation    │
│                         │
│    [Primary Action]     │
└─────────────────────────┘
```

- Quiet, no illustrations
- Informative + actionable
- Consistent structure across app

### Loading States

- **< 300ms:** No indicator (instant)
- **300ms - 2s:** Simple text "Loading..."
- **> 2s:** Progress bar (no animations)

Never use pulsing skeletons or spinners.

---

## Motion

| Token | Duration | Usage |
|-------|----------|-------|
| `--duration-fast` | 100ms | Hover states |
| `--duration-normal` | 150ms | Default transitions |
| `--duration-slow` | 250ms | Modal open/close |

**Easing:** `cubic-bezier(0.25, 0, 0.25, 1)` (ease-out)

**Reduced motion:** Respect `prefers-reduced-motion: reduce`

---

## Accessibility

| Requirement | Value |
|-------------|-------|
| Text contrast | 4.5:1 minimum (WCAG AA) |
| Large text | 3:1 minimum |
| Touch targets | 44×44px minimum |
| Focus states | 2px accent outline, 2px offset |

Never use color alone to convey information—pair with icons/text.

---

## File Locations

| File | Purpose |
|------|---------|
| `docs/DESIGN_SYSTEM.md` | Complete specifications (tokens, components, patterns) |
| `DESIGN.md` (this file) | Quick reference and decisions |
| `packages/desktop/src/styles/` | CSS implementation |

---

## Stop and Ask When

- Considering a visual element not covered here
- Adding a new component type
- Deviating from spacing/color system
- Unsure if something is "functional" or "decorative"

---

## Sources

This design language is grounded in:
- [Dieter Rams' 10 Principles](https://www.vitsoe.com/us/about/good-design)
- [Ulm School of Design](https://en.wikipedia.org/wiki/Ulm_School_of_Design)
- [Braun Colour Choices](https://www.braun-audio.com/en-GB/stories/design/braun-colour-choices/)
- [CSS Dark Mode Guide](https://css-tricks.com/a-complete-guide-to-dark-mode-on-the-web/)
