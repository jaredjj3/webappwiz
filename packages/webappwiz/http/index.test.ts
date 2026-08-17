import { describe, expect, it } from "bun:test";
import * as bun from "./bun";
import * as index from "./index";

describe("http entry points", () => {
	it("keeps the runtime-specific server off the main entry point", async () => {
		// Importing this package for `HttpServer`, `RateLimiter` or `MemoryStore`
		// should not reach anything that only runs on one runtime. Nothing here
		// throws on a runtime without `Bun`, but a module naming `Bun.serve` is one
		// bundler default away from being evaluated by whoever imports the barrel.
		expect(Object.keys(index)).not.toContain("BunHttpServer");
		expect(Object.keys(bun)).toEqual(["BunHttpServer"]);
	});

	it("serves from the subpath the same class it always was", async () => {
		const { BunHttpServer } = await import("./http-server/bun-http-server");

		expect(bun.BunHttpServer).toBe(BunHttpServer);
	});
});
