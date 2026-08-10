import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
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
			.action((o) => {
				got = o;
			})
			.exec(["--name", "ada", "--count", "3"]);
		expect(got).toEqual({ name: "ada", count: 3 });
	});

	it("supports --key=value form", () => {
		let n = 0;
		new Command("x")
			.option("n", t.number())
			.action((o) => {
				n = o.n;
			})
			.exec(["--n=42"]);
		expect(n).toBe(42);
	});

	it("a flag followed by another flag is a bare true", () => {
		let got: { loud: boolean; name: string } | undefined;
		const cmd = new Command("f")
			.option("loud", t.boolean())
			.option("name", t.string())
			.action((o) => {
				got = o;
			});
		cmd.exec(["--loud", "--name", "ada"]);
		expect(got).toEqual({ loud: true, name: "ada" });
		cmd.exec(["--loud=false", "--name", "ada"]);
		expect(got).toEqual({ loud: false, name: "ada" });
	});

	it("ignores tokens that are not flags", () => {
		let name = "";
		new Command("p")
			.option("name", t.string())
			.action((o) => {
				name = o.name;
			})
			.exec(["stray", "--name", "ada", "extra"]);
		expect(name).toBe("ada");
	});

	it("defaults fill in absent flags and are overridden when present", () => {
		let got: { add: boolean; name: string } | undefined;
		const cmd = new Command("d")
			.option("add", t.boolean(), { default: false })
			.option("name", t.string(), { default: "anon" })
			.action((o) => {
				got = o;
			});
		cmd.exec([]);
		expect(got).toEqual({ add: false, name: "anon" });
		cmd.exec(["--add", "--name", "ada"]);
		expect(got).toEqual({ add: true, name: "ada" });
	});

	it("a description-only meta does not make the option optional", () => {
		const cmd = new Command("r")
			.option("must", t.string(), { description: "required" })
			.action(() => {});
		expect(() => cmd.exec([])).toThrow("missing required option --must");
	});

	it("schema parse errors propagate to the caller", () => {
		const cmd = new Command("n").option("x", t.number()).action(() => {});
		expect(() => cmd.exec(["--x", "abc"])).toThrow(/number/);
	});

	it("exec returns the action's value, including a promise", async () => {
		expect(new Command("v").action(() => 7).exec([])).toBe(7);
		await expect(
			new Command("a").action(async () => "done").exec([]),
		).resolves.toBe("done");
	});

	it("a command with no action is a no-op", () => {
		expect(new Command("noop").exec([])).toBeUndefined();
	});

	it("helpLine pads the name and omits an unset description", () => {
		expect(new Command("c").description("does a thing").helpLine("c", 4)).toBe(
			"  c     does a thing",
		);
		expect(new Command("c").helpLine("c", 4)).toBe("  c   ");
	});

	it("--help prints usage, options and defaults, and skips the action", () => {
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
		const text = log.entries.map((e) => String(e.message)).join("\n");
		expect(text).toContain("Usage: wiz greet [options]");
		expect(text).toContain("greet someone");
		expect(text).toContain("--name");
		expect(text).toContain("who to greet");
		expect(text).toContain("(default: 1)");
		expect(text).toContain("-h, --help");
	});

	it("-h works the same as --help", () => {
		let ran = false;
		new Command("x", log)
			.option("n", t.number())
			.action(() => {
				ran = true;
			})
			.exec(["-h"]);
		expect(ran).toBe(false);
		expect(log.entries.map((e) => String(e.message)).join("\n")).toContain(
			"Usage: x [options]", // no prog prefix
		);
	});

	it("action opts are statically typed", () => {
		new Command("typed")
			.option("name", t.string())
			.option("count", t.number())
			.action((o) => {
				const name: string = o.name;
				const count: number = o.count;
				// @ts-expect-error name is a string, not a number
				const wrong: number = o.name;
				void name;
				void count;
				void wrong;
			});
	});

	it("positional args bind by declaration order, alongside options", () => {
		let got: { task: string; force: boolean } | undefined;
		new Command("prune")
			.arg("task", t.string())
			.option("force", t.boolean(), { default: false })
			.action((o) => {
				got = o;
			})
			.exec(["alpha", "--force"]);
		expect(got).toEqual({ task: "alpha", force: true });
	});

	it("a missing positional is an error unless it has a default", () => {
		expect(() =>
			new Command("prune")
				.arg("task", t.string())
				.action(() => {})
				.exec([]),
		).toThrow("missing required argument <task>");

		let got: unknown;
		new Command("ls")
			.arg("task", t.string(), { default: "all" })
			.action((o) => {
				got = o;
			})
			.exec([]);
		expect(got).toEqual({ task: "all" });
	});

	it("help shows arguments in the usage line and its own section", () => {
		new Command("escalate", log, "arbor")
			.arg("reason", t.string(), { description: "why this needs a human" })
			.arg("note", t.string(), { default: "" })
			.action(() => {})
			.exec(["--help"]);

		const text = log.entries.map((e) => String(e.message)).join("\n");
		expect(text).toContain("Usage: arbor escalate <reason> [note] [options]");
		expect(text).toContain("why this needs a human");
	});
});
