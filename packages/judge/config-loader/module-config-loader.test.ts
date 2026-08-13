import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { ModuleConfigLoader } from "./module-config-loader";

// The real module system, so these read this repository's own files rather than
// a fake fs. Anchored on this file, not the working directory: what a config
// path resolves against is the caller's business, not this suite's.
const root = join(import.meta.dirname, "../../..");

describe("ModuleConfigLoader", () => {
	it("loads the config a project keeps at the root", async () => {
		const config = await new ModuleConfigLoader().load(
			join(root, "judge.config.ts"),
		);

		expect(config.rules.length).toBeGreaterThan(0);
		expect(config.agent).toBe("haiku");
	});

	it("says which config it wanted when a project has none", async () => {
		await expect(
			new ModuleConfigLoader().load(join(root, "nowhere.config.ts")),
		).rejects.toThrow("nowhere.config.ts");
	});

	it("refuses a module that default-exports something else", async () => {
		await expect(
			new ModuleConfigLoader().load(join(root, "package.json")),
		).rejects.toThrow("must default-export defineConfig");
	});
});
