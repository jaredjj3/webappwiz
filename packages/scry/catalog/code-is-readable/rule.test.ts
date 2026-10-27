import { describe, expect, it } from "bun:test";
import { Cases, SourceFile } from "@webappwiz/scry";
import { FakeDecider } from "@webappwiz/scry/testing";
import CodeIsReadable from "./rule";

const cases = await Cases.load(import.meta.dir);

describe("code-is-readable", () => {
	it.each(cases.bad)("flags $name", async ({ file }) => {
		const rule = new CodeIsReadable({
			som: new FakeDecider({}, 0.9),
			llm: new FakeDecider(),
		});

		expect(await rule.check(file)).not.toEqual([]);
	});

	it.each(cases.good)("finds nothing sure in $name", async ({ file }) => {
		const rule = new CodeIsReadable({
			som: new FakeDecider({}, 0.1),
			llm: new FakeDecider(),
		});

		const sure = (await rule.check(file)).filter(
			(finding) => finding.confidence === 1,
		);

		expect(sure).toEqual([]);
	});

	it("flags a hidden character without asking, once per line", async () => {
		const som = new FakeDecider();
		const file = new SourceFile(
			"a.ts",
			'const a = "x​​y";\nconst b = 1;\nconst c = "‮";\n',
		);

		const findings = await new CodeIsReadable({
			som,
			llm: new FakeDecider(),
		}).check(file);

		expect(findings.map((finding) => finding.line)).toEqual([1, 3]);
		expect(som.asked).toEqual([]);
	});

	it("asks once about a statement that decodes an encoded literal", async () => {
		const som = new FakeDecider();
		const file = new SourceFile(
			"a.ts",
			`eval(atob("${"QUJDZGVmMTIz".repeat(8)}"));\n`,
		);

		await new CodeIsReadable({ som, llm: new FakeDecider() }).check(file);

		expect(som.asked.map((asked) => asked.about.line)).toEqual([1]);
	});

	it("leaves hashes, long names and other decodes unasked", async () => {
		const som = new FakeDecider();
		const file = new SourceFile(
			"a.ts",
			[
				`const sha = "${"a1b2c3d4".repeat(8)}";`,
				`const id = "${"some-long-kebab-case-name-".repeat(4)}";`,
				"const json = JSON.parse(text);",
				'const raw = Buffer.from(text, "utf8");',
				"const user = schema.decode(input);",
			].join("\n"),
		);

		await new CodeIsReadable({ som, llm: new FakeDecider() }).check(file);

		expect(som.asked).toEqual([]);
	});

	it("reads markdown only for hidden characters", async () => {
		const som = new FakeDecider();
		const file = new SourceFile(
			"README.md",
			`Call \`atob("${"QUJDZGVmMTIz".repeat(8)}")\`.\n`,
		);

		const findings = await new CodeIsReadable({
			som,
			llm: new FakeDecider(),
		}).check(file);

		expect([findings, som.asked]).toEqual([[], []]);
	});
});
