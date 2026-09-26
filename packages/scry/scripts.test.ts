import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import { Scripts } from "./scripts";

describe("Scripts", () => {
	const fs = new NodeFs();
	let root: string;
	let scripts: Scripts;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "rules-scripts-"));
		scripts = new Scripts(root, { fs });
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("runs a script by its #! line, with the files as arguments, and reads its candidates", async () => {
		await fs.write(
			`${root}/check.sh`,
			'#!/bin/sh\nfor f in "$@"; do echo "$f:3: flagged"; done\necho "noise"\n',
		);

		expect(await scripts.run("check.sh", ["a.ts", "b.ts"])).toEqual([
			{ file: "a.ts", line: 3, message: "flagged" },
			{ file: "b.ts", line: 3, message: "flagged" },
		]);
	});

	it("refuses a script with no #! line", async () => {
		await fs.write(`${root}/check.sh`, "echo hi\n");

		await expect(scripts.run("check.sh", ["a.ts"])).rejects.toThrow(
			"check.sh has no #! line naming what runs it",
		);
	});

	it("refuses a script that exits nonzero, with what it said", async () => {
		await fs.write(`${root}/check.sh`, "#!/bin/sh\necho broke >&2\nexit 3\n");

		await expect(scripts.run("check.sh", ["a.ts"])).rejects.toThrow(
			"check.sh exited 3: broke",
		);
	});
});
