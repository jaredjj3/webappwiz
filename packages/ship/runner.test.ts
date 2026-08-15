import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/system/testing";
import { Runner } from "./runner";
import { FakeShip, fakePlan } from "./ship/fake-ship";

describe("runner", () => {
	const NPM_AUTH = {
		kind: "npm-auth",
		message: "not logged in to npm",
		remedy: ["npm", "login"],
	};

	let log: MemoryLogger;
	let ps: FakePs;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
	});

	const answering = (answer: string | null) =>
		new Runner({ log, ps, prompt: () => answer });

	it("runs the command a problem carries, then plans again", async () => {
		const release = new FakeShip(fakePlan([NPM_AUTH]), fakePlan([NPM_AUTH]));

		await expect(answering("y").ship(release, "patch")).rejects.toThrow(
			"not ready to release",
		);
		expect(ps.getCalls()).toEqual(["npm login"]);
		expect(release.plans).toBe(2);
		expect(release.runs).toEqual([]);
	});

	it("runs nothing for a problem that carries no command", async () => {
		const dirty = { kind: "dirty", message: "uncommitted changes" };
		const release = new FakeShip(fakePlan([dirty]));

		await expect(answering("y").ship(release, "patch")).rejects.toThrow(
			"not ready to release",
		);
		expect(ps.getCalls()).toEqual([]);
		expect(release.plans).toBe(1);
	});

	it("ships once the person says yes", async () => {
		const release = new FakeShip(fakePlan());

		await answering(" Y ").ship(release, "patch");

		expect(release.runs).toEqual([fakePlan()]);
	});

	it("aborts without running on any other answer", async () => {
		const release = new FakeShip(fakePlan());

		await answering("n").ship(release, "patch");

		expect(release.runs).toEqual([]);
	});
});
