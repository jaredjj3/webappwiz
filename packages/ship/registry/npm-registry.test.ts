import { beforeEach, describe, expect, it } from "bun:test";
import { FakePs } from "@webappwiz/system/testing";
import { NpmRegistry } from "./npm-registry";

describe("npm registry", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	/** Fails every `npm whoami`, so nobody is logged in. */
	const loggedOut = () =>
		ps.simulate(async () => (ps.getCalls().at(-1) === "npm whoami" ? 1 : 0));

	it("publishes without a word when npm already has somebody", async () => {
		await new NpmRegistry({ ps }).publish("/repo/packages/one");

		expect(ps.getCalls()).toEqual([
			"npm whoami",
			"bun publish --access public",
		]);
	});

	it("logs in when npm has nobody, then publishes", async () => {
		loggedOut();

		await new NpmRegistry({ ps }).publish("/repo/packages/one");

		expect(ps.getCalls()).toEqual([
			"npm whoami",
			"npm login",
			"bun publish --access public",
		]);
	});

	it("asks once, however many packages go out", async () => {
		loggedOut();
		const registry = new NpmRegistry({ ps });

		await registry.publish("/repo/packages/one");
		await registry.publish("/repo/packages/two");

		expect(ps.getCalls().filter((call) => call === "npm login")).toHaveLength(
			1,
		);
	});

	it("says what to set instead of waiting on a human CI has not got", async () => {
		loggedOut();
		ps.setEnv({ CI: "true" });

		await expect(
			new NpmRegistry({ ps }).publish("/repo/packages/one"),
		).rejects.toThrow("not logged in to npm: set NPM_TOKEN");
		expect(ps.getCalls()).toEqual(["npm whoami"]);
	});
});
