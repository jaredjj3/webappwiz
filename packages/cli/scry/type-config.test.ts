import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { typeConfig } from "./type-config";

describe("typeConfig", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const path = "/p/scry.config.ts";

	const type = async (config: string) => {
		await fs.write(path, config);
		await typeConfig(path, { fs, log });
		return fs.read(path);
	};
	const said = () => log.entries.map((entry) => String(entry.message));

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/p", { recursive: true });
	});

	it("swaps defineConfig for a type-only import and satisfies, comments and all", async () => {
		expect(
			await type(
				[
					'import { defineConfig } from "@webappwiz/scry/config";',
					"",
					"// the skills under .agents are vendored",
					"export default defineConfig({",
					'\texclude: [".agents/**"], // not ours',
					'\tbudgets: "unlimited",',
					"});",
					"",
				].join("\n"),
			),
		).toEqual(
			[
				'import type { ScryConfig } from "@webappwiz/scry/config";',
				"",
				"// the skills under .agents are vendored",
				"export default {",
				'\texclude: [".agents/**"], // not ours',
				'\tbudgets: "unlimited",',
				"} satisfies ScryConfig;",
				"",
			].join("\n"),
		);
		expect(said()).toEqual([
			"typed /p/scry.config.ts with `satisfies ScryConfig`",
		]);
	});

	it("leaves a config it cannot rewrite as it is, and says so", async () => {
		const aliased =
			'import { defineConfig as d } from "@webappwiz/scry/config";\nexport default d({ jobs: 2 });\n';
		const twice =
			'import { defineConfig } from "@webappwiz/scry/config";\nconst base = defineConfig({ jobs: 2 });\nexport default defineConfig(base);\n';

		expect(await type(aliased)).toEqual(aliased);
		expect(await type(twice)).toEqual(twice);
		expect(said()).toEqual([
			"/p/scry.config.ts calls defineConfig: type it with `satisfies ScryConfig` by hand",
			"/p/scry.config.ts calls defineConfig: type it with `satisfies ScryConfig` by hand",
		]);
	});

	it("leaves a config already typed, or none, alone", async () => {
		await typeConfig(path, { fs, log });
		const typed = "export default { jobs: 2 };\n";

		expect(await type(typed)).toEqual(typed);
		expect(said()).toEqual([]);
	});
});
