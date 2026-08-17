import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { Cut } from "./cut";
import { SkillArtifact } from "./skill-artifact";

const SKILL = `---
name: arbor
description: lands work on trunk
version: 0.0.0
---

# Using arbor

Its own frontmatter is not the only one it talks about:

\`\`\`markdown
---
version: 9.9.9
---
\`\`\`
`;

describe("skill artifact", () => {
	let fs: FakeFs;
	let cut: Cut;
	let log: MemoryLogger;

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/repo/templates");
		await fs.write("/repo/templates/arbor.skill.md", SKILL);
		cut = new Cut("1.2.4", [], { log, root: "/repo" });
	});

	const artifact = (path = "templates/arbor.skill.md") =>
		new SkillArtifact(path, { fs });

	it("stamps the release version into the frontmatter", async () => {
		await artifact().publish(cut);

		expect(await fs.read("/repo/templates/arbor.skill.md")).toContain(
			"version: 1.2.4\n",
		);
	});

	it("leaves a version in the body alone", async () => {
		await artifact().publish(cut);

		expect(await fs.read("/repo/templates/arbor.skill.md")).toContain(
			"version: 9.9.9",
		);
	});

	it("keeps everything else the document said", async () => {
		await artifact().publish(cut);

		expect(await fs.read("/repo/templates/arbor.skill.md")).toEqual(
			SKILL.replace("version: 0.0.0", "version: 1.2.4"),
		);
	});

	it("takes an absolute path as it is", async () => {
		await artifact("/repo/templates/arbor.skill.md").publish(cut);

		expect(await fs.read("/repo/templates/arbor.skill.md")).toContain(
			"version: 1.2.4\n",
		);
	});

	it("stamps the same version twice without changing anything", async () => {
		await artifact().publish(cut);
		const once = await fs.read("/repo/templates/arbor.skill.md");
		await artifact().publish(cut);

		expect(await fs.read("/repo/templates/arbor.skill.md")).toEqual(once);
	});

	it("says which document it stamped, by the path it was given", async () => {
		await artifact().publish(cut);

		expect(
			log.entries.map((entry) => String(entry.message)).join("\n"),
		).toContain("templates/arbor.skill.md");
	});

	it("publishes no package of its own", () => {
		expect(artifact().packages).toEqual([]);
		expect(artifact().stage).toEqual("stamp");
	});

	it("refuses a skill with no version to stamp", async () => {
		await fs.write("/repo/templates/arbor.skill.md", "---\nname: arbor\n---\n");

		await expect(artifact().publish(cut)).rejects.toThrow(
			'templates/arbor.skill.md has no "version:" line',
		);
	});

	it("refuses a document with no frontmatter at all", async () => {
		await fs.write("/repo/templates/arbor.skill.md", "# Using arbor\n");

		await expect(artifact().publish(cut)).rejects.toThrow('no "version:" line');
	});
});
