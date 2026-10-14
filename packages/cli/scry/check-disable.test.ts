import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { FakeJudge } from "@webappwiz/scry/testing";
import type { Role } from "../config";
import { check } from "./check";
import { Testing } from "./testing";

describe("wiz scry --disable", () => {
	let sandbox: Testing;

	beforeAll(async () => {
		sandbox = await Testing.seed();
	});

	afterAll(async () => {
		await sandbox.dispose();
	});

	beforeEach(async () => {
		await sandbox.begin();
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.install(
			"reasoned",
			sandbox.asking
				.replaceAll("som", "llm")
				.replace("restates the code", "reasoned"),
		);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst foo = 1;\n",
		);
	});

	afterEach(async () => {
		await sandbox.end();
	});

	/** How a test runs the check, besides the models it turns off. */
	interface RunOptions {
		format?: string;
		cost?: boolean;
	}

	const run = (
		disabled: Partial<Record<Role, string>>,
		opts: RunOptions = {},
	) =>
		check({
			paths: ["a.ts"],
			format: opts.format ?? "text",
			cost: opts.cost,
			disabled,
			...sandbox.deps,
			clock: sandbox.clock,
		});

	it("checks only what code decides with both off, with no budget declared, saying why each rule went unchecked", async () => {
		await sandbox.fs.rm(`${sandbox.root}/.config/wiz/config.ts`);

		await run({ som: "som disabled with --disable", llm: "saving tokens" });

		expect(sandbox.printed()).toEqual(
			[
				"a.ts",
				"  2   error   100%   no foo   no-foo",
				"",
				"needs a model that is off",
				"  reasoned       1 file   saving tokens",
				"  why-not-what   1 file   som disabled with --disable",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file, by code alone",
			].join("\n"),
		);
		expect([sandbox.warned(), sandbox.asked, sandbox.proc.exits]).toEqual([
			[],
			[],
			[1],
		]);
	});

	it("asks the model left on, and exits 0 for what the other left unchecked", async () => {
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.judge = new FakeJudge(0.1);

		await run({ llm: "saving tokens" });

		expect(sandbox.printed()).toEqual(
			[
				"needs a model that is off",
				"  reasoned   1 file   saving tokens",
				"",
				"✔ no problems in 1 file, without the llm",
				"  asked 1 question in 1 request",
			].join("\n"),
		);
		expect([sandbox.asked, sandbox.proc.exits]).toEqual([["clef"], []]);
	});

	it("still needs a budget declared while a model is on", async () => {
		await sandbox.fs.rm(`${sandbox.root}/.config/wiz/config.ts`);

		await run({ llm: "saving tokens" });

		expect([sandbox.asked, sandbox.proc.exits]).toEqual([[], [3]]);
	});

	it("marks what a model that is off left unchecked as disabled in JSON", async () => {
		await run({ som: "no som", llm: "no llm" }, { format: "json" });

		expect(JSON.parse(sandbox.printed()).unchecked).toEqual([
			{
				subject: "reasoned on a.ts",
				reason: "no llm",
				rule: "reasoned",
				unasked: "disabled",
			},
			{
				subject: "why-not-what on a.ts",
				reason: "no som",
				rule: "why-not-what",
				unasked: "disabled",
			},
		]);
	});

	it("counts with --cost only what the model left on would ask", async () => {
		await run({ llm: "saving tokens" }, { cost: true });

		expect(sandbox.printed()).toStartWith(
			[
				"needs a model that is off",
				"  reasoned   1 file   saving tokens",
				"",
				"estimated",
			].join("\n"),
		);
		expect(sandbox.proc.exits).toEqual([]);
	});
});
