import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { t } from "@webappwiz/t";
import { z } from "zod";
import { Command } from "./command";

/**
 * Against the real zod, not a stand-in. What this package claims is that a
 * caller who already has a validation library does not have to learn `t` to
 * declare a command, and only the real thing settles whether that is true.
 */
describe("Command with zod", () => {
	let log: MemoryLogger;

	beforeEach(() => {
		log = new MemoryLogger();
	});

	it("binds a command line declared entirely in zod", () => {
		let got: unknown;

		new Command("greet")
			.arg("name", z.string())
			.option("times", z.coerce.number(), { default: 1 })
			.action((opts) => {
				got = opts;
			})
			.exec(["ada", "--times", "3"], { log });

		expect(got).toEqual({ name: "ada", times: 3 });
	});

	it("infers the value types through the interface", () => {
		new Command("greet")
			.arg("name", z.string())
			.option("times", z.coerce.number(), { default: 1 })
			.action((opts) => {
				// Annotated rather than inferred: if the types came back as `unknown`
				// or `any` these assignments are what stops compiling, which is the
				// failure this guards against.
				const name: string = opts.name;
				const times: number = opts.times;
				expect([name, times]).toEqual(["ada", 1]);
			})
			.exec(["ada"], { log });
	});

	it("coerces through zod the way it coerces through ours", () => {
		let got: number | undefined;

		new Command("serve")
			.arg("port", z.coerce.number())
			.action((opts) => {
				got = opts.port;
			})
			.exec(["8080"], { log });

		expect(got).toBe(8080);
	});

	it("raises a zod refusal as an error, the way it raises one of ours", () => {
		const run = () =>
			new Command("serve")
				.arg("port", z.coerce.number().int().max(65535))
				.action(() => {})
				.exec(["99999"], { log });

		expect(run).toThrow();
	});

	it("mixes the two, since nothing says a command line picks one", () => {
		let got: unknown;

		new Command("copy")
			.arg("from", t.string())
			.arg("to", z.string())
			.action((opts) => {
				got = opts;
			})
			.exec(["a", "b"], { log });

		expect(got).toEqual({ from: "a", to: "b" });
	});

	it("lets a zod schema say absence is allowed, the way ours does", () => {
		let got: string | undefined = "untouched";

		new Command("greet")
			.arg("name", z.string().optional())
			.action((opts) => {
				got = opts.name;
			})
			.exec([], { log });

		expect(got).toBeUndefined();
	});

	it("still refuses to leave out one the schema demands", () => {
		const run = () =>
			new Command("greet")
				.arg("name", z.string())
				.action(() => {})
				.exec([], { log });

		expect(run).toThrow("missing required argument <name>");
	});

	it("takes the default a schema carries itself, which ours cannot express", () => {
		// Absence is put to the schema by validating `undefined`, so a schema that
		// answers with a value of its own supplies it. Nothing had to be taught
		// about zod for that to work.
		let got: string | undefined;

		new Command("greet")
			.arg("name", z.string().default("world"))
			.action((opts) => {
				got = opts.name;
			})
			.exec([], { log });

		expect(got).toBe("world");
	});
});
