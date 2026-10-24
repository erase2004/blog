// Starts `wrangler dev` with the project's wrangler.jsonc, serving the given
// directory as the Worker's static assets (`--assets` overrides only
// `assets.directory`; html_handling and not_found_handling still come from
// wrangler.jsonc).
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
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
 */
export async function startWranglerDev({ assetsDir, script }: { assetsDir: string; script?: string }): Promise<WranglerDev> {
	const port = await findFreePort();
	const inspectorPort = await findFreePort();
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
			String(port),
			'--inspector-port',
			String(inspectorPort),
			'--show-interactive-dev-session=false',
			'--log-level',
			'warn',
		],
		{
			cwd: projectRoot,
			env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
			stdio: ['ignore', 'pipe', 'pipe'],
			// On POSIX, give wrangler its own process group so stop() can kill workerd too.
			detached: process.platform !== 'win32',
		},
	);
	let output = '';
	child.stdout?.on('data', (chunk) => (output += chunk));
	child.stderr?.on('data', (chunk) => (output += chunk));

	const url = `http://127.0.0.1:${port}`;
	try {
		await waitUntilServing(url, child);
	} catch (error) {
		await stop(child);
		throw new Error(`wrangler dev did not start: ${(error as Error).message}\n${output}`);
	}
	return { url, stop: () => stop(child) };
}

async function waitUntilServing(url: string, child: ChildProcess): Promise<void> {
	const deadline = Date.now() + READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`exited with code ${child.exitCode}`);
		}
		try {
			await fetch(url, { redirect: 'manual' });
			return;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
	}
	throw new Error(`no response from ${url} within ${READY_TIMEOUT_MS} ms`);
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

async function findFreePort(): Promise<number> {
	const server = createServer();
	server.listen(0, '127.0.0.1');
	await once(server, 'listening');
	const address = server.address();
	server.close();
	await once(server, 'close');
	if (address === null || typeof address === 'string') {
		throw new Error('could not determine a free port');
	}
	return address.port;
}
