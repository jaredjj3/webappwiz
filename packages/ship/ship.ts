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

/** The version a release is about to go out at. */
interface Next {
	current: string;
	version: string;
	/** True when the version repeats itself to finish a release that died partway. */
	resuming: boolean;
}

/**
 * Releases everything `release` declares, at `type`: stamp every package at
 * one version, commit, publish each part in turn, and say what happened.
 * Asks before any of it, so give it a `prompt` to ask somewhere other than a
 * terminal.
 */
export async function ship(
	release: Release,
	type: Bump,
	opts: ShipOptions = {},
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

	const next = await version(workspace, git, type);
	const dirty = !(await git.clean());
	if (!confirm(opts.prompt ?? prompt, log, release, type, next, dirty)) {
		log.info(color.red("aborted"));
		return;
	}

	await workspace.setVersion(next.version);
	await git.commitAll(`Release ${next.version}`);
	const cut = new Cut(next.version, await workspace.packages(), { log });
	await release.publish(cut);
	if (!(await git.hasTag(cut.tag))) {
		// Without a tag the next release reads this commit as one that died
		// partway, and repeats the version rather than moving past it.
		throw new Error(`nothing tagged ${cut.tag}: declare releases.git()`);
	}
	log.info(color.green(`shipped ${next.version}`));
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
 * The version to release. A release commit at HEAD with no tag says the last
 * one died partway, and that version goes out again rather than being bumped
 * past: the tag is what says a release finished.
 */
async function version(
	workspace: Workspace,
	git: Git,
	type: Bump,
): Promise<Next> {
	const current = await workspace.version();
	// ponytail: a release that tagged but failed to push reads as finished, and
	// the next one moves past it. Compare against origin's tags if that ever
	// costs anyone a version.
	const resuming =
		!(await git.hasTag(`v${current}`)) &&
		(await git.headSubject()) === `Release ${current}`;
	return {
		current,
		version: resuming ? current : bump(current, type),
		resuming,
	};
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
	type: Bump,
	next: Next,
	dirty: boolean,
): boolean {
	log.info(
		next.resuming
			? `finishing the release of ${next.version}`
			: `${next.current} -> ${next.version} (${type})`,
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
