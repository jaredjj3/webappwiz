import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "@webappwiz/system/testing";
import { ReleaseFile } from "./release-file";

describe("release file", () => {
	let fs: FakeFs;
	let file: ReleaseFile;

	beforeEach(async () => {
		fs = new FakeFs();
		await fs.mkdir("/repo");
		file = new ReleaseFile("/repo", { fs });
	});

	it("reads null where no release is under way", async () => {
		expect(await file.read()).toBeNull();
	});

	it("reads back the state it wrote", async () => {
		await file.write({ version: "1.2.4", done: ["0:@scope/one"] });

		expect(await file.read()).toEqual({
			version: "1.2.4",
			done: ["0:@scope/one"],
		});
	});

	it("clears down to nothing, even twice", async () => {
		await file.write({ version: "1.2.4", done: [] });

		await file.clear();
		await file.clear();

		expect(await file.read()).toBeNull();
	});

	it("refuses contents that are not release state", async () => {
		await fs.write("/repo/RELEASE", '{"version": 124}');

		await expect(file.read()).rejects.toThrow(
			"/repo/RELEASE does not hold release state",
		);
	});
});
