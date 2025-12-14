/**
 * Conflict Detection Service
 *
 * Detects and manages fact conflicts between multiple sources.
 * Tracks when sources provide contradictory information and
 * facilitates resolution.
 *
 * @version 1.0
 */

import type { Database as SqliteDatabase } from 'better-sqlite3';
import { randomUUID } from 'crypto';

import type {
  FactConflict,
  FactConflictInput,
  ConflictClaim,
  ConflictType,
  ConflictResolution,
  ConflictResolutionInput,
  ConflictDetectionResult,
  ConflictDetectionOptions,
  ConflictSummary,
  SourceAuthority,
} from './conflict-types';

import { DEFAULT_CONFLICT_OPTIONS, getDefaultTier } from './conflict-types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Extracted date with source information
 */
interface SourcedDate {
  parsedDate: string | null;
  category: string;
  confidence: number;
  context: string;
  sourceRef: string;
  sourceDomain?: string;
}

/**
 * Field value with source
 */
interface SourcedValue {
  value: string;
  confidence: number;
  context: string;
  sourceRef: string;
  sourceDomain?: string;
}

// =============================================================================
// CONFLICT DETECTION SERVICE
// =============================================================================

export class ConflictDetectionService {
  private db: SqliteDatabase;

  constructor(db: SqliteDatabase) {
    this.db = db;
  }

  /**
   * Detect conflicts for a location based on timeline extractions
   *
   * @param locid - Location ID
   * @param options - Detection options
   * @returns Detection result with new and existing conflicts
   */
  async detectTimelineConflicts(
    locid: string,
    options?: ConflictDetectionOptions
  ): Promise<ConflictDetectionResult> {
    const config = { ...DEFAULT_CONFLICT_OPTIONS, ...options };

    // Get all timeline events for this location
    const events = this.db.prepare(`
      SELECT
        event_id,
        event_date,
        event_date_end,
        event_type,
        description,
        confidence,
        source_refs,
        verb_context
      FROM location_timeline
      WHERE locid = ?
      ORDER BY event_type, event_date
    `).all(locid) as Array<{
      event_id: string;
      event_date: string | null;
      event_date_end: string | null;
      event_type: string;
      description: string;
      confidence: number;
      source_refs: string | null;
      verb_context: string | null;
    }>;

    const newConflicts: FactConflict[] = [];
    const updatedConflicts: string[] = [];

    // Group events by type
    const eventsByType = new Map<string, typeof events>();
    for (const event of events) {
      const existing = eventsByType.get(event.event_type) || [];
      existing.push(event);
      eventsByType.set(event.event_type, existing);
    }

    // Check each event type for conflicts
    for (const [eventType, typeEvents] of eventsByType) {
      if (typeEvents.length < 2) continue;

      // Compare each pair of events
      for (let i = 0; i < typeEvents.length; i++) {
        for (let j = i + 1; j < typeEvents.length; j++) {
          const a = typeEvents[i];
          const b = typeEvents[j];

          // Check for date mismatch
          if (a.event_date && b.event_date && a.event_date !== b.event_date) {
            // Check if this conflict already exists
            const existing = this.findExistingConflict(
              locid,
              'date_mismatch',
              eventType,
              a.event_date,
              b.event_date
            );

            if (existing) {
              updatedConflicts.push(existing.conflict_id);
            } else {
              // Create new conflict
              const conflict = this.createConflict({
                locid,
                conflict_type: 'date_mismatch',
                field_name: eventType,
                claim_a: {
                  value: a.event_date,
                  source_ref: this.getFirstSourceRef(a.source_refs),
                  confidence: a.confidence,
                  context: a.description,
                  source_domain: this.getDomainFromSourceRef(this.getFirstSourceRef(a.source_refs)),
                },
                claim_b: {
                  value: b.event_date,
                  source_ref: this.getFirstSourceRef(b.source_refs),
                  confidence: b.confidence,
                  context: b.description,
                  source_domain: this.getDomainFromSourceRef(this.getFirstSourceRef(b.source_refs)),
                },
              });

              newConflicts.push(conflict);
            }
          }
        }
      }
    }

    // Get total and unresolved counts
    const counts = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved
      FROM fact_conflicts
      WHERE locid = ?
    `).get(locid) as { total: number; unresolved: number };

    return {
      new_conflicts: newConflicts,
      updated_conflicts: updatedConflicts,
      total_conflicts: counts.total + newConflicts.length,
      unresolved_count: counts.unresolved + newConflicts.length,
    };
  }

  /**
   * Detect conflicts between two extraction results
   *
   * @param locid - Location ID
   * @param sourceA - First source extractions
   * @param sourceB - Second source extractions
   * @returns Detected conflicts
   */
  detectExtractionConflicts(
    locid: string,
    sourceA: { dates: SourcedDate[]; sourceRef: string },
    sourceB: { dates: SourcedDate[]; sourceRef: string }
  ): FactConflict[] {
    const conflicts: FactConflict[] = [];

    // Group dates by category
    const datesA = new Map<string, SourcedDate[]>();
    const datesB = new Map<string, SourcedDate[]>();

    for (const date of sourceA.dates) {
      const existing = datesA.get(date.category) || [];
      existing.push({ ...date, sourceRef: sourceA.sourceRef });
      datesA.set(date.category, existing);
    }

    for (const date of sourceB.dates) {
      const existing = datesB.get(date.category) || [];
      existing.push({ ...date, sourceRef: sourceB.sourceRef });
      datesB.set(date.category, existing);
    }

    // Compare categories
    for (const [category, aDates] of datesA) {
      const bDates = datesB.get(category);
      if (!bDates || bDates.length === 0) continue;

      // Compare each date from A with dates from B
      for (const dateA of aDates) {
        for (const dateB of bDates) {
          if (
            dateA.parsedDate &&
            dateB.parsedDate &&
            !this.areDatesCompatible(dateA.parsedDate, dateB.parsedDate)
          ) {
            // Conflict found
            const conflict = this.createConflict({
              locid,
              conflict_type: 'date_mismatch',
              field_name: category,
              claim_a: {
                value: dateA.parsedDate,
                source_ref: dateA.sourceRef,
                confidence: dateA.confidence,
                context: dateA.context,
                source_domain: dateA.sourceDomain,
              },
              claim_b: {
                value: dateB.parsedDate,
                source_ref: dateB.sourceRef,
                confidence: dateB.confidence,
                context: dateB.context,
                source_domain: dateB.sourceDomain,
              },
            });

            conflicts.push(conflict);
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if two dates are compatible (allowing for precision differences)
   */
  private areDatesCompatible(dateA: string, dateB: string): boolean {
    // Extract years
    const yearA = dateA.split('-')[0];
    const yearB = dateB.split('-')[0];

    // If years don't match, not compatible
    if (yearA !== yearB) return false;

    // If one has month and other doesn't, compatible
    const partsA = dateA.split('-');
    const partsB = dateB.split('-');

    if (partsA.length !== partsB.length) return true;

    // If same precision, must match exactly
    return dateA === dateB;
  }

  /**
   * Create and store a new conflict
   */
  createConflict(input: FactConflictInput): FactConflict {
    const conflict_id = randomUUID();
    const now = new Date().toISOString();

    // Get source authority tiers
    const tierA = this.getSourceTier(input.claim_a.source_domain);
    const tierB = this.getSourceTier(input.claim_b.source_domain);

    const conflict: FactConflict = {
      conflict_id,
      locid: input.locid,
      conflict_type: input.conflict_type,
      field_name: input.field_name,
      claim_a: {
        ...input.claim_a,
        source_tier: tierA,
      },
      claim_b: {
        ...input.claim_b,
        source_tier: tierB,
      },
      resolved: false,
      created_at: now,
    };

    // Insert into database
    this.db.prepare(`
      INSERT INTO fact_conflicts (
        conflict_id, locid, conflict_type, field_name,
        claim_a_value, claim_a_source, claim_a_confidence, claim_a_context,
        claim_b_value, claim_b_source, claim_b_confidence, claim_b_context,
        resolved, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      conflict.conflict_id,
      conflict.locid,
      conflict.conflict_type,
      conflict.field_name,
      conflict.claim_a.value,
      conflict.claim_a.source_ref,
      conflict.claim_a.confidence,
      conflict.claim_a.context || null,
      conflict.claim_b.value,
      conflict.claim_b.source_ref,
      conflict.claim_b.confidence,
      conflict.claim_b.context || null,
      0,
      conflict.created_at
    );

    return conflict;
  }

  /**
   * Resolve a conflict
   */
  resolveConflict(input: ConflictResolutionInput): FactConflict | null {
    const now = new Date().toISOString();

    const result = this.db.prepare(`
      UPDATE fact_conflicts SET
        resolved = 1,
        resolution = ?,
        resolution_notes = ?,
        resolved_by = ?,
        resolved_at = ?
      WHERE conflict_id = ?
    `).run(
      input.resolution,
      input.resolution_notes || null,
      input.resolved_by || null,
      now,
      input.conflict_id
    );

    if (result.changes === 0) {
      return null;
    }

    return this.getConflictById(input.conflict_id);
  }

  /**
   * Get a conflict by ID
   */
  getConflictById(conflict_id: string): FactConflict | null {
    const row = this.db.prepare(`
      SELECT * FROM fact_conflicts WHERE conflict_id = ?
    `).get(conflict_id) as Record<string, unknown> | undefined;

    if (!row) return null;

    return this.rowToConflict(row);
  }

  /**
   * Get all conflicts for a location
   */
  getConflictsForLocation(
    locid: string,
    includeResolved = false
  ): FactConflict[] {
    const query = includeResolved
      ? `SELECT * FROM fact_conflicts WHERE locid = ? ORDER BY created_at DESC`
      : `SELECT * FROM fact_conflicts WHERE locid = ? AND resolved = 0 ORDER BY created_at DESC`;

    const rows = this.db.prepare(query).all(locid) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToConflict(row));
  }

  /**
   * Get conflict summary for a location
   */
  getConflictSummary(locid: string): ConflictSummary {
    // Get counts
    const counts = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved
      FROM fact_conflicts
      WHERE locid = ?
    `).get(locid) as { total: number; unresolved: number };

    // Get counts by type
    const byType = this.db.prepare(`
      SELECT conflict_type, COUNT(*) as count
      FROM fact_conflicts
      WHERE locid = ?
      GROUP BY conflict_type
    `).all(locid) as Array<{ conflict_type: string; count: number }>;

    // Get counts by field
    const byField = this.db.prepare(`
      SELECT field_name, COUNT(*) as count
      FROM fact_conflicts
      WHERE locid = ?
      GROUP BY field_name
    `).all(locid) as Array<{ field_name: string; count: number }>;

    // Get most recent
    const mostRecent = this.db.prepare(`
      SELECT created_at FROM fact_conflicts
      WHERE locid = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(locid) as { created_at: string } | undefined;

    return {
      locid,
      total: counts.total,
      unresolved: counts.unresolved,
      by_type: byType.reduce(
        (acc, row) => {
          acc[row.conflict_type as ConflictType] = row.count;
          return acc;
        },
        {} as Record<ConflictType, number>
      ),
      by_field: byField.reduce(
        (acc, row) => {
          acc[row.field_name] = row.count;
          return acc;
        },
        {} as Record<string, number>
      ),
      most_recent: mostRecent?.created_at,
    };
  }

  /**
   * Find existing conflict
   */
  private findExistingConflict(
    locid: string,
    conflictType: ConflictType,
    fieldName: string,
    valueA: string,
    valueB: string
  ): FactConflict | null {
    const row = this.db.prepare(`
      SELECT * FROM fact_conflicts
      WHERE locid = ?
        AND conflict_type = ?
        AND field_name = ?
        AND ((claim_a_value = ? AND claim_b_value = ?)
          OR (claim_a_value = ? AND claim_b_value = ?))
      LIMIT 1
    `).get(locid, conflictType, fieldName, valueA, valueB, valueB, valueA) as
      | Record<string, unknown>
      | undefined;

    if (!row) return null;

    return this.rowToConflict(row);
  }

  /**
   * Get source authority tier
   */
  private getSourceTier(domain: string | undefined): number {
    if (!domain) return 3;

    // Check database first
    const row = this.db.prepare(`
      SELECT tier FROM source_authority WHERE domain = ?
    `).get(domain) as { tier: number } | undefined;

    if (row) return row.tier;

    // Fall back to default tier calculation
    return getDefaultTier(domain);
  }

  /**
   * Get first source ref from JSON array
   */
  private getFirstSourceRef(sourceRefs: string | null): string {
    if (!sourceRefs) return 'unknown';

    try {
      const refs = JSON.parse(sourceRefs) as string[];
      return refs[0] || 'unknown';
    } catch {
      return sourceRefs;
    }
  }

  /**
   * Get domain from source ref (web_source ID)
   */
  private getDomainFromSourceRef(sourceRef: string): string | undefined {
    try {
      const row = this.db.prepare(`
        SELECT url FROM web_sources WHERE source_id = ?
      `).get(sourceRef) as { url: string } | undefined;

      if (!row?.url) return undefined;

      const url = new URL(row.url);
      return url.hostname;
    } catch {
      return undefined;
    }
  }

  /**
   * Convert database row to FactConflict
   */
  private rowToConflict(row: Record<string, unknown>): FactConflict {
    return {
      conflict_id: row.conflict_id as string,
      locid: row.locid as string,
      conflict_type: row.conflict_type as ConflictType,
      field_name: row.field_name as string,
      claim_a: {
        value: row.claim_a_value as string,
        source_ref: row.claim_a_source as string,
        confidence: row.claim_a_confidence as number,
        context: row.claim_a_context as string | undefined,
      },
      claim_b: {
        value: row.claim_b_value as string,
        source_ref: row.claim_b_source as string,
        confidence: row.claim_b_confidence as number,
        context: row.claim_b_context as string | undefined,
      },
      resolved: Boolean(row.resolved),
      resolution: row.resolution as ConflictResolution | undefined,
      resolution_notes: row.resolution_notes as string | undefined,
      resolved_by: row.resolved_by as string | undefined,
      resolved_at: row.resolved_at as string | undefined,
      created_at: row.created_at as string,
    };
  }

  /**
   * Add or update source authority
   */
  setSourceAuthority(
    domain: string,
    tier: 1 | 2 | 3 | 4,
    notes?: string
  ): SourceAuthority {
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO source_authority (domain, tier, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(domain) DO UPDATE SET
        tier = excluded.tier,
        notes = excluded.notes,
        updated_at = excluded.updated_at
    `).run(domain, tier, notes || null, now, now);

    return {
      domain,
      tier,
      notes,
      updated_at: now,
    };
  }

  /**
   * Get all source authorities
   */
  getAllSourceAuthorities(): SourceAuthority[] {
    const rows = this.db.prepare(`
      SELECT * FROM source_authority ORDER BY tier ASC, domain ASC
    `).all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      domain: row.domain as string,
      tier: row.tier as 1 | 2 | 3 | 4,
      notes: row.notes as string | undefined,
      created_at: row.created_at as string | undefined,
      updated_at: row.updated_at as string | undefined,
    }));
  }

  /**
   * Suggest resolution based on source authority
   */
  suggestResolution(conflict: FactConflict): {
    suggestion: ConflictResolution;
    reasoning: string;
    confidence: number;
  } {
    const tierA = conflict.claim_a.source_tier || 3;
    const tierB = conflict.claim_b.source_tier || 3;

    // Higher tier (lower number) is more authoritative
    if (tierA < tierB) {
      return {
        suggestion: 'claim_a',
        reasoning: `Source A has higher authority (tier ${tierA} vs ${tierB})`,
        confidence: 0.7 + (tierB - tierA) * 0.1,
      };
    }

    if (tierB < tierA) {
      return {
        suggestion: 'claim_b',
        reasoning: `Source B has higher authority (tier ${tierB} vs ${tierA})`,
        confidence: 0.7 + (tierA - tierB) * 0.1,
      };
    }

    // Same tier - use confidence
    if (conflict.claim_a.confidence > conflict.claim_b.confidence + 0.1) {
      return {
        suggestion: 'claim_a',
        reasoning: `Source A has higher extraction confidence (${conflict.claim_a.confidence.toFixed(2)} vs ${conflict.claim_b.confidence.toFixed(2)})`,
        confidence: 0.6,
      };
    }

    if (conflict.claim_b.confidence > conflict.claim_a.confidence + 0.1) {
      return {
        suggestion: 'claim_b',
        reasoning: `Source B has higher extraction confidence (${conflict.claim_b.confidence.toFixed(2)} vs ${conflict.claim_a.confidence.toFixed(2)})`,
        confidence: 0.6,
      };
    }

    // Can't determine - needs review
    return {
      suggestion: 'both_valid',
      reasoning: 'Sources have similar authority and confidence - manual review recommended',
      confidence: 0.3,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: ConflictDetectionService | null = null;

/**
 * Get the conflict detection service singleton
 */
export function getConflictDetectionService(db: SqliteDatabase): ConflictDetectionService {
  if (!serviceInstance) {
    serviceInstance = new ConflictDetectionService(db);
  }
  return serviceInstance;
}
