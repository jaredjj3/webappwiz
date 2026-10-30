import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryLogger } from "webappwiz/log";
import { NodeFs } from "webappwiz/system";
import { FakePs } from "webappwiz/system/testing";
import { publish, trust } from "./declaration";

describe("ship declaration", () => {
	let root: string;
	let ps: FakePs;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "wiz-ship-"));
		ps = new FakePs();
		ps.setCwd(root);
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const run = () => publish({ log: new MemoryLogger(), fs: new NodeFs(), ps });

	it("names the declaration when the project has none", async () => {
		await expect(run()).rejects.toThrow(".wiz/ship.ts not found");
	});

	it("trusts nothing when the project has no declaration", async () => {
		await expect(
			trust({ log: new MemoryLogger(), fs: new NodeFs(), ps }),
		).rejects.toThrow(".wiz/ship.ts not found");
	});

	it("refuses a declaration that is not a Release", async () => {
		await mkdir(join(root, ".wiz"));
		await writeFile(join(root, ".wiz/ship.ts"), "export default {};\n");
		await expect(run()).rejects.toThrow("must export a Release by default");
	});
});
