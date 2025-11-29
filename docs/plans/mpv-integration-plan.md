# MPV Integration Plan

## Goal
Replace Electron's HTML5 `<video>` element with MPV player for professional-grade video playback that handles all codecs, rotation, and scrubbing correctly.

## Problem Statement
Current video playback in Electron suffers from:
- No scrubbing (range requests not working)
- iPhone videos display incorrectly (rotation/displaymatrix issues)
- Limited codec support (HEVC/H.265 problematic)
- Slow, clunky performance with 4K content
- Memory-heavy Chromium-based playback

## Solution: MPV Integration
MPV is the gold-standard open-source video player:
- **License**: LGPL/GPL (open source, compatible)
- **Codecs**: All formats including HEVC, Dolby Vision, ProRes
- **Rotation**: Automatic displaymatrix handling
- **Performance**: Hardware accelerated, handles 4K+ easily
- **Scrubbing**: Full timeline scrubbing support
- **Cross-platform**: macOS, Windows, Linux

## Architecture

```
User clicks video → MediaViewer detects video type → Launches MPV subprocess
                                                   ↓
                                            MPV plays video
                                                   ↓
                                            User closes MPV
                                                   ↓
                                            Returns to archive
```

## Implementation Phases

### Phase 1: MpvService (electron/services/mpv-service.ts)
- Detect MPV installation on system
- Launch MPV with appropriate flags
- Handle platform differences (macOS/Windows/Linux)
- Graceful fallback to system player if MPV not installed

### Phase 2: IPC Integration
- Add `media:playVideo` handler
- Wire through preload bridge
- Add TypeScript types

### Phase 3: UI Integration
- Update MediaViewer to launch MPV for video playback
- Show poster frame as preview
- "Play" button or click to launch
- Premium UX with loading states

### Phase 4: Testing & Verification
- Test iPhone HEVC videos (rotation)
- Test 4K content
- Test various formats (MOV, MP4, MKV)
- Verify fallback behavior

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `electron/services/mpv-service.ts` | CREATE | MPV detection and launch service |
| `electron/main/ipc-handlers/media-processing.ts` | MODIFY | Add playVideo handler |
| `electron/preload/index.ts` | MODIFY | Add playVideo method |
| `electron/preload/preload.cjs` | MODIFY | Add playVideo method |
| `src/types/electron.d.ts` | MODIFY | Add playVideo type |
| `src/components/MediaViewer.svelte` | MODIFY | Use MPV for video playback |

## MPV Launch Arguments

```bash
mpv \
  --no-terminal \           # Don't use terminal for output
  --force-window=yes \      # Always create window
  --autofit=80% \           # Window size
  --title="AU Archive - Video Player" \
  --osd-level=1 \           # Show OSD
  --keep-open=yes \         # Keep window open after video ends
  "/path/to/video.mov"
```

## Fallback Strategy

1. Check if `mpv` binary exists in PATH
2. On macOS, also check `/opt/homebrew/bin/mpv` and `/usr/local/bin/mpv`
3. If MPV not found, fall back to `shell.openPath()` (system default player)
4. Show one-time notification about MPV for best experience

## CLAUDE.md Compliance Audit

| Principle | Compliance | Notes |
|-----------|------------|-------|
| Binary Dependencies Welcome | ✅ | MPV is explicitly encouraged per rule #8 |
| Archive-First | ✅ | Serves media viewing workflow |
| Open Source + Verify Licenses | ✅ | MPV is LGPL/GPL |
| Offline-First | ✅ | MPV works completely offline |
| Keep It Simple | ✅ | Simple subprocess launch, no complex embedding |
| Scope Discipline | ✅ | Focused on video playback improvement |

## User Experience Flow

1. User opens location detail page
2. User clicks video thumbnail in gallery
3. MediaViewer opens showing video poster frame
4. Large "Play" button overlay on video
5. User clicks Play → MPV launches with video
6. User watches video in MPV (full controls, scrubbing, etc.)
7. User closes MPV → Returns to MediaViewer
8. User can continue browsing or close MediaViewer

## Success Criteria

- [ ] Videos play correctly with proper rotation
- [ ] Full scrubbing/seeking support
- [ ] 4K HEVC content plays smoothly
- [ ] Graceful fallback when MPV not installed
- [ ] Premium, polished UX
- [ ] No regression in existing functionality
