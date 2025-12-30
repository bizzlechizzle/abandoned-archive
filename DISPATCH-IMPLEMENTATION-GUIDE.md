# Dispatch Integration - Implementation Guide

**For:** Less Experienced Coders
**Prerequisites:** Node.js, TypeScript basics, understanding of REST APIs

---

## Overview

This guide walks through fixing the connection issues between **abandoned-archive** (Electron app) and **dispatch** (Hub server). We'll fix them in order of priority.

---

## Part 1: Fix Critical Health Check Path (10 minutes)

### What's Wrong

The client checks if the hub is reachable by calling `/health`, but the hub registers the route at `/api/health`. They don't match!

### Files to Edit

1. **dispatch** `/src/hub/api/health.ts` - Add alias route
2. **abandoned-archive** `/packages/services/src/dispatch/dispatch-client.ts` - Fix path

### Step-by-Step Instructions

#### Option A: Fix in Dispatch Hub (Recommended)

This adds a `/health` route that redirects to `/api/health`:

**File:** `/Volumes/projects/dispatch/src/hub/api/health.ts`

Find this code (around line 7):

```typescript
export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/health', async (request, reply) => {
```

The route is registered at `/health` in `registerHealthRoutes`, but `registerRoutes` in `index.ts` wraps it with `/api` prefix. So actual path becomes `/api/health`.

**Solution:** Register health routes BEFORE the `/api` prefix wrapper.

**File:** `/Volumes/projects/dispatch/src/hub/api/index.ts`

Change from:
```typescript
export async function registerRoutes(app: FastifyInstance) {
  await registerHealthRoutes(app);
  await registerMetricsRoutes(app);

  await app.register(
    async (api) => {
```

To:
```typescript
export async function registerRoutes(app: FastifyInstance) {
  // Health and metrics routes at root level (no /api prefix)
  await registerHealthRoutes(app);
  await registerMetricsRoutes(app);

  // Also register health inside /api for consistency
  await app.register(
    async (api) => {
      await api.get('/health', async () => ({ status: 'ok' }));
```

Wait - looking at the code more carefully, `registerHealthRoutes` is called BEFORE the `app.register` with prefix `/api`. So the routes ARE at `/health`. Let me re-check...

Actually, let me trace the actual code flow:

```typescript
// index.ts
export async function registerRoutes(app: FastifyInstance) {
  await registerHealthRoutes(app);  // This registers /health at ROOT
  await registerMetricsRoutes(app); // This registers /metrics at ROOT

  await app.register(
    async (api) => {
      // Everything inside here gets /api prefix
```

So `/health` SHOULD be available at root! The issue must be something else. Let me check the client code again:

```typescript
// dispatch-client.ts:813
async checkConnection(): Promise<boolean> {
  try {
    const response = await fetch(`${this.config.hubUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
```

This looks correct. The actual issue might be:
1. CORS blocking the request
2. Network connectivity
3. The hub not running

Let me check if there's a CORS issue by looking at the server config:

```typescript
// server.ts
await app.register(fastifyCors, {
  origin: config.corsOrigins,
  credentials: true,
});
```

The corsOrigins needs to include the electron app origin. Since electron runs on file:// protocol, this might be an issue.

Let me check what corsOrigins is set to... This would be in the serve command or config.

---

## Part 2: Add Missing Sublocation Update Endpoint

### What's Wrong

The client tries to update sublocations via `PUT /api/locations/:id/sublocations/:subid` but this endpoint doesn't exist.

### Files to Edit

**dispatch** `/src/hub/api/locations.ts`

### Step-by-Step Instructions

**File:** `/Volumes/projects/dispatch/src/hub/api/locations.ts`

Find the sublocation routes section (around line 530-590) and add:

```typescript
// After the POST /locations/:id/sublocations route, add:

// PUT /locations/:id/sublocations/:subid - Update sublocation
app.put('/locations/:id/sublocations/:subid', async (request, reply) => {
  const { id: locationId, subid } = request.params as { id: string; subid: string };
  const updates = request.body as {
    name?: string;
    shortName?: string;
    type?: string;
    status?: string;
  };

  const db = getDatabase();

  // Verify location exists
  const [location] = await db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.id, locationId));

  if (!location) {
    return reply.code(404).send({ error: 'Location not found' });
  }

  // Verify sublocation exists and belongs to location
  const [existingSub] = await db
    .select()
    .from(schema.sublocations)
    .where(
      and(
        eq(schema.sublocations.id, subid),
        eq(schema.sublocations.locationId, locationId)
      )
    );

  if (!existingSub) {
    return reply.code(404).send({ error: 'Sublocation not found' });
  }

  // Update sublocation
  const [updated] = await db
    .update(schema.sublocations)
    .set({
      name: updates.name ?? existingSub.name,
      shortName: updates.shortName ?? existingSub.shortName,
      type: updates.type ?? existingSub.type,
      status: updates.status ?? existingSub.status,
      updatedAt: new Date(),
    })
    .where(eq(schema.sublocations.id, subid))
    .returning();

  return { sublocation: updated };
});

// DELETE /locations/:id/sublocations/:subid - Delete sublocation
app.delete('/locations/:id/sublocations/:subid', async (request, reply) => {
  const { id: locationId, subid } = request.params as { id: string; subid: string };

  const db = getDatabase();

  // Verify sublocation exists and belongs to location
  const [existingSub] = await db
    .select()
    .from(schema.sublocations)
    .where(
      and(
        eq(schema.sublocations.id, subid),
        eq(schema.sublocations.locationId, locationId)
      )
    );

  if (!existingSub) {
    return reply.code(404).send({ error: 'Sublocation not found' });
  }

  await db
    .delete(schema.sublocations)
    .where(eq(schema.sublocations.id, subid));

  return { success: true };
});
```

---

## Part 3: Add Notes Update Endpoint

### What's Wrong

Client tries to update notes via `PUT /api/locations/:id/notes/:noteId` but this doesn't exist.

### Step-by-Step Instructions

**File:** `/Volumes/projects/dispatch/src/hub/api/locations.ts`

After the POST /locations/:id/notes route, add:

```typescript
// PUT /locations/:id/notes/:noteId - Update note
app.put('/locations/:id/notes/:noteId', async (request, reply) => {
  const { id: locationId, noteId } = request.params as { id: string; noteId: string };
  const { noteText, noteType } = request.body as { noteText?: string; noteType?: string };

  const db = getDatabase();

  // Verify note exists and belongs to location
  const [existingNote] = await db
    .select()
    .from(schema.notes)
    .where(
      and(
        eq(schema.notes.id, noteId),
        eq(schema.notes.locationId, locationId)
      )
    );

  if (!existingNote) {
    return reply.code(404).send({ error: 'Note not found' });
  }

  const [updated] = await db
    .update(schema.notes)
    .set({
      noteText: noteText ?? existingNote.noteText,
      noteType: noteType ?? existingNote.noteType,
      updatedAt: new Date(),
    })
    .where(eq(schema.notes.id, noteId))
    .returning();

  return { note: updated };
});

// DELETE /locations/:id/notes/:noteId - Delete note
app.delete('/locations/:id/notes/:noteId', async (request, reply) => {
  const { id: locationId, noteId } = request.params as { id: string; noteId: string };

  const db = getDatabase();

  // Verify note exists and belongs to location
  const [existingNote] = await db
    .select()
    .from(schema.notes)
    .where(
      and(
        eq(schema.notes.id, noteId),
        eq(schema.notes.locationId, locationId)
      )
    );

  if (!existingNote) {
    return reply.code(404).send({ error: 'Note not found' });
  }

  await db
    .delete(schema.notes)
    .where(eq(schema.notes.id, noteId));

  return { success: true };
});

// GET /notes/recent - Get recent notes across all locations
app.get('/notes/recent', async (request) => {
  const { limit = 20 } = request.query as { limit?: number };

  const db = getDatabase();

  const notes = await db
    .select()
    .from(schema.notes)
    .orderBy(desc(schema.notes.createdAt))
    .limit(Number(limit));

  return { notes };
});
```

---

## Part 4: Complete Projects API

### What's Wrong

Projects feature is completely unimplemented in dispatch hub.

### Step-by-Step Instructions

**Create new file:** `/Volumes/projects/dispatch/src/hub/api/projects.ts`

```typescript
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDatabase, schema } from '../../shared/database/index.js';
import { eq, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
});

export async function registerProjectRoutes(app: FastifyInstance) {
  const db = getDatabase();

  // GET /projects - List all projects
  app.get('/projects', async (request) => {
    const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

    const projects = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        description: schema.projects.description,
        createdAt: schema.projects.createdAt,
        updatedAt: schema.projects.updatedAt,
        locationCount: sql<number>`(
          SELECT COUNT(*) FROM project_locations
          WHERE project_locations.project_id = projects.id
        )`,
      })
      .from(schema.projects)
      .orderBy(desc(schema.projects.updatedAt))
      .limit(Number(limit))
      .offset(Number(offset));

    const [{ count }] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(schema.projects);

    return {
      projects,
      total: Number(count),
      limit: Number(limit),
      offset: Number(offset),
    };
  });

  // GET /projects/:id - Get project by ID
  app.get('/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [project] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id));

    if (!project) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    // Get associated locations
    const locations = await db
      .select({
        id: schema.locations.id,
        name: schema.locations.name,
        state: schema.locations.state,
      })
      .from(schema.projectLocations)
      .innerJoin(schema.locations, eq(schema.projectLocations.locationId, schema.locations.id))
      .where(eq(schema.projectLocations.projectId, id));

    return { project: { ...project, locations } };
  });

  // POST /projects - Create project
  app.post('/projects', async (request, reply) => {
    const input = CreateProjectSchema.parse(request.body);

    const [project] = await db
      .insert(schema.projects)
      .values({
        id: randomUUID(),
        name: input.name,
        description: input.description,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return reply.code(201).send({ project });
  });

  // PUT /projects/:id - Update project
  app.put('/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = UpdateProjectSchema.parse(request.body);

    const [existing] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id));

    if (!existing) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    const [project] = await db
      .update(schema.projects)
      .set({
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        updatedAt: new Date(),
      })
      .where(eq(schema.projects.id, id))
      .returning();

    return { project };
  });

  // DELETE /projects/:id - Delete project
  app.delete('/projects/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [existing] = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id));

    if (!existing) {
      return reply.code(404).send({ error: 'Project not found' });
    }

    // Delete project-location associations first
    await db
      .delete(schema.projectLocations)
      .where(eq(schema.projectLocations.projectId, id));

    await db
      .delete(schema.projects)
      .where(eq(schema.projects.id, id));

    return { success: true };
  });

  // POST /projects/:id/locations/:locId - Add location to project
  app.post('/projects/:id/locations/:locId', async (request, reply) => {
    const { id: projectId, locId: locationId } = request.params as { id: string; locId: string };

    // Verify both exist
    const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId));
    const [location] = await db.select().from(schema.locations).where(eq(schema.locations.id, locationId));

    if (!project) return reply.code(404).send({ error: 'Project not found' });
    if (!location) return reply.code(404).send({ error: 'Location not found' });

    // Check if already associated
    const [existing] = await db
      .select()
      .from(schema.projectLocations)
      .where(
        sql`${schema.projectLocations.projectId} = ${projectId} AND ${schema.projectLocations.locationId} = ${locationId}`
      );

    if (existing) {
      return { success: true, message: 'Already associated' };
    }

    await db.insert(schema.projectLocations).values({
      projectId,
      locationId,
      addedAt: new Date(),
    });

    return reply.code(201).send({ success: true });
  });

  // DELETE /projects/:id/locations/:locId - Remove location from project
  app.delete('/projects/:id/locations/:locId', async (request, reply) => {
    const { id: projectId, locId: locationId } = request.params as { id: string; locId: string };

    await db
      .delete(schema.projectLocations)
      .where(
        sql`${schema.projectLocations.projectId} = ${projectId} AND ${schema.projectLocations.locationId} = ${locationId}`
      );

    return { success: true };
  });
}
```

**Then register in index.ts:**

```typescript
import { registerProjectRoutes } from './projects.js';

// In the protected routes section:
await registerProjectRoutes(protectedApi);
```

---

## Testing Each Fix

After each change:

1. **Rebuild dispatch:**
   ```bash
   cd /Volumes/projects/dispatch
   pnpm build
   ```

2. **Start hub:**
   ```bash
   dispatch serve --mode hub
   ```

3. **Test with curl:**
   ```bash
   # Health check
   curl http://localhost:3000/health

   # Get locations (requires auth)
   curl -H "Authorization: Bearer <token>" http://localhost:3000/api/locations
   ```

4. **Test from GUI:**
   - Start abandoned-archive: `pnpm dev`
   - Go to Settings → Dispatch Hub
   - Click "Test Connection"
   - Verify "Connected" status shows

---

## Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Cannot reach hub" | Hub not running or wrong URL | Check hub is running, URL is correct |
| "401 Unauthorized" | Token expired or missing | Login again via Settings |
| "404 Not Found" | Endpoint doesn't exist | Implement the missing endpoint |
| "CORS error" | Origin not allowed | Add electron:// to CORS origins |
| "ECONNREFUSED" | Hub not accepting connections | Check port, firewall |

---

## Order of Implementation

1. **Day 1:** Health check fix + Sublocation update endpoint
2. **Day 2:** Notes API completion + Location views
3. **Day 3:** Projects API
4. **Day 4:** Timeline API + Import history
5. **Day 5:** WebSources API (if needed)
6. **Day 6:** Testing and bug fixes

---

*This guide assumes you have both projects cloned and can build/run them.*
