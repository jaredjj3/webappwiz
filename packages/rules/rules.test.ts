import { describe, expect, it } from "bun:test";
import { checkGuide, compile, type Rule } from "@webappwiz/style";
import { base } from "./index";

const compiled = async (path: string): Promise<Rule | null> =>
	compile(await Bun.file(path).text(), path).rule;

describe("rules", () => {
	it("compiles every base rule without diagnostics", async () => {
		for (const ref of base) {
			const { diagnostics } = compile(
				await Bun.file(ref.path).text(),
				ref.path,
			);
			expect(diagnostics).toEqual([]);
		}
	});

	it("gives every base rule a distinct name", async () => {
		const rules = await Promise.all(base.map((ref) => compiled(ref.path)));

		expect(checkGuide(rules.filter((r) => r !== null))).toEqual([]);
	});
});
