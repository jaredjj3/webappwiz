import { describe, expect, it } from "bun:test";
import { NodePs } from "./node-ps";

describe("NodePs output", () => {
	it("reports inherited-output commands and their signal exits", async () => {
		expect(await new NodePs().spawn(["sh", "-c", "exit 3"])).toEqual({
			exitCode: 3,
		});
		expect(await new NodePs().spawn(["sh", "-c", "kill -9 $$"])).toEqual({
			exitCode: 137,
		});
	});

	it("allows stdin to close after the child has already exited", async () => {
		const child = new NodePs().start(["true"]);
		expect(await child.exited).toBe(0);
		await child.stdin.close();
	});

	it("captures all output from a child that exits with unread stdin", async () => {
		const result = await new NodePs().spawnCapture(
			["sh", "-c", "printf done; printf error >&2"],
			{
				stdin: "ignored".repeat(100_000),
			},
		);
		expect(result).toEqual({ exitCode: 0, stdout: "done", stderr: "error" });
	});

	it("rejects a missing program and an already aborted spawn", async () => {
		await expect(
			new NodePs().spawnCapture(["/no/such/webappwiz-program"]),
		).rejects.toThrow();
		await expect(
			new NodePs().spawnCapture(["sleep", "5"], {
				signal: AbortSignal.abort(),
			}),
		).rejects.toThrow();
	});

	it("starts a missing program as one whose streams error and whose exit rejects", async () => {
		const child = new NodePs().start(["/no/such/webappwiz-program"]);
		await expect(child.exited).rejects.toThrow();
		await expect(new Response(child.stdout).text()).rejects.toThrow();
	});
});
