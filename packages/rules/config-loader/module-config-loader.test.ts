import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ModuleConfigLoader } from "./module-config-loader";

// The real module system, so these read this repository's own files rather than
// a fake fs. Anchored on this file, not the working directory: what a config
// path resolves against is the caller's business, not this suite's.
const root = join(import.meta.dirname, "../../..");

describe("ModuleConfigLoader", () => {
	it("loads the section a project keeps at the root", async () => {
		const section = await new ModuleConfigLoader().load(
			join(root, "rules.config.ts"),
			"judge",
		);

		expect(section).toHaveProperty("agent", "haiku");
	});

	it("hands back nothing for a section the config does not have", async () => {
		const section = await new ModuleConfigLoader().load(
			join(root, "rules.config.ts"),
			"nowhere",
		);

		expect(section).toBeUndefined();
	});

	it("says which config it wanted when a project has none", async () => {
		await expect(
			new ModuleConfigLoader().load(join(root, "nowhere.config.ts"), "judge"),
		).rejects.toThrow("nowhere.config.ts");
	});

	it("refuses a module that default-exports no sections at all", async () => {
		await expect(
			new ModuleConfigLoader().load(
				join(root, "packages/rules/rule.ts"),
				"judge",
			),
		).rejects.toThrow("must default-export an object of sections");
	});
});
