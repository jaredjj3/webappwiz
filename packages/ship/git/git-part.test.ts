import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { Cut } from "../cut";
import { FakeGit } from "./fake-git";
import { GitPart } from "./git-part";

describe("git part", () => {
	it("tags the release commit and pushes both", async () => {
		const git = new FakeGit();
		const part = new GitPart({ git });

		expect(part.packages).toEqual([]);
		expect(part.stage).toBe("tag");
		await part.publish(new Cut("1.2.4", [], { log: new MemoryLogger() }));

		expect([...git.tags]).toEqual(["v1.2.4"]);
		expect(git.pushes).toEqual(["main", "v1.2.4"]);
	});

	it("leaves no tag behind when the branch will not push", async () => {
		const git = new FakeGit();
		git.rejects.add("main");
		const part = new GitPart({ git });

		await expect(
			part.publish(new Cut("1.2.4", [], { log: new MemoryLogger() })),
		).rejects.toThrow("git push origin main: rejected");

		// A tag here would say 1.2.4 finished, and send the next release past it.
		expect([...git.tags]).toEqual([]);
	});
});
