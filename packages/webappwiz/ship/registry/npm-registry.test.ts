import { beforeEach, describe, expect, it } from "bun:test";
import { FakePs } from "webappwiz/system/testing";
import { FakeGit } from "../git/fake-git";
import { FakeWorkflows } from "../github/fake-workflows";
import { GithubActions } from "./github-actions";
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

	// Trusted publishing, from a CI job npm trusts
	const trusted = () => new NpmRegistry({ ps }).trusted();

	it("trusted: publishes plainly: no version check, no login, no stage", async () => {
		const registry = trusted();
		const got = await registry.publish("/repo/packages/one");

		expect(registry.staged).toBe(false);
		expect(got).toEqual({});
		expect(ps.getCalls()).toEqual([
			"npm publish --access public --loglevel verbose",
		]);
	});

	it("trusted: takes npm's 409 for a version it already has", async () => {
		ps.setCaptureOutput("", "npm error code E409\n");
		ps.exit(1);

		expect(await trusted().publish("/repo/packages/one")).toEqual({
			already: true,
		});
	});

	it("trusted: names a failed OIDC exchange rather than the bare 404", async () => {
		ps.setCaptureOutput(
			"",
			"npm verbose oidc Failed token exchange request with body message: OIDC token exchange error - package not found\nnpm error code E404\n",
		);
		ps.exit(1);

		await expect(trusted().publish("/repo/packages/one")).rejects.toThrow(
			"no trusted publisher entry",
		);
	});
});

describe("npm registry via github actions", () => {
	it("starts the run instead of publishing, and watches it", async () => {
		const ps = new FakePs();
		const workflows = new FakeWorkflows();
		const git = new FakeGit();
		const registry = new NpmRegistry({
			ps,
			via: new GithubActions({ git, workflows }),
		});

		expect(registry.staged).toBe(false);
		expect(registry.publishDeadline?.ms).toBeGreaterThan(5 * 60 * 1000);
		expect(await registry.publish("/repo/one")).toEqual({});
		expect(ps.getCalls()).toEqual([]);
		expect(workflows.dispatches).toHaveLength(1);
		expect(await registry.watch?.("@s/one", "1.2.4")).toMatchObject({
			passed: false,
			status: "waiting",
		});
	});

	it("is trusted without the run it started", () => {
		const registry = new NpmRegistry({
			via: new GithubActions({
				git: new FakeGit(),
				workflows: new FakeWorkflows(),
			}),
		});

		expect(registry.trusted().staged).toBe(false);
		expect((registry.trusted() as NpmRegistry).watch).toBeUndefined();
	});
});
