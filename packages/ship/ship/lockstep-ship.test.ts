import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { GITHUB_AUTH } from "../github/fake-github";
import { FakeRegistry, REGISTRY_AUTH } from "../registry/fake-registry";
import { LockstepShip } from "./lockstep-ship";
import type { Ship, Target } from "./ship";
import { ShipHarness } from "./ship-harness";

describe("ship", () => {
	let workspace: ShipHarness["workspace"];
	let git: ShipHarness["git"];
	let registry: ShipHarness["registry"];
	let github: ShipHarness["github"];
	let ship: Ship;

	beforeEach(() => {
		({ workspace, git, registry, github, ship } = new ShipHarness());
	});

	/** The harness's ship with its targets redeclared. */
	const declaring = (...targets: Target[]) =>
		new LockstepShip(targets, {
			workspace,
			git,
			github,
			log: new MemoryLogger(),
		});

	it("plans the whole workspace onto the next version", async () => {
		const plan = await ship.plan("minor");
		expect(plan.current).toBe("1.2.3");
		expect(plan.next).toBe("1.3.0");
		expect(plan.resuming).toBe(false);
		expect(plan.problems).toEqual([]);
	});

	it("plans every package, private ones included", async () => {
		const plan = await ship.plan("patch");
		expect(plan.packages.map((pkg) => pkg.name)).toEqual([
			"@scope/one",
			"@scope/two",
			"@scope/hid",
		]);
	});

	it("reports a dirty tree and the wrong branch without a remedy", async () => {
		git.dirty = true;
		git.current = "task/ship";
		const plan = await ship.plan("patch");
		expect(plan.problems).toEqual([
			{
				kind: "dirty",
				message: "the tree has uncommitted changes: commit them first",
			},
			{
				kind: "branch",
				message: 'on "task/ship": releases go out from "main"',
			},
		]);
	});

	it("hands a login problem the command that clears it", async () => {
		registry.loggedIn = false;
		github.loggedIn = false;
		const plan = await ship.plan("patch");
		expect(plan.problems).toEqual([REGISTRY_AUTH, GITHUB_AUTH]);
	});

	it("says a shared registry's problem once, not once per target", async () => {
		registry.loggedIn = false;
		const plan = await ship.plan("patch");
		expect(plan.problems).toEqual([REGISTRY_AUTH]);
	});

	it("reports a target the workspace has no public package for", async () => {
		const roaming = declaring(
			{ name: "@scope/one", registry },
			{ name: "@scope/two", registry },
			{ name: "@scope/gone", registry },
		);
		const plan = await roaming.plan("patch");
		expect(plan.problems).toEqual([
			{
				kind: "unknown",
				message:
					'"@scope/gone" is declared but the workspace has no public package by that name',
			},
		]);
	});

	it("reports a public package nobody declared", async () => {
		const partial = declaring({ name: "@scope/one", registry });
		const plan = await partial.plan("patch");
		expect(plan.problems).toEqual([
			{
				kind: "undeclared",
				message:
					'"@scope/two" is public but not declared: declare it or mark it private',
			},
		]);
	});

	it("reports an empty declaration", async () => {
		const empty = declaring();
		const plan = await empty.plan("patch");
		expect(plan.problems.map((problem) => problem.kind)).toEqual([
			"empty",
			"undeclared",
			"undeclared",
		]);
	});

	it("finishes a release that died before its tag, rather than bumping past it", async () => {
		git.subject = "Release 1.2.3";
		registry.has.add("@scope/one@1.2.3");
		const plan = await ship.plan("patch");
		expect(plan.resuming).toBe(true);
		expect(plan.next).toBe("1.2.3");
		expect(plan.packages.map((pkg) => pkg.published)).toEqual([
			true,
			false,
			false,
		]);
	});

	it("treats a tagged release as finished and bumps", async () => {
		git.subject = "Release 1.2.3";
		git.tags.add("v1.2.3");
		const plan = await ship.plan("patch");
		expect(plan.resuming).toBe(false);
		expect(plan.next).toBe("1.2.4");
	});

	it("stamps, commits, publishes, tags, pushes and writes the release", async () => {
		await ship.run(await ship.plan("patch"));
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

	it("publishes each target through its own registry", async () => {
		const other = new FakeRegistry();
		const split = declaring(
			{ name: "@scope/one", registry },
			{ name: "@scope/two", registry: other },
		);
		await split.run(await split.plan("patch"));
		expect(registry.publishes).toEqual(["/repo/packages/one"]);
		expect(other.publishes).toEqual(["/repo/packages/two"]);
	});

	it("has no GitHub step, or GitHub problems, unless one is declared", async () => {
		github.loggedIn = false;
		const quiet = new LockstepShip(
			[
				{ name: "@scope/one", registry },
				{ name: "@scope/two", registry },
			],
			{ workspace, git, log: new MemoryLogger() },
		);
		const plan = await quiet.plan("patch");
		expect(plan.problems).toEqual([]);
		await quiet.run(plan);
		expect(git.pushes).toEqual(["main", "v1.2.4"]);
		expect(github.releases).toEqual([]);
	});

	it("publishes before it tags, so no tag names a version the registry lacks", async () => {
		const order: string[] = [];
		registry.publish = async (dir: string) => {
			order.push(`publish ${dir}`);
		};
		git.tag = async (tag: string) => {
			order.push(`tag ${tag}`);
		};
		await ship.run(await ship.plan("patch"));
		expect(order).toEqual([
			"publish /repo/packages/one",
			"publish /repo/packages/two",
			"tag v1.2.4",
		]);
	});

	it("skips a package the registry already has", async () => {
		const plan = await ship.plan("patch");
		registry.has.add("@scope/one@1.2.4");
		await ship.run(plan);
		expect(registry.publishes).toEqual(["/repo/packages/two"]);
	});

	it("refuses a plan whose problems came back", async () => {
		const plan = await ship.plan("patch");
		git.dirty = true;
		await expect(ship.run(plan)).rejects.toThrow(
			"not ready to release: the tree has uncommitted changes",
		);
		expect(registry.publishes).toEqual([]);
	});

	it("refuses a plan the workspace has moved past", async () => {
		const plan = await ship.plan("patch");
		await workspace.setVersion("2.0.0");
		await expect(ship.run(plan)).rejects.toThrow(
			"plan is stale: it releases 1.2.4, the workspace is now at 2.0.1",
		);
	});
});
