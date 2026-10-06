import { projectName } from "webappwiz/creds";
import { color } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { SystemWallClock, type WallClock } from "webappwiz/time";
import { ROLES, type Role } from "../config";
import type { Settings } from "../load-config";
import { table } from "../table";
import { type Allowance, Budgets, Ledger, type Standing } from "./budgets";
import { type ProjectTools, thousands } from "./project-tools";

/** The exit when a run would spend what no budget allows, or none is declared. */
export const OVER_BUDGET = 3;

/** Why a run with no budget declared does not start. */
export const NONE_DECLARED =
	'no budget declared: set scry.budgets in .wiz/config.ts or ~/.config/wiz/config.ts to "nothing", "unlimited", or limits like [{ llm: 2_000_000, per: "month" }]; --cost says what a check would spend';

export interface ProjectBudgetsOptions {
	/** Spends without a limit, and with no budget declared. False by default. */
	override?: boolean;
	/** When spending happens, for the windows. */
	clock?: WallClock;
	fs?: Fs;
	ps?: Ps;
}

/** What a run would use of each role's budgets, as a report says it. */
export type Use = (role: Role) => number;

/**
 * A project's `scry.budgets`, held against what this device has spent on
 * it: whether a run may start, what it may spend once it has, and the
 * ledger that keeps what it spent for the next.
 */
export class ProjectBudgets {
	private constructor(
		private budgets: Budgets | undefined,
		private ledger: Ledger,
		private clock: WallClock,
		private override: boolean,
		/** When the run started, which every window is measured to. */
		private now: number,
	) {}

	static async open(
		dir: string,
		settings: Settings,
		opts: ProjectBudgetsOptions = {},
	): Promise<ProjectBudgets> {
		const fs = opts.fs ?? new NodeFs();
		const ps = opts.ps ?? new NodePs();
		const clock = opts.clock ?? new SystemWallClock();
		const ledger = await Ledger.open(
			Ledger.path(await projectName(dir, { fs, ps }), { ps }),
			{ fs, ps },
		);
		return new ProjectBudgets(
			settings.budgets === undefined
				? undefined
				: Budgets.from(settings.budgets),
			ledger,
			clock,
			opts.override ?? false,
			clock.now(),
		);
	}

	/** Whether a run may not start for want of a budget. */
	get undeclared(): boolean {
		return this.budgets === undefined && !this.override;
	}

	/** Whether a run has a number to stay under, so counts what it asks first. */
	get countsFirst(): boolean {
		return (this.budgets?.limited ?? false) && !this.override;
	}

	/** What each role may spend in the run; none when nothing limits it. */
	get allowances(): Partial<Record<Role, Allowance>> | undefined {
		const budgets = this.budgets;
		if (budgets === undefined || this.override) {
			return undefined;
		}
		return Object.fromEntries(
			ROLES.flatMap((role) => {
				const allowance = budgets.allowance(role, this.ledger, this.now);
				return allowance === undefined ? [] : [[role, allowance]];
			}),
		);
	}

	/** Why a run that would `use` this much does not start; none when it fits. */
	overrun(use: Use, run: string): string | undefined {
		const over = this.standing.some((each) => use(each.role) > each.left);
		return over
			? [
					`over budget: this ${run} would spend more than scry.budgets allows`,
					...this.lines(use),
					`raise scry.budgets, ${run === "check" ? "check fewer files" : "evaluate fewer rules"}, or run again with --override-budget`,
				].join("\n")
			: undefined;
	}

	/**
	 * Each role's budgets as a run that would `use` this much leaves them:
	 * what it would use of each, and what would be left, or how far over it
	 * would go. Nothing when every role is unlimited.
	 */
	lines(use: Use): string[] {
		const budgets = this.budgets;
		if (budgets === undefined || budgets.unlimited) {
			return [];
		}
		const rows = ROLES.flatMap((role): string[][] => {
			const using = thousands(use(role));
			if (budgets.spendsNothing(role)) {
				return [[`  ${role}`, "nothing", `${using} would go unasked`, ""]];
			}
			const limits = this.standing.filter((each) => each.role === role);
			if (limits.length === 0) {
				return [[`  ${role}`, "unlimited", `would use ${using}`, ""]];
			}
			return limits.map((each) => {
				const after = each.left - use(role);
				return [
					`  ${role}`,
					each.window,
					`would use ${using} of ${thousands(each.tokens)}, ${thousands(each.spent)} spent`,
					after < 0
						? color.red(`over by ${thousands(-after)}`)
						: `${thousands(after)} left`,
				];
			});
		});
		return [color.bold("budgets"), ...table(rows)];
	}

	/** The lines as JSON: each numbered limit, and what the run would use of it. */
	json(use: Use): { budgets?: (Standing & { use: number })[] } {
		return this.budgets === undefined || this.budgets.unlimited
			? {}
			: {
					budgets: this.standing.map((each) => ({
						...each,
						use: use(each.role),
					})),
				};
	}

	/** Keeps what `asking` spent, for every later run's windows. */
	async record(asking: ProjectTools): Promise<void> {
		await this.ledger.record(asking.spending(this.clock.now()));
	}

	private get standing(): Standing[] {
		return this.budgets?.standing(this.ledger, this.now) ?? [];
	}
}
