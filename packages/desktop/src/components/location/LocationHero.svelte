<script lang="ts">
  /**
   * LocationHero - Hero image display (pure photograph, no overlay)
   * DESIGN_SYSTEM: Ulm School / Functional Minimalism
   * - Photography is the hero - no gradient overlays
   * - Solid metadata bar handled by parent (LocationDetail)
   * Per LILBITS: ~100 lines, single responsibility
   * Per PUEA: Show placeholder with import prompt if no images
   * Migration 22: Uses focal point from location data
   * Issue 1: Added quality indicator and regenerate option
   */
  import type { MediaImage } from './types';
  import { thumbnailCache } from '../../stores/thumbnail-cache-store';

  interface Props {
    images: MediaImage[];
    heroImgsha: string | null;
    focalX?: number; // 0-1, default 0.5 (center)
    focalY?: number; // 0-1, default 0.5 (center)
    onRegeneratePreview?: (imgsha: string) => Promise<void>;
  }

  let { images, heroImgsha, focalX = 0.5, focalY = 0.5, onRegeneratePreview }: Props = $props();

  // Cache version for busting browser cache after thumbnail regeneration
  const cacheVersion = $derived($thumbnailCache);

  const heroImage = $derived(
    heroImgsha
      ? images.find(img => img.imgsha === heroImgsha) || images[0]
      : images[0]
  );

  const heroSrc = $derived(
    heroImage
      ? heroImage.preview_path || heroImage.thumb_path_lg || heroImage.thumb_path_sm || heroImage.thumb_path
      : null
  );

  // Issue 1: Determine quality level (for showing warning when using low-quality fallback)
  type QualityLevel = 'preview' | 'large' | 'medium' | 'small' | 'none';
  const qualityLevel = $derived<QualityLevel>(() => {
    if (!heroImage) return 'none';
    if (heroImage.preview_path) return 'preview';
    if (heroImage.thumb_path_lg) return 'large';
    if (heroImage.thumb_path_sm) return 'medium';
    if (heroImage.thumb_path) return 'small';
    return 'none';
  });

  // Show warning for low quality (small or legacy thumb only)
  const isLowQuality = $derived(qualityLevel() === 'small' || qualityLevel() === 'medium');

  // Regenerate state
  let regenerating = $state(false);
  let regenerateError = $state<string | null>(null);

  async function handleRegenerate() {
    if (!heroImage || !onRegeneratePreview || regenerating) return;
    regenerating = true;
    regenerateError = null;
    try {
      await onRegeneratePreview(heroImage.imgsha);
    } catch (err) {
      regenerateError = err instanceof Error ? err.message : 'Failed to regenerate';
    } finally {
      regenerating = false;
    }
  }

  // Convert focal point (0-1) to object-position percentage
  const objectPosition = $derived(`${focalX * 100}% ${focalY * 100}%`);
</script>

<!-- DESIGN_SYSTEM: Hero with 2.35:1 aspect, capped at 40vh, NO gradient overlay -->
{#if images.length > 0 && heroImage}
  <div class="hero-container">
    <div class="hero-wrapper">
      {#if heroSrc}
        <img
          src={`media://${heroSrc}?v=${cacheVersion}`}
          alt={heroImage.imgnam || 'Hero Image'}
          class="hero-image"
          style="object-position: {objectPosition};"
        />
        <!-- Issue 1: Quality indicator and regenerate button for low-quality hero -->
        {#if isLowQuality && onRegeneratePreview}
          <div class="quality-indicator">
            <span class="quality-badge">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Low Quality
            </span>
            <button
              onclick={handleRegenerate}
              disabled={regenerating}
              class="regenerate-btn"
              title="Regenerate higher quality preview"
            >
              {#if regenerating}
                <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              {:else}
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              {/if}
              {regenerating ? 'Generating...' : 'Regenerate'}
            </button>
          </div>
        {/if}
        {#if regenerateError}
          <div class="error-toast">
            {regenerateError}
          </div>
        {/if}
      {:else}
        <div class="hero-placeholder">
          <svg class="w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      {/if}
      <!-- DESIGN_SYSTEM: NO gradient overlay - pure photograph per DESIGN.md -->
    </div>
  </div>
{:else}
  <!-- PUEA: Graceful empty state - matches hero constraints -->
  <div class="hero-container">
    <div class="hero-wrapper hero-empty">
      <div class="empty-content">
        <svg class="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p class="text-lg">No Hero Image</p>
        <p class="text-sm mt-1">Import images to set a hero image</p>
      </div>
    </div>
  </div>
{/if}

<style>
  /* DESIGN_SYSTEM: Hero uses design tokens, no gradient overlay */
  .hero-container {
    width: 100%;
    background: var(--color-bg);
  }

  .hero-wrapper {
    position: relative;
    width: 100%;
    max-height: 40vh;
    margin: 0 auto;
    overflow: hidden;
    aspect-ratio: 2.35 / 1;
  }

  .hero-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .hero-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-muted);
  }

  .hero-empty {
    background: var(--color-surface);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-content {
    text-align: center;
    color: var(--color-text-muted);
  }

  .quality-indicator {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    z-index: 10;
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .quality-badge {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: rgba(245, 158, 11, 0.9); /* warning color with opacity */
    color: white;
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-sm);
  }

  .regenerate-btn {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    background: rgba(255, 255, 255, 0.9);
    color: var(--neutral-700);
    font-size: var(--text-xs);
    font-weight: var(--font-medium);
    border-radius: var(--radius-full);
    box-shadow: var(--shadow-sm);
    transition: background var(--duration-fast) var(--ease-out);
  }

  .regenerate-btn:hover {
    background: white;
  }

  .regenerate-btn:disabled {
    opacity: 0.5;
  }

  .error-toast {
    position: absolute;
    top: 48px;
    right: var(--space-3);
    z-index: 10;
    padding: var(--space-1) var(--space-2);
    background: rgba(239, 68, 68, 0.9); /* error color with opacity */
    color: white;
    font-size: var(--text-xs);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow-sm);
  }
</style>
