import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/system/testing";
import { FakeGit } from "./git/fake-git";
import { FakeGithub } from "./github/fake-github";
import { FakeRegistry } from "./registry/fake-registry";
import { Runner } from "./runner";
import { GithubShip } from "./ship/github-ship";
import type { Ship } from "./ship/ship";
import { ships } from "./ships";
import { FakeWorkspace } from "./workspace/fake-workspace";

describe("runner", () => {
	let workspace: FakeWorkspace;
	let git: FakeGit;
	let registry: FakeRegistry;
	let github: FakeGithub;
	let log: MemoryLogger;
	let ps: FakePs;
	/** Both public packages onto one registry, with the GitHub notes last. */
	let ship: Ship;

	beforeEach(() => {
		workspace = new FakeWorkspace();
		git = new FakeGit();
		registry = new FakeRegistry();
		github = new FakeGithub();
		log = new MemoryLogger();
		ps = new FakePs();
		asked.length = 0;
		ship = ships.lockstep(
			ships.custom("@scope/one", registry),
			ships.custom("@scope/two", registry),
			new GithubShip(github),
		);
	});

	const asked: string[] = [];

	const answering = (answer: string | null) =>
		new Runner({
			workspace,
			git,
			log,
			ps,
			prompt: (message) => {
				asked.push(message);
				return answer;
			},
		});

	/** Everything the runner said, colour codes and all. */
	const said = () =>
		log.entries.map((entry) => String(entry.message)).join("\n");

	it("stamps, commits, publishes, tags, pushes and writes the notes", async () => {
		await answering(" Y ").ship(ship, "patch");

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
		await answering("y").ship(ship, "minor");

		expect(workspace.stamped).toEqual(["1.3.0"]);
	});

	it("publishes before it tags, so no tag names a version the registry lacks", async () => {
		const order: string[] = [];
		registry.publish = async (dir: string) => {
			order.push(`publish ${dir}`);
		};
		git.tag = async (tag: string) => {
			order.push(`tag ${tag}`);
		};

		await answering("y").ship(ship, "patch");

		expect(order).toEqual([
			"publish /repo/packages/one",
			"publish /repo/packages/two",
			"tag v1.2.4",
		]);
	});

	it("tags a release nothing asked a tag for", async () => {
		const quiet = ships.lockstep(
			ships.custom("@scope/one", registry),
			ships.custom("@scope/two", registry),
		);

		await answering("y").ship(quiet, "patch");

		expect(git.pushes).toEqual(["main", "v1.2.4"]);
		expect(github.releases).toEqual([]);
	});

	it("skips a package the registry already has", async () => {
		registry.has.add("@scope/one@1.2.4");

		await answering("y").ship(ship, "patch");

		expect(registry.publishes).toEqual(["/repo/packages/two"]);
	});

	it("asks before anything moves, and stops on any other answer", async () => {
		await answering("n").ship(ship, "patch");

		expect(asked.join()).toContain("publish 2 packages as 1.2.4?");
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
		expect(git.commits).toEqual([]);
	});

	it("finishes a release that died before its tag, rather than bumping past it", async () => {
		git.subject = "Release 1.2.3";
		registry.has.add("@scope/one@1.2.3");

		await answering("y").ship(ship, "patch");

		expect(said()).toContain("finishing the release of 1.2.3");
		expect(registry.publishes).toEqual(["/repo/packages/two"]);
		expect([...git.tags]).toEqual(["v1.2.3"]);
	});

	it("treats a tagged release as finished and bumps", async () => {
		git.subject = "Release 1.2.3";
		git.tags.add("v1.2.3");

		await answering("y").ship(ship, "patch");

		expect(workspace.stamped).toEqual(["1.2.4"]);
	});

	it("says uncommitted changes go into the release commit, rather than refusing", async () => {
		git.dirty = true;

		await answering("y").ship(ship, "patch");

		expect(said()).toContain("uncommitted changes");
		expect(git.commits).toEqual(["Release 1.2.4"]);
	});

	it("refuses to release from anywhere but the default branch", async () => {
		git.current = "task/ship";

		await expect(answering("y").ship(ship, "patch")).rejects.toThrow(
			'on "task/ship": releases go out from "main"',
		);
		expect(workspace.stamped).toEqual([]);
		expect(registry.publishes).toEqual([]);
	});

	it("refuses a package the workspace has nothing public by the name of", async () => {
		const roaming = ships.lockstep(
			ships.custom("@scope/one", registry),
			ships.custom("@scope/two", registry),
			ships.custom("@scope/gone", registry),
		);

		await expect(answering("y").ship(roaming, "patch")).rejects.toThrow(
			'"@scope/gone" is declared but the workspace has no public package by that name',
		);
	});

	it("refuses a public package nobody declared", async () => {
		const partial = ships.lockstep(ships.custom("@scope/one", registry));

		await expect(answering("y").ship(partial, "patch")).rejects.toThrow(
			'"@scope/two" is public but not declared: declare it or mark it private',
		);
	});

	it("says every way the declaration drifted at once", async () => {
		const drifted = ships.lockstep(
			ships.custom("@scope/one", registry),
			ships.custom("@scope/gone", registry),
		);

		await expect(answering("y").ship(drifted, "patch")).rejects.toThrow(
			/"@scope\/gone" is declared[\s\S]*"@scope\/two" is public/,
		);
	});

	it("refuses a declaration with nothing to publish", async () => {
		await expect(
			answering("y").ship(new GithubShip(github), "patch"),
		).rejects.toThrow("there is nothing to publish");
	});
});
