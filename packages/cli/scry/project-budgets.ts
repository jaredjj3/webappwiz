import { ROLES, type Role } from "@webappwiz/scry/config";
import { projectName } from "webappwiz/creds";
import { color } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { SystemWallClock, type WallClock } from "webappwiz/time";
import type { Settings } from "../load-config";
import { table } from "../table";
import { BudgetChanges, type Pause, type Raise } from "./budget-changes";
import { type Allowance, Budgets, type Standing } from "./budgets";
import { Ledger } from "./ledger";
import { type ProjectTools, thousands } from "./project-tools";
import { saySpend } from "./spend";

/** The exit when a run would spend what no budget allows, or none is declared. */
export const OVER_BUDGET = 3;

/** Why a run with no budget declared does not start. */
export const NONE_DECLARED =
	'no budget declared: set budgets in scry.config.ts or ~/.config/scry/config.ts to "nothing", "unlimited", or what each model may spend, like { som: { tokens: 5_000_000, per: "day" }, llm: "nothing" }; --cost says what a check would spend';

export interface ProjectBudgetsOptions {
	/** Spends without a limit, and with no budget declared. False by default. */
	override?: boolean;
	/** When spending happens, for the windows. */
	clock?: WallClock;
	fs?: Fs;
	ps?: Ps;
}

/** Where a project's budgets stand, as `wiz scry budgets --format json` prints it. */
export interface BudgetReport {
	/** Whether any config or change declares budgets, without which no check runs. */
	declared: boolean;
	roles: RoleReport[];
}

/** Where one role's budget stands. */
export interface RoleReport {
	role: Role;
	/** What it may spend, as `wiz scry budgets set` takes it; none when undeclared. */
	spend: string | null;
	/**
	 * The config or file that declared it, from the project's root when in
	 * it; none when undeclared.
	 */
	from: string | null;
	/** Whether it was set with `wiz scry budgets set`, over the configs. */
	set: boolean;
	standing: Omit<Standing, "role">[];
	raises: Omit<Raise, "role">[];
	/** The pause stopping it asking anything; none when it asks as it may. */
	paused: Omit<Pause, "role"> | null;
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
		/** What the user changed here, over the configs. */
		readonly changes: BudgetChanges,
		/** The project's root, which a report names its config from. */
		private dir: string,
	) {}

	static async open(
		dir: string,
		settings: Settings,
		opts: ProjectBudgetsOptions = {},
	): Promise<ProjectBudgets> {
		const fs = opts.fs ?? new NodeFs();
		const ps = opts.ps ?? new NodePs();
		const clock = opts.clock ?? new SystemWallClock();
		const project = await projectName(dir, { fs, ps });
		const ledger = await Ledger.open(Ledger.path(project, { ps }), { fs, ps });
		const changes = await BudgetChanges.open(
			BudgetChanges.path(project, { ps }),
			{ fs, ps },
		);
		const now = clock.now();
		const raises = changes.raises(now);
		return new ProjectBudgets(
			Budgets.over(settings.budgets, changes.set, changes.path)
				?.raised(raises)
				.paused(changes.pauses(now)),
			ledger,
			clock,
			opts.override ?? false,
			now,
			changes,
			dir,
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

	/**
	 * Why each role cannot do its part of a run that would `use` this much:
	 * no budget declared, nothing to spend, nothing left of a window, or less
	 * than the run would use. A role that can is left out.
	 */
	shortfalls(use: Use): Partial<Record<Role, string>> {
		const budgets = this.budgets;
		if (this.override) {
			return {};
		}
		if (budgets === undefined) {
			return Object.fromEntries(
				ROLES.map((role) => [role, "no budget declared"]),
			);
		}
		const short = this.standing.filter(
			(each) => each.left === 0 || use(each.role) > each.left,
		);
		return Object.fromEntries(
			ROLES.flatMap((role) => {
				const limit = short.find((each) => each.role === role);
				const paused = budgets.pausedReason(role);
				if (paused !== undefined) {
					return [[role, paused]];
				}
				if (budgets.spendsNothing(role)) {
					return [[role, `scry.budgets spends nothing on the ${role}`]];
				}
				return limit === undefined
					? []
					: [[role, `over the ${role} budget for ${limit.window}`]];
			}),
		);
	}

	/** Why a run that would `use` this much does not start; none when it fits. */
	overrun(use: Use, run: string): string | undefined {
		// a paused role asks nothing, so cannot go over
		const over = this.standing.some(
			(each) =>
				this.budgets?.pausedReason(each.role) === undefined &&
				use(each.role) > each.left,
		);
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
			if (budgets.pausedReason(role) !== undefined) {
				return [[`  ${role}`, "paused", `${using} would go unasked`, ""]];
			}
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

	/**
	 * Where each role stands, as `wiz scry budgets` and arbor dev's Budget
	 * page show it: what it was declared to spend and where, each limit's
	 * window with its raises in, and the raises not yet ended.
	 */
	report(): BudgetReport {
		const budgets = this.budgets;
		const raises = this.changes.raises(this.now);
		const pauses = this.changes.pauses(this.now);
		return {
			declared: budgets !== undefined,
			roles: ROLES.map((role) => {
				const declared = budgets?.declared[role];
				const from = declared?.where.replace(/: scry\.budgets$/, "");
				return {
					role,
					spend: declared === undefined ? null : saySpend(declared.spend),
					from: from?.startsWith(`${this.dir}/`)
						? from.slice(this.dir.length + 1)
						: (from ?? null),
					set: this.changes.set[role] !== undefined,
					standing: this.standing
						.filter((each) => each.role === role)
						.map(({ role: _, ...each }) => each),
					raises: raises
						.filter((raise) => raise.role === role)
						.map(({ role: _, ...raise }) => raise),
					paused: pauseOf(pauses, role),
				};
			}),
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

function pauseOf(pauses: Pause[], role: Role): Omit<Pause, "role"> | null {
	const pause = pauses.find((each) => each.role === role);
	return pause === undefined ? null : { from: pause.from, until: pause.until };
}
