import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { Cut } from "../cut";
import { FakeGit } from "../git/fake-git";
import { GitRelease } from "./git-release";

describe("git release", () => {
	it("tags the release commit and pushes both", async () => {
		const git = new FakeGit();
		const release = new GitRelease({ git });

		expect(release.packages).toEqual([]);
		await release.publish(new Cut("1.2.4", [], { log: new MemoryLogger() }));

		expect([...git.tags]).toEqual(["v1.2.4"]);
		expect(git.pushes).toEqual(["main", "v1.2.4"]);
	});
});
