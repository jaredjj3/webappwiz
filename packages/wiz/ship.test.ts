import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeShip, fakePlan } from "@webappwiz/ship";
import { FakePs } from "@webappwiz/sys/testing";
import { FakeFix } from "./fix/fake-fix";
import { ship } from "./ship";

describe("ship", () => {
	const NPM_AUTH = {
		kind: "npm-auth" as const,
		message: "not logged in to npm",
		remedy: ["npm", "login"],
	};

	let log: MemoryLogger;
	let ps: FakePs;
	let fix: FakeFix;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		fix = new FakeFix();
	});

	it("refuses a bump nobody has heard of", async () => {
		const release = new FakeShip(fakePlan());

		await expect(
			ship(release, fix, { ...{ bump: "sideways" }, log, ps }),
		).rejects.toThrow('unknown version bump "sideways"');
		expect(release.plans).toBe(0);
	});

	it("runs the command a problem carries, then plans again", async () => {
		const release = new FakeShip(fakePlan([NPM_AUTH]), fakePlan([NPM_AUTH]));

		await expect(
			ship(release, fix, { ...{ bump: "patch" }, log, ps }),
		).rejects.toThrow("not ready to release");
		expect(ps.getCalls()).toEqual(["npm login"]);
		expect(release.plans).toBe(2);
		expect(release.runs).toEqual([]);
	});

	it("runs nothing for a problem that carries no command", async () => {
		const dirty = { kind: "dirty" as const, message: "uncommitted changes" };
		const release = new FakeShip(fakePlan([dirty]));

		await expect(
			ship(release, fix, { ...{ bump: "patch" }, log, ps }),
		).rejects.toThrow("not ready to release");
		expect(ps.getCalls()).toEqual([]);
		expect(release.plans).toBe(1);
	});
});
