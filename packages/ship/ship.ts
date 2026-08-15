import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { Cut } from "./cut";
import { CliGit } from "./git/cli-git";
import type { Git } from "./git/git";
import type { Release } from "./release/release";
import { type Bump, bump } from "./version";
import { ManifestWorkspace } from "./workspace/manifest-workspace";
import type { Package, Workspace } from "./workspace/workspace";

/** What a release goes out through; the real system by default. */
export interface ShipOptions {
	/** The packages the release stamps; the manifest workspace here by default. */
	workspace?: Workspace;
	/** The repository the release commits; the workspace root's by default. */
	git?: Git;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	// judge-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
}

/**
 * Releasing everything a `Release` declares, at one version: stamp every
 * package, commit, publish each part in turn, and say what happened. Each
 * verb asks before any of it, so pass a `prompt` to ask somewhere other than
 * a terminal.
 *
 * ```ts
 * const release = releases.lockstep(releases.npm("@scope/foo"), releases.git());
 *
 * await ship.patch(release);
 * ```
 */
export class ship {
	private constructor() {}

	/** Releases at the next major version: 1.2.3 goes out as 2.0.0. */
	static major(release: Release, opts: ShipOptions = {}): Promise<void> {
		return run(release, "major", opts);
	}

	/** Releases at the next minor version: 1.2.3 goes out as 1.3.0. */
	static minor(release: Release, opts: ShipOptions = {}): Promise<void> {
		return run(release, "minor", opts);
	}

	/** Releases at the next patch version: 1.2.3 goes out as 1.2.4. */
	static patch(release: Release, opts: ShipOptions = {}): Promise<void> {
		return run(release, "patch", opts);
	}

	/**
	 * Releases at the version already stamped, finishing one that died partway
	 * rather than moving past it. Everything that went out the first time is
	 * skipped, so this picks up where the failure was.
	 */
	static resume(release: Release, opts: ShipOptions = {}): Promise<void> {
		return run(release, "resume", opts);
	}
}

/** How far a run moves the version, or that it repeats the one already stamped. */
type Step = Bump | "resume";

/** The version a release is about to go out at, and how it got there. */
interface Next {
	step: Step;
	current: string;
	version: string;
}

async function run(
	release: Release,
	step: Step,
	opts: ShipOptions,
): Promise<void> {
	const ps = opts.ps ?? new NodePs();
	const log = opts.log ?? new ConsoleLogger();
	const workspace =
		opts.workspace ?? (await ManifestWorkspace.at(ps.cwd(), { fs: opts.fs }));
	const git = opts.git ?? new CliGit(workspace.root, { ps });

	const [branch, trunk] = [await git.branch(), await git.defaultBranch()];
	if (branch !== trunk) {
		// Switching would release code nobody was looking at, so this is the one
		// thing here a person has to answer with their own checkout.
		throw new Error(`on "${branch}": releases go out from "${trunk}"`);
	}
	declares(release, await workspace.packages());

	const current = await workspace.version();
	const next: Next = {
		step,
		current,
		version: step === "resume" ? current : bump(current, step),
	};
	const dirty = !(await git.clean());
	if (!confirm(opts.prompt ?? prompt, log, release, next, dirty)) {
		log.info(color.red("aborted"));
		return;
	}

	const { version } = next;
	await workspace.setVersion(version);
	await git.commitAll(`Release ${version}`);
	await release.publish(new Cut(version, await workspace.packages(), { log }));
	log.info(color.green(`shipped ${version}`));
}

/**
 * Throws unless the declaration and the workspace agree, saying every way they
 * differ at once: fixing a declaration one name per run is nobody's idea of a
 * good time.
 */
function declares(release: Release, packages: Package[]): void {
	if (release.packages.length === 0) {
		throw new Error("no packages are declared: there is nothing to publish");
	}
	const drift: string[] = [];
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const declared = new Set(release.packages);
	for (const name of declared) {
		const pkg = byName.get(name);
		if (pkg === undefined || pkg.private) {
			drift.push(
				`"${name}" is declared but the workspace has no public package by that name`,
			);
		}
	}
	for (const pkg of packages) {
		if (!pkg.private && !declared.has(pkg.name)) {
			drift.push(
				`"${pkg.name}" is public but not declared: declare it or mark it private`,
			);
		}
	}
	if (drift.length > 0) {
		throw new Error(drift.join("\n"));
	}
}

/**
 * Whether to go ahead. A dirty tree is named rather than refused: the release
 * commit takes every tracked change with it either way, so this is the moment
 * to say so to somebody who can answer.
 */
function confirm(
	ask: (message: string) => string | null,
	log: Logger,
	release: Release,
	next: Next,
	dirty: boolean,
): boolean {
	log.info(
		next.step === "resume"
			? `finishing the release of ${next.version}`
			: `${next.current} -> ${next.version} (${next.step})`,
	);
	for (const name of release.packages) {
		log.info(`  ${name}`);
	}
	if (dirty) {
		log.info(
			color.yellow("  uncommitted changes, which go into the release commit"),
		);
	}
	const answer = ask(
		color.yellow(
			`publish ${release.packages.length} packages as ${next.version}? (y/n)`,
		),
	);
	return answer?.trim().toLowerCase() === "y";
}
