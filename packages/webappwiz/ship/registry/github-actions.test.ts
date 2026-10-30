import { beforeEach, describe, expect, it } from "bun:test";
import { FakeGit } from "../git/fake-git";
import { FakeWorkflows } from "../github/fake-workflows";
import type { WorkflowRun } from "../github/workflows";
import { GithubActions } from "./github-actions";

const run = (over: Partial<WorkflowRun> = {}): WorkflowRun => ({
	id: "7",
	url: "https://github.com/o/r/actions/runs/7",
	status: "in_progress",
	attempt: 1,
	...over,
});

describe("github actions", () => {
	let git: FakeGit;
	let workflows: FakeWorkflows;
	let actions: GithubActions;

	beforeEach(() => {
		git = new FakeGit();
		workflows = new FakeWorkflows();
		actions = new GithubActions({ git, workflows });
	});

	it("pushes the release commit and dispatches the workflow on it", async () => {
		await actions.start();

		expect(git.pushes).toEqual(["main"]);
		expect(workflows.dispatches).toEqual([
			{
				file: "webappwiz-publish.yml",
				branch: "main",
				inputs: { ref: "abc123" },
			},
		]);
	});

	it("leaves a run that is going or done alone", async () => {
		workflows.runList = [run({ status: "completed", conclusion: "success" })];

		await actions.start();

		expect(workflows.dispatches).toEqual([]);
		expect(workflows.reruns).toEqual([]);
	});

	it("reruns only the failed jobs of a failed run", async () => {
		workflows.runList = [run({ status: "completed", conclusion: "failure" })];

		await actions.start();

		expect(workflows.reruns).toEqual([{ id: "7", failedOnly: true }]);
		expect(workflows.dispatches).toEqual([]);
	});

	it("reruns every job of a cancelled run", async () => {
		workflows.runList = [run({ status: "completed", conclusion: "cancelled" })];

		await actions.start();

		expect(workflows.reruns).toEqual([{ id: "7", failedOnly: false }]);
	});

	it("reports the run's status and page while it goes", async () => {
		workflows.runList = [run({ status: "queued" })];

		expect(await actions.watch("@s/one", false)).toEqual({
			passed: false,
			status: "queued",
			url: "https://github.com/o/r/actions/runs/7",
		});
	});

	it("waits for a run to show up, unless the package is live without one", async () => {
		expect(await actions.watch("@s/one", false)).toEqual({
			passed: false,
			status: "waiting",
		});
		expect(await actions.watch("@s/one", true)).toEqual({ passed: true });
	});

	it("passes once the run succeeded", async () => {
		workflows.runList = [run({ status: "completed", conclusion: "success" })];

		expect((await actions.watch("@s/one", false)).passed).toBe(true);
	});

	it("fails with the end of the log when the run failed", async () => {
		workflows.runList = [run({ status: "completed", conclusion: "failure" })];
		workflows.log = "step\nboom";

		await expect(actions.watch("@s/one", false)).rejects.toThrow(
			/the publish run failure: .*\nstep\nboom/,
		);
	});

	it("says how to set up the trusted publisher when npm refused the exchange", async () => {
		workflows.runList = [run({ status: "completed", conclusion: "failure" })];
		workflows.log = "npm refused the OIDC token exchange for /x";

		await expect(actions.watch("@s/one", false)).rejects.toThrow(
			/repository: {2}owner\/repo\n {2}workflow: {4}webappwiz-publish\.yml/,
		);
	});

	it("does not take the failed attempt it reran for the new one", async () => {
		workflows.runList = [run({ status: "completed", conclusion: "failure" })];
		await actions.start();

		expect(await actions.watch("@s/one", false)).toMatchObject({
			passed: false,
			status: "queued",
		});

		workflows.runList = [
			run({ status: "completed", conclusion: "success", attempt: 2 }),
		];
		expect((await actions.watch("@s/one", false)).passed).toBe(true);
	});
});
