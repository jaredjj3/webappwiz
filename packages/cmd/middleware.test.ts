import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { t } from "@webappwiz/t";
import { cli } from "./cli";
import { Command } from "./command";
import type { Middleware } from "./middleware";

describe("middleware", () => {
	let trace: string[];

	/** Appends to `trace` on the way in and on the way back out. */
	const mark =
		(name: string): Middleware<object> =>
		async (ctx, next) => {
			trace.push(`>${name}`);
			await next(ctx);
			trace.push(`<${name}`);
		};

	beforeEach(() => {
		trace = [];
	});

	it("wraps the action, outermost first", async () => {
		const app = cli("app", new MemoryLogger()).use(mark("a")).use(mark("b"));
		app.command("go").action(() => trace.push("action"));

		await app.run(["go"]);

		expect(trace).toEqual([">a", ">b", "action", "<b", "<a"]);
	});

	// Inline middleware states its output context: TypeScript will not infer a
	// type argument from how a callback parameter gets used. Factories that
	// declare a `Middleware<C, Out>` return type — the usual shape — infer fine.
	it("what a middleware hands to next is what the action receives", async () => {
		const seen: unknown[] = [];
		const app = cli("app", new MemoryLogger())
			.use<{ user: string }>(async (_ctx, next) => next({ user: "ada" }))
			.use<{ user: string; id: number }>(async (ctx, next) =>
				next({ ...ctx, id: 7 }),
			);
		app
			.command("who")
			.arg("greeting", t.string())
			.action((o, ctx) => seen.push(`${o.greeting} ${ctx.user} ${ctx.id}`));

		await app.run(["who", "hi"]);

		expect(seen).toEqual(["hi ada 7"]);
	});

	it("a command's own middleware runs inside the cli's", async () => {
		const app = cli("app", new MemoryLogger()).use(mark("cli"));
		app
			.command("go")
			.use(mark("cmd"))
			.action(() => trace.push("action"));

		await app.run(["go"]);

		expect(trace).toEqual([">cli", ">cmd", "action", "<cmd", "<cli"]);
	});

	it("can catch what the action throws", async () => {
		const app = cli("app", new MemoryLogger()).use(async (ctx, next) => {
			try {
				await next(ctx);
			} catch {
				// swallowed on purpose: the cli would otherwise exit(1)
			}
		});
		app.command("boom").action(() => {
			throw new Error("nope");
		});

		expect(await app.run(["boom"])).toBeUndefined();
	});

	it("the action's return value survives the chain", async () => {
		const app = cli("app", new MemoryLogger()).use(mark("a"));
		app.command("v").action(() => 7);

		expect(await app.run(["v"])).toBe(7);
	});

	it("asking for help never runs the middleware", async () => {
		const app = cli("app", new MemoryLogger()).use(mark("a"));
		app.command("go").action(() => trace.push("action"));

		await app.run(["go", "--help"]);

		expect(trace).toEqual([]);
	});

	it("use must come before the things it wraps", () => {
		const app = cli("app", new MemoryLogger());
		app.command("go").action(() => {});
		expect(() => app.use(mark("late"))).toThrow("before command()");

		const cmd = new Command("go").action(() => {});
		expect(() => cmd.use(mark("late"))).toThrow("before action()");
	});

	it("without middleware a sync action stays sync", () => {
		const app = cli("app", new MemoryLogger());
		app.command("v").action(() => 7);

		const out = app.run(["v"]);

		expect(out).not.toBeInstanceOf(Promise);
		expect(out).toBe(7);
	});
});
