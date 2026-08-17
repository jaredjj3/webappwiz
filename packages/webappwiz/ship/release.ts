import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { type Artifact, STAGES } from "./artifact/artifact";
import { Cut } from "./cut";
import { CliGit } from "./git/cli-git";
import type { Git } from "./git/git";
import { order } from "./order";
import { ReleaseFile } from "./release-file";
import { type Bump, bump } from "./version";
import { ManifestWorkspace } from "./workspace/manifest-workspace";
import type { Package, Workspace } from "./workspace/workspace";

/** What a release goes out through; the real system by default. */
export interface ReleaseOptions {
	/**
	 * How far to move the version; `patch` by default. A RELEASE file left by a
	 * run that died overrides it: that version is finished first.
	 */
	bump?: Bump;
	/** The packages the release stamps; the manifest workspace here by default. */
	workspace?: Workspace;
	/** The repository the release commits; the workspace root's by default. */
	git?: Git;
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	// rule-ignore objects-over-callbacks: the platform's own prompt() is the
	// dependency here, and it is a bare function
	prompt?: (message: string) => string | null;
}

/**
 * Everything a release ships, ready to go out at one version. `releases`
 * composes these; `release()` runs the whole flow: say what would go out, ask,
 * stamp every package, commit, and carry each artifact out in stage order.
 *
 * ```ts
 * await releases.lockstep(releases.npm("@scope/foo"), releases.git()).release();
 * ```
 *
 * A release that dies partway leaves a RELEASE file behind, and the next
 * `release()` finishes that version instead of bumping past it: every artifact
 * that landed is skipped, so nothing goes out twice.
 */
export class Release {
	/** Every artifact, in the order they will run: publish, then tag, then notes. */
	readonly artifacts: readonly Artifact[];

	constructor(artifacts: readonly Artifact[]) {
		// Sorting here, stably, is what frees declarations from caring about
		// order: a tag cannot come before the packages it names however the
		// artifacts were written down.
		this.artifacts = artifacts.toSorted(
			(left, right) =>
				STAGES.indexOf(left.stage ?? "publish") -
				STAGES.indexOf(right.stage ?? "publish"),
		);
	}

	/** The workspace packages this publishes, gathered from every artifact. */
	get packages(): readonly string[] {
		return this.artifacts.flatMap((artifact) => [...artifact.packages]);
	}

	/** Releases everything, asking first. Run it again after a failure. */
	async release(opts: ReleaseOptions = {}): Promise<void> {
		const ps = opts.ps ?? new NodePs();
		const log = opts.log ?? new ConsoleLogger();
		const fs = opts.fs ?? new NodeFs();
		const workspace =
			opts.workspace ?? (await ManifestWorkspace.at(ps.cwd(), { fs }));
		const git = opts.git ?? new CliGit(workspace.root, { ps });

		const [branch, trunk] = [await git.branch(), await git.defaultBranch()];
		if (branch !== trunk) {
			// Switching would release code nobody was looking at, so this is the one
			// thing here a person has to answer with their own checkout.
			throw new Error(`on "${branch}": releases go out from "${trunk}"`);
		}
		if (!(await git.clean())) {
			// The release commit takes every tracked change with it, so a dirty tree
			// is a release nobody reviewed. A run that died between the stamp and
			// its commit lands here too: `git checkout` the stamps and release
			// again, since the version comes back off RELEASE either way.
			throw new Error(
				"uncommitted changes: releases go out from a clean tree, so commit or discard them first",
			);
		}
		// Ordered once, and used twice: it decides what builds before what, and
		// then which package reaches the registry before which.
		const packages = order(await workspace.packages());
		declares(this.packages, packages);

		const file = new ReleaseFile(workspace.root, { fs });
		const found = await file.read();
		const next: Next = {
			bump: opts.bump ?? "patch",
			resuming: found !== null,
			current: await workspace.version(),
		};
		const version = found?.version ?? bump(next.current, next.bump);
		if (!confirm(opts.prompt ?? prompt, log, this.packages, version, next)) {
			log.info(color.red("aborted"));
			return;
		}

		const state = found ?? { version, done: [] };
		// The file goes down before anything moves: a run that dies from here on
		// is one the next run can see and finish.
		await file.write(state);
		await workspace.setVersion(version);
		await git.commitAll(`Release ${version}`);

		const cut = new Cut(version, packages, { log });
		try {
			for (const [index, artifact] of sequence(
				this.artifacts,
				packages,
			).entries()) {
				const key = keyFor(artifact, index);
				if (state.done.includes(key)) {
					continue;
				}
				await artifact.publish(cut);
				state.done.push(key);
				await file.write(state);
			}
		} finally {
			for (const artifact of this.artifacts) {
				await artifact.clean?.(cut);
			}
		}
		await file.clear();
		log.info(color.green(`shipped ${version}`));
	}
}

/**
 * `artifacts` in the order they run: by stage, and within a stage by where the
 * packages they name fall in the dependency order. The stage key is applied
 * again here rather than trusted from the constructor, so the sequence is
 * right however the artifacts arrived.
 *
 * An artifact naming no packages, or naming one the workspace does not have,
 * sorts to the end of its stage, where it cannot come between two that do.
 */
function sequence(
	artifacts: readonly Artifact[],
	packages: readonly Package[],
): Artifact[] {
	const rank = new Map(packages.map((pkg, index) => [pkg.name, index]));
	const at = (artifact: Artifact): number => {
		const ranks = artifact.packages.map(
			(name) => rank.get(name) ?? packages.length,
		);
		return ranks.length === 0 ? packages.length : Math.min(...ranks);
	};
	return artifacts.toSorted((left, right) => {
		const stages =
			STAGES.indexOf(left.stage ?? "publish") -
			STAGES.indexOf(right.stage ?? "publish");
		return stages !== 0 ? stages : at(left) - at(right);
	});
}

/**
 * One name per artifact, so RELEASE can say which of them landed. The index makes
 * it unique; the rest makes the file legible. A declaration edited between a
 * death and its retry shifts the keys, and every artifact reruns: each one skips
 * what already went out, so the cost is a registry lookup, not a double
 * publish.
 */
function keyFor(artifact: Artifact, index: number): string {
	return `${index}:${artifact.packages.join(" ") || (artifact.stage ?? "publish")}`;
}

/** The version about to go out, and everything the prompt should say about it. */
interface Next {
	bump: Bump;
	resuming: boolean;
	current: string;
}

/**
 * Throws unless the declaration and the workspace agree, saying every way they
 * differ at once: fixing a declaration one name per run is nobody's idea of a
 * good time.
 */
function declares(declared: readonly string[], packages: Package[]): void {
	if (declared.length === 0) {
		throw new Error("no packages are declared: there is nothing to publish");
	}
	const drift: string[] = [];
	const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
	const names = new Set(declared);
	for (const name of names) {
		const pkg = byName.get(name);
		if (pkg === undefined || pkg.private) {
			drift.push(
				`"${name}" is declared but the workspace has no public package by that name`,
			);
		}
	}
	for (const pkg of packages) {
		if (!pkg.private && !names.has(pkg.name)) {
			drift.push(
				`"${pkg.name}" is public but not declared: declare it or mark it private`,
			);
		}
	}
	if (drift.length > 0) {
		throw new Error(drift.join("\n"));
	}
}

/** Whether to go ahead, having said what would go out. */
function confirm(
	ask: (message: string) => string | null,
	log: Logger,
	packages: readonly string[],
	version: string,
	next: Next,
): boolean {
	log.info(
		next.resuming
			? `finishing the release of ${version}`
			: `${next.current} -> ${version} (${next.bump})`,
	);
	for (const name of packages) {
		log.info(`  ${name}`);
	}
	const answer = ask(
		color.yellow(`publish ${packages.length} packages as ${version}? (y/n)`),
	);
	return answer?.trim().toLowerCase() === "y";
}
