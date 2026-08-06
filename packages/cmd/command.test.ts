import { expect, test } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";

import { Command } from "./command";
import { t } from "./schema";

function out(log: MemoryLogger): string {
	return log.entries.map((e) => String(e.message)).join("\n");
}

test("parses --flag value into typed opts and hands them to the action", () => {
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

test("supports --key=value form", () => {
	let n = 0;
	new Command("x")
		.option("n", t.number())
		.action((o) => {
			n = o.n;
		})
		.exec(["--n=42"]);
	expect(n).toBe(42);
});

test("a flag followed by another flag is a bare true", () => {
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

test("ignores tokens that are not flags", () => {
	let name = "";
	new Command("p")
		.option("name", t.string())
		.action((o) => {
			name = o.name;
		})
		.exec(["stray", "--name", "ada", "extra"]);
	expect(name).toBe("ada");
});

test("defaults fill in absent flags and are overridden when present", () => {
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

test("a description-only meta does not make the option optional", () => {
	const cmd = new Command("r")
		.option("must", t.string(), { description: "required" })
		.action(() => {});
	expect(() => cmd.exec([])).toThrow("missing required option --must");
});

test("schema parse errors propagate to the caller", () => {
	const cmd = new Command("n").option("x", t.number()).action(() => {});
	expect(() => cmd.exec(["--x", "abc"])).toThrow(/number/);
});

test("exec returns the action's value, including a promise", async () => {
	expect(new Command("v").action(() => 7).exec([])).toBe(7);
	await expect(
		new Command("a").action(async () => "done").exec([]),
	).resolves.toBe("done");
});

test("a command with no action is a no-op", () => {
	expect(new Command("noop").exec([])).toBeUndefined();
});

test("summary reflects the description", () => {
	expect(new Command("c").description("does a thing").summary).toBe(
		"does a thing",
	);
	expect(new Command("c").summary).toBe("");
});

test("--help prints usage, options and defaults, and skips the action", () => {
	const log = new MemoryLogger();
	let ran = false;
	new Command("greet", log)
		.description("greet someone")
		.option("name", t.string(), { description: "who to greet" })
		.option("count", t.number(), { default: 1, description: "how many times" })
		.action(() => {
			ran = true;
		})
		.exec(["--help"], "wiz");

	expect(ran).toBe(false); // required --name is not enforced when asking for help
	const text = out(log);
	expect(text).toContain("Usage: wiz greet [options]");
	expect(text).toContain("greet someone");
	expect(text).toContain("--name");
	expect(text).toContain("who to greet");
	expect(text).toContain("(default: 1)");
	expect(text).toContain("-h, --help");
});

test("-h works the same as --help", () => {
	const log = new MemoryLogger();
	let ran = false;
	new Command("x", log)
		.option("n", t.number())
		.action(() => {
			ran = true;
		})
		.exec(["-h"]);
	expect(ran).toBe(false);
	expect(out(log)).toContain("Usage: x [options]"); // no prog prefix
});

test("action opts are statically typed", () => {
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
