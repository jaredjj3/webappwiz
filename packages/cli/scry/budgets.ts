import { type Period, ROLES, type Role } from "@webappwiz/scry/config";
import { Duration } from "webappwiz/time";
import type { Ledger } from "./ledger";

/**
 * The limits `scry.budgets` declares, as checked against what the ledger
 * holds. A role that spends `"nothing"` asks no question; one with no limit
 * is unlimited; one with limits is held to every one of them.
 */
export class Budgets {
	private constructor(
		private limits: RoleLimit[],
		private nothing: Set<Role>,
	) {}

	/**
	 * The budgets `value` declares, as a config sets `scry.budgets`. Throws,
	 * saying `where` and what to write instead, unless every role is named
	 * and each limit is one a check can hold to, since a config read at run
	 * time was never typechecked.
	 */
	static from(value: unknown, where = "scry.budgets"): Budgets {
		if (value === "nothing" || value === "unlimited") {
			return Budgets.from({ som: value, llm: value }, where);
		}
		if (Array.isArray(value)) {
			throw new Error(
				`${where}: a list of limits is the old shape: run \`wiz scry update\` to give each model its own, like { som: { tokens: 5_000_000, per: "day" }, llm: "nothing" }`,
			);
		}
		if (!isRecord(value)) {
			throw new Error(`${where}: expected ${EXAMPLE}`);
		}
		const unknown = Object.keys(value).filter(
			(key) => !(ROLES as readonly string[]).includes(key),
		);
		if (unknown.includes("decider")) {
			throw new Error(
				`${where}.decider: decider is now som, the System One model a rule asks first`,
			);
		}
		if (unknown.length > 0) {
			throw new Error(
				`${where}: unknown ${unknown.join(", ")}: expected som and llm`,
			);
		}
		const limits: RoleLimit[] = [];
		const nothing = new Set<Role>();
		for (const role of ROLES) {
			const spend = value[role];
			const at = `${where}.${role}`;
			if (spend === undefined) {
				throw new Error(
					`${where}: say what the ${role} may spend, like ${role}: "nothing"`,
				);
			}
			if (spend === "nothing") {
				nothing.add(role);
			} else if (spend !== "unlimited") {
				const each = Array.isArray(spend) ? spend : [spend];
				if (each.length === 0) {
					throw new Error(`${at}: expected a limit, not an empty list`);
				}
				for (const [index, limit] of each.entries()) {
					limits.push({
						role,
						...checkLimit(Array.isArray(spend) ? `${at}[${index}]` : at, limit),
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

/** A role's numbered limit over one window. */
interface RoleLimit {
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

/** When a limit's window began, as Unix epoch milliseconds in local time. */
function start(limit: RoleLimit, now: number): number {
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

function windowName(limit: RoleLimit): string {
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

const EXAMPLE = `"nothing", "unlimited", or what each model may spend, like { som: { tokens: 5_000_000, per: "day" }, llm: "nothing" }`;

const PERIODS = ["check", "day", "week", "month"];

/** `value` as a limit, or throws, saying `where`, why it is not one. */
function checkLimit(
	where: string,
	value: unknown,
): Pick<RoleLimit, "tokens" | "per" | "within"> {
	if (!isRecord(value)) {
		throw new Error(
			`${where}: expected "nothing", "unlimited", or a limit like { tokens: 2_000_000, per: "month" }`,
		);
	}
	const unknown = Object.keys(value).filter(
		(key) => !["tokens", "per", "within"].includes(key),
	);
	if (unknown.length > 0) {
		throw new Error(
			`${where}: unknown ${unknown.join(", ")}: expected tokens, then per or within`,
		);
	}
	const { tokens, per, within: rolling } = value;
	if (!(typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0)) {
		throw new Error(
			`${where}.tokens: expected input tokens, got ${JSON.stringify(tokens)}`,
		);
	}
	if ((per === undefined) === (rolling === undefined)) {
		throw new Error(
			`${where}: expected one window: per "check", "day", "week" or "month", or within, like "7d"`,
		);
	}
	if (per !== undefined && !PERIODS.includes(per as string)) {
		throw new Error(
			`${where}.per: expected one of ${PERIODS.join(", ")}, got ${JSON.stringify(per)}`,
		);
	}
	if (rolling !== undefined) {
		try {
			within(String(rolling));
		} catch (error) {
			throw new Error(`${where}.within: ${(error as Error).message}`);
		}
	}
	return {
		tokens,
		per: per as Period | undefined,
		within: rolling as string | undefined,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
