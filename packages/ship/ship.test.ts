import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/system/testing";
import { FakeGit } from "./git/fake-git";
import { FakeGithub } from "./github/fake-github";
import { FakeRegistry } from "./registry/fake-registry";
import { GithubRelease } from "./release/github-release";
import type { Release } from "./release/release";
import { releases } from "./releases";
import type { ShipOptions } from "./ship";
import { ship } from "./ship";
import { FakeWorkspace } from "./workspace/fake-workspace";

describe("ship", () => {
	let workspace: FakeWorkspace;
	let git: FakeGit;
	let registry: FakeRegistry;
	let github: FakeGithub;
	let log: MemoryLogger;
	let ps: FakePs;
	let asked: string[];
	/** Both public packages onto one registry, tagged, with the notes last. */
	let release: Release;

	beforeEach(() => {
		workspace = new FakeWorkspace();
		git = new FakeGit();
		registry = new FakeRegistry();
		github = new FakeGithub();
		log = new MemoryLogger();
		ps = new FakePs();
		asked = [];
		release = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
			releases.git({ git }),
			new GithubRelease(github),
		);
	});

	const answering = (answer: string | null): ShipOptions => ({
		workspace,
		git,
		log,
		ps,
		prompt: (message) => {
			asked.push(message);
			return answer;
		},
	});

	/** Everything the release said, colour codes and all. */
	const said = () =>
		log.entries.map((entry) => String(entry.message)).join("\n");

	it("stamps, commits, publishes, tags, pushes and writes the notes", async () => {
		await ship.patch(release, answering(" Y "));

		expect(workspace.stamped).toEqual(["1.2.4"]);
		expect(git.commits).toEqual(["Release 1.2.4"]);
		expect(registry.publishes).toEqual([
			"/repo/packages/one",
			"/repo/packages/two",
		]);
		expect([...git.tags]).toEqual(["v1.2.4"]);
		expect(git.pushes).toEqual(["main", "v1.2.4"]);
		expect(github.releases).toEqual(["v1.2.4"]);
	});

	it("moves the version as far as the verb says", async () => {
		await ship.minor(release, answering("y"));

		expect(workspace.stamped).toEqual(["1.3.0"]);
	});

	it("takes the whole major version", async () => {
		await ship.major(release, answering("y"));

		expect(workspace.stamped).toEqual(["2.0.0"]);
	});

	it("publishes before it tags, so no tag names a version the registry lacks", async () => {
		const order: string[] = [];
		registry.publish = async (dir: string) => {
			order.push(`publish ${dir}`);
		};
		git.tag = async (tag: string) => {
			order.push(`tag ${tag}`);
			git.tags.add(tag);
		};

		await ship.patch(release, answering("y"));

		expect(order).toEqual([
			"publish /repo/packages/one",
			"publish /repo/packages/two",
			"tag v1.2.4",
		]);
	});

	it("refuses a declaration that would tag before it publishes", () => {
		expect(() =>
			releases.lockstep(
				releases.git({ git }),
				releases.custom("@scope/one", registry),
			),
		).toThrow("releases.git() is declared before a package it would tag");
	});

	it("skips a package the registry already has", async () => {
		registry.has.add("@scope/one@1.2.4");

		await ship.patch(release, answering("y"));

		expect(registry.publishes).toEqual(["/repo/packages/two"]);
	});

	it("asks before anything moves, and stops on any other answer", async () => {
		await ship.patch(release, answering("n"));

		expect(asked.join()).toContain("publish 2 packages as 1.2.4?");
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
		expect(git.commits).toEqual([]);
	});

	it("resumes at the version already stamped, rather than moving past it", async () => {
		registry.has.add("@scope/one@1.2.3");

		await ship.resume(release, answering("y"));

		expect(said()).toContain("finishing the release of 1.2.3");
		expect(workspace.stamped).toEqual(["1.2.3"]);
		expect(registry.publishes).toEqual(["/repo/packages/two"]);
		expect([...git.tags]).toEqual(["v1.2.3"]);
	});

	it("resumes a release that died after its tag, which now decides nothing", async () => {
		registry.has.add("@scope/one@1.2.3");
		registry.has.add("@scope/two@1.2.3");
		git.tags.add("v1.2.3");
		github.error = new Error("not logged in to GitHub");

		await expect(ship.resume(release, answering("y"))).rejects.toThrow(
			"not logged in to GitHub",
		);

		// The notes are all that is left, so they are all a second resume does.
		github.error = undefined;
		await ship.resume(release, answering("y"));

		expect(registry.publishes).toEqual([]);
		expect(github.releases).toEqual(["v1.2.3"]);
		expect(said()).toContain("shipped 1.2.3");
	});

	it("says uncommitted changes go into the release commit, rather than refusing", async () => {
		git.dirty = true;

		await ship.patch(release, answering("y"));

		expect(said()).toContain("uncommitted changes");
		expect(git.commits).toEqual(["Release 1.2.4"]);
	});

	it("refuses to release from anywhere but the default branch", async () => {
		git.current = "task/ship";

		await expect(ship.patch(release, answering("y"))).rejects.toThrow(
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

		await expect(ship.patch(roaming, answering("y"))).rejects.toThrow(
			'"@scope/gone" is declared but the workspace has no public package by that name',
		);
	});

	it("refuses a public package nobody declared", async () => {
		const partial = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.git({ git }),
		);

		await expect(ship.patch(partial, answering("y"))).rejects.toThrow(
			'"@scope/two" is public but not declared: declare it or mark it private',
		);
	});

	it("says every way the declaration drifted at once", async () => {
		const drifted = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/gone", registry),
			releases.git({ git }),
		);

		await expect(ship.patch(drifted, answering("y"))).rejects.toThrow(
			/"@scope\/gone" is declared[\s\S]*"@scope\/two" is public/,
		);
	});

	it("refuses a declaration with nothing to publish", async () => {
		await expect(
			ship.patch(new GithubRelease(github), answering("y")),
		).rejects.toThrow("there is nothing to publish");
	});
});
