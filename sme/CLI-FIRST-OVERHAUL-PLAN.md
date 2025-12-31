# Abandoned Archive: CLI-First Overhaul Plan

**Version:** 1.0.0
**Date:** 2024-12-24
**Status:** APPROVED FOR IMPLEMENTATION

---

## Executive Summary

This document outlines a comprehensive plan to refactor Abandoned Archive from a GUI-first Electron application to a CLI-first architecture. The goal is to create a bulletproof, testable, maintainable application where all business logic is accessible via command-line interface, with the GUI serving as a thin presentation layer.

### Key Principles

1. **CLI-First**: Every feature accessible via typed CLI commands before GUI
2. **Service Layer Consolidation**: Reduce 138 services to ~15 domain modules
3. **Complete Testing**: 80%+ code coverage with unit, integration, and E2E tests
4. **Documentation**: SME-quality documentation for every component
5. **No Deferrals**: Build complete - no "V2" or TODO markers

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Target Architecture](#2-target-architecture)
3. [Gap Analysis](#3-gap-analysis)
4. [Implementation Phases](#4-implementation-phases)
5. [CLI Command Specification](#5-cli-command-specification)
6. [Testing Strategy](#6-testing-strategy)
7. [Documentation Requirements](#7-documentation-requirements)
8. [Risk Assessment](#8-risk-assessment)
9. [Success Criteria](#9-success-criteria)

---

## 1. Current State Analysis

### 1.1 Architecture Overview

| Component | Current State | Issues |
|-----------|--------------|--------|
| **Services** | 138 files, ~41K LoC | Over-granular, inconsistent patterns |
| **Database** | 176KB monolithic file, 45+ tables | Hard to maintain, no migration files |
| **IPC Handlers** | 456 handlers, 32 files | Tightly coupled to Electron |
| **CLI** | Only mapcombine (6 commands) | Most features GUI-only |
| **Tests** | ~15K LoC, 36% ratio | Low coverage, no component tests |
| **Documentation** | Scattered, outdated | No SME-quality guides |

### 1.2 Feature Inventory

**Currently Implemented:**
- Location CRUD (create, read, update, delete, merge)
- Media import (images, videos, documents)
- GPS extraction and geocoding
- Thumbnail generation (via shoemaker)
- BLAKE3 hashing (via wake-n-blake)
- Reference map import and deduplication
- Web source scraping and image download
- Date extraction with ML
- VLM image tagging
- BagIt archival format
- Monitoring and alerting
- Job queue with dead letter

**GUI-Only Features (No CLI):**
- All location management
- Media import pipeline
- Geocoding and address normalization
- Thumbnail generation
- Reference map operations
- Web scraping
- AI/ML tagging
- Export/backup
- Database management

### 1.3 National Treasure Reference

National Treasure provides the CLI-first blueprint:
- **Typer** for CLI framework (Python equivalent of Commander.js)
- **Rich** for terminal UI (spinners, tables, progress bars)
- **Nested subcommands** (capture, queue, training, learning, db)
- **Async context managers** for resource cleanup
- **Thompson Sampling** for ML learning loop
- **SQLite job queue** with priorities

---

## 2. Target Architecture

### 2.1 Package Structure

```
packages/
├── cli/                    # NEW: CLI package
│   ├── src/
│   │   ├── commands/       # Command implementations
│   │   │   ├── location.ts
│   │   │   ├── media.ts
│   │   │   ├── import.ts
│   │   │   ├── export.ts
│   │   │   ├── refmap.ts
│   │   │   ├── web.ts
│   │   │   ├── ai.ts
│   │   │   ├── queue.ts
│   │   │   └── db.ts
│   │   ├── output/         # Output formatters
│   │   │   ├── table.ts
│   │   │   ├── json.ts
│   │   │   ├── progress.ts
│   │   │   └── spinner.ts
│   │   ├── cli.ts          # Main entry point
│   │   └── config.ts       # CLI configuration
│   ├── tests/
│   └── package.json
│
├── services/               # NEW: Consolidated services
│   ├── src/
│   │   ├── location/       # Location domain
│   │   │   ├── location-service.ts
│   │   │   ├── geocoding-service.ts
│   │   │   ├── address-service.ts
│   │   │   └── index.ts
│   │   ├── media/          # Media domain
│   │   │   ├── media-service.ts
│   │   │   ├── thumbnail-service.ts
│   │   │   ├── metadata-service.ts
│   │   │   └── index.ts
│   │   ├── import/         # Import domain
│   │   │   ├── import-service.ts
│   │   │   ├── scanner-service.ts
│   │   │   ├── hash-service.ts
│   │   │   └── index.ts
│   │   ├── refmap/         # Reference maps
│   │   ├── web/            # Web scraping
│   │   ├── ai/             # ML/AI features
│   │   ├── queue/          # Job queue
│   │   ├── archive/        # BagIt, backup
│   │   └── database/       # DB operations
│   ├── tests/
│   └── package.json
│
├── core/                   # Domain models (existing)
├── desktop/                # Electron GUI (refactored)
├── mapcombine/             # GPS CLI (existing)
├── wake-n-blake/           # Hashing backbone
└── shoemaker/              # Thumbnail backbone
```

### 2.2 Dependency Flow

```
                    ┌─────────┐
                    │   CLI   │
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │                     │
         ┌────┴────┐          ┌────┴────┐
         │ Desktop │          │ Scripts │
         └────┬────┘          └────┬────┘
              │                    │
              └──────────┬─────────┘
                         │
                  ┌──────┴──────┐
                  │  Services   │
                  └──────┬──────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────┴────┐    ┌─────┴─────┐   ┌─────┴─────┐
    │  Core   │    │ Wake-n-   │   │ Shoemaker │
    │ Models  │    │  Blake    │   │           │
    └─────────┘    └───────────┘   └───────────┘
```

### 2.3 Service Consolidation

| Current (138 files) | Target (15 modules) |
|---------------------|---------------------|
| exiftool-service, ffmpeg-service, thumbnail-service, poster-frame-service, preview-extractor-service, media-cache-service | **media/** (6 files consolidated) |
| geocoding-service, geocoding-cache, gps-validator, geo-utils, address-service, libpostal-service | **location/** (5 files consolidated) |
| file-import-service, phase-import-service, import-intelligence-service, import-manifest, scanner-service | **import/** (5 files consolidated) |
| websource-orchestrator-service, websource-capture-service, websource-extraction-service, websource-behaviors, image-downloader-service | **web/** (5 files consolidated) |
| date-engine-service, date-extraction-processor, date-parser-service, vlm-enhancement-service, litellm-lifecycle-service, ocr-service | **ai/** (6 files consolidated) |
| ref-map-dedup-service, ref-map-matcher-service, map-parser-service, gpx-kml-parser | **refmap/** (4 files consolidated) |
| bagit-service, bagit-integrity-service, database-archive-service, backup-scheduler, recovery-system | **archive/** (5 files consolidated) |
| job-queue, job-worker-service, maintenance-scheduler | **queue/** (3 files consolidated) |
| health-monitor, logger-service, disk-space-monitor, metrics-collector, tracer, alert-manager | **monitoring/** (6 files consolidated) |
| credential-service, config-service, privacy-sanitizer | **config/** (3 files consolidated) |

---

## 3. Gap Analysis

### 3.1 CLI Feature Gaps

| Feature | Current CLI | Required CLI |
|---------|------------|--------------|
| **Location Management** | None | `aa location list/show/create/update/delete/merge` |
| **Media Import** | None | `aa import scan/run/status/history` |
| **Media Operations** | None | `aa media list/show/thumbnail/metadata/tag` |
| **Export** | None | `aa export bagit/json/csv/backup` |
| **Reference Maps** | None | `aa refmap import/dedup/match/enrich` |
| **Web Scraping** | None | `aa web capture/scrape/download` |
| **AI/ML** | None | `aa ai tag/extract-dates/ocr` |
| **Queue** | None | `aa queue add/status/run/dead-letter` |
| **Database** | None | `aa db init/info/backup/restore/integrity` |
| **GPS Dedup** | mapcombine | Integrate into `aa refmap dedup` |

### 3.2 Testing Gaps

| Area | Current | Required |
|------|---------|----------|
| Unit Tests | ~15K LoC | 40K LoC (80% coverage) |
| Integration Tests | 19 files | 50+ files |
| E2E Tests | 0 | 20+ flows |
| Component Tests | 0 | 61 components |
| CLI Tests | 180 (mapcombine only) | 300+ all commands |
| Performance Tests | 0 | 10+ benchmarks |

### 3.3 Documentation Gaps

| Document | Current | Required |
|----------|---------|----------|
| README.md | Basic | Full CLI reference, examples |
| Developer Guide | techguide.md (500 lines) | SME-quality (2000+ lines) |
| Architecture Guide | Scattered ADRs | Unified ARCHITECTURE.md |
| API Reference | None | Full IPC/CLI reference |
| User Guide | None | End-user documentation |
| Service Guide | None | Per-service documentation |

---

## 4. Implementation Phases

### Phase 1: Foundation (Services Package)
**Duration:** 1 week
**Objective:** Create consolidated services package

**Tasks:**
1. Create `packages/services` with domain structure
2. Migrate and consolidate location services (6 files → 1 module)
3. Migrate and consolidate media services (8 files → 1 module)
4. Migrate and consolidate import services (6 files → 1 module)
5. Create shared utilities (logging, config, errors)
6. Write unit tests for each module (80% coverage)
7. Update desktop to consume new services

**Deliverables:**
- `packages/services/` with location, media, import modules
- 100+ unit tests
- Migration guide for desktop

### Phase 2: CLI Package
**Duration:** 1 week
**Objective:** Create CLI with core commands

**Tasks:**
1. Create `packages/cli` with Commander.js
2. Implement output formatters (table, JSON, progress)
3. Implement `aa location` commands (list, show, create, update, delete)
4. Implement `aa media` commands (list, show, thumbnail, metadata)
5. Implement `aa import` commands (scan, run, status)
6. Implement `aa db` commands (init, info, backup, restore)
7. Write CLI integration tests

**Deliverables:**
- `aa` CLI binary with 20+ commands
- 100+ CLI tests
- CLI reference documentation

### Phase 3: Advanced Features
**Duration:** 1 week
**Objective:** Add advanced CLI commands

**Tasks:**
1. Migrate refmap services, implement `aa refmap` commands
2. Migrate web services, implement `aa web` commands
3. Migrate AI services, implement `aa ai` commands
4. Migrate queue services, implement `aa queue` commands
5. Migrate archive services, implement `aa export` commands
6. Integrate mapcombine as `aa refmap dedup`
7. Write tests for all new commands

**Deliverables:**
- Complete CLI with 50+ commands
- 200+ additional tests
- Feature parity with GUI

### Phase 4: GUI Refactor
**Duration:** 1 week
**Objective:** Refactor GUI to consume services

**Tasks:**
1. Update IPC handlers to call service layer
2. Remove business logic from handlers (thin wrappers)
3. Update Svelte stores to use new service types
4. Add missing TypeScript types
5. Add component tests (61 components)
6. Update error handling to use service errors

**Deliverables:**
- Thin IPC layer (~100 LoC per handler file)
- 61 component tests
- Consistent error handling

### Phase 5: Testing & Quality
**Duration:** 1 week
**Objective:** Achieve 80%+ coverage

**Tasks:**
1. Add missing unit tests (target 40K LoC)
2. Add E2E tests (20+ flows)
3. Add performance benchmarks (10+)
4. Run full audit with static analysis
5. Fix all identified issues
6. Achieve 80%+ code coverage

**Deliverables:**
- 80%+ code coverage
- 0 critical/high issues
- Performance baseline

### Phase 6: Documentation
**Duration:** 3 days
**Objective:** Complete documentation

**Tasks:**
1. Write comprehensive README.md with CLI reference
2. Write DEVELOPER.md (setup, architecture, patterns)
3. Write ARCHITECTURE.md (system design)
4. Write per-service documentation
5. Write user guide (end-user docs)
6. Create diagrams (architecture, data flow)

**Deliverables:**
- README.md (CLI reference, examples)
- DEVELOPER.md (2000+ lines)
- ARCHITECTURE.md
- User guide

### Phase 7: Final Verification
**Duration:** 2 days
**Objective:** Verify production readiness

**Tasks:**
1. Run full test suite
2. Run security audit
3. Run performance tests
4. Manual testing of all features
5. Documentation review
6. Final commit and tag release

**Deliverables:**
- All tests passing
- Security audit clean
- v1.0.0 release

---

## 5. CLI Command Specification

### 5.1 Command Structure

```bash
aa <domain> <action> [options] [arguments]
```

### 5.2 Command Reference

#### Location Commands
```bash
aa location list [--type TYPE] [--status STATUS] [--format json|table]
aa location show <id>
aa location create --name NAME [--lat LAT] [--lon LON] [--type TYPE]
aa location update <id> [--name NAME] [--lat LAT] [--lon LON]
aa location delete <id> [--force]
aa location merge <source-id> <target-id> [--strategy keep-target|keep-source|interactive]
aa location duplicates [--threshold 0.8] [--distance 100m]
aa location enrich <id> [--geocode] [--cultural-region]
```

#### Media Commands
```bash
aa media list [--location ID] [--type image|video|document]
aa media show <hash>
aa media thumbnail <hash> [--size 256|512|1024]
aa media metadata <hash> [--format json|table]
aa media tag <hash> [--model vlm|litellm]
aa media ocr <hash> [--lang eng|spa|fra]
aa media move <hash> <location-id>
aa media delete <hash> [--force]
```

#### Import Commands
```bash
aa import scan <path> [--recursive] [--dry-run]
aa import run <path> [--location ID] [--recursive] [--watch]
aa import status [--session ID]
aa import history [--limit 10]
aa import resume <session-id>
aa import cancel <session-id>
```

#### Export Commands
```bash
aa export bagit <location-id> <output-dir> [--include-media]
aa export json <location-id> [--output file.json]
aa export csv [--type locations|media] [--output file.csv]
aa export backup <output-file> [--include-media]
```

#### Reference Map Commands
```bash
aa refmap import <file.kml|gpx|geojson|csv>
aa refmap list [--format table|json]
aa refmap dedup [--distance 50m] [--name-threshold 0.8] [--dry-run]
aa refmap match <location-id> [--threshold 0.8]
aa refmap enrich [--all] [--location ID]
```

#### Web Commands
```bash
aa web capture <url> [--formats screenshot,html,pdf,warc]
aa web scrape <url> [--selectors config.json]
aa web download <url> [--images] [--videos]
aa web batch <urls-file> [--concurrent 3]
```

#### AI Commands
```bash
aa ai tag <hash> [--model vlm|litellm] [--confidence 0.7]
aa ai extract-dates <hash> [--output json]
aa ai ocr <hash> [--lang eng]
aa ai batch <location-id> [--concurrent 3]
aa ai stats [--format table|json]
```

#### Queue Commands
```bash
aa queue add <job-type> <payload-json> [--priority 0]
aa queue status
aa queue run [--workers 3]
aa queue dead-letter [--limit 10]
aa queue retry <job-id>
aa queue cancel <job-id>
```

#### Database Commands
```bash
aa db init [--force]
aa db info
aa db backup <output-file>
aa db restore <backup-file>
aa db integrity [--fix]
aa db migrate [--dry-run]
aa db vacuum
```

#### Config Commands
```bash
aa config show
aa config set <key> <value>
aa config get <key>
aa config reset
```

### 5.3 Global Options

```bash
--config, -c <path>     # Config file path
--database, -d <path>   # Database path
--verbose, -v           # Verbose output
--quiet, -q             # Quiet mode
--json                  # JSON output
--help, -h              # Show help
--version               # Show version
```

---

## 6. Testing Strategy

### 6.1 Test Pyramid

```
                    ┌─────────┐
                    │  E2E    │  20+ flows
                    │  Tests  │
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │   Integration       │  100+ tests
              │      Tests          │
              └──────────┬──────────┘
                         │
         ┌───────────────┴───────────────┐
         │         Unit Tests            │  500+ tests
         │                               │
         └───────────────────────────────┘
```

### 6.2 Coverage Targets

| Package | Current | Target |
|---------|---------|--------|
| services | 0% | 85% |
| cli | 0% | 90% |
| core | ~50% | 80% |
| desktop | ~30% | 70% |
| mapcombine | ~80% | 90% |

### 6.3 Test Categories

**Unit Tests:**
- Service methods (pure functions)
- Validators and parsers
- Formatters and transformers
- Error handling

**Integration Tests:**
- Database operations
- File system operations
- External tool integration (exiftool, ffmpeg)
- IPC handler flows

**E2E Tests:**
- Complete import workflow
- Location CRUD cycle
- Export and restore
- Web scraping pipeline
- AI tagging pipeline

**CLI Tests:**
- Command parsing
- Output formatting
- Error messages
- Help text

---

## 7. Documentation Requirements

### 7.1 README.md Structure

```markdown
# Abandoned Archive

## Overview
## Quick Start
## Installation
## CLI Reference
  - Location Commands
  - Media Commands
  - Import Commands
  - Export Commands
  - Reference Map Commands
  - Web Commands
  - AI Commands
  - Queue Commands
  - Database Commands
## GUI Usage
## Configuration
## Troubleshooting
## Contributing
## License
```

### 7.2 DEVELOPER.md Structure

```markdown
# Developer Guide

## Architecture Overview
## Project Structure
## Setup
  - Prerequisites
  - Installation
  - Development Server
## Coding Standards
  - TypeScript Guidelines
  - Testing Guidelines
  - Documentation Guidelines
## Package Guide
  - Core Package
  - Services Package
  - CLI Package
  - Desktop Package
## Database
  - Schema
  - Migrations
  - Queries
## IPC Layer
  - Handler Pattern
  - Validation
  - Error Handling
## Testing
  - Running Tests
  - Writing Tests
  - Coverage
## Build & Deploy
## Troubleshooting
```

### 7.3 SME Documents

Each domain requires:
1. Overview and purpose
2. Technical specification
3. API reference
4. Examples
5. Edge cases
6. Performance considerations

---

## 8. Risk Assessment

### 8.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Service consolidation breaks functionality | Medium | High | Comprehensive tests before refactor |
| CLI performance issues | Low | Medium | Async operations, progress indicators |
| Database migration issues | Medium | High | Backup before migration, rollback plan |
| Native module compatibility | Low | High | Pin versions, test on all platforms |
| GUI regression | Medium | Medium | Component tests, manual testing |

### 8.2 Schedule Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Scope creep | High | Medium | Strict phase boundaries |
| Unknown complexity | Medium | Medium | Buffer time in estimates |
| Dependency issues | Low | Medium | Lock file, version pinning |

---

## 9. Success Criteria

### 9.1 Functional Criteria

- [ ] All 50+ CLI commands implemented and tested
- [ ] All GUI features work via CLI first
- [ ] GUI calls services, not direct DB access
- [ ] All tests passing (500+ tests)
- [ ] 80%+ code coverage

### 9.2 Quality Criteria

- [ ] 0 critical security issues
- [ ] 0 high severity bugs
- [ ] <5 medium severity bugs
- [ ] Documentation complete
- [ ] Performance benchmarks met

### 9.3 Documentation Criteria

- [ ] README.md with full CLI reference
- [ ] DEVELOPER.md (2000+ lines)
- [ ] ARCHITECTURE.md
- [ ] Per-service documentation
- [ ] User guide

---

## Appendix A: File Structure After Refactor

```
packages/
├── cli/
│   ├── src/
│   │   ├── commands/
│   │   │   ├── location.ts       # 300 LoC
│   │   │   ├── media.ts          # 300 LoC
│   │   │   ├── import.ts         # 300 LoC
│   │   │   ├── export.ts         # 200 LoC
│   │   │   ├── refmap.ts         # 300 LoC
│   │   │   ├── web.ts            # 300 LoC
│   │   │   ├── ai.ts             # 250 LoC
│   │   │   ├── queue.ts          # 200 LoC
│   │   │   ├── db.ts             # 200 LoC
│   │   │   └── config.ts         # 100 LoC
│   │   ├── output/
│   │   │   ├── table.ts          # 100 LoC
│   │   │   ├── json.ts           # 50 LoC
│   │   │   ├── progress.ts       # 150 LoC
│   │   │   └── spinner.ts        # 50 LoC
│   │   ├── cli.ts                # 100 LoC (entry point)
│   │   └── config.ts             # 50 LoC
│   ├── tests/
│   │   ├── commands/             # 300+ tests
│   │   └── output/               # 50+ tests
│   └── package.json
│
├── services/
│   ├── src/
│   │   ├── location/
│   │   │   ├── location-service.ts    # 400 LoC
│   │   │   ├── geocoding-service.ts   # 300 LoC
│   │   │   ├── address-service.ts     # 300 LoC
│   │   │   ├── types.ts               # 100 LoC
│   │   │   └── index.ts               # 20 LoC
│   │   ├── media/
│   │   │   ├── media-service.ts       # 400 LoC
│   │   │   ├── thumbnail-service.ts   # 300 LoC
│   │   │   ├── metadata-service.ts    # 300 LoC
│   │   │   ├── types.ts               # 100 LoC
│   │   │   └── index.ts               # 20 LoC
│   │   ├── import/
│   │   │   ├── import-service.ts      # 500 LoC
│   │   │   ├── scanner-service.ts     # 300 LoC
│   │   │   ├── hash-service.ts        # 200 LoC
│   │   │   ├── types.ts               # 100 LoC
│   │   │   └── index.ts               # 20 LoC
│   │   ├── refmap/                    # Similar structure
│   │   ├── web/                       # Similar structure
│   │   ├── ai/                        # Similar structure
│   │   ├── queue/                     # Similar structure
│   │   ├── archive/                   # Similar structure
│   │   ├── database/                  # Similar structure
│   │   └── shared/
│   │       ├── logger.ts              # 100 LoC
│   │       ├── config.ts              # 100 LoC
│   │       ├── errors.ts              # 150 LoC
│   │       └── types.ts               # 100 LoC
│   ├── tests/
│   │   ├── location/                  # 100+ tests
│   │   ├── media/                     # 100+ tests
│   │   ├── import/                    # 100+ tests
│   │   └── ...
│   └── package.json
│
├── core/                              # Existing (minor updates)
├── desktop/                           # Refactored (thin IPC layer)
├── mapcombine/                        # Existing (integrate into CLI)
├── wake-n-blake/                      # Existing (submodule)
└── shoemaker/                         # Existing (submodule)
```

---

## Appendix B: Estimated Line Counts

| Package | Current LoC | Target LoC | Change |
|---------|-------------|------------|--------|
| cli | 0 | ~3,000 | +3,000 |
| services | 0 | ~8,000 | +8,000 |
| core | ~500 | ~600 | +100 |
| desktop/services | ~41,000 | ~5,000 | -36,000 |
| desktop/ipc | ~5,000 | ~2,000 | -3,000 |
| desktop/ui | ~8,000 | ~8,000 | 0 |
| mapcombine | ~2,500 | ~2,500 | 0 |
| **Total** | ~57,000 | ~29,100 | -27,900 |

**Net reduction: ~50% less code** while maintaining all functionality.

---

## Appendix C: Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| CLI Framework | Commander.js | TypeScript native, familiar API |
| Output | cli-table3, ora, chalk | Rich terminal output |
| Testing | Vitest | Fast, ESM native, similar to Jest |
| Validation | Zod | Already used in project |
| Logging | winston/pino | Structured logging |
| Config | cosmiconfig | Standard config loading |

---

**Document End**

*This plan is approved for implementation. All phases must be completed to 100% before marking done.*
