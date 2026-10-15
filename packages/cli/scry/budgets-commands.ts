import { Git } from "@webappwiz/scry";
import { ROLES, type Role } from "@webappwiz/scry/config";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { SystemWallClock, type WallClock } from "webappwiz/time";
import { loadConfig } from "../load-config";
import { table } from "../table";
import { within } from "./budgets";
import { type BudgetReport, ProjectBudgets } from "./project-budgets";
import { thousands } from "./project-tools";
import { parseSpend, parseTokens } from "./spend";

/** What every `wiz scry budgets` command runs with. */
export interface BudgetsOptions {
	format: "text" | "json";
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	clock?: WallClock;
}

/** Prints where each role's budget stands, and the raises on it. */
export async function show(opts: BudgetsOptions): Promise<void> {
	print(await open(opts), opts);
}

/**
 * Sets what `role` may spend in this project, over the configs, and prints
 * where the budgets stand. With no config declaring budgets, the other
 * role, unless set already, spends nothing, so a check can run.
 */
export async function set(
	opts: BudgetsOptions & { role: string; spend: string },
): Promise<void> {
	const role = roleIn(opts.role);
	const spend = parseSpend(opts.spend);
	const budgets = await open(opts);
	await budgets.changes.spend(role, spend);
	const other = ROLES.find((each) => each !== role) as Role;
	const report = budgets.report();
	if (!report.declared && budgets.changes.set[other] === undefined) {
		await budgets.changes.spend(other, "nothing");
	}
	print(await open(opts), opts);
}

/** Gives `role`'s budget back to the configs, and prints where they stand. */
export async function reset(
	opts: BudgetsOptions & { role: string },
): Promise<void> {
	const budgets = await open(opts);
	await budgets.changes.spend(roleIn(opts.role), undefined);
	print(await open(opts), opts);
}

/**
 * Adds `tokens` to each of `role`'s limits `for` a while, like `1d`, and
 * prints where the budgets stand. A role that spends nothing may spend the
 * raise; an unlimited one, or one with no budget, has nothing to raise.
 */
export async function raise(
	opts: BudgetsOptions & { role: string; tokens: string; for: string },
): Promise<void> {
	const role = roleIn(opts.role);
	const tokens = parseTokens(opts.tokens);
	const span = within(opts.for);
	const budgets = await open(opts);
	const spend = budgets.report().roles.find((each) => each.role === role);
	if (spend?.spend == null) {
		throw new Error(
			`no budget declared for the ${role}: set one with \`wiz scry budgets set ${role} <spend>\` first`,
		);
	}
	if (spend.spend === "unlimited") {
		throw new Error(`the ${role} is unlimited: there is nothing to raise`);
	}
	const from = (opts.clock ?? new SystemWallClock()).now();
	await budgets.changes.raise(role, tokens, { from, until: from + span.ms });
	print(await open(opts), opts);
}

/** Ends raise `id` before its time, and prints where the budgets stand. */
export async function end(
	opts: BudgetsOptions & { id: number },
): Promise<void> {
	const budgets = await open(opts);
	if (!(await budgets.changes.end(opts.id))) {
		throw new Error(`no raise #${opts.id}: \`wiz scry budgets\` lists them`);
	}
	print(await open(opts), opts);
}

async function open(opts: BudgetsOptions): Promise<ProjectBudgets> {
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	// the project the working directory is in, as for a check
	const { root } = await Git.locate(ps.cwd(), ["."], { ps });
	return ProjectBudgets.open(root, await loadConfig(root, { fs, ps }), {
		fs,
		ps,
		clock: opts.clock,
	});
}

function print(budgets: ProjectBudgets, opts: BudgetsOptions): void {
	const log = opts.log ?? new ConsoleLogger();
	const report = budgets.report();
	log.info(
		opts.format === "json"
			? JSON.stringify(report, null, 2)
			: lines(report, (opts.clock ?? new SystemWallClock()).now()).join("\n"),
	);
}

/** The report as text: each role's limits, then the raises on them. */
function lines(report: BudgetReport, now: number): string[] {
	if (!report.declared) {
		return [
			"no budget declared: set one with `wiz scry budgets set <som|llm> <spend>`, like 5m/day",
		];
	}
	const rows = report.roles.flatMap((role): string[][] => {
		const said = `${role.spend} ${color.dim(role.set ? "(set here)" : `(${role.from})`)}`;
		if (role.standing.length === 0) {
			return [[role.role, said, "", ""]];
		}
		return role.standing.map((each, index) => [
			index === 0 ? role.role : "",
			index === 0 ? said : "",
			`${each.window}: ${thousands(each.spent)} of ${thousands(each.tokens)}${each.raised > 0 ? color.dim(` (${thousands(each.raised)} raised)`) : ""}`,
			each.left === 0
				? color.red("nothing left")
				: `${thousands(each.left)} left`,
		]);
	});
	const raises = report.roles.flatMap((role) =>
		role.raises.map((each) => [
			`#${each.id}`,
			role.role,
			`+${thousands(each.tokens)}`,
			`ends ${new Date(each.until).toLocaleString()}, in ${Math.ceil((each.until - now) / 3_600_000)}h`,
		]),
	);
	return [
		color.bold("budgets"),
		...table(rows),
		...(raises.length === 0
			? []
			: ["", color.bold("raises"), ...table(raises)]),
	];
}

function roleIn(role: string): Role {
	if (!(ROLES as readonly string[]).includes(role)) {
		throw new Error(`expected som or llm, got "${role}"`);
	}
	return role as Role;
}
