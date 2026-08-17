import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { Cut } from "../cut";
import { FakeGithub } from "./fake-github";
import { GithubArtifact } from "./github-artifact";

describe("github artifact", () => {
	it("writes the notes for the tag", async () => {
		const github = new FakeGithub();
		const artifact = new GithubArtifact(github);

		expect(artifact.packages).toEqual([]);
		expect(artifact.stage).toBe("notes");
		await artifact.publish(new Cut("1.2.4", [], { log: new MemoryLogger() }));

		expect(github.releases).toEqual(["v1.2.4"]);
	});

	it("throws the notes it could not write, for a retry to finish", async () => {
		const github = new FakeGithub();
		github.error = new Error("not logged in to GitHub");

		await expect(
			new GithubArtifact(github).publish(
				new Cut("1.2.4", [], { log: new MemoryLogger() }),
			),
		).rejects.toThrow("not logged in to GitHub");
	});
});
