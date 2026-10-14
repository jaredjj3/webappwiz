import { dirname } from "node:path";
import type { Role } from "@webappwiz/scry/config";
import { FileLock, type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";

/**
 * What a project's checks have spent on this device, for every user budget
 * to sum its window from. It lives outside the repository, so every worktree
 * of a project draws on one budget, and is never shared.
 */
export class Ledger {
	private constructor(
		private path: string,
		private entries: Spending[],
		private fs: Fs,
		private ps: Ps,
	) {}

	/**
	 * Where a project's ledger is kept: under `$XDG_STATE_HOME`
	 * (`~/.local/state`), by the project's name.
	 */
	static path(project: string, opts: { ps?: Ps } = {}): string {
		const ps = opts.ps ?? new NodePs();
		const state =
			ps.env("XDG_STATE_HOME") ?? `${ps.env("HOME") ?? "~"}/.local/state`;
		return `${state}/wiz/${project}/scry-spent.json`;
	}

	static async open(path: string, opts: LedgerOptions = {}): Promise<Ledger> {
		const fs = opts.fs ?? new NodeFs();
		return new Ledger(path, await read(fs, path), fs, opts.ps ?? new NodePs());
	}

	/** What `role` spent at or after `since`, in input tokens. */
	spent(role: Role, since: number): number {
		return this.entries
			.filter((entry) => entry.role === role && entry.at >= since)
			.reduce((total, entry) => total + entry.input, 0);
	}

	/** Adds `spending`, kept with whatever another check wrote meanwhile. */
	async record(spending: Spending[]): Promise<void> {
		const kept = spending.filter((entry) => entry.input > 0);
		if (kept.length === 0) {
			return;
		}
		await this.fs.mkdir(dirname(this.path), { recursive: true });
		const lock = new FileLock(`${this.path}.lock`, {
			fs: this.fs,
			ps: this.ps,
		});
		await lock.acquire();
		try {
			this.entries = [...(await read(this.fs, this.path)), ...kept];
			await this.fs.write(this.path, `${JSON.stringify(this.entries)}\n`);
		} finally {
			await lock.release();
		}
	}
}

/** What one role spent in one check, as the ledger keeps it. */
export interface Spending {
	/** When, as Unix epoch milliseconds. */
	at: number;
	role: Role;
	model: string;
	/** Input tokens. */
	input: number;
}

/** What `Ledger` reads and writes through. */
export interface LedgerOptions {
	fs?: Fs;
	ps?: Ps;
}

async function read(fs: Fs, path: string): Promise<Spending[]> {
	const entries = (await fs.exists(path))
		? (JSON.parse(await fs.read(path)) as Spending[])
		: [];
	// som was once called decider, and what it spent then still counts
	return entries.map((entry) =>
		(entry.role as string) === "decider" ? { ...entry, role: "som" } : entry,
	);
}
