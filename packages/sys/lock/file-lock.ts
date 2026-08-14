import { rmSync } from "node:fs";
import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import { Duration, sleep } from "@webappwiz/time";
import type { Fs } from "../fs/fs";
import { NodeFs } from "../fs/node-fs";
import type { Ps } from "../ps/ps";
import { NodePs } from "../ps/node-ps";
import type { Lock } from "./lock";

interface Holder {
	pid: number;
	hostname: string;
	at: string;
}

export interface FileLockOptions {
	/** How long a holder may go quiet before its lock can be stolen. */
	stalenessMs?: number;
	/** How often to re-check a lock that is already taken. */
	pollMs?: number;
}

/**
 * A mutex between processes, held by a directory on disk. A holder that died
 * is detected and its lock stolen, and the directory is removed on signals and
 * uncaught exceptions.
 */
export class FileLock implements Lock {
	private held = false;
	private handlersRegistered = false;
	private readonly stalenessMs: number;
	private readonly pollMs: number;

	private readonly fs: Fs;
	private readonly ps: Ps;
	private readonly log: Logger;

	constructor(
		readonly path: string,
		fs?: Fs,
		ps?: Ps,
		log?: Logger,
		{ stalenessMs = 60_000, pollMs = 2_000 }: FileLockOptions = {},
	) {
		this.fs = fs ?? new NodeFs();
		this.ps = ps ?? new NodePs();
		this.log = log ?? new ConsoleLogger();
		this.stalenessMs = stalenessMs;
		this.pollMs = pollMs;
	}

	async acquire(): Promise<void> {
		// `mkdir` is the whole mechanism: it is atomic on every filesystem and
		// either creates the directory or fails, so there is no check-then-write
		// window to lose.
		let unreadableSince: number | null = null;
		// Short first waits so a lock freed quickly is picked up quickly, backing
		// off to `pollMs` for a holder that is settling in for a long test run.
		let sleepMs = 5;

		for (let waited = false; ; waited = true) {
			try {
				await this.fs.mkdir(this.path, { recursive: false });
			} catch {
				const holder = await this.holder();
				if (holder === null) {
					// A holder that has not written its metadata yet: give the winner
					// time to finish before deciding the directory is orphaned.
					unreadableSince ??= Date.now();
					if (Date.now() - unreadableSince > this.stalenessMs) {
						unreadableSince = null;
						this.steal("it has no holder metadata");
						continue;
					}
				} else if (this.isStale(holder)) {
					this.steal(`holder pid ${holder.pid} is gone or stale`);
					continue;
				}
				await sleep(Duration.ms(sleepMs));
				sleepMs = Math.min(sleepMs * 2, this.pollMs);
				continue;
			}
			if (waited) {
				this.log.error(`acquired ${this.path} after waiting`);
			}
			break;
		}

		this.held = true;
		await this.fs.write(
			this.holderPath,
			JSON.stringify({
				pid: this.ps.pid,
				hostname: this.ps.hostname,
				at: new Date().toISOString(),
			} satisfies Holder),
		);
		this.registerCleanup();
	}

	async release(): Promise<void> {
		if (this.held) {
			this.held = false;
			await this.fs.rm(this.path, { recursive: true, force: true });
		}
	}

	async releaseIfOurs(): Promise<void> {
		const holder = await this.holder();
		if (holder?.pid === this.ps.pid && holder.hostname === this.ps.hostname) {
			this.held = true;
			await this.release();
		}
	}

	private get holderPath(): string {
		return `${this.path}/holder.json`;
	}

	private async holder(): Promise<Holder | null> {
		const raw = await this.fs.read(this.holderPath).catch(() => null);
		try {
			return raw === null ? null : (JSON.parse(raw) as Holder);
		} catch {
			return null;
		}
	}

	private isStale(holder: Holder): boolean {
		if (Date.now() - Date.parse(holder.at) > this.stalenessMs) {
			return true;
		}
		return holder.hostname === this.ps.hostname && !this.ps.alive(holder.pid);
	}

	private steal(why: string): void {
		this.log.error(color.yellow(`stealing stale lock ${this.path} (${why})`));
		rmSync(this.path, { recursive: true, force: true });
	}

	/**
	 * A crashed holder that never releases wedges every other waiter, so the
	 * removal has to survive signals and uncaught exceptions. It is sync
	 * because exit handlers cannot await.
	 */
	private registerCleanup(): void {
		if (this.handlersRegistered) {
			return;
		}
		this.handlersRegistered = true;
		const drop = (): void => {
			if (this.held) {
				this.held = false;
				rmSync(this.path, { recursive: true, force: true });
			}
		};
		this.ps.once("exit", drop);
		for (const signal of ["SIGINT", "SIGTERM"]) {
			this.ps.on(signal, () => {
				drop();
				this.ps.exit(130);
			});
		}
		this.ps.on("uncaughtException", (error: unknown) => {
			drop();
			this.log.error(error);
			this.ps.exit(1);
		});
	}
}
