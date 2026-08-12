import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "@webappwiz/log";
import { t } from "@webappwiz/t";
import { Command } from "./command";

describe("Command", () => {
	let log: MemoryLogger;

	beforeEach(() => {
		log = new MemoryLogger();
	});

	it("parses --flag value into typed opts and hands them to the action", () => {
		let got: { name: string; count: number } | undefined;
		new Command("greet")
			.option("name", t.string())
			.option("count", t.number())
			.action((opts) => {
				got = opts;
			})
			.exec(["--name", "ada", "--count", "3"]);
		expect(got).toEqual({ name: "ada", count: 3 });
	});

	it("supports --key=value form", () => {
		let parsed = 0;
		new Command("x")
			.option("n", t.number())
			.action((opts) => {
				parsed = opts.n;
			})
			.exec(["--n=42"]);
		expect(parsed).toBe(42);
	});

	it("parses a bare boolean flag as true and --flag=false as false", () => {
		let got: { loud: boolean; name: string } | undefined;
		const cmd = new Command("f")
			.option("loud", t.boolean())
			.option("name", t.string())
			.action((opts) => {
				got = opts;
			});
		cmd.exec(["--loud", "--name", "ada"]);
		expect(got).toEqual({ loud: true, name: "ada" });
		cmd.exec(["--loud=false", "--name", "ada"]);
		expect(got).toEqual({ loud: false, name: "ada" });
	});

	it("throws on a flag it was never given", () => {
		const cmd = new Command("p").option("name", t.string()).action(() => {});

		expect(() => cmd.exec(["--name", "ada", "--nmae", "bob"])).toThrow(
			"unknown option --nmae",
		);
	});

	it("throws on a positional past the ones it declares", () => {
		const cmd = new Command("p").arg("task", t.string()).action(() => {});

		expect(() => cmd.exec(["alpha", "extra"])).toThrow(
			'unexpected argument "extra"',
		);
	});

	it("names the unknown flag before an argument it could blame instead", () => {
		const cmd = new Command("p")
			.arg("task", t.string())
			.option("force", t.boolean(), { default: false })
			.action(() => {});

		expect(() => cmd.exec(["--frce"])).toThrow("unknown option --frce");
	});

	it("uses defaults for absent flags and the given value when present", () => {
		let got: { add: boolean; name: string } | undefined;
		const cmd = new Command("d")
			.option("add", t.boolean(), { default: false })
			.option("name", t.string(), { default: "anon" })
			.action((opts) => {
				got = opts;
			});
		cmd.exec([]);
		expect(got).toEqual({ add: false, name: "anon" });
		cmd.exec(["--add", "--name", "ada"]);
		expect(got).toEqual({ add: true, name: "ada" });
	});

	it("still requires an option whose meta only has a description", () => {
		const cmd = new Command("r")
			.option("must", t.string(), { description: "required" })
			.action(() => {});
		expect(() => cmd.exec([])).toThrow("missing required option --must");
	});

	it("propagates schema parse errors to the caller", () => {
		const cmd = new Command("n").option("x", t.number()).action(() => {});
		expect(() => cmd.exec(["--x", "abc"])).toThrow(/number/);
	});

	it("returns the action's value from exec, including a promise", async () => {
		expect(new Command("v").action(() => 7).exec([])).toBe(7);
		await expect(
			new Command("a").action(async () => "done").exec([]),
		).resolves.toBe("done");
	});

	it("returns undefined when the command has no action", () => {
		expect(new Command("noop").exec([])).toBeUndefined();
	});

	it("pads the name and omits an unset description in helpLine", () => {
		expect(
			color.strip(
				new Command("c").description("does a thing").helpLine("c", 4),
			),
		).toBe("  c     does a thing");
		expect(color.strip(new Command("c").helpLine("c", 4))).toBe("  c   ");
	});

	it("prints usage, options, and defaults and skips the action on --help", () => {
		let ran = false;
		new Command("greet", log, "wiz")
			.description("greet someone")
			.option("name", t.string(), { description: "who to greet" })
			.option("count", t.number(), {
				default: 1,
				description: "how many times",
			})
			.action(() => {
				ran = true;
			})
			.exec(["--help"]);

		expect(ran).toBe(false); // required --name is not enforced when asking for help
		const text = log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
		expect(text).toContain("Usage: wiz greet [options]");
		expect(text).toContain("greet someone");
		expect(text).toContain("--name");
		expect(text).toContain("who to greet");
		expect(text).toContain("(default: 1)");
		expect(text).toContain("-h, --help");
	});

	it("says nothing about the default of an option that defaults to undefined", () => {
		new Command("greet", log, "wiz")
			.option("name", t.optional(t.string()), {
				default: undefined,
				description: "who to greet",
			})
			.action(() => {})
			.exec(["--help"]);

		const text = log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
		expect(text).toContain("who to greet");
		expect(text).not.toContain("default");
	});

	it("prints help for -h just as for --help", () => {
		let ran = false;
		new Command("x", log)
			.option("n", t.number())
			.action(() => {
				ran = true;
			})
			.exec(["-h"]);
		expect(ran).toBe(false);
		expect(
			log.entries.map((entry) => color.strip(entry.message)).join("\n"),
		).toContain(
			"Usage: x [options]", // no prog prefix
		);
	});

	it("types the action's opts statically", () => {
		new Command("typed")
			.option("name", t.string())
			.option("count", t.number())
			.action((opts) => {
				const name: string = opts.name;
				const count: number = opts.count;
				// @ts-expect-error name is a string, not a number
				const wrong: number = opts.name;
				void name;
				void count;
				void wrong;
			});
	});

	it("binds positional args by declaration order, alongside options", () => {
		let got: { task: string; force: boolean } | undefined;
		new Command("prune")
			.arg("task", t.string())
			.option("force", t.boolean(), { default: false })
			.action((opts) => {
				got = opts;
			})
			.exec(["alpha", "--force"]);
		expect(got).toEqual({ task: "alpha", force: true });
	});

	it("throws when a positional is missing, unless it has a default", () => {
		expect(() =>
			new Command("prune")
				.arg("task", t.string())
				.action(() => {})
				.exec([]),
		).toThrow("missing required argument <task>");

		let got: unknown;
		new Command("ls")
			.arg("task", t.string(), { default: "all" })
			.action((opts) => {
				got = opts;
			})
			.exec([]);
		expect(got).toEqual({ task: "all" });
	});

	it("shows arguments in the usage line and their own section in help", () => {
		new Command("escalate", log, "arbor")
			.arg("reason", t.string(), { description: "why this needs a human" })
			.arg("note", t.string(), { default: "" })
			.action(() => {})
			.exec(["--help"]);

		const text = log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
		expect(text).toContain("Usage: arbor escalate <reason> [note] [options]");
		expect(text).toContain("why this needs a human");
	});
});
