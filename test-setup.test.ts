import { describe, expect, it } from "bun:test";
import "./test-setup";

describe("dom", () => {
	it("gives the DOM to whoever imports it", () => {
		expect(document.createElement("div").tagName).toBe("DIV");
	});

	// The rest of the workspace shares this process under a plain `bun test`, so
	// registering happy-dom must not cost anyone the runtime's HTTP. Without the
	// restore in `dom.ts` this answers "Welcome to Bun!" instead of "hi".
	it("leaves the runtime's HTTP alone for every file loaded after it", async () => {
		const server = Bun.serve({ port: 0, fetch: () => new Response("hi") });

		const response = await fetch(`http://localhost:${server.port}`);
		const text = await response.text();
		await server.stop(true);

		expect(text).toBe("hi");
	});
});
