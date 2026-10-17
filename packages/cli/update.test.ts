import { beforeEach, describe, expect, it } from "bun:test";
import { FakeSecretStore } from "webappwiz/creds/testing";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";

import { update } from "./update";

describe("update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	let ps: FakePs;
	let store: FakeSecretStore;
	let device: FakeSecretStore;

	const manifest = (deps: Record<string, string>) =>
		JSON.stringify({ name: "app", dependencies: deps }, null, "\t");

	const skill = async (name: string) => {
		await fs.mkdir(`/p/.agents/skills/${name}`);
		await fs.write(
			`/p/.agents/skills/${name}/SKILL.md`,
			`---\nname: ${name}\nversion: 0.9.0\n---\n\n# ${name}\n`,
		);
	};

	const updating = () => ({
		dir: "/p",
		version: "1.0.0",
		log,
		fs,
		ps,
		store,
		deviceStore: device,
	});

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		ps = new FakePs();
		ps.setCaptureOutput("/p\n/p/.git\n", "");
		store = new FakeSecretStore({
			ANTHROPIC_API_KEY: "sk-key",
			CLOUDFLARE_ACCOUNT_ID: "account",
			CLOUDFLARE_API_TOKEN: "token",
			TYPESAFE_API_KEY: "key",
		});
		device = new FakeSecretStore();
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

	it("refreshes the webappwiz skill, and leaves scry's to its own updater", async () => {
		await fs.write("/p/package.json", manifest({ webappwiz: "0.1.0" }));
		await skill("scry");
		await skill("webappwiz");

		await update(updating());

		expect(ps.getCalls().filter((call) => call.includes("skills@1"))).toEqual(
			["webappwiz", "scry"].map(
				(name) =>
					`bunx skills@1 add jaredjj3/webappwiz#v1.0.0 --yes --skill ${name}`,
			),
		);
	});

	it.each(["splates", "arbor"])(
		"leaves splates to splates update, saying to run it where the project has its %s skill",
		async (name) => {
			await skill(name);

			await update(updating());

			expect(ps.getCalls().join("\n")).not.toContain(`--skill ${name}`);
			expect(log.entries.map((entry) => String(entry.message))).toContain(
				"this project has the splates skill; run `bunx @stringsync/splates update` to bring splates up to date",
			);
		},
	);

	it("says nothing of splates in a project without its skill", async () => {
		await update(updating());

		const logged = log.entries.map((entry) => String(entry.message)).join("\n");
		expect(logged).not.toContain("splates");
		expect(logged).not.toContain("arbor");
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

	it("moves scry's settings out of .wiz/config.ts, as scry update does", async () => {
		await fs.mkdir("/p/.wiz");
		await fs.write(
			"/p/.wiz/config.ts",
			'export default {\n\tscry: { budgets: "unlimited" },\n};\n',
		);

		await update(updating());

		expect(await fs.read("/p/scry.config.ts")).toEqual(
			'export default { budgets: "unlimited" };\n',
		);
	});

	it("names the credentials nothing has yet, and how a person adds each", async () => {
		store.values.delete("CLOUDFLARE_API_TOKEN");
		store.values.delete("TYPESAFE_API_KEY");

		await update(updating());

		expect(log.entries.at(-1)?.message).toEqual(
			[
				"2 credentials missing; a person runs:",
				"  bunx @webappwiz/cli creds add CLOUDFLARE_API_TOKEN",
				"  bunx @webappwiz/cli creds add TYPESAFE_API_KEY",
			].join("\n"),
		);
	});

	it("says nothing about credentials when every one is there", async () => {
		await update(updating());

		expect(String(log.entries.at(-1)?.message)).not.toContain("missing");
	});
});
