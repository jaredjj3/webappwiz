import { type Fs, NodePs, type Ps } from "webappwiz/system";
import type { Artifact } from "./artifact/artifact";
import { BunBundle } from "./bundle/bun-bundle";
import type { Bundle } from "./bundle/bundle";
import { BundleArtifact } from "./bundle/bundle-artifact";
import { CliGit } from "./git/cli-git";
import { GitArtifact, type GitArtifactOptions } from "./git/git-artifact";
import { CliGithub, type CliGithubOptions } from "./github/cli-github";
import { GithubArtifact } from "./github/github-artifact";
import { NpmRegistry, type NpmRegistryOptions } from "./registry/npm-registry";
import type { Registry } from "./registry/registry";
import { RegistryArtifact } from "./registry/registry-artifact";
import { Release } from "./release";
import { SkillArtifact, type SkillArtifactOptions } from "./skill-artifact";
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
		return new Release([new RegistryArtifact(name, new NpmRegistry(opts))]);
	}

	/** A package `registry` carries, for wherever npm is not the answer. */
	static custom(name: string, registry: Registry): Release {
		return new Release([new RegistryArtifact(name, registry)]);
	}

	/** The tag, and the push that publishes it. */
	static git(opts: GitArtifactOptions = {}): Release {
		return new Release([new GitArtifact(opts)]);
	}

	/**
	 * Building every package before any of them goes out, and clearing what that
	 * left once the release is over. Add it to any release whose packages
	 * publish something other than the source they were written in.
	 */
	static build(bundle?: Bundle): Release {
		return new Release([new BundleArtifact(bundle)]);
	}

	/**
	 * An agent skill document whose frontmatter version this release stamps,
	 * given relative to the workspace root. The stamp lands in the release
	 * commit, so a skill bundled into a package says the version that bundled
	 * it rather than the one before.
	 */
	static skill(path: string, opts: SkillArtifactOptions = {}): Release {
		return new Release([new SkillArtifact(path, opts)]);
	}

	/** The release notes GitHub publishes for the tag. */
	static github(opts: CliGithubOptions = {}): Release {
		return new Release([new GithubArtifact(new CliGithub(opts))]);
	}

	/**
	 * Every artifact given, at one version. Declare them in any order: each artifact's
	 * stage decides when it runs, so the packages always publish before the tag
	 * that names them, and the notes always come last.
	 */
	static lockstep(...artifacts: Array<Artifact | Release>): Release {
		return new Release(
			artifacts.flatMap((artifact) =>
				artifact instanceof Release ? [...artifact.artifacts] : [artifact],
			),
		);
	}

	/**
	 * The workspace's own release: every public package around the working
	 * directory onto npm, tagged, with GitHub release notes. This is what
	 * `wiz dev ship` runs when nothing declares otherwise.
	 */
	static async workspace(opts: WorkspaceReleaseOptions = {}): Promise<Release> {
		const ps = opts.ps ?? new NodePs();
		const workspace = await ManifestWorkspace.at(ps.cwd(), { fs: opts.fs });
		const registry = new NpmRegistry({ ps });
		const artifacts: Artifact[] = (await workspace.packages())
			.filter((pkg) => !pkg.private)
			.map((pkg) => new RegistryArtifact(pkg.name, registry));
		return new Release([
			new BundleArtifact(new BunBundle({ fs: opts.fs, ps })),
			...artifacts,
			new GitArtifact({ git: new CliGit(workspace.root, { ps }) }),
			new GithubArtifact(new CliGithub({ ps })),
		]);
	}
}
