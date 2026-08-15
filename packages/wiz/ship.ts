import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import type { Check } from "@webappwiz/rules";
import {
	CliGit,
	CliGithub,
	isBump,
	LockstepShip,
	ManifestWorkspace,
	NpmRegistry,
	type Plan,
	type Ship,
} from "@webappwiz/ship";
import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { fix } from "./fix";

export interface ShipOptions {
	/** How far to move the version: patch, minor or major. */
	bump: string;
	/** The release to run; the workspace's own lockstep release by default. */
	release?: Ship;
	/** The rules the gate runs; the workspace's own by default. */
	checks?: Pick<Check, "run">;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
}

/** Releases every package in the workspace together, at one version. */
export async function ship(opts: ShipOptions): Promise<void> {
	const log = opts.log ?? new ConsoleLogger();
	const ps = opts.ps ?? new NodePs();
	const release =
		opts.release ?? (await lockstepRelease(log, ps, { fs: opts.fs }));
	if (!isBump(opts.bump)) {
		throw new Error(
			`unknown version bump "${opts.bump}" (expected patch, minor or major)`,
		);
	}
	// These packages publish their source, so a typecheck is the only compile
	// gate there is. Run it before anything is stamped or pushed.
	await fix({ check: true, checks: opts.checks, log, ps });

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

/** The real thing: every package in this workspace, released in lockstep. */
async function lockstepRelease(
	log: Logger,
	ps: Ps,
	{ fs }: { fs?: Fs },
): Promise<Ship> {
	const workspace = await ManifestWorkspace.at(ps.cwd(), { fs });
	return new LockstepShip(
		workspace,
		new CliGit(workspace.root, { ps }),
		new NpmRegistry({ ps }),
		new CliGithub({ ps }),
		{ log },
	);
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
	release: Ship,
): Promise<Plan> {
	const fixable = plan.problems.filter(
		(problem) => problem.remedy !== undefined,
	);
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
