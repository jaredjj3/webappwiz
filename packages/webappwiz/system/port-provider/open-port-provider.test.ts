import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:net";
import { AssertError } from "webappwiz/assert";
import { OpenPortProvider } from "./open-port-provider";

describe("OpenPortProvider", () => {
	const held: Server[] = [];

	/** Binds a port and keeps it, answering with the port it got. */
	const hold = (): Promise<number> =>
		new Promise((resolve) => {
			const server = createServer();
			held.push(server);
			server.listen(0, () => {
				const address = server.address();
				resolve(typeof address === "object" && address ? address.port : 0);
			});
		});

	/** Lets go of everything `hold` took, so those ports read as open again. */
	const release = async (): Promise<void> => {
		await Promise.all(
			held.splice(0).map((server) => new Promise((done) => server.close(done))),
		);
	};

	afterEach(release);

	it("answers with the port it was made for when that one is free", async () => {
		const free = await hold();
		await release();

		expect(await new OpenPortProvider({ from: free }).get()).toBe(free);
	});

	it("looks past a port something else is holding", async () => {
		const taken = await hold();

		const port = await OpenPortProvider.span({ from: taken, span: 20 }).get();

		expect(port).toBeGreaterThan(taken);
	});

	it("refuses a range it cannot satisfy rather than widening it", async () => {
		const taken = await hold();
		const provider = new OpenPortProvider({ from: taken, to: taken });

		// awaited: an unawaited rejection here surfaces as an unhandled error in
		// whichever test the runner happens to be in when it lands
		await expect(provider.get()).rejects.toThrow(
			`no open port between ${taken}`,
		);
	});

	it("hands back 0 for any, so whatever binds it chooses", async () => {
		expect(await OpenPortProvider.any().get()).toBe(0);
	});

	it.each([
		["a fractional port", { from: 4269.5 }],
		["a negative port", { from: -1 }],
		["a port past the last one", { from: 65536 }],
		["a range that ends before it starts", { from: 4269, to: 4268 }],
		["a range that ends past the last port", { from: 65530, to: 65540 }],
	])("rejects %s when it is made", (_what, range) => {
		expect(() => new OpenPortProvider(range)).toThrow(AssertError);
	});

	it("shortens a span that runs past the last port there is", async () => {
		// 65535 is the last one, so this is a two port search, not a mistake
		const provider = OpenPortProvider.span({ from: 65534, span: 20 });

		expect(await provider.get()).toBeGreaterThanOrEqual(65534);
	});

	it.each([
		["a span of no ports", 0],
		["a fractional span", 1.5],
	])("rejects %s when it is made", (_what, span) => {
		expect(() => OpenPortProvider.span({ from: 4269, span })).toThrow(
			AssertError,
		);
	});
});
