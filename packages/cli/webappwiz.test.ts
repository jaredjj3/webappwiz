import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { NodeGlob } from "webappwiz/system";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { webappwiz } from "./webappwiz";

describe("webappwiz", () => {
	it("runs a command against the dependencies it is given", async () => {
		const fs = new FakeFs();
		await fs.mkdir("/p");
		await fs.write(
			"/p/package.json",
			JSON.stringify({ dependencies: { webappwiz: "0.1.0" } }, null, "\t"),
		);

		await webappwiz().run(
			{
				log: new MemoryLogger(),
				fs,
				ps: new FakePs(),
				glob: new NodeGlob(),
			},
			["update", "/p", "--version", "1.2.3"],
		);

		expect(await fs.read("/p/package.json")).toContain('"webappwiz": "1.2.3"');
	});
});
