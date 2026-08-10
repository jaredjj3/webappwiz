import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/sys/testing";
import { t } from "@webappwiz/t";
import { cli } from "./cli";

describe("cli", () => {
	// errors exit the process, so tests record the exit and read the logger instead
	let log: MemoryLogger;
	let ps: FakePs;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
	});

	it("dispatches to the named command with parsed, typed opts", () => {
		let got: { name: string; count: number } | undefined;
		const wiz = cli("wiz", log);
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

	it("routes to the right command among several", () => {
		const calls: string[] = [];
		const wiz = cli("wiz", log);
		wiz.command("foo").action(() => calls.push("foo"));
		wiz.command("bar").action(() => calls.push("bar"));
		wiz.run(["bar"]);
		expect(calls).toEqual(["bar"]);
	});

	it("returns the command's value through run", () => {
		const wiz = cli("wiz", log);
		wiz.command("v").action(() => 7);
		expect(wiz.run(["v"])).toBe(7);
	});

	it("no args, --help, -h, and unknown commands all print program help", () => {
		const wiz = cli("wiz", log);
		wiz
			.command("a")
			.description("does a")
			.action(() => {});
		for (const argv of [[], ["--help"], ["-h"], ["nope"]]) {
			expect(() => wiz.run(argv)).not.toThrow();
		}
		const text = log.entries.map((e) => String(e.message)).join("\n");
		expect(log.entries).toHaveLength(4);
		expect(text).toContain("Usage: wiz <command> [options]");
		expect(text).toContain("a  does a");
		expect(text).toContain(
			"Run `wiz <command> --help` for a command's options.",
		);
	});

	it("command help goes to the injected logger, not the console", () => {
		const wiz = cli("wiz", log);
		wiz
			.command("greet")
			.description("greet someone")
			.action(() => {});
		wiz.run(["greet", "--help"]);
		expect(log.entries.map((e) => String(e.message)).join("\n")).toContain(
			"Usage: wiz greet [options]",
		);
	});

	it("a bad option value is reported as an error and exits 1", () => {
		const wiz = cli("wiz", log, ps);
		wiz
			.command("n")
			.option("x", t.number())
			.action(() => {});
		wiz.run(["n", "--x", "abc"]);
		expect(String(log.entries.at(-1)?.message)).toMatch(/^error: .*number/);
		expect(ps.getExitCode()).toBe(1);
	});

	it("missing required option prints a readable error and exits 1", () => {
		const wiz = cli("wiz", log, ps);
		wiz
			.command("r")
			.option("must", t.string())
			.action(() => {});
		wiz.run(["r"]);
		expect(log.entries.at(-1)?.message).toBe(
			"error: missing required option --must",
		);
		expect(ps.getExitCode()).toBe(1);
	});

	it("a throwing sync action is reported and exits 1", () => {
		const wiz = cli("wiz", log, ps);
		wiz.command("boom").action(() => {
			throw new Error("nope");
		});
		wiz.run(["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: nope");
		expect(ps.getExitCode()).toBe(1);
	});

	it("a rejecting async action is reported the same way", async () => {
		const wiz = cli("wiz", log, ps);
		wiz.command("boom").action(async () => {
			throw new Error("nope");
		});
		await wiz.run(["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: nope");
		expect(ps.getExitCode()).toBe(1);
	});

	it("non-Error throws are still reported", () => {
		const wiz = cli("wiz", log, ps);
		wiz.command("boom").action(() => {
			throw "plain string";
		});
		wiz.run(["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: plain string");
		expect(ps.getExitCode()).toBe(1);
	});

	it("defaults to the console logger when none is injected", () => {
		const spy = spyOn(console, "log").mockImplementation(() => {});
		cli("wiz").run([]);
		const printed = spy.mock.calls.flat().join("\n");
		spy.mockRestore();
		expect(printed).toContain("Usage: wiz <command> [options]");
	});
});
