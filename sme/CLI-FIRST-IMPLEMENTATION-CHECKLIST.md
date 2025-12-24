# CLI-First Implementation Checklist

**Status:** ACTIVE
**Last Updated:** 2024-12-24

This checklist tracks every task required for the CLI-first overhaul. Check items as completed.

---

## Phase 1: Foundation (Services Package)

### 1.1 Package Setup
- [ ] Create `packages/services/` directory structure
- [ ] Create `packages/services/package.json`
- [ ] Create `packages/services/tsconfig.json`
- [ ] Add to `pnpm-workspace.yaml`
- [ ] Create shared utilities folder structure

### 1.2 Location Services Migration
- [ ] Create `services/src/location/types.ts` - Location domain types
- [ ] Create `services/src/location/location-service.ts` - Core location operations
- [ ] Create `services/src/location/geocoding-service.ts` - Geocoding operations
- [ ] Create `services/src/location/address-service.ts` - Address normalization
- [ ] Create `services/src/location/index.ts` - Module exports
- [ ] Migrate `geocoding-service.ts` logic
- [ ] Migrate `geocoding-cache.ts` logic
- [ ] Migrate `gps-validator.ts` logic
- [ ] Migrate `address-service.ts` logic
- [ ] Migrate `libpostal-service.ts` logic
- [ ] Write unit tests for location-service (20+ tests)
- [ ] Write unit tests for geocoding-service (15+ tests)
- [ ] Write unit tests for address-service (15+ tests)
- [ ] Achieve 85% coverage for location module

### 1.3 Media Services Migration
- [ ] Create `services/src/media/types.ts` - Media domain types
- [ ] Create `services/src/media/media-service.ts` - Core media operations
- [ ] Create `services/src/media/thumbnail-service.ts` - Thumbnail generation
- [ ] Create `services/src/media/metadata-service.ts` - Metadata extraction
- [ ] Create `services/src/media/index.ts` - Module exports
- [ ] Migrate `exiftool-service.ts` logic
- [ ] Migrate `ffmpeg-service.ts` logic
- [ ] Migrate `thumbnail-service.ts` logic
- [ ] Migrate `poster-frame-service.ts` logic
- [ ] Migrate `preview-extractor-service.ts` logic
- [ ] Migrate `media-cache-service.ts` logic
- [ ] Write unit tests for media-service (25+ tests)
- [ ] Write unit tests for thumbnail-service (15+ tests)
- [ ] Write unit tests for metadata-service (20+ tests)
- [ ] Achieve 85% coverage for media module

### 1.4 Import Services Migration
- [ ] Create `services/src/import/types.ts` - Import domain types
- [ ] Create `services/src/import/import-service.ts` - Import orchestration
- [ ] Create `services/src/import/scanner-service.ts` - File scanning
- [ ] Create `services/src/import/hash-service.ts` - Hashing operations
- [ ] Create `services/src/import/index.ts` - Module exports
- [ ] Migrate `file-import-service.ts` logic (split 1667 LoC)
- [ ] Migrate `phase-import-service.ts` logic
- [ ] Migrate `import-intelligence-service.ts` logic
- [ ] Migrate `import-manifest.ts` logic
- [ ] Integrate wake-n-blake for hashing
- [ ] Write unit tests for import-service (30+ tests)
- [ ] Write unit tests for scanner-service (15+ tests)
- [ ] Write unit tests for hash-service (10+ tests)
- [ ] Achieve 85% coverage for import module

### 1.5 Shared Utilities
- [ ] Create `services/src/shared/logger.ts` - Logging wrapper
- [ ] Create `services/src/shared/config.ts` - Configuration loading
- [ ] Create `services/src/shared/errors.ts` - Custom error types
- [ ] Create `services/src/shared/types.ts` - Shared type definitions
- [ ] Create `services/src/shared/database.ts` - Database connection
- [ ] Write unit tests for shared utilities (20+ tests)

### 1.6 Desktop Integration
- [ ] Update desktop package.json to depend on @aa/services
- [ ] Update IPC handlers to use new location services
- [ ] Update IPC handlers to use new media services
- [ ] Update IPC handlers to use new import services
- [ ] Remove old service files from desktop (after verification)
- [ ] Run full test suite to verify no regressions

---

## Phase 2: CLI Package

### 2.1 Package Setup
- [ ] Create `packages/cli/` directory structure
- [ ] Create `packages/cli/package.json` with bin entry
- [ ] Create `packages/cli/tsconfig.json`
- [ ] Add to `pnpm-workspace.yaml`
- [ ] Set up Commander.js as CLI framework
- [ ] Set up cli-table3 for table output
- [ ] Set up ora for spinners
- [ ] Set up chalk for colors

### 2.2 Output Formatters
- [ ] Create `cli/src/output/table.ts` - Table formatter
- [ ] Create `cli/src/output/json.ts` - JSON formatter
- [ ] Create `cli/src/output/progress.ts` - Progress bar
- [ ] Create `cli/src/output/spinner.ts` - Spinner wrapper
- [ ] Create `cli/src/output/index.ts` - Exports
- [ ] Write unit tests for formatters (20+ tests)

### 2.3 Location Commands
- [ ] Create `cli/src/commands/location.ts`
- [ ] Implement `aa location list` - List all locations
- [ ] Implement `aa location show <id>` - Show location details
- [ ] Implement `aa location create` - Create new location
- [ ] Implement `aa location update <id>` - Update location
- [ ] Implement `aa location delete <id>` - Delete location
- [ ] Implement `aa location merge` - Merge locations
- [ ] Implement `aa location duplicates` - Find duplicates
- [ ] Implement `aa location enrich` - Enrich with geocoding
- [ ] Write CLI tests for location commands (25+ tests)
- [ ] Document location commands in help text

### 2.4 Media Commands
- [ ] Create `cli/src/commands/media.ts`
- [ ] Implement `aa media list` - List media files
- [ ] Implement `aa media show <hash>` - Show media details
- [ ] Implement `aa media thumbnail` - Generate thumbnail
- [ ] Implement `aa media metadata` - Show metadata
- [ ] Implement `aa media tag` - AI tagging
- [ ] Implement `aa media ocr` - OCR extraction
- [ ] Implement `aa media move` - Move to location
- [ ] Implement `aa media delete` - Delete media
- [ ] Write CLI tests for media commands (20+ tests)
- [ ] Document media commands in help text

### 2.5 Import Commands
- [ ] Create `cli/src/commands/import.ts`
- [ ] Implement `aa import scan` - Scan directory
- [ ] Implement `aa import run` - Run import
- [ ] Implement `aa import status` - Show status
- [ ] Implement `aa import history` - Show history
- [ ] Implement `aa import resume` - Resume import
- [ ] Implement `aa import cancel` - Cancel import
- [ ] Write CLI tests for import commands (20+ tests)
- [ ] Document import commands in help text

### 2.6 Database Commands
- [ ] Create `cli/src/commands/db.ts`
- [ ] Implement `aa db init` - Initialize database
- [ ] Implement `aa db info` - Show database info
- [ ] Implement `aa db backup` - Backup database
- [ ] Implement `aa db restore` - Restore database
- [ ] Implement `aa db integrity` - Check integrity
- [ ] Implement `aa db migrate` - Run migrations
- [ ] Implement `aa db vacuum` - Optimize database
- [ ] Write CLI tests for db commands (15+ tests)
- [ ] Document db commands in help text

### 2.7 Main Entry Point
- [ ] Create `cli/src/cli.ts` - Main entry point
- [ ] Create `cli/src/config.ts` - CLI configuration
- [ ] Set up global options (--verbose, --quiet, --json, --config, --database)
- [ ] Set up version command
- [ ] Set up help formatting
- [ ] Create `cli/bin/aa` executable
- [ ] Test CLI installation via npm link
- [ ] Write integration tests for CLI (10+ tests)

---

## Phase 3: Advanced Features

### 3.1 Reference Map Services Migration
- [ ] Create `services/src/refmap/types.ts`
- [ ] Create `services/src/refmap/refmap-service.ts`
- [ ] Create `services/src/refmap/dedup-service.ts`
- [ ] Create `services/src/refmap/matcher-service.ts`
- [ ] Create `services/src/refmap/parser-service.ts`
- [ ] Create `services/src/refmap/index.ts`
- [ ] Migrate `ref-map-dedup-service.ts` logic
- [ ] Migrate `ref-map-matcher-service.ts` logic
- [ ] Migrate `map-parser-service.ts` logic
- [ ] Integrate mapcombine dedup algorithm
- [ ] Write unit tests (30+ tests)

### 3.2 Reference Map Commands
- [ ] Create `cli/src/commands/refmap.ts`
- [ ] Implement `aa refmap import` - Import KML/GPX/GeoJSON/CSV
- [ ] Implement `aa refmap list` - List reference maps
- [ ] Implement `aa refmap dedup` - Deduplicate points
- [ ] Implement `aa refmap match` - Match to locations
- [ ] Implement `aa refmap enrich` - Enrich locations
- [ ] Write CLI tests (20+ tests)

### 3.3 Web Services Migration
- [ ] Create `services/src/web/types.ts`
- [ ] Create `services/src/web/capture-service.ts`
- [ ] Create `services/src/web/scraper-service.ts`
- [ ] Create `services/src/web/downloader-service.ts`
- [ ] Create `services/src/web/behaviors.ts`
- [ ] Create `services/src/web/index.ts`
- [ ] Migrate `websource-orchestrator-service.ts` logic
- [ ] Migrate `websource-capture-service.ts` logic
- [ ] Migrate `websource-extraction-service.ts` logic
- [ ] Migrate `websource-behaviors.ts` logic
- [ ] Write unit tests (30+ tests)

### 3.4 Web Commands
- [ ] Create `cli/src/commands/web.ts`
- [ ] Implement `aa web capture` - Capture URL
- [ ] Implement `aa web scrape` - Scrape with selectors
- [ ] Implement `aa web download` - Download images/videos
- [ ] Implement `aa web batch` - Batch processing
- [ ] Write CLI tests (15+ tests)

### 3.5 AI Services Migration
- [ ] Create `services/src/ai/types.ts`
- [ ] Create `services/src/ai/tagging-service.ts`
- [ ] Create `services/src/ai/date-extraction-service.ts`
- [ ] Create `services/src/ai/ocr-service.ts`
- [ ] Create `services/src/ai/litellm-service.ts`
- [ ] Create `services/src/ai/index.ts`
- [ ] Migrate `date-engine-service.ts` logic
- [ ] Migrate `vlm-enhancement-service.ts` logic
- [ ] Migrate `litellm-lifecycle-service.ts` logic
- [ ] Migrate `ocr-service.ts` logic
- [ ] Write unit tests (25+ tests)

### 3.6 AI Commands
- [ ] Create `cli/src/commands/ai.ts`
- [ ] Implement `aa ai tag` - AI tagging
- [ ] Implement `aa ai extract-dates` - Date extraction
- [ ] Implement `aa ai ocr` - OCR processing
- [ ] Implement `aa ai batch` - Batch processing
- [ ] Implement `aa ai stats` - Show statistics
- [ ] Write CLI tests (15+ tests)

### 3.7 Queue Services Migration
- [ ] Create `services/src/queue/types.ts`
- [ ] Create `services/src/queue/queue-service.ts`
- [ ] Create `services/src/queue/worker-service.ts`
- [ ] Create `services/src/queue/index.ts`
- [ ] Migrate `job-queue.ts` logic
- [ ] Migrate `job-worker-service.ts` logic
- [ ] Write unit tests (20+ tests)

### 3.8 Queue Commands
- [ ] Create `cli/src/commands/queue.ts`
- [ ] Implement `aa queue add` - Add job
- [ ] Implement `aa queue status` - Show status
- [ ] Implement `aa queue run` - Run workers
- [ ] Implement `aa queue dead-letter` - Show failed
- [ ] Implement `aa queue retry` - Retry job
- [ ] Implement `aa queue cancel` - Cancel job
- [ ] Write CLI tests (15+ tests)

### 3.9 Archive Services Migration
- [ ] Create `services/src/archive/types.ts`
- [ ] Create `services/src/archive/bagit-service.ts`
- [ ] Create `services/src/archive/backup-service.ts`
- [ ] Create `services/src/archive/recovery-service.ts`
- [ ] Create `services/src/archive/index.ts`
- [ ] Migrate `bagit-service.ts` logic
- [ ] Migrate `database-archive-service.ts` logic
- [ ] Migrate `backup-scheduler.ts` logic
- [ ] Write unit tests (20+ tests)

### 3.10 Export Commands
- [ ] Create `cli/src/commands/export.ts`
- [ ] Implement `aa export bagit` - BagIt archive
- [ ] Implement `aa export json` - JSON export
- [ ] Implement `aa export csv` - CSV export
- [ ] Implement `aa export backup` - Full backup
- [ ] Write CLI tests (10+ tests)

### 3.11 Config Commands
- [ ] Create `cli/src/commands/config.ts`
- [ ] Implement `aa config show` - Show config
- [ ] Implement `aa config set` - Set value
- [ ] Implement `aa config get` - Get value
- [ ] Implement `aa config reset` - Reset config
- [ ] Write CLI tests (10+ tests)

---

## Phase 4: GUI Refactor

### 4.1 IPC Handler Refactor
- [ ] Refactor `locations.ts` handler to use services
- [ ] Refactor `media-import.ts` handler to use services
- [ ] Refactor `media-processing.ts` handler to use services
- [ ] Refactor `ref-maps.ts` handler to use services
- [ ] Refactor `extraction.ts` handler to use services
- [ ] Refactor `websources.ts` handler to use services
- [ ] Refactor `image-downloader.ts` handler to use services
- [ ] Refactor `import-v2.ts` handler to use services
- [ ] Refactor `timeline.ts` handler to use services
- [ ] Refactor `projects.ts` handler to use services
- [ ] Refactor `notes.ts` handler to use services
- [ ] Refactor `database.ts` handler to use services
- [ ] Refactor `monitoring.ts` handler to use services
- [ ] Refactor `ai.ts` handler to use services
- [ ] Reduce each handler file to <150 LoC

### 4.2 Store Updates
- [ ] Update `import-store.ts` to use new types
- [ ] Update `import-modal-store.ts` to use new types
- [ ] Update `user-store.ts` to use new types
- [ ] Update `router.ts` if needed
- [ ] Update `toast-store.ts` if needed
- [ ] Add proper TypeScript types to all stores

### 4.3 Type Definitions
- [ ] Update `types/electron.d.ts` with new IPC types
- [ ] Add missing type definitions
- [ ] Remove deprecated type definitions
- [ ] Verify all IPC channels have types

### 4.4 Component Tests
- [ ] Set up Vitest + @testing-library/svelte
- [ ] Write tests for Dashboard page
- [ ] Write tests for Locations page
- [ ] Write tests for Atlas page
- [ ] Write tests for Imports page
- [ ] Write tests for LocationDetail page
- [ ] Write tests for Settings page
- [ ] Write tests for shared components (20+ tests)
- [ ] Write tests for location components (20+ tests)
- [ ] Write tests for media components (10+ tests)
- [ ] Write tests for map components (10+ tests)

### 4.5 Error Handling
- [ ] Create unified error types for IPC
- [ ] Update all handlers to use error types
- [ ] Add error boundaries to Svelte pages
- [ ] Add toast notifications for errors
- [ ] Test error handling paths

---

## Phase 5: Testing & Quality

### 5.1 Unit Test Completion
- [ ] Verify services package at 85%+ coverage
- [ ] Verify cli package at 90%+ coverage
- [ ] Verify core package at 80%+ coverage
- [ ] Write missing tests to reach targets
- [ ] Generate coverage reports

### 5.2 Integration Tests
- [ ] Write integration tests for location workflow
- [ ] Write integration tests for media import workflow
- [ ] Write integration tests for refmap workflow
- [ ] Write integration tests for web scraping workflow
- [ ] Write integration tests for AI tagging workflow
- [ ] Write integration tests for backup/restore workflow
- [ ] Write integration tests for queue processing

### 5.3 E2E Tests
- [ ] Set up E2E test framework (Playwright/Electron)
- [ ] Write E2E test: Full import workflow
- [ ] Write E2E test: Location CRUD cycle
- [ ] Write E2E test: Media management
- [ ] Write E2E test: Map operations
- [ ] Write E2E test: Export/backup
- [ ] Write E2E test: AI features
- [ ] Write E2E test: Settings changes
- [ ] Write E2E test: Error recovery

### 5.4 Performance Tests
- [ ] Benchmark import of 1000 files
- [ ] Benchmark location list with 10000 locations
- [ ] Benchmark media thumbnail generation
- [ ] Benchmark database queries
- [ ] Benchmark CLI startup time
- [ ] Document baseline performance

### 5.5 Static Analysis
- [ ] Set up ESLint at root level
- [ ] Configure ESLint rules
- [ ] Fix all ESLint errors
- [ ] Set up TypeScript strict mode checks
- [ ] Fix all TypeScript errors
- [ ] Run security audit (npm audit)
- [ ] Fix security vulnerabilities

### 5.6 Code Quality
- [ ] Remove all TODO/FIXME markers
- [ ] Remove all `any` types
- [ ] Ensure consistent error handling
- [ ] Ensure consistent logging
- [ ] Review and clean up imports
- [ ] Remove dead code

---

## Phase 6: Documentation

### 6.1 README.md
- [ ] Write overview section
- [ ] Write quick start section
- [ ] Write installation section
- [ ] Write CLI reference (all commands)
- [ ] Add examples for each command
- [ ] Write GUI usage section
- [ ] Write configuration section
- [ ] Write troubleshooting section
- [ ] Add badges (version, license, tests)
- [ ] Review and polish

### 6.2 DEVELOPER.md
- [ ] Write architecture overview
- [ ] Write project structure guide
- [ ] Write setup instructions
- [ ] Write coding standards (TypeScript, testing, docs)
- [ ] Write package guide (core, services, cli, desktop)
- [ ] Write database guide (schema, migrations, queries)
- [ ] Write IPC layer guide
- [ ] Write testing guide
- [ ] Write build & deploy guide
- [ ] Write troubleshooting guide

### 6.3 ARCHITECTURE.md
- [ ] Write system overview
- [ ] Create architecture diagrams
- [ ] Document data flow
- [ ] Document service boundaries
- [ ] Document database schema
- [ ] Document IPC protocol
- [ ] Document CLI structure
- [ ] Document deployment

### 6.4 Service Documentation
- [ ] Document location services
- [ ] Document media services
- [ ] Document import services
- [ ] Document refmap services
- [ ] Document web services
- [ ] Document AI services
- [ ] Document queue services
- [ ] Document archive services

### 6.5 User Guide
- [ ] Write getting started guide
- [ ] Write location management guide
- [ ] Write media import guide
- [ ] Write export/backup guide
- [ ] Write troubleshooting guide

---

## Phase 7: Final Verification

### 7.1 Test Suite
- [ ] Run full test suite
- [ ] Verify 80%+ coverage
- [ ] Verify 0 failing tests
- [ ] Verify performance benchmarks

### 7.2 Security Audit
- [ ] Run npm audit
- [ ] Run static analysis security tools
- [ ] Review authentication/authorization
- [ ] Review data handling
- [ ] Document security considerations

### 7.3 Manual Testing
- [ ] Test all CLI commands
- [ ] Test all GUI features
- [ ] Test on macOS arm64
- [ ] Test on macOS x64
- [ ] Test on Linux (if applicable)
- [ ] Test on Windows (if applicable)

### 7.4 Documentation Review
- [ ] Review README.md for accuracy
- [ ] Review DEVELOPER.md for accuracy
- [ ] Review ARCHITECTURE.md for accuracy
- [ ] Review CLI help text
- [ ] Verify all links work

### 7.5 Release Preparation
- [ ] Update version to 1.0.0
- [ ] Update CHANGELOG.md
- [ ] Create release notes
- [ ] Tag release in git
- [ ] Create release build
- [ ] Test release build

---

## Progress Tracking

| Phase | Tasks | Completed | % Complete |
|-------|-------|-----------|------------|
| Phase 1: Foundation | 60 | 0 | 0% |
| Phase 2: CLI Package | 55 | 0 | 0% |
| Phase 3: Advanced Features | 85 | 0 | 0% |
| Phase 4: GUI Refactor | 45 | 0 | 0% |
| Phase 5: Testing & Quality | 40 | 0 | 0% |
| Phase 6: Documentation | 40 | 0 | 0% |
| Phase 7: Final Verification | 25 | 0 | 0% |
| **Total** | **350** | **0** | **0%** |

---

## Notes

- Check off items as completed
- Update progress tracking after each work session
- Document any blockers or changes to plan
- All phases must be 100% before final release

---

**Last Updated By:** Claude
**Next Update:** After Phase 1 completion
