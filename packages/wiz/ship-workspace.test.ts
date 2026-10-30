import { beforeEach, describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { catalog } from "@webappwiz/scry/catalog";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { publish } from "./ship";

/** What the publish workflow runs for each package, from a job npm trusts. */
const PUBLISH = "npm publish --access public --loglevel verbose";

describe("workspace publication", () => {
	let fs: FakeFs;
	let ps: FakePs;
	const opts = () => ({ fs, ps, log: new MemoryLogger() });
	let sources: Map<string, Record<string, unknown>>;
	let fail: boolean;
	let sent: Array<{ dir: string; manifest: Record<string, unknown> }>;

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		ps.setCwd("/repo");
		await fs.mkdir("/repo");
		const documents = [
			"skills/scry/SKILL.md",
			"skills/webappwiz/SKILL.md",
			...Object.keys(catalog).map(
				(id) => `packages/scry/catalog/${id}/RULE.md`,
			),
		];
		for (const path of documents) {
			await fs.write(`/repo/${path}`, "---\nversion: 1.2.3\n---\n");
		}
		await fs.write(
			"/repo/package.json",
			JSON.stringify({
				name: "workspace",
				version: "1.2.3",
				workspaces: ["packages/*"],
			}),
		);
		sources = new Map();
		const packages = new URL("../", import.meta.url);
		for (const dir of await readdir(packages)) {
			// At the workspace's version, as a release commit leaves them.
			const manifest = {
				...JSON.parse(
					await readFile(new URL(`${dir}/package.json`, packages), "utf8"),
				),
				version: "1.2.3",
			};
			sources.set(`/repo/packages/${dir}`, manifest);
			await fs.mkdir(`/repo/packages/${dir}`);
			await fs.write(
				`/repo/packages/${dir}/package.json`,
				JSON.stringify(manifest),
			);
		}
		fail = true;
		sent = [];
		ps.simulate(async () => {
			if (ps.getCalls().at(-1) !== PUBLISH) {
				return 0;
			}
			if (fail) {
				return 1;
			}
			const dir = ps.getCallDirs().at(-1) as string;
			sent.push({
				dir,
				manifest: JSON.parse(await fs.read(`${dir}/package.json`)),
			});
			return 0;
		});
	});

	it("publishes built metadata for every public package after a fresh retry", async () => {
		await expect(publish(opts())).rejects.toThrow("publish failed");
		expect(
			await Promise.all(
				[...sources.keys()].map((dir) => fs.exists(`${dir}/dist`)),
			),
		).toEqual([...sources.keys()].map(() => false));
		fail = false;
		// publish constructs new release artifacts and a new Cut, as another CLI run does.
		await publish(opts());

		const publicSources = [...sources.entries()].filter(
			([, manifest]) => !manifest.private,
		);
		expect(sent.map(({ dir }) => dir).sort()).toEqual(
			publicSources.map(([dir]) => `${dir}/dist`).sort(),
		);
		expect(sent.map(({ manifest }) => manifest.version)).toEqual(
			publicSources.map(() => "1.2.3"),
		);
		expect(JSON.stringify(sent)).not.toContain("workspace:");
		const dependencies = Object.fromEntries(
			sent.map(({ manifest }) => [manifest.name, manifest.dependencies]),
		);
		expect(dependencies).toMatchObject({
			"@webappwiz/cli": { "@webappwiz/scry": "^1.2.3", webappwiz: "^1.2.3" },
			"@webappwiz/scry": { webappwiz: "^1.2.3" },
			"@webappwiz/react": { webappwiz: "^1.2.3" },
		});
		expect(
			await Promise.all(
				[...sources.keys()].map(async (dir) =>
					JSON.parse(await fs.read(`${dir}/package.json`)),
				),
			),
		).toEqual([...sources.values()]);
	});
});
