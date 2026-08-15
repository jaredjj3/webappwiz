import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { CliGit } from "../git/cli-git";
import type { Git } from "../git/git";
import type { Github } from "../github/github";
import type { Package, Plan, Problem } from "../plan";
import type { Registry } from "../registry/registry";
import { type Bump, bump } from "../version";
import { ManifestWorkspace } from "../workspace/manifest-workspace";
import type { Workspace } from "../workspace/workspace";
import type { Ship, Target } from "./ship";

/** What a `LockstepShip` releases through; found from the working directory by default. */
export interface LockstepShipOptions {
	/** Publishes release notes after the tag. Omitted, the release has no GitHub step. */
	github?: Github;
	/** The packages the release stamps; the manifest workspace here by default. */
	workspace?: Workspace;
	/** The repository the release commits, tags and pushes; the workspace root's by default. */
	git?: Git;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
}

/**
 * Releases every declared target together, at one version: stamp, commit,
 * publish each target through its registry, tag, push, and write the GitHub
 * release notes when a step for them was declared. Planning cross-checks the
 * declared targets against the workspace, so a declaration that drifted from
 * the manifest fails before anything moves.
 */
export class LockstepShip implements Ship {
	private readonly log: Logger;
	private workspace?: Workspace;
	private git?: Git;

	constructor(
		private readonly targets: Target[],
		private readonly opts: LockstepShipOptions = {},
	) {
		this.log = opts.log ?? new ConsoleLogger();
		this.workspace = opts.workspace;
		this.git = opts.git;
	}

	async plan(type: Bump): Promise<Plan> {
		const { workspace, git } = await this.collaborators();
		const current = await workspace.version();
		const resuming = await this.unfinished(git, current);
		const next = resuming ? current : bump(current, type);
		const packages = await this.withPublished(
			await workspace.packages(),
			resuming ? current : null,
		);
		return {
			bump: type,
			current,
			next,
			resuming,
			packages,
			problems: await this.problems(git, packages),
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

		const { workspace, git } = await this.collaborators();
		const { next } = fresh;
		const tag = `v${next}`;
		await workspace.setVersion(next);
		await git.commitAll(`Release ${next}`);

		// Publish before tagging: a tag for a version the registry never got
		// outlives the failure that caused it, and lies about what exists.
		const dirs = new Map(fresh.packages.map((pkg) => [pkg.name, pkg.dir]));
		for (const target of this.targets) {
			if (await target.registry.published(target.name, next)) {
				this.log.info(
					`${target.name}@${next} ${color.green("already published")}`,
				);
				continue;
			}
			const dir = dirs.get(target.name);
			if (dir === undefined) {
				// Unreachable while the roster problems above hold their gate.
				throw new Error(`"${target.name}" has no workspace package`);
			}
			await target.registry.publish(dir);
			this.log.info(`${target.name}@${next} ${color.green("published")}`);
		}

		await git.tag(tag);
		await git.push(await git.branch());
		await git.push(tag);
		await this.opts.github?.release(tag);
		this.log.info(color.green(`shipped ${next}`));
	}

	/** The workspace and repository released from, found once and kept. */
	private async collaborators(): Promise<{ workspace: Workspace; git: Git }> {
		if (this.workspace === undefined) {
			const ps = this.opts.ps ?? new NodePs();
			this.workspace = await ManifestWorkspace.at(ps.cwd(), {
				fs: this.opts.fs,
			});
		}
		this.git ??= new CliGit(this.workspace.root, { ps: this.opts.ps });
		return { workspace: this.workspace, git: this.git };
	}

	/**
	 * Whether the release of `version` stopped partway. Its commit sitting at
	 * HEAD without a tag is the signature: tagging is the first thing that
	 * happens once every package is out.
	 */
	private async unfinished(git: Git, version: string): Promise<boolean> {
		if (await git.hasTag(`v${version}`)) {
			return false;
		}
		// ponytail: a release that tagged but failed to push reads as finished,
		// and the next one moves past it. Compare against origin's tags if that
		// ever costs anyone a version.
		return (await git.headSubject()) === `Release ${version}`;
	}

	private async withPublished(
		packages: Package[],
		version: string | null,
	): Promise<Package[]> {
		if (version === null) {
			// Nobody has released this version yet, and `run` asks the registry
			// again per target anyway, so there is nothing to learn by asking now.
			return packages;
		}
		const registries = new Map(
			this.targets.map((target) => [target.name, target.registry]),
		);
		const answered: Package[] = [];
		for (const pkg of packages) {
			const registry = registries.get(pkg.name);
			answered.push({
				...pkg,
				published:
					registry !== undefined &&
					(await registry.published(pkg.name, version)),
			});
		}
		return answered;
	}

	private async problems(git: Git, packages: Package[]): Promise<Problem[]> {
		const problems: Problem[] = [];
		if (!(await git.clean())) {
			problems.push({
				kind: "dirty",
				message: "the tree has uncommitted changes: commit them first",
			});
		}
		const [branch, trunk] = [await git.branch(), await git.defaultBranch()];
		if (branch !== trunk) {
			problems.push({
				kind: "branch",
				message: `on "${branch}": releases go out from "${trunk}"`,
			});
		}
		if (this.targets.length === 0) {
			problems.push({
				kind: "empty",
				message: "no targets are declared: there is nothing to publish",
			});
		}
		problems.push(...this.roster(packages));
		problems.push(...(await this.blocked()));
		return problems;
	}

	/** Where the declared targets and the workspace's packages disagree. */
	private roster(packages: Package[]): Problem[] {
		const problems: Problem[] = [];
		const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
		const declared = new Set(this.targets.map((target) => target.name));
		for (const target of this.targets) {
			const pkg = byName.get(target.name);
			if (pkg === undefined || pkg.private) {
				problems.push({
					kind: "unknown",
					message: `"${target.name}" is declared but the workspace has no public package by that name`,
				});
			}
		}
		for (const pkg of packages) {
			if (!pkg.private && !declared.has(pkg.name)) {
				problems.push({
					kind: "undeclared",
					message: `"${pkg.name}" is public but not declared: declare it or mark it private`,
				});
			}
		}
		return problems;
	}

	/** Everything the registries and GitHub report, each problem said once. */
	private async blocked(): Promise<Problem[]> {
		const sources: Pick<Registry, "problems">[] = [
			...new Set(this.targets.map((target) => target.registry)),
		];
		if (this.opts.github !== undefined) {
			sources.push(this.opts.github);
		}
		const problems: Problem[] = [];
		const seen = new Set<string>();
		for (const source of sources) {
			for (const problem of await source.problems()) {
				const key = `${problem.kind}: ${problem.message}`;
				if (!seen.has(key)) {
					seen.add(key);
					problems.push(problem);
				}
			}
		}
		return problems;
	}
}
