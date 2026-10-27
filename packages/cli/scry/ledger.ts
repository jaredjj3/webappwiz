import { dirname } from "node:path";
import type { Role } from "@webappwiz/scry/config";
import { FileLock, type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";

/**
 * What a project's checks have spent on this device, for every user budget
 * to sum its window from. It lives outside the repository, so every worktree
 * of a project draws on one budget; a budget from the user's own config sums
 * every project's, as `Ledger.everyProject` reads them.
 */
export class Ledger implements Spent {
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
		return `${stateDir(opts.ps ?? new NodePs())}/${project}/scry-spent.json`;
	}

	/**
	 * What every project's checks have spent on this device, from each
	 * ledger `Ledger.path` keeps, for a budget they share.
	 */
	static async everyProject(opts: LedgerOptions = {}): Promise<Spent> {
		const fs = opts.fs ?? new NodeFs();
		const root = stateDir(opts.ps ?? new NodePs());
		const projects = (await fs.exists(root)) ? await fs.readdir(root) : [];
		const entries: Spending[] = [];
		for (const project of projects) {
			entries.push(...(await read(fs, `${root}/${project}/scry-spent.json`)));
		}
		return { spent: (role, since) => spentOf(entries, role, since) };
	}

	static async open(path: string, opts: LedgerOptions = {}): Promise<Ledger> {
		const fs = opts.fs ?? new NodeFs();
		return new Ledger(path, await read(fs, path), fs, opts.ps ?? new NodePs());
	}

	/** What `role` spent at or after `since`, in input tokens. */
	spent(role: Role, since: number): number {
		return spentOf(this.entries, role, since);
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

/** Where a budget sums what its role spent over a window. */
export interface Spent {
	/** What `role` spent at or after `since`, in input tokens. */
	spent(role: Role, since: number): number;
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

/**
 * Where wiz keeps its state on this device: under `$XDG_STATE_HOME`
 * (`~/.local/state`), each project's in a directory by its name.
 */
export function stateDir(ps: Ps): string {
	const state =
		ps.env("XDG_STATE_HOME") ?? `${ps.env("HOME") ?? "~"}/.local/state`;
	return `${state}/wiz`;
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

function spentOf(entries: Spending[], role: Role, since: number): number {
	return entries
		.filter((entry) => entry.role === role && entry.at >= since)
		.reduce((total, entry) => total + entry.input, 0);
}
