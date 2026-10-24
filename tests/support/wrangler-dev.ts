// Starts `wrangler dev` with the project's wrangler.jsonc, serving the given
// directory as the Worker's static assets (`--assets` overrides only
// `assets.directory`; html_handling and not_found_handling still come from
// wrangler.jsonc).
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const wranglerBin = fileURLToPath(
	new URL('../../node_modules/wrangler/bin/wrangler.js', import.meta.url),
);

const READY_TIMEOUT_MS = 60_000;

export interface WranglerDev {
	/** Origin of the dev server, e.g. `http://127.0.0.1:54321` (no trailing slash). */
	url: string;
	stop(): Promise<void>;
}

/**
 * `script` replaces the Worker wrangler.jsonc names (`main`) with another
 * one; the rest of wrangler.jsonc still applies.
 *
 * The server and its inspector listen on port 0: the system gives each a
 * free port as it binds, so servers started at the same time (by test files
 * running in parallel) never get the same one. wrangler says which port it
 * got in its "Ready on" line.
 */
export async function startWranglerDev({ assetsDir, script }: { assetsDir: string; script?: string }): Promise<WranglerDev> {
	const child = spawn(
		process.execPath,
		[
			wranglerBin,
			'dev',
			...(script === undefined ? [] : [script]),
			'--assets',
			assetsDir,
			'--ip',
			'127.0.0.1',
			'--port',
			'0',
			'--inspector-port',
			'0',
			'--show-interactive-dev-session=false',
			// The "Ready on" line is an info message.
			'--log-level',
			'info',
		],
		{
			cwd: projectRoot,
			env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
			stdio: ['ignore', 'pipe', 'pipe'],
			// On POSIX, give wrangler its own process group so stop() can kill workerd too.
			detached: process.platform !== 'win32',
		},
	);
	try {
		return { url: await readyUrl(child), stop: () => stop(child) };
	} catch (error) {
		await stop(child);
		throw error;
	}
}

/** The origin wrangler says it is ready on; what it prints after that (a line per request) is dropped. */
function readyUrl(child: ChildProcess): Promise<string> {
	return new Promise((resolve, reject) => {
		let output = '';
		let settled = false;
		const settle = (outcome: () => void) => {
			settled = true;
			clearTimeout(timer);
			child.off('exit', exited);
			outcome();
		};
		const fail = (reason: string) =>
			settle(() => reject(new Error(`wrangler dev did not start: ${reason}\n${output}`)));
		const timer = setTimeout(() => fail(`not ready within ${READY_TIMEOUT_MS} ms`), READY_TIMEOUT_MS);
		const exited = (code: number | null) => fail(`exited with code ${code}`);
		const read = (chunk: Buffer) => {
			if (settled) return;
			output += chunk;
			const ready = /Ready on (http:\/\/\S+)/.exec(output);
			if (ready) settle(() => resolve(new URL(ready[1]!).origin));
		};
		child.stdout?.on('data', read);
		child.stderr?.on('data', read);
		child.once('exit', exited);
	});
}

async function stop(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
		return;
	}
	const exited = once(child, 'exit');
	if (process.platform === 'win32') {
		// Kill the whole tree: wrangler leaves workerd running if only node is killed.
		spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
	} else {
		process.kill(-child.pid, 'SIGTERM');
	}
	await exited;
}
