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
		await ship(release, "patch", answering(" Y "));

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

	it("moves the version as far as the bump says", async () => {
		await ship(release, "minor", answering("y"));

		expect(workspace.stamped).toEqual(["1.3.0"]);
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

		await ship(release, "patch", answering("y"));

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

	it("refuses a release nothing tagged", async () => {
		const untagged = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/two", registry),
		);

		await expect(ship(untagged, "patch", answering("y"))).rejects.toThrow(
			"nothing tagged v1.2.4: declare releases.git()",
		);
	});

	it("skips a package the registry already has", async () => {
		registry.has.add("@scope/one@1.2.4");

		await ship(release, "patch", answering("y"));

		expect(registry.publishes).toEqual(["/repo/packages/two"]);
	});

	it("asks before anything moves, and stops on any other answer", async () => {
		await ship(release, "patch", answering("n"));

		expect(asked.join()).toContain("publish 2 packages as 1.2.4?");
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
		expect(git.commits).toEqual([]);
	});

	it("finishes a release that died before its tag, rather than bumping past it", async () => {
		git.subject = "Release 1.2.3";
		registry.has.add("@scope/one@1.2.3");

		await ship(release, "patch", answering("y"));

		expect(said()).toContain("finishing the release of 1.2.3");
		expect(registry.publishes).toEqual(["/repo/packages/two"]);
		expect([...git.tags]).toEqual(["v1.2.3"]);
	});

	it("treats a tagged release as finished and bumps", async () => {
		git.subject = "Release 1.2.3";
		git.tags.add("v1.2.3");

		await ship(release, "patch", answering("y"));

		expect(workspace.stamped).toEqual(["1.2.4"]);
	});

	it("says uncommitted changes go into the release commit, rather than refusing", async () => {
		git.dirty = true;

		await ship(release, "patch", answering("y"));

		expect(said()).toContain("uncommitted changes");
		expect(git.commits).toEqual(["Release 1.2.4"]);
	});

	it("refuses to release from anywhere but the default branch", async () => {
		git.current = "task/ship";

		await expect(ship(release, "patch", answering("y"))).rejects.toThrow(
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

		await expect(ship(roaming, "patch", answering("y"))).rejects.toThrow(
			'"@scope/gone" is declared but the workspace has no public package by that name',
		);
	});

	it("refuses a public package nobody declared", async () => {
		const partial = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.git({ git }),
		);

		await expect(ship(partial, "patch", answering("y"))).rejects.toThrow(
			'"@scope/two" is public but not declared: declare it or mark it private',
		);
	});

	it("says every way the declaration drifted at once", async () => {
		const drifted = releases.lockstep(
			releases.custom("@scope/one", registry),
			releases.custom("@scope/gone", registry),
			releases.git({ git }),
		);

		await expect(ship(drifted, "patch", answering("y"))).rejects.toThrow(
			/"@scope\/gone" is declared[\s\S]*"@scope\/two" is public/,
		);
	});

	it("refuses a declaration with nothing to publish", async () => {
		await expect(
			ship(new GithubRelease(github), "patch", answering("y")),
		).rejects.toThrow("there is nothing to publish");
	});
});
