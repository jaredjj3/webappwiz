import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "webappwiz/log";
import { t } from "webappwiz/t";
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
			.exec(["--name", "ada", "--count", "3"], { log });
		expect(got).toEqual({ name: "ada", count: 3 });
	});

	it("supports --key=value form", () => {
		let parsed = 0;
		new Command("x")
			.option("n", t.number())
			.action((opts) => {
				parsed = opts.n;
			})
			.exec(["--n=42"], { log });
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
		cmd.exec(["--loud", "--name", "ada"], { log });
		expect(got).toEqual({ loud: true, name: "ada" });
		cmd.exec(["--loud=false", "--name", "ada"], { log });
		expect(got).toEqual({ loud: false, name: "ada" });
	});

	it("throws on a flag it was never given", () => {
		const cmd = new Command("p").option("name", t.string()).action(() => {});

		expect(() => cmd.exec(["--name", "ada", "--nmae", "bob"], { log })).toThrow(
			"unknown option --nmae",
		);
	});

	it("throws on a positional past the ones it declares", () => {
		const cmd = new Command("p").arg("task", t.string()).action(() => {});

		expect(() => cmd.exec(["alpha", "extra"], { log })).toThrow(
			'unexpected argument "extra"',
		);
	});

	it("names the unknown flag before an argument it could blame instead", () => {
		const cmd = new Command("p")
			.arg("task", t.string())
			.option("force", t.boolean(), { default: false })
			.action(() => {});

		expect(() => cmd.exec(["--frce"], { log })).toThrow(
			"unknown option --frce",
		);
	});

	it("uses defaults for absent flags and the given value when present", () => {
		let got: { add: boolean; name: string } | undefined;
		const cmd = new Command("d")
			.option("add", t.boolean(), { default: false })
			.option("name", t.string(), { default: "anon" })
			.action((opts) => {
				got = opts;
			});
		cmd.exec([], { log });
		expect(got).toEqual({ add: false, name: "anon" });
		cmd.exec(["--add", "--name", "ada"], { log });
		expect(got).toEqual({ add: true, name: "ada" });
	});

	it("still requires an option whose meta only has a description", () => {
		const cmd = new Command("r")
			.option("must", t.string(), { description: "required" })
			.action(() => {});
		expect(() => cmd.exec([], { log })).toThrow(
			"missing required option --must",
		);
	});

	it("leaves an optional option undefined when it is absent, with no default", () => {
		let got: unknown;
		new Command("judge")
			.option("agent", t.optional(t.string()))
			.action((opts) => {
				got = opts;
			})
			.exec([], { log });
		expect(got).toEqual({ agent: undefined });
	});

	it("leaves an optional positional undefined when it is absent", () => {
		let got: unknown;
		new Command("show")
			.arg("task", t.optional(t.string()))
			.action((opts) => {
				got = opts;
			})
			.exec([], { log });
		expect(got).toEqual({ task: undefined });
	});

	it("propagates schema parse errors to the caller", () => {
		const cmd = new Command("n").option("x", t.number()).action(() => {});
		expect(() => cmd.exec(["--x", "abc"], { log })).toThrow(/number/);
	});

	it("returns the action's value from exec, including a promise", async () => {
		expect(new Command("v").action(() => 7).exec([], { log })).toBe(7);
		await expect(
			new Command("a").action(async () => "done").exec([], { log }),
		).resolves.toBe("done");
	});

	it("returns undefined when the command has no action", () => {
		expect(new Command("noop").exec([], { log })).toBeUndefined();
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
		new Command("greet")
			.description("greet someone")
			.option("name", t.string(), { description: "who to greet" })
			.option("count", t.number(), {
				default: 1,
				description: "how many times",
			})
			.action(() => {
				ran = true;
			})
			.exec(["--help"], { log }, [], "wiz greet");

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
		new Command("greet")
			.option("name", t.optional(t.string()), {
				default: undefined,
				description: "who to greet",
			})
			.action(() => {})
			.exec(["--help"], { log });

		const text = log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
		expect(text).toContain("who to greet");
		expect(text).not.toContain("default");
	});

	it("prints help for -h just as for --help", () => {
		let ran = false;
		new Command("x")
			.option("n", t.number())
			.action(() => {
				ran = true;
			})
			.exec(["-h"], { log });
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
			.exec(["alpha", "--force"], { log });
		expect(got).toEqual({ task: "alpha", force: true });
	});

	it("throws when a positional is missing, unless it has a default", () => {
		expect(() =>
			new Command("prune")
				.arg("task", t.string())
				.action(() => {})
				.exec([], { log }),
		).toThrow("missing required argument <task>");

		let got: unknown;
		new Command("ls")
			.arg("task", t.string(), { default: "all" })
			.action((opts) => {
				got = opts;
			})
			.exec([], { log });
		expect(got).toEqual({ task: "all" });
	});

	it("collects the arguments past the declared ones into rest()", () => {
		const cmd = new Command("test")
			.arg("pkg", t.string(), { default: "" })
			.rest("args", t.string())
			.action((opts) => {
				got = opts;
			});
		let got: { pkg: string; args: string[] } | undefined;

		cmd.exec(["web"], { log });
		expect(got).toEqual({ pkg: "web", args: [] });

		cmd.exec(["web", "viewframe"], { log });
		expect(got).toEqual({ pkg: "web", args: ["viewframe"] });

		cmd.exec(["web", "viewframe", "midi"], { log });
		expect(got).toEqual({ pkg: "web", args: ["viewframe", "midi"] });
	});

	it("reads each of the rest through the schema it was given", () => {
		let got: { ports: number[] } | undefined;
		new Command("open")
			.rest("ports", t.number())
			.action((opts) => {
				got = opts;
			})
			.exec(["80", "443"], { log });
		expect(got).toEqual({ ports: [80, 443] });
	});

	it("throws when anything is declared after rest(), at declaration time", () => {
		expect(() =>
			new Command("test").rest("args", t.string()).arg("pkg", t.string()),
		).toThrow("args takes every remaining argument");

		expect(() =>
			new Command("test").rest("args", t.string()).rest("more", t.string()),
		).toThrow("args already takes every remaining argument");
	});

	it("passes an undeclared flag through as an argument with allowUnknownOption", () => {
		let got: { check: boolean; args: string[] } | undefined;
		new Command("test")
			.allowUnknownOption()
			.option("check", t.boolean(), { default: false })
			.rest("args", t.string())
			.action((opts) => {
				got = opts;
			})
			// `--check` before `web` would read it as its value, the way any bare
			// flag ahead of a positional does; that rule has not changed here
			.exec(["web", "--check", "--watch", "--grep", "midi"], { log });
		expect(got).toEqual({
			check: true,
			args: ["web", "--watch", "--grep", "midi"],
		});
	});

	it("tolerates arguments it never declared with allowExcessArguments", () => {
		let got: { task: string } | undefined;
		new Command("show")
			.allowExcessArguments()
			.arg("task", t.string())
			.action((opts) => {
				got = opts;
			})
			.exec(["alpha", "extra"], { log });
		expect(got).toEqual({ task: "alpha" });
	});

	it("stops reading options at the first argument with passThroughOptions", () => {
		const cmd = new Command("serve")
			.passThroughOptions()
			.option("port", t.number(), { default: 0 })
			.rest("args", t.string())
			.action((opts) => {
				got = opts;
			});
		let got: { port: number; args: string[] } | undefined;

		cmd.exec(["--port=80", "run"], { log });
		expect(got).toEqual({ port: 80, args: ["run"] });

		cmd.exec(["run", "--port=80"], { log });
		expect(got).toEqual({ port: 0, args: ["run", "--port=80"] });
	});

	it("passes everything after a bare -- through as arguments", () => {
		let got: { args: string[] } | undefined;
		const cmd = new Command("test").rest("args", t.string()).action((opts) => {
			got = opts;
		});

		cmd.exec(["--", "--watch"], { log });
		expect(got).toEqual({ args: ["--watch"] });

		cmd.exec(["--", "--help"], { log });
		expect(got).toEqual({ args: ["--help"] });
		expect(log.entries).toHaveLength(0);
	});

	it("keeps refusing unknown flags and extra arguments by default", () => {
		const cmd = new Command("test")
			.arg("pkg", t.string(), { default: "" })
			.action(() => {});

		expect(() => cmd.exec(["web", "viewframe"], { log })).toThrow(
			'unexpected argument "viewframe"',
		);
		expect(() => cmd.exec(["web", "--watch"], { log })).toThrow(
			"unknown option --watch",
		);
		expect(() => cmd.exec(["web", "--", "--watch"], { log })).toThrow(
			'unexpected argument "--watch"',
		);
	});

	it("shows a variadic as [args...] in the usage line and the argument list", () => {
		new Command("test")
			.arg("pkg", t.string(), { default: "" })
			.rest("args", t.string(), { description: "passed to the runner" })
			.action(() => {})
			.exec(["--help"], { log }, [], "s2s test");

		const text = log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
		expect(text).toContain("Usage: s2s test [pkg] [args...] [options]");
		expect(text).toContain("args...");
		expect(text).toContain("passed to the runner");
	});

	it("shows arguments in the usage line and their own section in help", () => {
		new Command("escalate")
			.arg("reason", t.string(), { description: "why this needs a human" })
			.arg("note", t.string(), { default: "" })
			.action(() => {})
			.exec(["--help"], { log }, [], "arbor escalate");

		const text = log.entries
			.map((entry) => color.strip(entry.message))
			.join("\n");
		expect(text).toContain("Usage: arbor escalate <reason> [note] [options]");
		expect(text).toContain("why this needs a human");
	});
});
