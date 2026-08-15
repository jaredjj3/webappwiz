import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { CliGit } from "./git/cli-git";
import type { Git } from "./git/git";
import type { Problem } from "./problem";
import { WorkspaceRelease } from "./release/workspace-release";
import type { Ship } from "./ship/ship";
import { type Bump, bump } from "./version";
import { ManifestWorkspace } from "./workspace/manifest-workspace";
import type { Package, Workspace } from "./workspace/workspace";

/** What a `Runner` releases through; the real system by default. */
export interface RunnerOptions {
	/** The packages the release stamps; the manifest workspace here by default. */
	workspace?: Workspace;
	/** The repository the release commits, tags and pushes; the workspace root's by default. */
	git?: Git;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	// judge-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
}

/** The version a release is about to go out at. */
interface Next {
	current: string;
	version: string;
	/** True when the version repeats itself to finish a release that died partway. */
	resuming: boolean;
}

/**
 * Ships a release from a terminal: say what stands in the way, run each
 * problem's remedy and look again, show what would go out, ask, and release
 * it. A terminal is the one place the remedies are safe: `npm login` wants a
 * human, and a server that ran it would hang instead of failing.
 */
export class Runner {
	private readonly log: Logger;
	private readonly ps: Ps;
	private readonly ask: (message: string) => string | null;
	private workspace?: Workspace;
	private git?: Git;

	constructor(private readonly opts: RunnerOptions = {}) {
		this.log = opts.log ?? new ConsoleLogger();
		this.ps = opts.ps ?? new NodePs();
		this.ask = opts.prompt ?? prompt;
		this.workspace = opts.workspace;
		this.git = opts.git;
	}

	/**
	 * Releases `ship` at `type`: stamp every package at one version, commit,
	 * run each step, tag and push.
	 */
	async ship(ship: Ship, type: Bump): Promise<void> {
		const problems = await this.recover(ship);
		if (problems.length > 0) {
			for (const problem of problems) {
				this.log.error(color.red(problem.message));
			}
			throw new Error("not ready to release");
		}

		const next = await this.next(type);
		if (!this.confirm(ship, type, next)) {
			this.log.info(color.red("aborted"));
			return;
		}

		const { workspace, git } = await this.collaborators();
		await workspace.setVersion(next.version);
		await git.commitAll(`Release ${next.version}`);
		const release = new WorkspaceRelease(
			next.version,
			await workspace.packages(),
			git,
			{ log: this.log },
		);
		await ship.run(release);
		// Nothing had to ask for the tag, and a release without one reads as a
		// release that never finished.
		await release.tag();
		this.log.info(color.green(`shipped ${next.version}`));
	}

	/** Runs the commands that clear the problems carrying one, then looks again. */
	private async recover(ship: Ship): Promise<Problem[]> {
		const problems = await this.problems(ship);
		const fixable = problems.filter((problem) => problem.remedy !== undefined);
		if (fixable.length === 0) {
			return problems;
		}
		for (const problem of fixable) {
			const remedy = problem.remedy ?? [];
			this.log.info(`${problem.message}: running \`${remedy.join(" ")}\``);
			await this.ps.spawn(remedy);
		}
		return this.problems(ship);
	}

	/** Everything standing between this repository and the release. */
	private async problems(ship: Ship): Promise<Problem[]> {
		const { workspace, git } = await this.collaborators();
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
		if (ship.packages.length === 0) {
			problems.push({
				kind: "empty",
				message: "no packages are declared: there is nothing to publish",
			});
		}
		problems.push(...this.roster(ship, await workspace.packages()));
		problems.push(...(await ship.problems()));
		return problems;
	}

	/** Where the declaration and the workspace's packages disagree. */
	private roster(ship: Ship, packages: Package[]): Problem[] {
		const problems: Problem[] = [];
		const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
		const declared = new Set(ship.packages);
		for (const name of declared) {
			const pkg = byName.get(name);
			if (pkg === undefined || pkg.private) {
				problems.push({
					kind: "unknown",
					message: `"${name}" is declared but the workspace has no public package by that name`,
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

	/**
	 * The version to release. A release commit at HEAD with no tag says the
	 * last one died partway, and that version goes out again rather than being
	 * bumped past: tagging is the first thing that happens once every package
	 * is out.
	 */
	private async next(type: Bump): Promise<Next> {
		const { workspace, git } = await this.collaborators();
		const current = await workspace.version();
		// ponytail: a release that tagged but failed to push reads as finished,
		// and the next one moves past it. Compare against origin's tags if that
		// ever costs anyone a version.
		const resuming =
			!(await git.hasTag(`v${current}`)) &&
			(await git.headSubject()) === `Release ${current}`;
		return {
			current,
			version: resuming ? current : bump(current, type),
			resuming,
		};
	}

	private confirm(ship: Ship, type: Bump, next: Next): boolean {
		this.log.info(
			next.resuming
				? `finishing the release of ${next.version}`
				: `${next.current} -> ${next.version} (${type})`,
		);
		for (const name of ship.packages) {
			this.log.info(`  ${name}`);
		}
		const answer = this.ask(
			color.yellow(
				`publish ${ship.packages.length} packages as ${next.version}? (y/n)`,
			),
		);
		return answer?.trim().toLowerCase() === "y";
	}

	/** The workspace and repository released from, found once and kept. */
	private async collaborators(): Promise<{ workspace: Workspace; git: Git }> {
		this.workspace ??= await ManifestWorkspace.at(this.ps.cwd(), {
			fs: this.opts.fs,
		});
		this.git ??= new CliGit(this.workspace.root, { ps: this.ps });
		return { workspace: this.workspace, git: this.git };
	}
}
