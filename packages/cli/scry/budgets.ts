import { dirname } from "node:path";
import { FileLock, type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { Duration } from "webappwiz/time";
import { type Budget, type Period, ROLES, type Role } from "../config";

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

async function read(fs: Fs, path: string): Promise<Spending[]> {
	const entries = (await fs.exists(path))
		? (JSON.parse(await fs.read(path)) as Spending[])
		: [];
	// som was once called decider, and what it spent then still counts
	return entries.map((entry) =>
		(entry.role as string) === "decider" ? { ...entry, role: "som" } : entry,
	);
}

/** A role's numbered limit over one window. */
interface Limit {
	role: Role;
	tokens: number;
	per?: Period;
	within?: string;
}

/** Where a role stands against one of its limits. */
export interface Standing {
	role: Role;
	/** The window, as a report names it: `this month`, `the last 7d`. */
	window: string;
	tokens: number;
	/** What the ledger holds for the window. */
	spent: number;
	/** What is left of it, never below 0. */
	left: number;
}

/** What a role may still spend in a check, and why it stops there. */
export interface Allowance {
	/** Input tokens; 0 asks nothing. */
	input: number;
	/** Why a question past it goes unasked. */
	reason: string;
}

/**
 * The limits `scry.budgets` declares, as checked against what the ledger
 * holds. A role an entry calls `"nothing"`, or no entry names, spends
 * nothing; one with no number is unlimited; one with numbers is held to
 * every one of them.
 */
export class Budgets {
	private constructor(
		private limits: Limit[],
		private nothing: Set<Role>,
	) {}

	static from(budgets: Budget[]): Budgets {
		const limits: Limit[] = [];
		const nothing = new Set<Role>(
			ROLES.filter((role) => budgets.every((each) => each[role] === undefined)),
		);
		for (const budget of budgets) {
			for (const role of ROLES) {
				const spend = budget[role];
				if (spend === "nothing") {
					nothing.add(role);
				} else if (typeof spend === "number") {
					limits.push({
						role,
						tokens: spend,
						per: budget.per,
						within: budget.within,
					});
				}
			}
		}
		return new Budgets(limits, nothing);
	}

	/** Whether any role has a number to stay under, which takes counting first. */
	get limited(): boolean {
		return this.limits.some((limit) => !this.nothing.has(limit.role));
	}

	/** Whether no role has a limit, so there is nothing to report. */
	get unlimited(): boolean {
		return this.nothing.size === 0 && this.limits.length === 0;
	}

	/** Whether `role` may spend nothing. */
	spendsNothing(role: Role): boolean {
		return this.nothing.has(role);
	}

	/** Where each numbered limit stands at `now`, by role, then as declared. */
	standing(ledger: Ledger, now: number): Standing[] {
		return ROLES.flatMap((role) =>
			this.nothing.has(role)
				? []
				: this.limits
						.filter((limit) => limit.role === role)
						.map((limit) => {
							const spent =
								limit.per === "check"
									? 0
									: ledger.spent(role, start(limit, now));
							return {
								role,
								window: windowName(limit),
								tokens: limit.tokens,
								spent,
								left: Math.max(0, limit.tokens - spent),
							};
						}),
		);
	}

	/** What `role` may spend in this check; none for unlimited. */
	allowance(role: Role, ledger: Ledger, now: number): Allowance | undefined {
		if (this.nothing.has(role)) {
			return { input: 0, reason: `scry.budgets spends nothing on the ${role}` };
		}
		const tightest = this.standing(ledger, now)
			.filter((each) => each.role === role)
			.toSorted((left, right) => left.left - right.left)[0];
		return tightest === undefined
			? undefined
			: {
					input: tightest.left,
					reason: `over the ${role} budget for ${tightest.window}`,
				};
	}
}

/** When a limit's window began, as Unix epoch milliseconds in local time. */
function start(limit: Limit, now: number): number {
	if (limit.within !== undefined) {
		return now - within(limit.within).ms;
	}
	const date = new Date(now);
	date.setHours(0, 0, 0, 0);
	if (limit.per === "week") {
		// from Monday: getDay counts from Sunday
		date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
	} else if (limit.per === "month") {
		date.setDate(1);
	}
	return date.getTime();
}

/** A rolling window, like `7d`, as a duration. */
export function within(window: string): Duration {
	const match = /^(\d+)([hdw])$/.exec(window);
	if (match === null) {
		throw new Error(
			`expected hours, days or weeks, like "24h", "7d" or "2w", got "${window}"`,
		);
	}
	const count = Number(match[1]);
	return match[2] === "h"
		? Duration.hrs(count)
		: Duration.days(match[2] === "d" ? count : count * 7);
}

function windowName(limit: Limit): string {
	if (limit.within !== undefined) {
		return `the last ${limit.within}`;
	}
	return {
		check: "this check",
		day: "today",
		week: "this week",
		month: "this month",
	}[limit.per ?? "check"];
}
