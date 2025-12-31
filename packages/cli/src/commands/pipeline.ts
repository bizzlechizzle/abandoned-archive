/**
 * Pipeline Commands
 *
 * CLI commands for orchestrating pipeline tools:
 * - wake-n-blake, shoemaker, visual-buffet, national-treasure
 */

import { Command } from 'commander';
import {
  createPipelineOrchestrator,
  PipelineHelpers,
} from '@aa/services';
import type { PipelineTool, ProgressMessage } from '@aa/services';

/**
 * Format progress for display
 */
function formatProgress(msg: ProgressMessage): string {
  const percent = msg.percent_complete.toFixed(1);
  const stage = msg.stage?.display_name || msg.stage?.name || 'Processing';
  const item = msg.current?.item ? ` - ${msg.current.item}` : '';
  const items = msg.items ? ` (${msg.items.completed}/${msg.items.total})` : '';
  return `[${percent}%] ${stage}${items}${item}`;
}

/**
 * Register pipeline commands
 */
export function registerPipelineCommands(program: Command): void {
  const pipeline = program
    .command('pipeline')
    .alias('pipe')
    .description('Run pipeline tools (wake-n-blake, shoemaker, visual-buffet, national-treasure)');

  // Run arbitrary tool
  pipeline
    .command('run <tool> [args...]')
    .description('Run a pipeline tool with arguments')
    .option('-t, --timeout <ms>', 'Timeout in milliseconds', '300000')
    .option('--cwd <path>', 'Working directory')
    .option('-q, --quiet', 'Suppress progress output')
    .action(async (tool: string, args: string[], options) => {
      const orchestrator = createPipelineOrchestrator();

      try {
        await orchestrator.start();

        const result = await orchestrator.run({
          tool: tool as PipelineTool,
          args,
          cwd: options.cwd,
          timeout: parseInt(options.timeout),
          onProgress: options.quiet ? undefined : (msg) => {
            process.stdout.write(`\r${formatProgress(msg)}`);
          },
        });

        if (!options.quiet) {
          console.log('\n');
        }

        if (result.status === 'completed') {
          console.log(`Completed in ${(result.durationMs / 1000).toFixed(1)}s`);
        } else {
          console.error(`Failed: ${result.error}`);
          process.exitCode = 1;
        }

        if (result.stdout && !options.quiet) {
          console.log(result.stdout);
        }
      } finally {
        await orchestrator.stop();
      }
    });

  // Import command (wake-n-blake wrapper)
  pipeline
    .command('import <source> <dest>')
    .description('Import files using wake-n-blake')
    .option('--sidecar', 'Generate XMP sidecars')
    .option('--dedup', 'Skip duplicate files')
    .option('--detect-device', 'Detect source device')
    .option('-b, --batch <name>', 'Batch name')
    .option('-q, --quiet', 'Suppress progress output')
    .action(async (source: string, dest: string, options) => {
      const orchestrator = createPipelineOrchestrator();

      try {
        await orchestrator.start();

        const result = await PipelineHelpers.import(orchestrator, source, dest, {
          sidecar: options.sidecar,
          dedup: options.dedup,
          detectDevice: options.detectDevice,
          batch: options.batch,
          onProgress: options.quiet ? undefined : (msg) => {
            process.stdout.write(`\r${formatProgress(msg)}`);
          },
        });

        if (!options.quiet) {
          console.log('\n');
        }

        if (result.status === 'completed') {
          console.log(`Import completed in ${(result.durationMs / 1000).toFixed(1)}s`);
        } else {
          console.error(`Import failed: ${result.error}`);
          process.exitCode = 1;
        }
      } finally {
        await orchestrator.stop();
      }
    });

  // Thumbnail command (shoemaker wrapper)
  pipeline
    .command('thumb <path>')
    .description('Generate thumbnails using shoemaker')
    .option('-p, --preset <preset>', 'Preset: fast, quality, portable', 'fast')
    .option('-r, --recursive', 'Process subdirectories')
    .option('--proxy', 'Generate video proxies')
    .option('-q, --quiet', 'Suppress progress output')
    .action(async (path: string, options) => {
      const orchestrator = createPipelineOrchestrator();

      try {
        await orchestrator.start();

        const result = await PipelineHelpers.thumbnail(orchestrator, path, {
          preset: options.preset,
          recursive: options.recursive,
          proxy: options.proxy,
          onProgress: options.quiet ? undefined : (msg) => {
            process.stdout.write(`\r${formatProgress(msg)}`);
          },
        });

        if (!options.quiet) {
          console.log('\n');
        }

        if (result.status === 'completed') {
          console.log(`Thumbnails generated in ${(result.durationMs / 1000).toFixed(1)}s`);
        } else {
          console.error(`Thumbnail generation failed: ${result.error}`);
          process.exitCode = 1;
        }
      } finally {
        await orchestrator.stop();
      }
    });

  // Tag command (visual-buffet wrapper)
  pipeline
    .command('tag <path>')
    .description('Tag images using visual-buffet ML models')
    .option('-s, --size <size>', 'Image size: little, small, large, huge', 'small')
    .option('--plugin <plugin...>', 'Plugins to use')
    .option('-r, --recursive', 'Process subdirectories')
    .option('-q, --quiet', 'Suppress progress output')
    .action(async (path: string, options) => {
      const orchestrator = createPipelineOrchestrator();

      try {
        await orchestrator.start();

        const result = await PipelineHelpers.tag(orchestrator, path, {
          size: options.size,
          plugins: options.plugin,
          recursive: options.recursive,
          onProgress: options.quiet ? undefined : (msg) => {
            process.stdout.write(`\r${formatProgress(msg)}`);
          },
        });

        if (!options.quiet) {
          console.log('\n');
        }

        if (result.status === 'completed') {
          console.log(`Tagging completed in ${(result.durationMs / 1000).toFixed(1)}s`);
        } else {
          console.error(`Tagging failed: ${result.error}`);
          process.exitCode = 1;
        }
      } finally {
        await orchestrator.stop();
      }
    });

  // Capture command (national-treasure wrapper)
  pipeline
    .command('capture <url>')
    .description('Capture web page using national-treasure')
    .option('-f, --formats <formats>', 'Formats: screenshot,pdf,html,warc', 'screenshot,html')
    .option('-o, --output <dir>', 'Output directory')
    .option('--visible', 'Run with visible browser')
    .option('-q, --quiet', 'Suppress progress output')
    .action(async (url: string, options) => {
      const orchestrator = createPipelineOrchestrator();

      try {
        await orchestrator.start();

        const formats = options.formats.split(',') as ('screenshot' | 'pdf' | 'html' | 'warc')[];

        const result = await PipelineHelpers.capture(orchestrator, url, {
          formats,
          output: options.output,
          visible: options.visible,
          onProgress: options.quiet ? undefined : (msg) => {
            process.stdout.write(`\r${formatProgress(msg)}`);
          },
        });

        if (!options.quiet) {
          console.log('\n');
        }

        if (result.status === 'completed') {
          console.log(`Capture completed in ${(result.durationMs / 1000).toFixed(1)}s`);
        } else {
          console.error(`Capture failed: ${result.error}`);
          process.exitCode = 1;
        }
      } finally {
        await orchestrator.stop();
      }
    });

  // Status command
  pipeline
    .command('status')
    .description('Show pipeline status')
    .action(async () => {
      const orchestrator = createPipelineOrchestrator();

      try {
        await orchestrator.start();

        const activeJobs = orchestrator.getActiveJobs();

        if (activeJobs.length === 0) {
          console.log('No active pipeline jobs');
        } else {
          console.log(`Active jobs (${activeJobs.length}):`);
          for (const sessionId of activeJobs) {
            const status = orchestrator.getStatus(sessionId);
            const progress = orchestrator.getProgress(sessionId);
            console.log(`  ${sessionId}: ${status}`);
            if (progress) {
              console.log(`    ${formatProgress(progress)}`);
            }
          }
        }
      } finally {
        await orchestrator.stop();
      }
    });
}
