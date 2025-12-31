# Design System Implementation Plan

**Decision ID:** DESIGN-001
**Date:** 2025-12-03
**Status:** Proposed

---

## Summary

This document outlines all changes needed to align the Abandoned Archive codebase with the new design system (`DESIGN.md` and `docs/DESIGN_SYSTEM.md`).

---

## Current State vs Target State

| Aspect | Current | Target |
|--------|---------|--------|
| Theme | Light only (cream #fffbf7) | Dark default + Light + System toggle |
| Branding | Logo image + "Archive Tool" | Text wordmark only |
| Hero images | Gradient overlay | Solid metadata bar below |
| Colors | Hardcoded, warm cream | CSS custom properties, cool zinc |
| Typography | Mixed fonts | Inter (variable) + JetBrains Mono |
| Spacing | Inconsistent | 8px grid system |
| Border radius | Mixed values | 4px / 6px / 8px only |

---

## Implementation Phases

### Phase 1: Foundation (CSS Tokens)

**Files to create:**
- `packages/desktop/src/styles/tokens.css` — All CSS custom properties
- `packages/desktop/src/styles/theme.css` — Theme switching logic

**Changes:**

```css
/* packages/desktop/src/styles/tokens.css */

:root {
  /* Neutral Scale (Dark Mode) */
  --neutral-950: #0a0a0b;
  --neutral-900: #111113;
  /* ... full scale from DESIGN_SYSTEM.md */

  /* Accent Scale */
  --accent-400: #fbbf24;
  /* ... full scale */

  /* Semantic aliases - these change per theme */
  --color-bg: var(--neutral-950);
  --color-surface: var(--neutral-900);
  /* ... */
}

[data-theme="light"] {
  --color-bg: var(--neutral-50);
  /* ... */
}
```

**Import in:** `packages/desktop/src/app.css` or main entry

---

### Phase 2: Theme Toggle

**Files to modify:**
- `packages/desktop/src/pages/Settings.svelte` — Add theme selector
- `packages/desktop/electron/main/database.ts` — Ensure `theme` setting exists
- `packages/desktop/src/App.svelte` — Apply theme on mount

**Settings UI:**

```svelte
<!-- Theme selector in Settings.svelte -->
<div class="setting-group">
  <label class="setting-label">Theme</label>
  <div class="theme-options">
    <button class:active={theme === 'dark'} onclick={() => setTheme('dark')}>
      Dark
    </button>
    <button class:active={theme === 'light'} onclick={() => setTheme('light')}>
      Light
    </button>
    <button class:active={theme === 'system'} onclick={() => setTheme('system')}>
      System
    </button>
  </div>
</div>
```

**App.svelte theme application:**

```svelte
<script>
  onMount(async () => {
    const settings = await window.electronAPI.settings.getAll();
    const theme = settings.theme || 'dark';
    applyTheme(theme);
  });

  function applyTheme(theme: 'dark' | 'light' | 'system') {
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }
</script>
```

---

### Phase 3: Navigation/Branding

**Files to modify:**
- `packages/desktop/src/components/Navigation.svelte`
- Remove: `packages/desktop/src/assets/abandoned-upstate-logo.png` (or keep for legacy)

**Before:**
```svelte
<img src={logo} alt="Abandoned Upstate" class="h-20 w-auto mx-auto mb-2" />
<p class="text-sm font-heading font-semibold text-accent tracking-wide">Archive Tool</p>
```

**After:**
```svelte
<div class="app-wordmark">
  <span>ABANDONED</span>
  <span>ARCHIVE</span>
</div>

<style>
  .app-wordmark {
    display: flex;
    flex-direction: column;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--color-text-primary);
    line-height: 1.4;
    text-align: center;
  }
</style>
```

---

### Phase 4: Hero Image Treatment

**Files to modify:**
- `packages/desktop/src/components/location/LocationHero.svelte`
- `packages/desktop/src/pages/LocationDetail.svelte`

**Current:** Gradient overlay on image (lines 128-142 in LocationHero.svelte)

```svelte
<!-- REMOVE this gradient div -->
<div
  class="absolute bottom-0 left-0 right-0 h-[80%] pointer-events-none"
  style="background: linear-gradient(to top, #fffbf7 0%, ...);"
></div>
```

**New structure:**

```svelte
<!-- LocationHero.svelte - simplified -->
<div class="hero-container">
  <img src={heroSrc} class="hero-image" />
</div>

<!-- LocationDetail.svelte - metadata bar BELOW hero -->
<LocationHero {images} {heroImgsha} />

<div class="hero-metadata-bar">
  <h1 class="hero-title">{heroDisplayName}</h1>
  {#if sublocations.length > 0}
    <div class="hero-subtitle">
      {#each sublocations as subloc}
        <button onclick={() => navigate(subloc)}>{subloc.subnam}</button>
      {/each}
    </div>
  {/if}
</div>

<div class="gps-confidence-bar" style="background: var(--gps-{confidence})"></div>
```

---

### Phase 5: Color Migration

**Files to update:** All `.svelte` files with hardcoded colors

**Common replacements:**

| Current | Replace With |
|---------|--------------|
| `#fffbf7` | `var(--color-bg)` |
| `#fff8f2` | `var(--color-surface)` |
| `bg-gray-100` | `bg-[var(--color-surface)]` |
| `text-gray-500` | `text-[var(--color-text-muted)]` |
| `border-gray-200` | `border-[var(--color-border)]` |
| `#b9975c` (old accent) | `var(--color-accent)` |
| `bg-accent` | `bg-[var(--color-accent)]` |

**Strategy:** Use find/replace with review, not blind replacement.

---

### Phase 6: Typography

**Files to update:**
- `packages/desktop/src/app.css` — Base font styles
- All components using font classes

**Add to app.css:**

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 15px;
  line-height: 24px;
  -webkit-font-smoothing: antialiased;
}

.mono {
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
}
```

**Or for offline:** Bundle Inter as a local asset.

---

### Phase 7: Component Updates

**Buttons:**
```css
.btn-primary {
  background: var(--color-accent);
  color: var(--neutral-950);
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: 500;
}
```

**Cards:**
```css
.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 8px;
}
```

**Inputs:**
```css
.input {
  background: var(--neutral-850);
  border: 1px solid var(--color-border);
  border-radius: 6px;
}

.input:focus {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.15);
}
```

---

## Files Requiring Changes

### High Priority (Phase 1-3)
- [ ] `packages/desktop/src/styles/tokens.css` (new)
- [ ] `packages/desktop/src/styles/theme.css` (new)
- [ ] `packages/desktop/src/app.css`
- [ ] `packages/desktop/src/App.svelte`
- [ ] `packages/desktop/src/pages/Settings.svelte`
- [ ] `packages/desktop/src/components/Navigation.svelte`

### Medium Priority (Phase 4-5)
- [ ] `packages/desktop/src/components/location/LocationHero.svelte`
- [ ] `packages/desktop/src/pages/LocationDetail.svelte`
- [ ] `packages/desktop/src/pages/Dashboard.svelte`
- [ ] `packages/desktop/src/pages/Locations.svelte`
- [ ] `packages/desktop/src/components/Layout.svelte`

### Lower Priority (Phase 6-7)
- [ ] All modal components
- [ ] All form components
- [ ] Toast components
- [ ] Card components
- [ ] Empty state components

---

## Migration Strategy

1. **Create tokens.css** with all design system values
2. **Add theme toggle** to Settings (default: dark)
3. **Update Navigation** branding
4. **Update LocationHero** to remove gradient
5. **Gradual color migration** — One page at a time
6. **Typography pass** — Update fonts project-wide
7. **Component audit** — Ensure all components use tokens

---

## Testing Checklist

- [ ] Dark mode renders correctly
- [ ] Light mode renders correctly
- [ ] System preference detection works
- [ ] Theme persists across app restart
- [ ] Hero images display without overlay
- [ ] GPS confidence colors are correct in both themes
- [ ] Focus states use accent color
- [ ] All text meets WCAG AA contrast

---

## Rollback Plan

If issues arise:
1. Theme toggle can default to current light mode
2. Keep existing component styles as fallback
3. CSS custom properties gracefully degrade

---

## Notes

- Current cream color (#fffbf7) can be preserved as a "legacy" theme option if users prefer it
- Hero gradient removal is the most visually significant change
- Consider A/B testing with users before full rollout
