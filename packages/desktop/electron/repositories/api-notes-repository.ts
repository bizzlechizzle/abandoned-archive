/**
 * API-based Notes Repository
 *
 * Implements notes operations using dispatch hub API
 * instead of local SQLite database.
 */

import type { DispatchClient } from '@aa/services';
import type { LocationNote } from '@aa/services';

export interface NoteInput {
  locid: string;
  note_text: string;
  auth_imp?: string | null;
  note_type?: string;
}

export interface NoteUpdate {
  note_text?: string;
  note_type?: string;
}

export interface Note {
  note_id: string;
  locid: string;
  note_text: string;
  note_date: string;
  auth_imp: string | null;
  note_type: string;
  locnam?: string;
}

/**
 * API-based notes repository
 */
export class ApiNotesRepository {
  constructor(private readonly client: DispatchClient) {}

  /**
   * Create a new note
   */
  async create(input: NoteInput): Promise<Note> {
    const result = await this.client.createLocationNote(input.locid, {
      noteText: input.note_text,
      noteType: input.note_type,
    });
    return this.mapApiToLocal(result, input.locid);
  }

  /**
   * Find a note by ID
   * Note: API doesn't support direct note lookup, need location context
   */
  async findById(note_id: string): Promise<Note | null> {
    console.warn('ApiNotesRepository.findById: Direct lookup not supported, use findByLocation');
    return null;
  }

  /**
   * Find all notes for a specific location
   */
  async findByLocation(locid: string): Promise<Note[]> {
    const results = await this.client.getLocationNotes(locid);
    return results.map((n) => this.mapApiToLocal(n, locid));
  }

  /**
   * Find recent notes across all locations
   * Note: API needs endpoint for global recent notes
   */
  async findRecent(limit: number = 10): Promise<Note[]> {
    // TODO: Dispatch hub needs global recent notes endpoint
    console.warn('ApiNotesRepository.findRecent: Not yet implemented in dispatch hub');
    return [];
  }

  /**
   * Update a note
   * Note: API needs update endpoint for notes
   */
  async update(note_id: string, updates: NoteUpdate): Promise<Note | null> {
    // TODO: Dispatch hub needs PUT /api/locations/:id/notes/:noteId endpoint
    console.warn('ApiNotesRepository.update: Not yet implemented in dispatch hub');
    throw new Error('Note update not yet supported via API');
  }

  /**
   * Delete a note
   */
  async delete(locid: string, note_id: string): Promise<void> {
    await this.client.deleteLocationNote(locid, note_id);
  }

  /**
   * Get total note count for a location
   */
  async countByLocation(locid: string): Promise<number> {
    const notes = await this.findByLocation(locid);
    return notes.length;
  }

  /**
   * Get notes by type for a location
   */
  async findByLocationAndType(locid: string, note_type: string): Promise<Note[]> {
    const notes = await this.findByLocation(locid);
    return notes.filter((n) => n.note_type === note_type);
  }

  /**
   * Map API LocationNote to local Note format
   */
  private mapApiToLocal(api: LocationNote, locid: string): Note {
    return {
      note_id: api.id,
      locid: locid,
      note_text: api.noteText,
      note_date: api.createdAt,
      auth_imp: null, // Not in API yet
      note_type: api.noteType || 'general',
      locnam: undefined, // Would need separate location lookup
    };
  }
}
