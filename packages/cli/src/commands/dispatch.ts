/**
 * Dispatch commands
 *
 * CLI commands for interacting with the dispatch hub.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createInterface } from 'readline';
import {
  getDispatchClient,
  destroyDispatchClient,
  type DispatchStatus,
  type JobUpdate,
  type Worker,
} from '@aa/services';

export function registerDispatchCommands(program: Command): void {
  const dispatch = program
    .command('dispatch')
    .description('Manage dispatch hub connection and jobs');

  // Status
  dispatch
    .command('status')
    .description('Show dispatch connection status')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Checking dispatch status...').start();

      try {
        const client = getDispatchClient();
        const status: DispatchStatus = client.getStatus();
        const hubReachable = await client.checkConnection();

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify({ ...status, hubReachable }, null, 2));
          return;
        }

        console.log(chalk.bold.cyan('\nDispatch Status\n'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`Hub URL:        ${status.hubUrl}`);
        console.log(`Hub Reachable:  ${hubReachable ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`Connected:      ${status.connected ? chalk.green('Yes') : chalk.yellow('No')}`);
        console.log(`Authenticated:  ${status.authenticated ? chalk.green('Yes') : chalk.yellow('No')}`);
        console.log(`Queued Jobs:    ${status.queuedJobsCount}`);

        destroyDispatchClient();
      } catch (error) {
        spinner.fail('Failed to get status');
        console.error(chalk.red((error as Error).message));
        destroyDispatchClient();
        process.exit(1);
      }
    });

  // Login
  dispatch
    .command('login')
    .description('Login to dispatch hub')
    .option('-u, --username <username>', 'Username')
    .option('-p, --password <password>', 'Password')
    .action(async (options) => {
      try {
        let username = options.username;
        let password = options.password;

        // Prompt for credentials if not provided
        if (!username || !password) {
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          });

          const prompt = (question: string): Promise<string> => {
            return new Promise((resolve) => {
              rl.question(question, (answer) => {
                resolve(answer);
              });
            });
          };

          if (!username) {
            username = await prompt('Username: ');
          }
          if (!password) {
            password = await prompt('Password: ');
          }
          rl.close();
        }

        const spinner = ora('Logging in...').start();

        const client = getDispatchClient();
        await client.login(username, password);

        spinner.succeed('Logged in successfully');
        destroyDispatchClient();
      } catch (error) {
        console.error(chalk.red(`Login failed: ${(error as Error).message}`));
        destroyDispatchClient();
        process.exit(1);
      }
    });

  // Logout
  dispatch
    .command('logout')
    .description('Logout from dispatch hub')
    .action(async () => {
      const spinner = ora('Logging out...').start();

      try {
        const client = getDispatchClient();
        await client.logout();

        spinner.succeed('Logged out');
        destroyDispatchClient();
      } catch (error) {
        spinner.fail('Logout failed');
        console.error(chalk.red((error as Error).message));
        destroyDispatchClient();
        process.exit(1);
      }
    });

  // List jobs
  dispatch
    .command('jobs')
    .description('List jobs')
    .option('-s, --status <status>', 'Filter by status (pending, running, completed, failed)')
    .option('-l, --limit <number>', 'Limit results', '20')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Fetching jobs...').start();

      try {
        const client = getDispatchClient();
        await client.initialize();

        const jobs: JobUpdate[] = await client.listJobs({
          status: options.status,
          limit: parseInt(options.limit, 10),
        });

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(jobs, null, 2));
          destroyDispatchClient();
          return;
        }

        console.log(chalk.bold.cyan('\nJobs\n'));
        console.log(chalk.gray('─'.repeat(80)));

        if (jobs.length === 0) {
          console.log(chalk.yellow('No jobs found'));
          destroyDispatchClient();
          return;
        }

        for (const job of jobs) {
          const statusColor =
            job.status === 'completed'
              ? chalk.green
              : job.status === 'failed'
                ? chalk.red
                : job.status === 'running'
                  ? chalk.blue
                  : chalk.yellow;

          console.log(
            `${chalk.gray(job.jobId.slice(0, 8))} ${statusColor(job.status.padEnd(10))} ${job.workerId || '-'}`
          );
        }

        console.log(chalk.gray(`\nShowing ${jobs.length} jobs`));
        destroyDispatchClient();
      } catch (error) {
        spinner.fail('Failed to fetch jobs');
        console.error(chalk.red((error as Error).message));
        destroyDispatchClient();
        process.exit(1);
      }
    });

  // Get job details
  dispatch
    .command('job <jobId>')
    .description('Get job details')
    .option('--json', 'Output as JSON')
    .action(async (jobId, options) => {
      const spinner = ora('Fetching job...').start();

      try {
        const client = getDispatchClient();
        await client.initialize();

        const job = await client.getJob(jobId);

        spinner.stop();

        if (!job) {
          console.log(chalk.yellow(`Job not found: ${jobId}`));
          destroyDispatchClient();
          process.exit(1);
        }

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(job, null, 2));
          destroyDispatchClient();
          return;
        }

        console.log(chalk.bold.cyan('\nJob Details\n'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log(`ID:        ${job.jobId}`);
        console.log(`Status:    ${job.status}`);
        console.log(`Worker:    ${job.workerId || '-'}`);
        console.log(`Retries:   ${job.retryCount || 0}`);
        if (job.error) {
          console.log(`Error:     ${chalk.red(job.error)}`);
        }
        if (job.result) {
          console.log(`Result:    ${JSON.stringify(job.result)}`);
        }

        destroyDispatchClient();
      } catch (error) {
        spinner.fail('Failed to fetch job');
        console.error(chalk.red((error as Error).message));
        destroyDispatchClient();
        process.exit(1);
      }
    });

  // Cancel job
  dispatch
    .command('cancel <jobId>')
    .description('Cancel a job')
    .action(async (jobId) => {
      const spinner = ora('Cancelling job...').start();

      try {
        const client = getDispatchClient();
        await client.initialize();
        await client.cancelJob(jobId);

        spinner.succeed(`Job cancelled: ${jobId}`);
        destroyDispatchClient();
      } catch (error) {
        spinner.fail('Failed to cancel job');
        console.error(chalk.red((error as Error).message));
        destroyDispatchClient();
        process.exit(1);
      }
    });

  // List workers
  dispatch
    .command('workers')
    .description('List connected workers')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      const spinner = ora('Fetching workers...').start();

      try {
        const client = getDispatchClient();
        await client.initialize();

        const workers: Worker[] = await client.listWorkers();

        spinner.stop();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(workers, null, 2));
          destroyDispatchClient();
          return;
        }

        console.log(chalk.bold.cyan('\nWorkers\n'));
        console.log(chalk.gray('─'.repeat(60)));

        if (workers.length === 0) {
          console.log(chalk.yellow('No workers connected'));
          destroyDispatchClient();
          return;
        }

        for (const worker of workers) {
          const statusColor =
            worker.status === 'online'
              ? chalk.green
              : worker.status === 'busy'
                ? chalk.blue
                : chalk.red;

          console.log(
            `${chalk.bold(worker.name.padEnd(20))} ${statusColor(worker.status.padEnd(10))} ${worker.plugins.join(', ')}`
          );
        }

        destroyDispatchClient();
      } catch (error) {
        spinner.fail('Failed to fetch workers');
        console.error(chalk.red((error as Error).message));
        destroyDispatchClient();
        process.exit(1);
      }
    });

  // Set hub URL
  dispatch
    .command('set-hub <url>')
    .description('Set dispatch hub URL')
    .action(async (url) => {
      const spinner = ora('Setting hub URL...').start();

      try {
        const client = getDispatchClient({ hubUrl: url });
        const reachable = await client.checkConnection();

        if (reachable) {
          spinner.succeed(`Hub URL set: ${url}`);
        } else {
          spinner.warn(`Hub URL set but not reachable: ${url}`);
        }

        destroyDispatchClient();
      } catch (error) {
        spinner.fail('Failed to set hub URL');
        console.error(chalk.red((error as Error).message));
        destroyDispatchClient();
        process.exit(1);
      }
    });

  // Show queued jobs (offline queue)
  dispatch
    .command('queue')
    .description('Show offline job queue')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        const client = getDispatchClient();
        const queued = client.getQueuedJobs();

        if (options.json || program.opts().json) {
          console.log(JSON.stringify(queued, null, 2));
          destroyDispatchClient();
          return;
        }

        console.log(chalk.bold.cyan('\nOffline Queue\n'));
        console.log(chalk.gray('─'.repeat(60)));

        if (queued.length === 0) {
          console.log(chalk.green('Queue is empty'));
          destroyDispatchClient();
          return;
        }

        for (const item of queued) {
          console.log(
            `${chalk.gray(item.id.slice(0, 8))} ${item.job.type.padEnd(12)} ${item.job.plugin.padEnd(15)} attempts: ${item.attempts}`
          );
        }

        console.log(chalk.gray(`\n${queued.length} jobs queued`));
        destroyDispatchClient();
      } catch (error) {
        console.error(chalk.red((error as Error).message));
        destroyDispatchClient();
        process.exit(1);
      }
    });
}
