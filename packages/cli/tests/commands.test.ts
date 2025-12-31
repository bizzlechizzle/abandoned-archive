/**
 * CLI Commands Tests
 *
 * Tests CLI command registration and basic functionality.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerLocationCommands } from '../src/commands/location';
import { registerMediaCommands } from '../src/commands/media';
import { registerImportCommands } from '../src/commands/import';
import { registerExportCommands } from '../src/commands/export';
import { registerDbCommands } from '../src/commands/db';
import { registerConfigCommands } from '../src/commands/config';
import { registerRefmapCommands } from '../src/commands/refmap';
import { registerCollectionCommands } from '../src/commands/collection';
import { registerTagCommands } from '../src/commands/tag';

describe('CLI Commands', () => {
  let program: Command;

  beforeEach(() => {
    program = new Command();
    program.name('aa').version('0.0.1');
  });

  describe('Location Commands', () => {
    beforeEach(() => {
      registerLocationCommands(program);
    });

    it('should register location command', () => {
      const location = program.commands.find(c => c.name() === 'location');
      expect(location).toBeDefined();
    });

    it('should register subcommands', () => {
      const location = program.commands.find(c => c.name() === 'location');
      const subcommands = location?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('list');
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('create');
      expect(subcommands).toContain('update');
      expect(subcommands).toContain('delete');
      expect(subcommands).toContain('duplicates');
      expect(subcommands).toContain('stats');
    });

    it('should have correct options for list command', () => {
      const location = program.commands.find(c => c.name() === 'location');
      const list = location?.commands.find(c => c.name() === 'list');
      const optionNames = list?.options.map(o => o.long) || [];

      expect(optionNames).toContain('--type');
      expect(optionNames).toContain('--status');
      expect(optionNames).toContain('--state');
      expect(optionNames).toContain('--search');
      expect(optionNames).toContain('--limit');
      expect(optionNames).toContain('--json');
    });

    it('should have correct options for create command', () => {
      const location = program.commands.find(c => c.name() === 'location');
      const create = location?.commands.find(c => c.name() === 'create');
      const optionNames = create?.options.map(o => o.long) || [];

      expect(optionNames).toContain('--name');
      expect(optionNames).toContain('--lat');
      expect(optionNames).toContain('--lon');
      expect(optionNames).toContain('--state');
    });
  });

  describe('Media Commands', () => {
    beforeEach(() => {
      registerMediaCommands(program);
    });

    it('should register media command', () => {
      const media = program.commands.find(c => c.name() === 'media');
      expect(media).toBeDefined();
    });

    it('should register subcommands', () => {
      const media = program.commands.find(c => c.name() === 'media');
      const subcommands = media?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('list');
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('assign');
      expect(subcommands).toContain('unassign');
      expect(subcommands).toContain('delete');
      expect(subcommands).toContain('stats');
    });
  });

  describe('Import Commands', () => {
    beforeEach(() => {
      registerImportCommands(program);
    });

    it('should register import command', () => {
      const importCmd = program.commands.find(c => c.name() === 'import');
      expect(importCmd).toBeDefined();
    });

    it('should register subcommands', () => {
      const importCmd = program.commands.find(c => c.name() === 'import');
      const subcommands = importCmd?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('dir');
      expect(subcommands).toContain('file');
      expect(subcommands).toContain('jobs');
    });
  });

  describe('Export Commands', () => {
    beforeEach(() => {
      registerExportCommands(program);
    });

    it('should register export command', () => {
      const exportCmd = program.commands.find(c => c.name() === 'export');
      expect(exportCmd).toBeDefined();
    });

    it('should register subcommands', () => {
      const exportCmd = program.commands.find(c => c.name() === 'export');
      const subcommands = exportCmd?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('locations');
      expect(subcommands).toContain('media');
      expect(subcommands).toContain('location');
      expect(subcommands).toContain('gpx');
      expect(subcommands).toContain('backup');
    });
  });

  describe('Database Commands', () => {
    beforeEach(() => {
      registerDbCommands(program);
    });

    it('should register db command', () => {
      const db = program.commands.find(c => c.name() === 'db');
      expect(db).toBeDefined();
    });

    it('should register subcommands', () => {
      const db = program.commands.find(c => c.name() === 'db');
      const subcommands = db?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('init');
      expect(subcommands).toContain('info');
      expect(subcommands).toContain('migrate');
      expect(subcommands).toContain('vacuum');
      expect(subcommands).toContain('check');
      expect(subcommands).toContain('reset');
    });
  });

  describe('Config Commands', () => {
    beforeEach(() => {
      registerConfigCommands(program);
    });

    it('should register config command', () => {
      const config = program.commands.find(c => c.name() === 'config');
      expect(config).toBeDefined();
    });

    it('should register subcommands', () => {
      const config = program.commands.find(c => c.name() === 'config');
      const subcommands = config?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('show');
      expect(subcommands).toContain('get');
      expect(subcommands).toContain('set');
      expect(subcommands).toContain('unset');
      expect(subcommands).toContain('keys');
      expect(subcommands).toContain('init');
    });
  });

  describe('Refmap Commands', () => {
    beforeEach(() => {
      registerRefmapCommands(program);
    });

    it('should register refmap command', () => {
      const refmap = program.commands.find(c => c.name() === 'refmap');
      expect(refmap).toBeDefined();
    });

    it('should register subcommands', () => {
      const refmap = program.commands.find(c => c.name() === 'refmap');
      const subcommands = refmap?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('list');
      expect(subcommands).toContain('import');
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('match');
      expect(subcommands).toContain('delete');
      expect(subcommands).toContain('unmatched');
    });
  });

  describe('Collection Commands', () => {
    beforeEach(() => {
      registerCollectionCommands(program);
    });

    it('should register collection command', () => {
      const collection = program.commands.find(c => c.name() === 'collection');
      expect(collection).toBeDefined();
    });

    it('should register subcommands', () => {
      const collection = program.commands.find(c => c.name() === 'collection');
      const subcommands = collection?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('list');
      expect(subcommands).toContain('create');
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('add');
      expect(subcommands).toContain('remove');
      expect(subcommands).toContain('delete');
    });
  });

  describe('Tag Commands', () => {
    beforeEach(() => {
      registerTagCommands(program);
    });

    it('should register tag command', () => {
      const tag = program.commands.find(c => c.name() === 'tag');
      expect(tag).toBeDefined();
    });

    it('should register subcommands', () => {
      const tag = program.commands.find(c => c.name() === 'tag');
      const subcommands = tag?.commands.map(c => c.name()) || [];

      expect(subcommands).toContain('list');
      expect(subcommands).toContain('create');
      expect(subcommands).toContain('assign');
      expect(subcommands).toContain('unassign');
      expect(subcommands).toContain('show');
      expect(subcommands).toContain('delete');
      expect(subcommands).toContain('rename');
      expect(subcommands).toContain('categories');
    });
  });

  describe('Full CLI', () => {
    beforeEach(() => {
      registerLocationCommands(program);
      registerMediaCommands(program);
      registerImportCommands(program);
      registerExportCommands(program);
      registerRefmapCommands(program);
      registerCollectionCommands(program);
      registerTagCommands(program);
      registerDbCommands(program);
      registerConfigCommands(program);
    });

    it('should register all top-level commands', () => {
      const commandNames = program.commands.map(c => c.name());

      expect(commandNames).toContain('location');
      expect(commandNames).toContain('media');
      expect(commandNames).toContain('import');
      expect(commandNames).toContain('export');
      expect(commandNames).toContain('refmap');
      expect(commandNames).toContain('collection');
      expect(commandNames).toContain('tag');
      expect(commandNames).toContain('db');
      expect(commandNames).toContain('config');
    });

    it('should have exactly 9 command groups', () => {
      expect(program.commands).toHaveLength(9);
    });
  });
});
