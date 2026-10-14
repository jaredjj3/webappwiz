import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { moveConfig } from "./move-config";

describe("moveConfig", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const paths = { wiz: "/p/.wiz/config.ts", scry: "/p/scry.config.ts" };

	const move = async (wiz: string) => {
		await fs.write(paths.wiz, wiz);
		await moveConfig(paths, { fs, log });
	};
	const said = () => log.entries.map((entry) => String(entry.message));

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/p/.wiz", { recursive: true });
	});

	it("moves a config that set only scry whole, comments and all", async () => {
		await move(
			[
				"// the skills under .agents are vendored",
				"export default {",
				"\tscry: {",
				"\t\t// not ours",
				'\t\texclude: [".agents/**"],',
				'\t\tbudgets: "unlimited",',
				"\t},",
				"};",
				"",
			].join("\n"),
		);

		expect(await fs.read(paths.scry)).toEqual(
			[
				"// the skills under .agents are vendored",
				"export default {",
				"\t// not ours",
				'\texclude: [".agents/**"],',
				'\tbudgets: "unlimited",',
				"};",
				"",
			].join("\n"),
		);
		expect(await fs.exists(paths.wiz)).toBe(false);
		expect(said()).toEqual([
			"moved /p/.wiz/config.ts to /p/scry.config.ts: it set only scry",
		]);
	});

	it("takes scry and the comments above it out of a config that sets more, typed as it was", async () => {
		await move(
			[
				'import { defineConfig } from "@webappwiz/cli/config";',
				"",
				"export default defineConfig({",
				"\t// every rule, every time",
				'\tscry: { budgets: "unlimited" },',
				'\tcredentials: { project: "shop" },',
				"});",
				"",
			].join("\n"),
		);

		expect(await fs.read(paths.scry)).toEqual(
			[
				'import { defineConfig } from "@webappwiz/scry/config";',
				"",
				"// every rule, every time",
				'export default defineConfig({ budgets: "unlimited" });',
				"",
			].join("\n"),
		);
		expect(await fs.read(paths.wiz)).toEqual(
			[
				'import { defineConfig } from "@webappwiz/cli/config";',
				"",
				"export default defineConfig({",
				'\tcredentials: { project: "shop" },',
				"});",
				"",
			].join("\n"),
		);
	});

	it("takes scry out of a config written on one line", async () => {
		await move(
			'export default { credentials: { project: "shop" }, scry: { jobs: 2 } };\n',
		);

		expect([await fs.read(paths.wiz), await fs.read(paths.scry)]).toEqual([
			'export default { credentials: { project: "shop" }, };\n',
			"export default { jobs: 2 };\n",
		]);
	});

	it("leaves both alone when the scry config is already there, and says so", async () => {
		await fs.write(paths.scry, "export default { jobs: 4 };\n");
		await move("export default { scry: { jobs: 2 } };\n");

		expect([await fs.read(paths.wiz), await fs.read(paths.scry)]).toEqual([
			"export default { scry: { jobs: 2 } };\n",
			"export default { jobs: 4 };\n",
		]);
		expect(said()).toEqual([
			"/p/.wiz/config.ts still sets scry, and /p/scry.config.ts exists: move what you still want into /p/scry.config.ts by hand",
		]);
	});

	it("says to move scry by hand when the config names it from elsewhere", async () => {
		await move("const scry = { jobs: 2 };\nexport default { scry };\n");

		expect(await fs.exists(paths.scry)).toBe(false);
		expect(said()).toEqual([
			"/p/.wiz/config.ts sets scry from elsewhere in the file: move it into /p/scry.config.ts by hand",
		]);
	});

	it("does nothing to a config without scry, or with no config at all", async () => {
		await moveConfig(paths, { fs, log });
		await move('export default { credentials: { project: "shop" } };\n');

		expect(await fs.exists(paths.scry)).toBe(false);
		expect(said()).toEqual([]);
	});
});
