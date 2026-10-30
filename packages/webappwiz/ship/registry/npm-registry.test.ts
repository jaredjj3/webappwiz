import { beforeEach, describe, expect, it } from "bun:test";
import { FakePs } from "webappwiz/system/testing";
import { NpmRegistry } from "./npm-registry";

describe("npm registry", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
		ps.setCaptureOutput("+ @scope/one@1.2.4 (staged with id st-123)\n", "");
	});

	/** Fails every `npm whoami`, so nobody is logged in. */
	const loggedOut = () =>
		ps.simulate(async () => (ps.getCalls().at(-1) === "npm whoami" ? 1 : 0));

	it("stages without a word when npm already has somebody", async () => {
		await new NpmRegistry({ ps }).publish("/repo/packages/one");

		expect(ps.getCalls()).toEqual([
			"npm --version",
			"npm whoami",
			"npm stage publish --access public",
		]);
	});

	it("refuses to stage with an npm older than 11.15", async () => {
		ps.setCaptureOutput("10.9.4\n", "");

		await expect(
			new NpmRegistry({ ps }).publish("/repo/packages/one"),
		).rejects.toThrow("npm 11.15 or newer is required");
		expect(ps.getCalls()).toEqual(["npm --version"]);
	});

	it("reports the stage id and the page to approve on", async () => {
		const staged = await new NpmRegistry({ ps }).publish("/repo/packages/one");

		expect(staged).toEqual({
			staged: {
				stageId: "st-123",
				url: "https://www.npmjs.com/package/@scope/one",
			},
		});
	});

	it("takes npm's 409 for a version it already has, still scanning or not", async () => {
		ps.simulate(async () =>
			ps.getCalls().at(-1) === "npm stage publish --access public" ? 1 : 0,
		);
		ps.setCaptureOutput(
			"11.15.0\n",
			"npm error code E409\nnpm error 409 Conflict - Cannot stage previously published version\n",
		);

		expect(await new NpmRegistry({ ps }).publish("/repo/packages/one")).toEqual(
			{ already: true },
		);
	});

	it("still fails a stage npm refuses for any other reason", async () => {
		ps.simulate(async () =>
			ps.getCalls().at(-1) === "npm stage publish --access public" ? 1 : 0,
		);
		ps.setCaptureOutput("11.15.0\n", "npm error code E403\n");

		await expect(
			new NpmRegistry({ ps }).publish("/repo/packages/one"),
		).rejects.toThrow("stage publish failed in /repo/packages/one");
	});

	it("waits on the scan and links each version's page", () => {
		const registry = new NpmRegistry({ ps });

		expect(registry.scans).toBe(true);
		expect(registry.page("@scope/one", "1.2.4")).toBe(
			"https://www.npmjs.com/package/@scope/one/v/1.2.4",
		);
	});

	it("fails when npm stages without printing an id", async () => {
		ps.setCaptureOutput("", "");

		await expect(
			new NpmRegistry({ ps }).publish("/repo/packages/one"),
		).rejects.toThrow("printed no stage id");
	});

	it("logs in when npm has nobody, then stages", async () => {
		loggedOut();

		await new NpmRegistry({ ps }).publish("/repo/packages/one");

		expect(ps.getCalls()).toEqual([
			"npm --version",
			"npm whoami",
			"npm login --auth-type=web",
			"npm stage publish --access public",
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
		expect(ps.getCalls()).toEqual(["npm --version", "npm whoami"]);
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
