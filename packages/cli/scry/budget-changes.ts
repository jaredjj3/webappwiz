import { dirname } from "node:path";
import type { Role, Spend } from "@webappwiz/scry/config";
import { FileLock, type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { Ledger } from "./ledger";

/**
 * What the user changed of a project's budgets on this device, from
 * `wiz scry budgets` or arbor dev's Budget page: what each role may spend,
 * over what the configs declare, the raises that add to it for a while,
 * and the pauses that stop it asking anything for a while.
 * It lives beside the ledger, so every worktree of a project shares it.
 */
export class BudgetChanges {
	private constructor(
		readonly path: string,
		private kept: Kept,
		private fs: Fs,
		private ps: Ps,
	) {}

	/**
	 * Where a project's changes are kept: under `$XDG_STATE_HOME`
	 * (`~/.local/state`), by the project's name, beside its ledger.
	 */
	static path(project: string, opts: BudgetChangesOptions = {}): string {
		return `${dirname(Ledger.path(project, opts))}/scry-budgets.json`;
	}

	static async open(
		path: string,
		opts: BudgetChangesOptions = {},
	): Promise<BudgetChanges> {
		const fs = opts.fs ?? new NodeFs();
		return new BudgetChanges(
			path,
			await read(fs, path),
			fs,
			opts.ps ?? new NodePs(),
		);
	}

	/** What each role was set to spend here; a role left out keeps the configs'. */
	get set(): Partial<Record<Role, Spend>> {
		return this.kept.set;
	}

	/** The raises that have not ended by `now`, oldest first. */
	raises(now: number): Raise[] {
		return this.kept.raises.filter((raise) => raise.until > now);
	}

	/** The pauses that have not ended by `now`, one a role at most. */
	pauses(now: number): Pause[] {
		return this.kept.pauses.filter((pause) => pause.until > now);
	}

	/** Sets what `role` may spend, or, for none, gives it back to the configs. */
	async spend(role: Role, spend: Spend | undefined): Promise<void> {
		await this.change((kept) => {
			const { [role]: _, ...rest } = kept.set;
			return {
				...kept,
				set: spend === undefined ? rest : { ...rest, [role]: spend },
			};
		});
	}

	/**
	 * Adds `tokens` to what `role` may spend from `from` until `until`, as
	 * Unix epoch milliseconds, and answers with the raise.
	 */
	async raise(
		role: Role,
		tokens: number,
		{ from, until }: { from: number; until: number },
	): Promise<Raise> {
		let made: Raise | undefined;
		await this.change((kept) => {
			const live = kept.raises.filter((raise) => raise.until > from);
			const id = Math.max(0, ...kept.raises.map((raise) => raise.id)) + 1;
			made = { id, role, tokens, from, until };
			return { ...kept, raises: [...live, made] };
		});
		return made as Raise;
	}

	/** Ends raise `id` now; false when there was none by that id. */
	async end(id: number): Promise<boolean> {
		let found = false;
		await this.change((kept) => {
			found = kept.raises.some((raise) => raise.id === id);
			return {
				...kept,
				raises: kept.raises.filter((raise) => raise.id !== id),
			};
		});
		return found;
	}

	/**
	 * Stops `role` asking anything from `from` until `until`, as Unix epoch
	 * milliseconds, in place of any pause it had.
	 */
	async pause(
		role: Role,
		{ from, until }: { from: number; until: number },
	): Promise<void> {
		await this.change((kept) => ({
			...kept,
			pauses: [
				...kept.pauses.filter(
					(pause) => pause.role !== role && pause.until > from,
				),
				{ role, from, until },
			],
		}));
	}

	/** Ends `role`'s pause now; false when it had none. */
	async resume(role: Role, now: number): Promise<boolean> {
		let found = false;
		await this.change((kept) => {
			found = kept.pauses.some(
				(pause) => pause.role === role && pause.until > now,
			);
			return {
				...kept,
				pauses: kept.pauses.filter((pause) => pause.role !== role),
			};
		});
		return found;
	}

	/** Rereads the file under its lock, so another process's change is kept. */
	private async change(edit: (kept: Kept) => Kept): Promise<void> {
		await this.fs.mkdir(dirname(this.path), { recursive: true });
		const lock = new FileLock(`${this.path}.lock`, {
			fs: this.fs,
			ps: this.ps,
		});
		await lock.acquire();
		try {
			this.kept = edit(await read(this.fs, this.path));
			await this.fs.write(this.path, `${JSON.stringify(this.kept, null, 2)}\n`);
		} finally {
			await lock.release();
		}
	}
}

/** What `BudgetChanges` reads and writes through. */
export interface BudgetChangesOptions {
	fs?: Fs;
	ps?: Ps;
}

/** More tokens a role may spend for a while, on top of its limits. */
export interface Raise {
	/** What `wiz scry budgets end` names it by. */
	id: number;
	role: Role;
	tokens: number;
	/** When it began, as Unix epoch milliseconds. */
	from: number;
	/** When it ends, as Unix epoch milliseconds. */
	until: number;
}

/** A while a role asks nothing, whatever it may spend. */
export interface Pause {
	role: Role;
	/** When it began, as Unix epoch milliseconds. */
	from: number;
	/** When it ends, as Unix epoch milliseconds. */
	until: number;
}

interface Kept {
	set: Partial<Record<Role, Spend>>;
	raises: Raise[];
	pauses: Pause[];
}

async function read(fs: Fs, path: string): Promise<Kept> {
	if (!(await fs.exists(path))) {
		return { set: {}, raises: [], pauses: [] };
	}
	const kept = JSON.parse(await fs.read(path)) as Partial<Kept>;
	return {
		set: kept.set ?? {},
		raises: kept.raises ?? [],
		pauses: kept.pauses ?? [],
	};
}
