import { color, type Logger } from "@webappwiz/log";
import { isBump, type Plan, type Ship } from "@webappwiz/ship";
import type { Ps } from "@webappwiz/sys";
import type { Fix } from "./fix";

/** Releases every package in the workspace together, at one version. */
export async function ship(
	opts: { bump: string },
	log: Logger,
	ps: Ps,
	release: Pick<Ship, "plan" | "run">,
	fix: Pick<Fix, "run">,
): Promise<void> {
	if (!isBump(opts.bump)) {
		throw new Error(
			`unknown version bump "${opts.bump}" (expected patch, minor or major)`,
		);
	}
	// These packages publish their source, so a typecheck is the only compile
	// gate there is. Run it before anything is stamped or pushed.
	await fix.run({ check: true });

	const plan = await recover(await release.plan(opts.bump), log, ps, release);
	if (plan.problems.length > 0) {
		for (const problem of plan.problems) {
			log.error(color.red(problem.message));
		}
		throw new Error("not ready to release");
	}
	if (!confirm(plan, log)) {
		log.info(color.red("aborted"));
		return;
	}
	await release.run(plan);
}

/**
 * Runs the commands that clear the problems carrying one, then plans again.
 * A terminal is the one place this is safe: `npm login` wants a human, and a
 * server that ran it would hang instead of failing.
 */
async function recover(
	plan: Plan,
	log: Logger,
	ps: Ps,
	release: Pick<Ship, "plan">,
): Promise<Plan> {
	const fixable = plan.problems.filter((p) => p.remedy !== undefined);
	if (fixable.length === 0) {
		return plan;
	}
	for (const problem of fixable) {
		const remedy = problem.remedy ?? [];
		log.info(`${problem.message}: running \`${remedy.join(" ")}\``);
		await ps.spawn(remedy);
	}
	return release.plan(plan.bump);
}

function confirm(plan: Plan, log: Logger): boolean {
	const going = plan.packages.filter((pkg) => !pkg.private);
	log.info(
		plan.resuming
			? `finishing the release of ${plan.next}`
			: `${plan.current} -> ${plan.next} (${plan.bump})`,
	);
	for (const pkg of going) {
		log.info(`  ${pkg.name}${pkg.published ? color.green(" done") : ""}`);
	}
	const answer = prompt(
		color.yellow(`publish ${going.length} packages as ${plan.next}? (y/n)`),
	);
	return answer?.trim().toLowerCase() === "y";
}
