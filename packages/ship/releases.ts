import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { CliGit } from "./git/cli-git";
import { CliGithub, type CliGithubOptions } from "./github/cli-github";
import { GitPart, type GitPartOptions } from "./part/git-part";
import { GithubPart } from "./part/github-part";
import type { Part } from "./part/part";
import { RegistryPart } from "./part/registry-part";
import { NpmRegistry, type NpmRegistryOptions } from "./registry/npm-registry";
import type { Registry } from "./registry/registry";
import { Release } from "./release";
import { ManifestWorkspace } from "./workspace/manifest-workspace";

/** What `releases.workspace` reads the roster through; the real system by default. */
export interface WorkspaceReleaseOptions {
	fs?: Fs;
	ps?: Ps;
}

/**
 * Composes a release: name each package and where it goes, add the tag and
 * the notes, and call `release()` on the result.
 *
 * ```ts
 * await releases.lockstep(
 * 	releases.npm("@scope/foo"),
 * 	releases.custom("@scope/baz", new S3Registry()),
 * 	releases.git(),
 * 	releases.github(),
 * ).release();
 * ```
 */
export class releases {
	private constructor() {}

	/** A package the npm registry carries. */
	static npm(name: string, opts: NpmRegistryOptions = {}): Release {
		return new Release([new RegistryPart(name, new NpmRegistry(opts))]);
	}

	/** A package `registry` carries, for wherever npm is not the answer. */
	static custom(name: string, registry: Registry): Release {
		return new Release([new RegistryPart(name, registry)]);
	}

	/** The tag, and the push that publishes it. */
	static git(opts: GitPartOptions = {}): Release {
		return new Release([new GitPart(opts)]);
	}

	/** The release notes GitHub publishes for the tag. */
	static github(opts: CliGithubOptions = {}): Release {
		return new Release([new GithubPart(new CliGithub(opts))]);
	}

	/**
	 * Every part given, at one version. Declare them in any order: each part's
	 * stage decides when it runs, so the packages always publish before the tag
	 * that names them, and the notes always come last.
	 */
	static lockstep(...parts: Array<Part | Release>): Release {
		return new Release(
			parts.flatMap((part) =>
				part instanceof Release ? [...part.parts] : [part],
			),
		);
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
		const parts: Part[] = (await workspace.packages())
			.filter((pkg) => !pkg.private)
			.map((pkg) => new RegistryPart(pkg.name, registry));
		return new Release([
			...parts,
			new GitPart({ git: new CliGit(workspace.root, { ps }) }),
			new GithubPart(new CliGithub({ ps })),
		]);
	}
}
