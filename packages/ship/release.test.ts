import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs } from "@webappwiz/system/testing";
import { FakeGit } from "./git/fake-git";
import { FakeGithub } from "./github/fake-github";
import { GithubArtifact } from "./github/github-artifact";
import { FakeRegistry } from "./registry/fake-registry";
import type { Release, ReleaseOptions } from "./release";
import { releases } from "./releases";
import { FakeWorkspace } from "./workspace/fake-workspace";

describe("release", () => {
	let workspace: FakeWorkspace;
	let git: FakeGit;
	let registry: FakeRegistry;
	let github: FakeGithub;
	let log: MemoryLogger;
	let fs: FakeFs;
	let asked: string[];
	/** Both public packages onto one registry, tagged, with the notes last. */
	let release: Release;

	beforeEach(async () => {
		workspace = new FakeWorkspace();
		git = new FakeGit();
		registry = new FakeRegistry();
		github = new FakeGithub();
		log = new MemoryLogger();
		fs = new FakeFs();
		await fs.mkdir("/repo");
		asked = [];
		release = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
			releases.git({ git }),
			new GithubArtifact(github),
		);
	});

	const answering = (answer: string | null): ReleaseOptions => ({
		workspace,
		git,
		log,
		fs,
		prompt: (message) => {
			asked.push(message);
			return answer;
		},
	});

	/** Everything the release said, colour codes and all. */
	const said = () =>
		log.entries.map((entry) => String(entry.message)).join("\n");

	it("stamps, commits, publishes, tags, pushes and writes the notes", async () => {
		await release.release(answering(" Y "));

		expect(workspace.stamped).toEqual(["1.2.4"]);
		expect(git.commits).toEqual(["Release 1.2.4"]);
		expect(registry.publishes).toEqual([
			"/repo/packages/one",
			"/repo/packages/two",
		]);
		expect([...git.tags]).toEqual(["v1.2.4"]);
		expect(git.pushes).toEqual(["main", "v1.2.4"]);
		expect(github.releases).toEqual(["v1.2.4"]);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("moves the version as far as the bump says", async () => {
		await release.release({ ...answering("y"), bump: "minor" });

		expect(workspace.stamped).toEqual(["1.3.0"]);
	});

	it("takes the whole major version", async () => {
		await release.release({ ...answering("y"), bump: "major" });

		expect(workspace.stamped).toEqual(["2.0.0"]);
	});

	it("publishes before it tags, however the declaration is ordered", async () => {
		const order: string[] = [];
		registry.publish = async (dir: string) => {
			order.push(`publish ${dir}`);
		};
		git.tag = async (tag: string) => {
			order.push(`tag ${tag}`);
			git.tags.add(tag);
		};
		github.release = async (tag: string) => {
			order.push(`notes ${tag}`);
		};
		const scrambled = releases.lockstep(
			new GithubArtifact(github),
			releases.git({ git }),
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
		);

		await scrambled.release(answering("y"));

		expect(order).toEqual([
			"publish /repo/packages/one",
			"publish /repo/packages/two",
			"tag v1.2.4",
			"notes v1.2.4",
		]);
	});

	it("skips a package the registry already has", async () => {
		registry.has.add("@scope/one@1.2.4");

		await release.release(answering("y"));

		expect(registry.publishes).toEqual(["/repo/packages/two"]);
	});

	it("asks before anything moves, and stops on any other answer", async () => {
		await release.release(answering("n"));

		expect(asked.join()).toContain("publish 2 packages as 1.2.4?");
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
		expect(git.commits).toEqual([]);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
	});

	it("leaves RELEASE behind when an artifact fails, and finishes from it", async () => {
		github.error = new Error("not logged in to GitHub");

		await expect(release.release(answering("y"))).rejects.toThrow(
			"not logged in to GitHub",
		);

		const state = JSON.parse(await fs.read("/repo/RELEASE"));
		expect(state.version).toBe("1.2.4");
		expect(state.done).toHaveLength(3); // both packages and the tag landed

		// The retry finishes 1.2.4 whatever bump it asked for, skipping every
		// artifact RELEASE says landed without so much as a registry lookup.
		github.error = undefined;
		const looked: string[] = [];
		registry.published = async (name: string) => {
			looked.push(name);
			return false;
		};
		await release.release({ ...answering("y"), bump: "major" });

		expect(said()).toContain("finishing the release of 1.2.4");
		expect(workspace.stamped).toEqual(["1.2.4", "1.2.4"]);
		expect(looked).toEqual([]);
		expect(registry.publishes).toEqual([
			"/repo/packages/one",
			"/repo/packages/two",
		]);
		expect(github.releases).toEqual(["v1.2.4"]);
		expect(await fs.exists("/repo/RELEASE")).toBe(false);
		expect(said()).toContain("shipped 1.2.4");
	});

	it("refuses a RELEASE file it cannot read", async () => {
		await fs.write("/repo/RELEASE", "half a releas");

		await expect(release.release(answering("y"))).rejects.toThrow(
			"does not hold release state",
		);
		expect(workspace.stamped).toEqual([]);
	});

	it("refuses a dirty tree, whose changes the release commit would take", async () => {
		git.dirty = true;

		await expect(release.release(answering("y"))).rejects.toThrow(
			"uncommitted changes: releases go out from a clean tree",
		);
		expect(asked).toEqual([]);
		expect(workspace.stamped).toEqual([]);
		expect(git.commits).toEqual([]);
	});

	it("refuses to release from anywhere but the default branch", async () => {
		git.current = "task/ship";

		await expect(release.release(answering("y"))).rejects.toThrow(
			'on "task/ship": releases go out from "main"',
		);
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
	});

	it("refuses a package the workspace has nothing public by the name of", async () => {
		const roaming = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
			releases.custom("@scope/gone", registry),
			releases.git({ git }),
		);

		await expect(roaming.release(answering("y"))).rejects.toThrow(
			'"@scope/gone" is declared but the workspace has no public package by that name',
		);
	});

	it("refuses a public package nobody declared", async () => {
		const partial = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.git({ git }),
		);

		await expect(partial.release(answering("y"))).rejects.toThrow(
			'"@scope/two" is public but not declared: declare it or mark it private',
		);
	});

	it("says every way the declaration drifted at once", async () => {
		const drifted = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/gone", registry),
			releases.git({ git }),
		);

		await expect(drifted.release(answering("y"))).rejects.toThrow(
			/"@scope\/gone" is declared[\s\S]*"@scope\/two" is public/,
		);
	});

	it("refuses a declaration with nothing to publish", async () => {
		await expect(releases.git({ git }).release(answering("y"))).rejects.toThrow(
			"there is nothing to publish",
		);
	});
});
