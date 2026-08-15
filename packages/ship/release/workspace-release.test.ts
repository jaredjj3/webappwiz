import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeGit } from "../git/fake-git";
import { WorkspaceRelease } from "./workspace-release";

describe("workspace release", () => {
	const releasing = (git: FakeGit) =>
		new WorkspaceRelease(
			"1.2.4",
			[{ name: "@scope/one", dir: "/repo/packages/one", private: false }],
			git,
			{ log: new MemoryLogger() },
		);

	it("finds a package's directory, and nothing for a name it lacks", () => {
		const release = releasing(new FakeGit());

		expect(release.dir("@scope/one")).toBe("/repo/packages/one");
		expect(release.dir("@scope/gone")).toBeUndefined();
	});

	it("tags and pushes once, however many steps ask", async () => {
		const git = new FakeGit();
		const release = releasing(git);

		expect(await release.tag()).toBe("v1.2.4");
		expect(await release.tag()).toBe("v1.2.4");
		expect([...git.tags]).toEqual(["v1.2.4"]);
		expect(git.pushes).toEqual(["main", "v1.2.4"]);
	});
});
