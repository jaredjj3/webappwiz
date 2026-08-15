import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs } from "@webappwiz/sys/testing";

import { source } from "./skills";
import { update } from "./update";

describe("update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	const manifest = (deps: Record<string, string>) =>
		JSON.stringify({ name: "app", dependencies: deps }, null, "\t");

	const skill = (version: string) =>
		`---\nname: arbor\nversion: ${version}\n---\n\n# arbor\n`;

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/p");
		await fs.mkdir(source);
		await fs.write(`${source}/arbor.skill.md`, skill("1.0.0"));
	});

	it("pins every @webappwiz dependency it finds, at any depth", async () => {
		await fs.write("/p/package.json", manifest({ "@webappwiz/t": "0.1.0" }));
		await fs.mkdir("/p/packages");
		await fs.mkdir("/p/packages/a");
		await fs.write(
			"/p/packages/a/package.json",
			manifest({ "@webappwiz/log": "^0.2.0", "left-pad": "1.0.0" }),
		);

		await update({ ...{ dir: "/p", version: "1.0.0" }, log: log, fs: fs });

		expect(await fs.read("/p/package.json")).toContain(
			'"@webappwiz/t": "1.0.0"',
		);
		const nested = await fs.read("/p/packages/a/package.json");
		expect(nested).toContain('"@webappwiz/log": "1.0.0"');
		expect(nested).toContain('"left-pad": "1.0.0"');
	});

	it("leaves workspace ranges alone", async () => {
		await fs.write(
			"/p/package.json",
			manifest({ "@webappwiz/t": "workspace:*" }),
		);

		await update({ ...{ dir: "/p", version: "1.0.0" }, log: log, fs: fs });

		expect(await fs.read("/p/package.json")).toContain('"workspace:*"');
	});

	it("does not touch a name that happens to be a webappwiz package", async () => {
		const own = JSON.stringify({ name: "@webappwiz/t", version: "0.1.0" });
		await fs.write("/p/package.json", own);

		await update({ ...{ dir: "/p", version: "1.0.0" }, log: log, fs: fs });

		expect(await fs.read("/p/package.json")).toEqual(own);
	});

	it("refreshes the skills the project has installed", async () => {
		await fs.write("/p/package.json", manifest({ "@webappwiz/t": "0.1.0" }));
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", skill("0.9.0"));

		await update({ ...{ dir: "/p", version: "1.0.0" }, log: log, fs: fs });

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			skill("1.0.0"),
		);
	});

	it("skips node_modules", async () => {
		const vendored = manifest({ "@webappwiz/t": "0.1.0" });
		await fs.mkdir("/p/node_modules");
		await fs.mkdir("/p/node_modules/x");
		await fs.write("/p/node_modules/x/package.json", vendored);

		await update({ ...{ dir: "/p", version: "1.0.0" }, log: log, fs: fs });

		expect(await fs.read("/p/node_modules/x/package.json")).toEqual(vendored);
	});
});
