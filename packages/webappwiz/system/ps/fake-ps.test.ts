import { beforeEach, describe, expect, it } from "bun:test";

import { FakePs } from "../testing";

describe("FakePs", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	it("runs the exit handlers when it exits, and records the code", () => {
		const seen: number[] = [];
		ps.once("exit", () => seen.push(ps.getExitCode()));

		ps.exit(1);

		expect(seen).toEqual([1]);
		expect(ps.isExited()).toBe(true);
		expect(ps.getExitCode()).toBe(1);
	});

	it("emits exit once, however many times it is exited", () => {
		let runs = 0;
		ps.on("exit", () => {
			runs += 1;
		});

		ps.exit(1);
		ps.exit(3);

		expect(runs).toBe(1);
		expect(ps.getExitCode()).toBe(1);
	});

	it("starts a child for the test to play, recording the call", async () => {
		const child = ps.start(["agent", "--acp"], { cwd: "/repo" });

		const writer = child.stdin.getWriter();
		void writer.write(new TextEncoder().encode("hello"));
		const { value } = await child.received.getReader().read();
		expect(new TextDecoder().decode(value)).toBe("hello");

		child.print("out");
		child.kill();

		expect(await new Response(child.stdout).text()).toBe("out");
		expect(await child.exited).toBe(143);
		expect(child.signals).toEqual(["SIGTERM"]);
		expect(ps.getChildren()).toEqual([child]);
		expect(ps.getCalls()).toEqual(["agent --acp"]);
		expect(ps.getCallDirs()).toEqual(["/repo"]);
	});

	it("starts a terminal child that keeps what was typed and its size", async () => {
		const child = ps.startOnTerminal(["/bin/sh"], { cols: 80, rows: 24 });

		child.write("ls\n");
		child.resize(100, 30);
		child.print("$ ");
		child.close();
		child.write("ignored");

		expect(child.typed).toEqual(["ls\n"]);
		expect(child.size).toEqual({ cols: 100, rows: 30 });
		expect(await new Response(child.output).text()).toBe("$ ");
		expect(ps.getTerminals()).toEqual([child]);
	});
});
