import * as a from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { Service } from 'typedi';

import { TaskRunnerAuthService } from './auth/task-runner-auth.service';
import { OnShutdown } from '../decorators/on-shutdown';

type ChildProcess = ReturnType<typeof spawn>;

@Service()
export class TaskRunnerProcess {
	private process: ChildProcess | null = null;

	private runPromise: Promise<void> | null = null;

	private isShuttingDown = false;

	constructor(private readonly authService: TaskRunnerAuthService) {}

	async start() {
		a.ok(!this.process, 'Task Runner Process already running');
		const grantToken = await this.authService.createGrantToken();
		const startScript = require.resolve('@n8n/task-runner');

		this.process = spawn('node', [startScript], {
			env: {
				PATH: process.env.PATH,
				N8N_RUNNERS_GRANT_TOKEN: grantToken,
			},
		});

		this.monitorProcess(this.process);
	}

	@OnShutdown()
	async stop() {
		if (!this.process) {
			return;
		}

		this.isShuttingDown = true;

		// TODO: Timeout & force kill
		this.process.kill();
		await this.runPromise;
	}

	private monitorProcess(process: ChildProcess) {
		this.runPromise = new Promise((resolve) => {
			process.on('exit', (code) => {
				console.error(`Task Runner Process exited with code ${code}`);
				this.onProcessExit(code, resolve);
			});

			process.stdout?.on('data', (data) => {
				console.log(`Task Runner Process: ${data}`);
			});

			process.stderr?.on('data', (data) => {
				console.error(`Task Runner Process: ${data}`);
			});
		});
	}

	private onProcessExit(code: number | null, resolveFn: () => void) {
		this.process = null;
		resolveFn();

		if (this.isShuttingDown) {
			return;
		}

		// Restart the process
		setImmediate(async () => await this.start());
	}
}
