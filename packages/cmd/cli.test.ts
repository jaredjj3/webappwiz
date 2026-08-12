import { beforeEach, describe, expect, it } from "bun:test";
import {
	ConsoleLogger,
	color,
	FakeConsole,
	MemoryLogger,
} from "@webappwiz/log";
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
			.action((opts) => {
				got = opts;
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

	it("prints program help for no args, --help, -h, and an unknown command", () => {
		const wiz = cli("wiz", log);
		wiz
			.command("a")
			.description("does a")
			.action(() => {});
		for (const argv of [[], ["--help"], ["-h"], ["nope"]]) {
			expect(() => wiz.run(argv)).not.toThrow();
		}
		const text = log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
		expect(log.entries).toHaveLength(4);
		expect(text).toContain("Usage: wiz <command> [options]");
		expect(text).toContain("a  does a");
		expect(text).toContain(
			"Run `wiz <command> --help` for a command's options.",
		);
	});

	it("writes command help to the injected logger, not the console", () => {
		const wiz = cli("wiz", log);
		wiz
			.command("greet")
			.description("greet someone")
			.action(() => {});
		wiz.run(["greet", "--help"]);
		expect(
			log.entries.map((entry) => color.strip(entry.message)).join("\n"),
		).toContain("Usage: wiz greet [options]");
	});

	it("reports an error and exits 1 when an option value is bad", () => {
		const wiz = cli("wiz", log, ps);
		wiz
			.command("n")
			.option("x", t.number())
			.action(() => {});
		wiz.run(["n", "--x", "abc"]);
		expect(String(log.entries.at(-1)?.message)).toMatch(/^error: .*number/);
		expect(ps.getExitCode()).toBe(1);
	});

	it("prints a readable error and exits 1 when a required option is missing", () => {
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

	it("reports the error and exits 1 when a sync action throws", () => {
		const wiz = cli("wiz", log, ps);
		wiz.command("boom").action(() => {
			throw new Error("nope");
		});
		wiz.run(["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: nope");
		expect(ps.getExitCode()).toBe(1);
	});

	it("reports the error and exits 1 when an async action rejects", async () => {
		const wiz = cli("wiz", log, ps);
		wiz.command("boom").action(async () => {
			throw new Error("nope");
		});
		await wiz.run(["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: nope");
		expect(ps.getExitCode()).toBe(1);
	});

	it("reports the value when the action throws a non-Error", () => {
		const wiz = cli("wiz", log, ps);
		wiz.command("boom").action(() => {
			throw "plain string";
		});
		wiz.run(["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: plain string");
		expect(ps.getExitCode()).toBe(1);
	});

	it("dispatches through a group to its subcommand", () => {
		let got: { name: string } | undefined;
		const wiz = cli("wiz", log);
		wiz
			.group("skills")
			.command("add")
			.option("name", t.string())
			.action((opts) => {
				got = opts;
			});
		wiz.run(["skills", "add", "--name", "arbor"]);
		expect(got).toEqual({ name: "arbor" });
	});

	it("lists groups in program help and their commands in the group's", () => {
		const wiz = cli("wiz", log);
		wiz
			.group("skills")
			.description("manage skills")
			.command("add")
			.description("add one");
		for (const argv of [
			[],
			["skills"],
			["skills", "--help"],
			["skills", "x"],
		]) {
			wiz.run(argv);
		}
		const [program, ...group] = log.entries.map((entry) =>
			color.strip(entry.message),
		);
		expect(program).toContain("skills  manage skills");
		expect(group).toHaveLength(3);
		for (const text of group) {
			expect(text).toContain("Usage: wiz skills <command> [options]");
			expect(text).toContain("add  add one");
			expect(text).toContain(
				"Run `wiz skills <command> --help` for a command's options.",
			);
		}
	});

	it("names the full path in a subcommand's own help", () => {
		const wiz = cli("wiz", log);
		wiz
			.group("skills")
			.command("add")
			.arg("skill", t.string())
			.action(() => {});
		wiz.run(["skills", "add", "--help"]);
		expect(color.strip(log.entries.at(-1)?.message)).toContain(
			"Usage: wiz skills add <skill> [options]",
		);
	});

	it("exits once, at the root, when a subcommand fails", () => {
		const wiz = cli("wiz", log, ps);
		wiz
			.group("skills")
			.command("add")
			.action(() => {
				throw new Error("nope");
			});
		wiz.run(["skills", "add"]);
		expect(log.entries.at(-1)?.message).toBe("error: nope");
		expect(ps.getExitCode()).toBe(1);
	});

	it("runs group middleware inside the program's", () => {
		const order: string[] = [];
		const wiz = cli("wiz", log).use<{ n: number }>(async (ctx, next) => {
			order.push("outer");
			await next({ ...ctx, n: 1 });
		});
		const skills = wiz.group("skills").use<{ n: number }>(async (ctx, next) => {
			order.push("inner");
			await next({ ...ctx, n: ctx.n + 1 });
		});
		skills.command("add").action((_o, ctx) => order.push(`n=${ctx.n}`));
		return Promise.resolve(wiz.run(["skills", "add"])).then(() => {
			expect(order).toEqual(["outer", "inner", "n=2"]);
		});
	});

	it("prints usage through the console logger it defaults to", () => {
		const out = new FakeConsole();

		cli("wiz", new ConsoleLogger(out)).run([]);

		expect(color.strip(out.logged.flat().join("\n"))).toContain(
			"Usage: wiz <command> [options]",
		);
	});
});
