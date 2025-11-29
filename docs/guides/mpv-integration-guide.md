# MPV Integration Implementation Guide

## Overview

This guide documents the MPV video player integration for AU Archive, providing professional-grade video playback with full codec support, automatic rotation handling, and smooth scrubbing.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Renderer Process                          │
│  ┌─────────────────┐                                            │
│  │  MediaViewer    │  User clicks "Play Video"                  │
│  │  .svelte        │─────────────────────────────────────┐      │
│  └─────────────────┘                                     │      │
└──────────────────────────────────────────────────────────│──────┘
                                                           │
                           IPC Bridge                      │
                                                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Main Process                             │
│  ┌─────────────────┐      ┌─────────────────┐                   │
│  │  IPC Handler    │─────▶│   MpvService    │                   │
│  │  media:playVideo│      │                 │                   │
│  └─────────────────┘      └────────┬────────┘                   │
│                                    │                             │
│                          ┌─────────┴─────────┐                   │
│                          ▼                   ▼                   │
│                    MPV Installed?      Fallback to               │
│                          │            System Player              │
│                          ▼                                       │
│                    Launch MPV                                    │
│                    subprocess                                    │
└─────────────────────────────────────────────────────────────────┘
```

## Files Modified/Created

### 1. MpvService (`electron/services/mpv-service.ts`)

**Purpose:** Handles MPV detection and video launching

**Key Functions:**
- `checkMpvInstalled()` - Detects if MPV is available on the system
- `playVideo(path, title)` - Launches video in MPV or falls back to system player
- `getInstallInstructions()` - Returns platform-specific install instructions

**Detection Logic:**
1. Check PATH using `which` (Unix) or `where` (Windows)
2. Check platform-specific paths:
   - macOS: `/opt/homebrew/bin/mpv`, `/usr/local/bin/mpv`
   - Windows: `C:\Program Files\mpv\mpv.exe`
   - Linux: `/usr/bin/mpv`, `/usr/local/bin/mpv`

**MPV Launch Arguments:**
```bash
mpv \
  --no-terminal \           # Silent terminal output
  --force-window=yes \      # Always create window
  --autofit=80% \           # 80% of screen size
  --title="AU Archive - Video" \
  --osd-level=1 \           # Minimal OSD
  --keep-open=yes \         # Keep window after video ends
  --hr-seek=yes \           # High-quality seeking
  "/path/to/video.mov"
```

### 2. IPC Handlers (`electron/main/ipc-handlers/media-processing.ts`)

**New Handlers:**
- `media:playVideo` - Play video via MpvService with security validation
- `media:checkMpvStatus` - Check if MPV is installed

**Security:**
- Path validation ensures file is within archive folder
- Zod schema validation for all inputs

### 3. Preload Bridge (`electron/preload/index.ts`, `preload.cjs`)

**New Methods:**
```typescript
media: {
  playVideo: (videoPath: string, title?: string) => Promise<PlayResult>
  checkMpvStatus: () => Promise<MpvStatus>
}
```

### 4. TypeScript Types (`src/types/electron.d.ts`)

**Added Types:**
```typescript
playVideo: (videoPath: string, title?: string) => Promise<{
  success: boolean;
  method: 'mpv' | 'system' | 'failed';
  message?: string;
}>;

checkMpvStatus: () => Promise<{
  installed: boolean;
  path: string | null;
  version: string | null;
  installInstructions: string;
}>;
```

### 5. MediaViewer (`src/components/MediaViewer.svelte`)

**Changes:**
- Replaced inline `<video>` element with poster image + play button
- Added `playVideoInMpv()` function
- Added loading state and success message display

**UI Flow:**
1. Display video poster/thumbnail
2. Show large "Play Video" button overlay
3. On click, launch MPV via IPC
4. Show success/error message briefly

## Usage

### For Users

**With MPV Installed:**
1. Click on video in gallery
2. MediaViewer shows poster with "Play Video" button
3. Click play → MPV opens with full playback controls
4. Close MPV → Return to archive

**Without MPV:**
1. Same flow, but opens in system default player (QuickTime, VLC, etc.)
2. One-time message suggests installing MPV for best experience

### Installing MPV

**macOS (Homebrew):**
```bash
brew install mpv
```

**Windows (winget):**
```bash
winget install mpv
```

**Linux (apt):**
```bash
sudo apt install mpv
```

## CLAUDE.md Compliance

| Principle | Status | Notes |
|-----------|--------|-------|
| Binary Dependencies Welcome | ✅ | MPV is explicitly encouraged |
| Archive-First | ✅ | Improves media viewing workflow |
| Open Source + Verify Licenses | ✅ | MPV is LGPL/GPL licensed |
| Offline-First | ✅ | MPV works completely offline |
| Keep It Simple | ✅ | Simple subprocess launch |
| Scope Discipline | ✅ | Focused on video playback |
| IPC Channel Naming | ✅ | Uses `media:playVideo` format |
| Security | ✅ | Path validation, Zod schemas |

## Testing Checklist

- [x] MPV detection on macOS
- [x] Fallback to system player when MPV not installed
- [x] Security validation (files must be in archive folder)
- [x] TypeScript compilation
- [x] Preload bridge wiring
- [ ] iPhone HEVC video rotation (requires MPV)
- [ ] 4K video playback performance
- [ ] Windows/Linux compatibility

## Troubleshooting

### MPV Not Launching
1. Verify MPV is installed: `which mpv` or `where mpv`
2. Check console for error messages
3. Try fallback: video should open in system player

### Video Still Wrong Orientation
- With MPV: Rotation is handled automatically via displaymatrix
- Without MPV: System player should handle it (QuickTime does)
- If still wrong: The video file may have unusual metadata

### Scrubbing Not Working
- With MPV: Full scrubbing support
- Without MPV: Depends on system player and video format

## Future Enhancements

1. **MPV Bundling** - Bundle MPV with app for guaranteed availability
2. **IPC Control** - Use MPV's JSON IPC for advanced control
3. **Picture-in-Picture** - Launch MPV in PiP mode
4. **Proxy Videos** - Generate web-friendly proxies for quick preview
