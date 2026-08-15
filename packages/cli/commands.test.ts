import { describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { NodeGlob } from "@webappwiz/sys";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { FakeClock } from "@webappwiz/time/testing";
import { webappwiz } from "./commands";

describe("webappwiz", () => {
	it("runs a command against the dependencies it is given", async () => {
		const fs = new FakeFs();
		await fs.mkdir("/p");
		await fs.write(
			"/p/package.json",
			JSON.stringify({ dependencies: { "@webappwiz/t": "0.1.0" } }, null, "\t"),
		);

		await webappwiz.run(
			{
				log: new MemoryLogger(),
				fs,
				ps: new FakePs(),
				clock: new FakeClock(),
				glob: new NodeGlob(),
			},
			["update", "/p", "--version", "1.2.3"],
		);

		expect(await fs.read("/p/package.json")).toContain(
			'"@webappwiz/t": "1.2.3"',
		);
	});
});
