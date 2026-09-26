import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";

import { update } from "./update";

describe("update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	const manifest = (deps: Record<string, string>) =>
		JSON.stringify({ name: "app", dependencies: deps }, null, "\t");

	const skill = (version: string) =>
		`---\nname: arbor\nversion: ${version}\n---\n\n# arbor\n`;

	const updating = () => ({
		dir: "/p",
		version: "1.0.0",
		log,
		fs,
		skills: { arbor: { "SKILL.md": skill("1.0.0") } },
	});

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/p");
	});

	it("pins every @webappwiz dependency it finds, at any depth", async () => {
		await fs.write("/p/package.json", manifest({ webappwiz: "0.1.0" }));
		await fs.mkdir("/p/packages");
		await fs.mkdir("/p/packages/a");
		await fs.write(
			"/p/packages/a/package.json",
			manifest({ "@webappwiz/scry": "^0.2.0", "left-pad": "1.0.0" }),
		);

		await update(updating());

		expect(await fs.read("/p/package.json")).toContain('"webappwiz": "1.0.0"');
		const nested = await fs.read("/p/packages/a/package.json");
		expect(nested).toContain('"@webappwiz/scry": "1.0.0"');
		expect(nested).toContain('"left-pad": "1.0.0"');
	});

	it("leaves workspace ranges alone", async () => {
		await fs.write("/p/package.json", manifest({ webappwiz: "workspace:*" }));

		await update(updating());

		expect(await fs.read("/p/package.json")).toContain('"workspace:*"');
	});

	it("does not touch a name that happens to be a webappwiz package", async () => {
		const own = JSON.stringify({ name: "webappwiz", version: "0.1.0" });
		await fs.write("/p/package.json", own);

		await update(updating());

		expect(await fs.read("/p/package.json")).toEqual(own);
	});

	it("refreshes the skills the project has installed", async () => {
		await fs.write("/p/package.json", manifest({ webappwiz: "0.1.0" }));
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", skill("0.9.0"));

		await update(updating());

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			skill("1.0.0"),
		);
	});

	it("skips node_modules", async () => {
		const vendored = manifest({ webappwiz: "0.1.0" });
		await fs.mkdir("/p/node_modules");
		await fs.mkdir("/p/node_modules/x");
		await fs.write("/p/node_modules/x/package.json", vendored);

		await update(updating());

		expect(await fs.read("/p/node_modules/x/package.json")).toEqual(vendored);
	});

	it("renames a dependency on @webappwiz/rules to @webappwiz/scry", async () => {
		await fs.write(
			"/p/package.json",
			manifest({ "@webappwiz/rules": "0.0.19", "left-pad": "1.0.0" }),
		);

		await update(updating());

		expect(await fs.read("/p/package.json")).toEqual(
			manifest({ "@webappwiz/scry": "1.0.0", "left-pad": "1.0.0" }),
		);
	});

	it("moves .wiz/rules to .wiz/scry, rules and all", async () => {
		await fs.mkdir("/p/.wiz/rules/mine");
		await fs.write("/p/.wiz/rules/mine/RULE.md", "mine");

		await update(updating());

		expect(await fs.read("/p/.wiz/scry/mine/RULE.md")).toEqual("mine");
		expect(await fs.exists("/p/.wiz/rules")).toBe(false);
	});

	it("leaves .wiz/rules alone when .wiz/scry already exists, and says so", async () => {
		await fs.mkdir("/p/.wiz/rules/old");
		await fs.write("/p/.wiz/rules/old/RULE.md", "old");
		await fs.mkdir("/p/.wiz/scry/new");
		await fs.write("/p/.wiz/scry/new/RULE.md", "new");

		await update(updating());

		expect(await fs.read("/p/.wiz/rules/old/RULE.md")).toEqual("old");
		expect(log.entries.map((entry) => String(entry.message))).toContain(
			"/p/.wiz/rules and /p/.wiz/scry both exist: move what you still want from /p/.wiz/rules by hand",
		);
	});
});
