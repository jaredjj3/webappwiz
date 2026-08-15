import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { Cut } from "../cut";
import { FakeGit } from "../git/fake-git";
import { FakeRelease } from "./fake-release";
import { GitRelease } from "./git-release";
import { LockstepRelease } from "./lockstep-release";

describe("lockstep release", () => {
	it("gathers every package its parts publish", () => {
		const release = new LockstepRelease(
			new FakeRelease(["@scope/one"]),
			new FakeRelease(["@scope/two"]),
			new FakeRelease(),
		);

		expect(release.packages).toEqual(["@scope/one", "@scope/two"]);
	});

	it("publishes every part into the one cut", async () => {
		const [one, two] = [new FakeRelease(["@scope/one"]), new FakeRelease()];
		const cut = new Cut("1.2.4", [], { log: new MemoryLogger() });

		await new LockstepRelease(one, two).publish(cut);

		expect(one.cuts).toEqual([cut]);
		expect(two.cuts).toEqual([cut]);
	});

	it("refuses a tag declared before a package it would tag", () => {
		expect(
			() =>
				new LockstepRelease(
					new GitRelease({ git: new FakeGit() }),
					new FakeRelease(["@scope/one"]),
				),
		).toThrow("releases.git() is declared before a package it would tag");
	});

	it("takes a tag declared after every package", () => {
		expect(
			() =>
				new LockstepRelease(
					new FakeRelease(["@scope/one"]),
					new GitRelease({ git: new FakeGit() }),
					new FakeRelease(),
				),
		).not.toThrow();
	});
});
