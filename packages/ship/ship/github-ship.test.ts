import { describe, expect, it } from "bun:test";
import { FakeGithub } from "../github/fake-github";
import { FakeRelease } from "../release/fake-release";
import { GithubShip } from "./github-ship";

describe("github ship", () => {
	it("writes the notes for the tag it asked the release to make", async () => {
		const github = new FakeGithub();
		const release = new FakeRelease();

		const ship = new GithubShip(github);
		await ship.run(release);

		expect(ship.packages).toEqual([]);
		expect(release.tagged).toBe(1);
		expect(github.releases).toEqual(["v1.2.4"]);
	});
});
