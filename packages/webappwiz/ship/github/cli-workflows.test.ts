import { beforeEach, describe, expect, it } from "bun:test";
import { FakePs } from "webappwiz/system/testing";
import { CliWorkflows } from "./cli-workflows";

describe("cli workflows", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	it("dispatches the file on a branch with its inputs", async () => {
		await new CliWorkflows({ ps }).dispatch("p.yml", "main", { ref: "abc" });

		expect(ps.getCalls()).toEqual([
			"gh auth status",
			"gh workflow run p.yml --ref main --field ref=abc",
		]);
	});

	it("reads the runs of a commit", async () => {
		ps.setCaptureOutput(
			JSON.stringify([
				{
					databaseId: 9,
					url: "u",
					status: "completed",
					conclusion: "failure",
					attempt: 2,
				},
				{
					databaseId: 8,
					url: "v",
					status: "queued",
					conclusion: "",
					attempt: 1,
				},
			]),
			"",
		);

		expect(await new CliWorkflows({ ps }).runs("p.yml", "abc")).toEqual([
			{
				id: "9",
				url: "u",
				status: "completed",
				conclusion: "failure",
				attempt: 2,
			},
			{ id: "8", url: "v", status: "queued", attempt: 1 },
		]);
	});

	it("reruns only the failed jobs when asked", async () => {
		await new CliWorkflows({ ps }).rerun("9", true);

		expect(ps.getCalls()).toEqual([
			"gh auth status",
			"gh run rerun 9 --failed",
		]);
	});
});
