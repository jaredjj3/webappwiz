import { beforeEach, describe, expect, it } from "bun:test";
import type { Ship } from "./ship";
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
		expect(plan.problems).toEqual([
			{
				kind: "npm-auth",
				message: "not logged in to npm",
				remedy: ["npm", "login"],
			},
			{
				kind: "gh-auth",
				message: "not logged in to GitHub",
				remedy: ["gh", "auth", "login"],
			},
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
