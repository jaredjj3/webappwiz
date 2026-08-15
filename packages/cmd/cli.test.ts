import { beforeEach, describe, expect, it } from "bun:test";
import {
	ConsoleLogger,
	color,
	FakeConsole,
	MemoryLogger,
} from "@webappwiz/log";
import { NodePs } from "@webappwiz/sys";
import { FakePs } from "@webappwiz/sys/testing";
import { t } from "@webappwiz/t";
import { cli } from "./cli";
import type { Deps } from "./deps";

/** One command at the top level, for the help the program prints. */
function plain() {
	const wiz = cli("wiz");
	wiz
		.command("a")
		.description("does a")
		.action(() => {});
	return wiz;
}

/** One command under a group, for the help a group prints. */
function grouped() {
	const wiz = cli("wiz");
	wiz
		.group("skills")
		.description("manage skills")
		.command("add")
		.description("add one");
	return wiz;
}

describe("cli", () => {
	// errors exit the process, so tests record the exit and read the logger instead
	let log: MemoryLogger;
	let ps: FakePs;
	let deps: Deps;

	beforeEach(() => {
		log = new MemoryLogger();
		ps = new FakePs();
		deps = { log, ps };
	});

	/** Everything written to the logger so far, uncoloured, as one string. */
	const help = () =>
		log.entries.map((entry) => color.strip(entry.message)).join("\n");

	it("dispatches to the named command with parsed, typed opts", () => {
		let got: { name: string; count: number } | undefined;
		const wiz = cli("wiz");
		wiz
			.command("greet")
			.option("name", t.string())
			.option("count", t.number())
			.action((opts) => {
				got = opts;
			});
		wiz.run(deps, ["greet", "--name", "ada", "--count", "3"]);
		expect(got).toEqual({ name: "ada", count: 3 });
	});

	it("routes to the right command among several", () => {
		const calls: string[] = [];
		const wiz = cli("wiz");
		wiz.command("foo").action(() => calls.push("foo"));
		wiz.command("bar").action(() => calls.push("bar"));
		wiz.run(deps, ["bar"]);
		expect(calls).toEqual(["bar"]);
	});

	it("returns the command's value through run", () => {
		const wiz = cli("wiz");
		wiz.command("v").action(() => 7);
		expect(wiz.run(deps, ["v"])).toBe(7);
	});

	it("prints program help for no args", () => {
		plain().run(deps, []);

		expect(help()).toContain("Usage: wiz <command> [options]");
		expect(help()).toContain("a  does a");
		expect(help()).toContain(
			"Run `wiz <command> --help` for a command's options.",
		);
	});

	it("prints program help for --help", () => {
		plain().run(deps, ["--help"]);

		expect(help()).toContain("Usage: wiz <command> [options]");
	});

	it("prints program help for -h", () => {
		plain().run(deps, ["-h"]);

		expect(help()).toContain("Usage: wiz <command> [options]");
	});

	it("prints program help for a command it does not have", () => {
		plain().run(deps, ["nope"]);

		expect(help()).toContain("Usage: wiz <command> [options]");
	});

	it("writes command help to the injected logger, not the console", () => {
		const wiz = cli("wiz");
		wiz
			.command("greet")
			.description("greet someone")
			.action(() => {});
		wiz.run(deps, ["greet", "--help"]);
		expect(
			log.entries.map((entry) => color.strip(entry.message)).join("\n"),
		).toContain("Usage: wiz greet [options]");
	});

	it("reports an error and exits 1 when an option value is bad", () => {
		const wiz = cli("wiz");
		wiz
			.command("n")
			.option("x", t.number())
			.action(() => {});
		wiz.run(deps, ["n", "--x", "abc"]);
		expect(String(log.entries.at(-1)?.message)).toMatch(/^error: .*number/);
		expect(ps.getExitCode()).toBe(1);
	});

	it("prints a readable error and exits 1 when a required option is missing", () => {
		const wiz = cli("wiz");
		wiz
			.command("r")
			.option("must", t.string())
			.action(() => {});
		wiz.run(deps, ["r"]);
		expect(log.entries.at(-1)?.message).toBe(
			"error: missing required option --must",
		);
		expect(ps.getExitCode()).toBe(1);
	});

	it("reports the error and exits 1 when a sync action throws", () => {
		const wiz = cli("wiz");
		wiz.command("boom").action(() => {
			throw new Error("nope");
		});
		wiz.run(deps, ["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: nope");
		expect(ps.getExitCode()).toBe(1);
	});

	it("reports the error and exits 1 when an async action rejects", async () => {
		const wiz = cli("wiz");
		wiz.command("boom").action(async () => {
			throw new Error("nope");
		});
		await wiz.run(deps, ["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: nope");
		expect(ps.getExitCode()).toBe(1);
	});

	it("reports the value when the action throws a non-Error", () => {
		const wiz = cli("wiz");
		wiz.command("boom").action(() => {
			throw "plain string";
		});
		wiz.run(deps, ["boom"]);
		expect(log.entries.at(-1)?.message).toBe("error: plain string");
		expect(ps.getExitCode()).toBe(1);
	});

	it("dispatches through a group to its subcommand", () => {
		let got: { name: string } | undefined;
		const wiz = cli("wiz");
		wiz
			.group("skills")
			.command("add")
			.option("name", t.string())
			.action((opts) => {
				got = opts;
			});
		wiz.run(deps, ["skills", "add", "--name", "arbor"]);
		expect(got).toEqual({ name: "arbor" });
	});

	it("lists a group on the program's own help", () => {
		grouped().run(deps, []);

		expect(help()).toContain("skills  manage skills");
	});

	it("lists a group's commands when the group is named alone", () => {
		grouped().run(deps, ["skills"]);

		expect(help()).toContain("Usage: wiz skills <command> [options]");
		expect(help()).toContain("add  add one");
		expect(help()).toContain(
			"Run `wiz skills <command> --help` for a command's options.",
		);
	});

	it("prints a group's help for --help", () => {
		grouped().run(deps, ["skills", "--help"]);

		expect(help()).toContain("Usage: wiz skills <command> [options]");
		expect(help()).toContain("add  add one");
	});

	it("prints a group's help for a subcommand it does not have", () => {
		grouped().run(deps, ["skills", "x"]);

		expect(help()).toContain("Usage: wiz skills <command> [options]");
		expect(help()).toContain("add  add one");
	});

	it("names the full path in a subcommand's own help", () => {
		const wiz = cli("wiz");
		wiz
			.group("skills")
			.command("add")
			.arg("skill", t.string())
			.action(() => {});
		wiz.run(deps, ["skills", "add", "--help"]);
		expect(color.strip(log.entries.at(-1)?.message)).toContain(
			"Usage: wiz skills add <skill> [options]",
		);
	});

	it("exits once, at the root, when a subcommand fails", () => {
		const wiz = cli("wiz");
		wiz
			.group("skills")
			.command("add")
			.action(() => {
				throw new Error("nope");
			});
		wiz.run(deps, ["skills", "add"]);
		expect(log.entries.at(-1)?.message).toBe("error: nope");
		expect(ps.getExitCode()).toBe(1);
	});

	it("runs group middleware inside the program's", () => {
		const order: string[] = [];
		const wiz = cli("wiz").use<{ n: number }>(async (ctx, next) => {
			order.push("outer");
			await next({ ...ctx, n: 1 });
		});
		const skills = wiz.group("skills").use<{ n: number }>(async (ctx, next) => {
			order.push("inner");
			await next({ ...ctx, n: ctx.n + 1 });
		});
		skills.command("add").action((_o, ctx) => order.push(`n=${ctx.n}`));
		return Promise.resolve(wiz.run(deps, ["skills", "add"])).then(() => {
			expect(order).toEqual(["outer", "inner", "n=2"]);
		});
	});

	it("dispatches into a mounted cli like a group", () => {
		const calls: string[] = [];
		const sub = cli("webappwiz");
		sub.command("update").action(() => calls.push("update"));
		const wiz = cli("wiz");
		wiz.mount("cli", sub);
		wiz.run(deps, ["cli", "update"]);
		expect(calls).toEqual(["update"]);
	});

	it("names a mounted cli's commands by the path they were reached through", () => {
		const sub = cli("webappwiz");
		sub.command("update").action(() => {});
		const wiz = cli("wiz");
		wiz.mount("cli", sub);

		wiz.run(deps, ["cli", "update", "--help"]);
		expect(help()).toContain("Usage: wiz cli update [options]");

		sub.run(deps, ["update", "--help"]);
		expect(help()).toContain("Usage: webappwiz update [options]");
	});

	it("lists a mounted cli under its own description", () => {
		const sub = cli("webappwiz").description("run webappwiz");
		sub.command("update").action(() => {});
		const wiz = cli("wiz");
		wiz.mount("cli", sub);

		wiz.run(deps, []);
		expect(help()).toContain("cli  run webappwiz");

		wiz.run(deps, ["cli"]);
		expect(help()).toContain("Usage: wiz cli <command> [options]");
	});

	it("prints usage through the logger it is run with", () => {
		const out = new FakeConsole();

		cli("wiz").run({ log: new ConsoleLogger({ out: out }), ps }, []);

		expect(color.strip(out.logged.flat().join("\n"))).toContain(
			"Usage: wiz <command> [options]",
		);
	});

	it("defaults the logger and process a command is given", () => {
		let got: Deps | undefined;
		const wiz = cli("wiz");
		wiz.command("a").action((_o, ctx) => {
			got = ctx;
		});

		wiz.run({}, ["a"]);

		expect(got?.log).toBeInstanceOf(ConsoleLogger);
		expect(got?.ps).toBeInstanceOf(NodePs);
	});

	it("defaults argv to the arguments the process was run with", () => {
		const calls: string[] = [];
		const wiz = cli("wiz");
		wiz.command("a").action(() => calls.push("a"));

		ps.args = ["a"];

		wiz.run({ log, ps });

		expect(calls).toEqual(["a"]);
	});
});
