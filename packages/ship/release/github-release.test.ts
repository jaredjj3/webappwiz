import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { Cut } from "../cut";
import { FakeGithub } from "../github/fake-github";
import { GithubRelease } from "./github-release";

describe("github release", () => {
	it("writes the notes for the tag", async () => {
		const github = new FakeGithub();
		const release = new GithubRelease(github);

		expect(release.packages).toEqual([]);
		await release.publish(new Cut("1.2.4", [], { log: new MemoryLogger() }));

		expect(github.releases).toEqual(["v1.2.4"]);
	});
});
