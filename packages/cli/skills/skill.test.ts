import { describe, expect, it } from "bun:test";
import { NodeFs } from "@webappwiz/system";

import { source, versionOf } from "./skill";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skill", () => {
	it("reads the version out of the frontmatter", () => {
		expect(versionOf(md("arbor", "2.1.0"))).toEqual("2.1.0");
	});

	it("ignores a version: line in the body", () => {
		expect(versionOf(`---\nname: x\n---\n\nversion: 9.9.9\n`)).toBeNull();
	});

	it("finds no version when there is no frontmatter at all", () => {
		expect(versionOf("# just a doc")).toBeNull();
	});

	it("stamps the package version in every bundled skill's frontmatter", async () => {
		// the frontmatter version is the only way a project can tell which
		// release of these packages its copy came from, so it must track the
		// package version exactly
		const real = new NodeFs();
		const { version } = JSON.parse(
			await real.read(`${import.meta.dirname}/../package.json`),
		);
		const root = JSON.parse(
			await real.read(`${import.meta.dirname}/../../../package.json`),
		);
		expect(root.version).toEqual(version);

		const files = (await real.readdir(source)).filter((file) =>
			file.endsWith(".skill.md"),
		);
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const skill = await real.read(`${source}/${file}`);
			expect(versionOf(skill)).toEqual(version);
		}
	});
});
