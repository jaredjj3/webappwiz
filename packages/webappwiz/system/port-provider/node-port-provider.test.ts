import { afterEach, describe, expect, it } from "bun:test";
import { createServer, type Server } from "node:net";
import { NodePortProvider } from "./node-port-provider";

describe("NodePortProvider", () => {
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

	it("answers with the port asked for when it is free", async () => {
		const free = await hold();
		await release();

		expect(await new NodePortProvider().get(free)).toBe(free);
	});

	it("looks past a port something else is holding", async () => {
		const taken = await hold();

		expect(await new NodePortProvider().get(taken)).toBeGreaterThan(taken);
	});

	it("hands back 0 unchanged, so whatever binds it chooses", async () => {
		expect(await new NodePortProvider().get(0)).toBe(0);
	});
});
