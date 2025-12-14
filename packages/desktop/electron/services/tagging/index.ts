/**
 * Image Auto-Tagging Module
 *
 * RAM++ based image tagging with urbex-specific taxonomy.
 * Per CLAUDE.md Rule 9: Local LLMs for background tasks only.
 *
 * @module services/tagging
 */

export * from './urbex-taxonomy';
export * from './ram-tagging-service';
export * from './location-tag-aggregator';
