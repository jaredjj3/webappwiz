import { describe, expect, it } from "bun:test";
import { parseLsof, parseLsofCwds, parseSs } from "./listening";
import { NodePs } from "./node-ps";

describe("listening", () => {
	it("reads lsof's listeners, each process's sockets once, the wildcard as *", () => {
		const stdout = [
			"p640",
			"f10",
			"n*:7000",
			"f11",
			"n*:7000",
			"p708",
			"f13",
			"n127.0.0.1:5173",
			"f14",
			"n[::1]:5174",
			"",
		].join("\n");

		expect(parseLsof(stdout)).toEqual([
			{ pid: 640, host: "*", port: 7000 },
			{ pid: 708, host: "127.0.0.1", port: 5173 },
			{ pid: 708, host: "[::1]", port: 5174 },
		]);
	});

	it("reads each process's working directory from lsof", () => {
		expect(
			parseLsofCwds("p640\nfcwd\nn/Users/me/app\np708\nfcwd\nn/tmp\n"),
		).toEqual(
			new Map([
				[640, "/Users/me/app"],
				[708, "/tmp"],
			]),
		);
	});

	it("reads ss's local address and every pid holding it", () => {
		const stdout = [
			'LISTEN 0      511        127.0.0.1:3000      0.0.0.0:*    users:(("node",pid=12,fd=20))',
			'LISTEN 0      4096            [::]:8080         [::]:*    users:(("srv",pid=13,fd=3),("srv",pid=14,fd=3))',
			'LISTEN 0      4096   [::1%lo]:9000         [::]:*    users:(("x",pid=15,fd=3))',
			"",
		].join("\n");

		expect(parseSs(stdout)).toEqual([
			{ pid: 12, host: "127.0.0.1", port: 3000 },
			{ pid: 13, host: "*", port: 8080 },
			{ pid: 14, host: "*", port: 8080 },
			{ pid: 15, host: "[::1]", port: 9000 },
		]);
	});

	it.skipIf(process.platform === "win32")(
		"finds a port this process listens on",
		async () => {
			using server = Bun.serve({
				port: 0,
				hostname: "127.0.0.1",
				fetch: () => new Response(),
			});

			const found = await new NodePs().listening();

			expect(found).toContainEqual({
				pid: process.pid,
				host: "127.0.0.1",
				port: server.port as number,
				cwd: process.cwd(),
			});
		},
	);
});
