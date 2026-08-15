import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { CliGit } from "./git/cli-git";
import { CliGithub, type CliGithubOptions } from "./github/cli-github";
import { NpmRegistry, type NpmRegistryOptions } from "./registry/npm-registry";
import type { Registry } from "./registry/registry";
import { GitRelease, type GitReleaseOptions } from "./release/git-release";
import { GithubRelease } from "./release/github-release";
import { LockstepRelease } from "./release/lockstep-release";
import { RegistryRelease } from "./release/registry-release";
import type { Release } from "./release/release";
import { ManifestWorkspace } from "./workspace/manifest-workspace";

/** What `releases.workspace` reads the roster through; the real system by default. */
export interface WorkspaceReleaseOptions {
	fs?: Fs;
	ps?: Ps;
}

/**
 * Composes a release: name each package and where it goes, add the tag and
 * whatever follows it, and `ship` the result.
 *
 * ```ts
 * const release = releases.lockstep(
 * 	releases.npm("@scope/foo"),
 * 	releases.custom("@scope/baz", new S3Registry()),
 * 	releases.git(),
 * 	releases.github(),
 * );
 *
 * await ship.patch(release);
 * ```
 */
export class releases {
	private constructor() {}

	/** A package the npm registry carries. */
	static npm(name: string, opts: NpmRegistryOptions = {}): Release {
		return new RegistryRelease(name, new NpmRegistry(opts));
	}

	/** A package `registry` carries, for wherever npm is not the answer. */
	static custom(name: string, registry: Registry): Release {
		return new RegistryRelease(name, registry);
	}

	/** The tag, and the push that publishes it. Declare it after the packages. */
	static git(opts: GitReleaseOptions = {}): Release {
		return new GitRelease(opts);
	}

	/** The release notes GitHub publishes for the tag. */
	static github(opts: CliGithubOptions = {}): Release {
		return new GithubRelease(new CliGithub(opts));
	}

	/** Every part above, run in the order they are given, at one version. */
	static lockstep(...parts: Release[]): Release {
		return new LockstepRelease(...parts);
	}

	/**
	 * The workspace's own release: every public package around the working
	 * directory onto npm, tagged, with GitHub release notes. This is what
	 * `wiz ship` runs when nothing declares otherwise.
	 */
	static async workspace(opts: WorkspaceReleaseOptions = {}): Promise<Release> {
		const ps = opts.ps ?? new NodePs();
		const workspace = await ManifestWorkspace.at(ps.cwd(), { fs: opts.fs });
		const registry = new NpmRegistry({ ps });
		const parts = (await workspace.packages())
			.filter((pkg) => !pkg.private)
			.map((pkg) => new RegistryRelease(pkg.name, registry));
		return new LockstepRelease(
			...parts,
			new GitRelease({ git: new CliGit(workspace.root, { ps }) }),
			new GithubRelease(new CliGithub({ ps })),
		);
	}
}
