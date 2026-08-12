import { color, type Logger } from "@webappwiz/log";
import { isBump, type Plan, type Ship } from "@webappwiz/ship";
import type { Ps } from "@webappwiz/sys";
import type { Fix } from "./fix";

/** The `wiz ship` command: releases every package in the workspace together. */
export class ShipCommand {
	constructor(
		private readonly log: Logger,
		private readonly ps: Ps,
		private readonly ship: Pick<Ship, "plan" | "run">,
		private readonly fix: Pick<Fix, "run">,
	) {}

	async run(opts: { bump: string }): Promise<void> {
		if (!isBump(opts.bump)) {
			throw new Error(
				`unknown version bump "${opts.bump}" (expected patch, minor or major)`,
			);
		}
		// These packages publish their source, so a typecheck is the only compile
		// gate there is. Run it before anything is stamped or pushed.
		await this.fix.run({ check: true });

		let plan = await this.ship.plan(opts.bump);
		plan = await this.recover(plan);
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
		await this.ship.run(plan);
	}

	/**
	 * Runs the commands that clear the problems carrying one, then plans again.
	 * A terminal is the one place this is safe: `npm login` wants a human, and
	 * a server that ran it would hang instead of failing.
	 */
	private async recover(plan: Plan): Promise<Plan> {
		const fixable = plan.problems.filter((p) => p.remedy !== undefined);
		if (fixable.length === 0) {
			return plan;
		}
		for (const problem of fixable) {
			const remedy = problem.remedy ?? [];
			this.log.info(`${problem.message}: running \`${remedy.join(" ")}\``);
			await this.ps.spawn(remedy);
		}
		return this.ship.plan(plan.bump);
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
		const answer = prompt(
			color.yellow(`publish ${going.length} packages as ${plan.next}? (y/n)`),
		);
		return answer?.trim().toLowerCase() === "y";
	}
}
