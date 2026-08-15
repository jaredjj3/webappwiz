import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import { NodePs, type Ps } from "@webappwiz/system";
import type { Plan } from "./plan";
import type { Ship } from "./ship/ship";
import type { Bump } from "./version";

/** What a `Runner` speaks through; the console and the real process by default. */
export interface RunnerOptions {
	log?: Logger;
	ps?: Ps;
	// judge-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
}

/**
 * Ships a release from a terminal: plan, run each problem's remedy and plan
 * again, show what would go out, ask, and run it. A terminal is the one place
 * the remedies are safe: `npm login` wants a human, and a server that ran it
 * would hang instead of failing.
 */
export class Runner {
	private readonly log: Logger;
	private readonly ps: Ps;
	private readonly ask: (message: string) => string | null;

	constructor(opts: RunnerOptions = {}) {
		this.log = opts.log ?? new ConsoleLogger();
		this.ps = opts.ps ?? new NodePs();
		this.ask = opts.prompt ?? prompt;
	}

	/** Plans `bump`, recovers what it can, confirms, and runs the release. */
	async ship(release: Ship, bump: Bump): Promise<void> {
		const plan = await this.recover(release, await release.plan(bump));
		if (plan.problems.length > 0) {
			for (const problem of plan.problems) {
				this.log.error(color.red(problem.message));
			}
			throw new Error("not ready to release");
		}
		if (!this.confirm(plan)) {
			this.log.info(color.red("aborted"));
			return;
		}
		await release.run(plan);
	}

	/** Runs the commands that clear the problems carrying one, then plans again. */
	private async recover(release: Ship, plan: Plan): Promise<Plan> {
		const fixable = plan.problems.filter(
			(problem) => problem.remedy !== undefined,
		);
		if (fixable.length === 0) {
			return plan;
		}
		for (const problem of fixable) {
			const remedy = problem.remedy ?? [];
			this.log.info(`${problem.message}: running \`${remedy.join(" ")}\``);
			await this.ps.spawn(remedy);
		}
		return release.plan(plan.bump);
	}

	private confirm(plan: Plan): boolean {
		const going = plan.packages.filter((pkg) => !pkg.private);
		this.log.info(
			plan.resuming
				? `finishing the release of ${plan.next}`
				: `${plan.current} -> ${plan.next} (${plan.bump})`,
		);
		for (const pkg of going) {
			this.log.info(
				`  ${pkg.name}${pkg.published ? color.green(" done") : ""}`,
			);
		}
		const answer = this.ask(
			color.yellow(`publish ${going.length} packages as ${plan.next}? (y/n)`),
		);
		return answer?.trim().toLowerCase() === "y";
	}
}
