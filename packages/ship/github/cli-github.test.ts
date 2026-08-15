import { beforeEach, describe, expect, it } from "bun:test";
import { FakePs } from "@webappwiz/system/testing";
import { CliGithub } from "./cli-github";

describe("cli github", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	it("leaves notes that are already there alone", async () => {
		await new CliGithub({ ps }).release("v1.2.4");

		expect(ps.getCalls()).toEqual(["gh auth status", "gh release view v1.2.4"]);
	});

	it("logs in when gh has nobody, then writes the notes", async () => {
		// Nobody is logged in, and the release does not exist yet.
		ps.simulate(async () => {
			const call = ps.getCalls().at(-1);
			return call === "gh auth status" || call === "gh release view v1.2.4"
				? 1
				: 0;
		});

		await new CliGithub({ ps }).release("v1.2.4");

		expect(ps.getCalls()).toEqual([
			"gh auth status",
			"gh auth login",
			"gh release view v1.2.4",
			"gh release create v1.2.4 --generate-notes",
		]);
	});

	it("says what to set instead of waiting on a human CI has not got", async () => {
		ps.simulate(async () => 1);
		ps.setEnv({ CI: "true" });

		await expect(new CliGithub({ ps }).release("v1.2.4")).rejects.toThrow(
			"not logged in to GitHub: set GH_TOKEN",
		);
		expect(ps.getCalls()).toEqual(["gh auth status"]);
	});
});
