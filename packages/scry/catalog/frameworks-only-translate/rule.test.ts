import { describe, expect, it } from "bun:test";
import { Cases, SourceFile } from "@webappwiz/scry";
import { FakeDecider } from "@webappwiz/scry/testing";
import FrameworksOnlyTranslate from "./rule";

const cases = await Cases.load(import.meta.dir);

describe("frameworks-only-translate", () => {
	it.each(cases.bad)(
		"flags $name when the decider says yes",
		async ({ file }) => {
			const rule = new FrameworksOnlyTranslate({
				decider: new FakeDecider({}, 0.9),
			});

			expect(await rule.check(file)).not.toEqual([]);
		},
	);

	it.each(cases.good)(
		"passes $name when the decider says no",
		async ({ file }) => {
			const rule = new FrameworksOnlyTranslate({ decider: new FakeDecider() });

			const findings = await rule.check(file);

			expect(findings.map(({ confidence }) => confidence)).not.toContain(1);
		},
	);

	it("flags a plain class that uses a framework's names, but not one that registers routes", async () => {
		const decider = new FakeDecider();
		const file = new SourceFile(
			"a.ts",
			[
				'import { Hono, HTTPException } from "hono";',
				"export class Todos {",
				"\tfind(id: string) {",
				"\t\tthrow new HTTPException(404);",
				"\t}",
				"}",
				"export class Server {",
				"\tapp = new Hono();",
				"\tconstructor(todos: Todos) {",
				'\t\tthis.app.get("/", (c) => c.json(todos.find("1")));',
				"\t}",
				"}",
			].join("\n"),
		);

		const findings = await new FrameworksOnlyTranslate({ decider }).check(file);

		expect([
			decider.asked,
			findings.map(({ line, message }) => [line, message]),
		]).toEqual([
			[],
			[
				[
					2,
					"Todos uses HTTPException from hono, so it cannot run without it: give it plain arguments and results, and leave hono to the adapter that calls it.",
				],
			],
		]);
	});

	it("asks about a component that holds state or branches in a handler, and passes one that does neither", async () => {
		const decider = new FakeDecider({}, 0.8);
		const file = new SourceFile(
			"a.tsx",
			[
				"export function Counter() {",
				"\tconst [count, setCount] = useState(0);",
				"\treturn <p>{count}</p>;",
				"}",
				"export const Name = ({ user }: { user: User }) => <p>{user.name}</p>;",
				"export function Save({ draft }: { draft: Draft }) {",
				"\treturn <button onClick={() => { if (draft.ok) draft.save(); }} />;",
				"}",
			].join("\n"),
		);

		const findings = await new FrameworksOnlyTranslate({ decider }).check(file);

		expect(findings.map(({ line, confidence }) => [line, confidence])).toEqual([
			[1, 0.8],
			[6, 0.8],
		]);
	});

	it("asks about a route or action only when it branches or runs a function of its own", async () => {
		const decider = new FakeDecider();
		const file = new SourceFile(
			"a.ts",
			[
				'import express from "express";',
				'import { cli } from "webappwiz/cmd";',
				'app.get("/a", (req, res) => res.json(service.a()));',
				'app.get("/b", (req, res) => res.json(rows.filter((row) => row.b)));',
				'cli("app").command("c").action((opts) => run(opts));',
				'cli("app").command("d").action((opts) => opts.all ? all() : one());',
			].join("\n"),
		);

		await new FrameworksOnlyTranslate({ decider }).check(file);

		expect(decider.asked.map(({ about }) => about.line)).toEqual([4, 6]);
	});

	it("reads no route or action in a file that imports no framework", async () => {
		const decider = new FakeDecider();
		const file = new SourceFile(
			"a.ts",
			'cache.get("/a", (key) => (key ? load(key) : undefined));',
		);

		await new FrameworksOnlyTranslate({ decider }).check(file);

		expect(decider.asked).toEqual([]);
	});
});
