import { beforeEach, describe, expect, it } from "bun:test";
import { FakePs } from "webappwiz/system/testing";
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
			"npm publish --access public",
		]);
	});

	it("logs in when npm has nobody, then publishes", async () => {
		loggedOut();

		await new NpmRegistry({ ps }).publish("/repo/packages/one");

		expect(ps.getCalls()).toEqual([
			"npm whoami",
			"npm login --auth-type=web",
			"npm publish --access public",
		]);
	});

	it("asks once, however many packages go out", async () => {
		loggedOut();
		const registry = new NpmRegistry({ ps });

		await registry.publish("/repo/packages/one");
		await registry.publish("/repo/packages/two");

		expect(
			ps.getCalls().filter((call) => call === "npm login --auth-type=web"),
		).toHaveLength(1);
	});

	it("says what to set instead of waiting on a human CI has not got", async () => {
		loggedOut();
		ps.setEnv({ CI: "true" });

		await expect(
			new NpmRegistry({ ps }).publish("/repo/packages/one"),
		).rejects.toThrow("not logged in to npm: set NPM_TOKEN");
		expect(ps.getCalls()).toEqual(["npm whoami"]);
	});

	it("reads the version installs get from the latest dist-tag", async () => {
		ps.setCaptureOutput("1.2.3\n", "");

		expect(await new NpmRegistry({ ps }).deployed("@scope/one")).toBe("1.2.3");
		expect(ps.getCalls()).toEqual(["npm view @scope/one dist-tags.latest"]);
	});

	it("reads nothing out yet for a name npm has never seen", async () => {
		ps.simulate(async () => 1);
		ps.setCaptureOutput("", "npm error code E404\n");

		expect(
			await new NpmRegistry({ ps }).deployed("@scope/new"),
		).toBeUndefined();
	});

	it("throws a read npm could not make, rather than guess", async () => {
		ps.simulate(async () => 1);
		ps.setCaptureOutput("", "npm error code ENOTFOUND\n");

		await expect(
			new NpmRegistry({ ps }).deployed("@scope/one"),
		).rejects.toThrow("npm view @scope/one: npm error code ENOTFOUND");
	});
});
