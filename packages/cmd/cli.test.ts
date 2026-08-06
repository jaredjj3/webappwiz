import { expect, spyOn, test } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";

import { cli } from "./cli";
import { t } from "./schema";

// errors exit the process, so tests stub it out and read the logger instead
function trapExit() {
	return {
		log: new MemoryLogger(),
		exit: spyOn(process, "exit").mockImplementation((() => {}) as never),
	};
}

function exitCode(exit: ReturnType<typeof spyOn>): unknown {
	const [call] = exit.mock.calls;
	exit.mockRestore();
	return call?.[0];
}

function out(log: MemoryLogger): string {
	return log.entries.map((e) => String(e.message)).join("\n");
}

test("dispatches to the named command with parsed, typed opts", () => {
	let got: { name: string; count: number } | undefined;
	const wiz = cli("wiz", new MemoryLogger());
	wiz
		.command("greet")
		.option("name", t.string())
		.option("count", t.number())
		.action((o) => {
			got = o;
		});
	wiz.run(["greet", "--name", "ada", "--count", "3"]);
	expect(got).toEqual({ name: "ada", count: 3 });
});

test("routes to the right command among several", () => {
	const calls: string[] = [];
	const wiz = cli("wiz", new MemoryLogger());
	wiz.command("foo").action(() => calls.push("foo"));
	wiz.command("bar").action(() => calls.push("bar"));
	wiz.run(["bar"]);
	expect(calls).toEqual(["bar"]);
});

test("returns the command's value through run", () => {
	const wiz = cli("wiz", new MemoryLogger());
	wiz.command("v").action(() => 7);
	expect(wiz.run(["v"])).toBe(7);
});

test("no args, --help, -h, and unknown commands all print program help", () => {
	const log = new MemoryLogger();
	const wiz = cli("wiz", log);
	wiz
		.command("a")
		.description("does a")
		.action(() => {});
	for (const argv of [[], ["--help"], ["-h"], ["nope"]]) {
		expect(() => wiz.run(argv)).not.toThrow();
	}
	const text = out(log);
	expect(log.entries).toHaveLength(4);
	expect(text).toContain("Usage: wiz <command> [options]");
	expect(text).toContain("a  does a");
	expect(text).toContain("Run `wiz <command> --help` for a command's options.");
});

test("command help goes to the injected logger, not the console", () => {
	const log = new MemoryLogger();
	const wiz = cli("wiz", log);
	wiz
		.command("greet")
		.description("greet someone")
		.action(() => {});
	wiz.run(["greet", "--help"]);
	expect(out(log)).toContain("Usage: wiz greet [options]");
});

test("a bad option value is reported as an error and exits 1", () => {
	const { log, exit } = trapExit();
	const wiz = cli("wiz", log);
	wiz
		.command("n")
		.option("x", t.number())
		.action(() => {});
	wiz.run(["n", "--x", "abc"]);
	const code = exitCode(exit); // read before restore; restoring clears the calls
	expect(String(log.entries.at(-1)?.message)).toMatch(/^error: .*number/);
	expect(code).toBe(1);
});

test("missing required option prints a readable error and exits 1", () => {
	const { log, exit } = trapExit();
	const wiz = cli("wiz", log);
	wiz
		.command("r")
		.option("must", t.string())
		.action(() => {});
	wiz.run(["r"]);
	const code = exitCode(exit);
	expect(log.entries.at(-1)?.message).toBe(
		"error: missing required option --must",
	);
	expect(code).toBe(1);
});

test("a throwing sync action is reported and exits 1", () => {
	const { log, exit } = trapExit();
	const wiz = cli("wiz", log);
	wiz.command("boom").action(() => {
		throw new Error("nope");
	});
	wiz.run(["boom"]);
	const code = exitCode(exit);
	expect(log.entries.at(-1)?.message).toBe("error: nope");
	expect(code).toBe(1);
});

test("a rejecting async action is reported the same way", async () => {
	const { log, exit } = trapExit();
	const wiz = cli("wiz", log);
	wiz.command("boom").action(async () => {
		throw new Error("nope");
	});
	await wiz.run(["boom"]);
	const code = exitCode(exit);
	expect(log.entries.at(-1)?.message).toBe("error: nope");
	expect(code).toBe(1);
});

test("non-Error throws are still reported", () => {
	const { log, exit } = trapExit();
	const wiz = cli("wiz", log);
	wiz.command("boom").action(() => {
		throw "plain string";
	});
	wiz.run(["boom"]);
	const code = exitCode(exit);
	expect(log.entries.at(-1)?.message).toBe("error: plain string");
	expect(code).toBe(1);
});

test("defaults to the console logger when none is injected", () => {
	const spy = spyOn(console, "log").mockImplementation(() => {});
	cli("wiz").run([]);
	const printed = spy.mock.calls.flat().join("\n");
	spy.mockRestore();
	expect(printed).toContain("Usage: wiz <command> [options]");
});
