import { color, type Logger } from "@webappwiz/log";
import type { Git } from "./git";
import type { Github } from "./github";
import type { Package, Plan, Problem } from "./plan";
import type { Registry } from "./registry";
import { type Bump, bump } from "./version";
import type { Workspace } from "./workspace";

/**
 * Releases every package in a workspace together, at one version.
 *
 * Ask `plan` what a release would do, show that to whoever is deciding, then
 * hand the plan back to `run`.
 */
export class Ship {
	constructor(
		private readonly log: Logger,
		private readonly workspace: Pick<
			Workspace,
			"version" | "packages" | "setVersion"
		>,
		private readonly git: Pick<
			Git,
			| "clean"
			| "branch"
			| "defaultBranch"
			| "headSubject"
			| "hasTag"
			| "commitAll"
			| "tag"
			| "push"
		>,
		private readonly registry: Pick<
			Registry,
			"authed" | "published" | "publish"
		>,
		private readonly github: Pick<Github, "authed" | "release">,
	) {}

	async plan(type: Bump): Promise<Plan> {
		const current = await this.workspace.version();
		const resuming = await this.unfinished(current);
		const next = resuming ? current : bump(current, type);
		const packages = await this.withPublished(
			await this.workspace.packages(),
			resuming ? current : null,
		);
		return {
			bump: type,
			current,
			next,
			resuming,
			packages,
			problems: await this.problems(packages),
		};
	}

	/**
	 * Carries out `plan`, having checked that it still holds. Run it again after
	 * a failure: everything that already landed is skipped, so a second run
	 * finishes the release rather than starting a new one.
	 */
	async run(plan: Plan): Promise<void> {
		// A plan is advice, and this is the gate. Somebody who never looked at
		// `problems` still must not get to publish from a dirty tree.
		const fresh = await this.plan(plan.bump);
		if (fresh.problems.length > 0) {
			const problems = fresh.problems
				.map((problem) => problem.message)
				.join("; ");
			throw new Error(`not ready to release: ${problems}`);
		}
		if (fresh.next !== plan.next) {
			throw new Error(
				`plan is stale: it releases ${plan.next}, the workspace is now at ${fresh.next}`,
			);
		}

		const { next } = fresh;
		const tag = `v${next}`;
		await this.workspace.setVersion(next);
		await this.git.commitAll(`Release ${next}`);

		// Publish before tagging: a tag for a version the registry never got
		// outlives the failure that caused it, and lies about what exists.
		for (const pkg of fresh.packages.filter((pkg) => !pkg.private)) {
			if (await this.registry.published(pkg.name, next)) {
				this.log.info(
					`${pkg.name}@${next} ${color.green("already published")}`,
				);
				continue;
			}
			await this.registry.publish(pkg.dir);
			this.log.info(`${pkg.name}@${next} ${color.green("published")}`);
		}

		await this.git.tag(tag);
		await this.git.push(await this.git.branch());
		await this.git.push(tag);
		await this.github.release(tag);
		this.log.info(color.green(`shipped ${next}`));
	}

	/**
	 * Whether the release of `version` stopped partway. Its commit sitting at
	 * HEAD without a tag is the signature: tagging is the first thing that
	 * happens once every package is out.
	 */
	private async unfinished(version: string): Promise<boolean> {
		if (await this.git.hasTag(`v${version}`)) {
			return false;
		}
		// ponytail: a release that tagged but failed to push reads as finished,
		// and the next one moves past it. Compare against origin's tags if that
		// ever costs anyone a version.
		return (await this.git.headSubject()) === `Release ${version}`;
	}

	private async withPublished(
		packages: Package[],
		version: string | null,
	): Promise<Package[]> {
		if (version === null) {
			// Nobody has released this version yet, and `run` asks the registry
			// again per package anyway, so there is nothing to learn by asking now.
			return packages;
		}
		const answered: Package[] = [];
		for (const pkg of packages) {
			answered.push({
				...pkg,
				published:
					!pkg.private && (await this.registry.published(pkg.name, version)),
			});
		}
		return answered;
	}

	private async problems(packages: Package[]): Promise<Problem[]> {
		const problems: Problem[] = [];
		if (!(await this.git.clean())) {
			problems.push({
				kind: "dirty",
				message: "the tree has uncommitted changes: commit them first",
			});
		}
		const [branch, trunk] = [
			await this.git.branch(),
			await this.git.defaultBranch(),
		];
		if (branch !== trunk) {
			problems.push({
				kind: "branch",
				message: `on "${branch}": releases go out from "${trunk}"`,
			});
		}
		if (packages.every((pkg) => pkg.private)) {
			problems.push({
				kind: "empty",
				message: "every package is private: there is nothing to publish",
			});
		}
		if (!(await this.registry.authed())) {
			problems.push({
				kind: "npm-auth",
				message: "not logged in to npm",
				remedy: ["npm", "login"],
			});
		}
		if (!(await this.github.authed())) {
			problems.push({
				kind: "gh-auth",
				message: "not logged in to GitHub",
				remedy: ["gh", "auth", "login"],
			});
		}
		return problems;
	}
}
