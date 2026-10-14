import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { check } from "./check";
import { Testing } from "./testing";

describe("wiz scry", () => {
	let sandbox: Testing;

	beforeAll(async () => {
		sandbox = await Testing.seed();
	});

	afterAll(async () => {
		await sandbox.dispose();
	});

	beforeEach(async () => {
		await sandbox.begin();
	});

	afterEach(async () => {
		await sandbox.end();
	});

	it("checks every file under the working directory, changed or not, given no paths", async () => {
		await sandbox.fs.mkdir(`${sandbox.root}/src`);
		await sandbox.fs.write(`${sandbox.root}/src/b.ts`, "const foo = 2;\n");
		await sandbox.git("add", "src");
		await sandbox.git("commit", "-qam", "change");
		sandbox.proc.chdir(`${sandbox.root}/src`);

		await sandbox.run("text", []);

		expect(sandbox.printed()).toEqual(
			[
				"src/b.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file",
			].join("\n"),
		);
	});

	it("says so when there is no file under the working directory", async () => {
		await sandbox.fs.mkdir(`${sandbox.root}/empty`);
		sandbox.proc.chdir(`${sandbox.root}/empty`);

		await sandbox.run("text", []);

		expect(sandbox.warned()).toEqual(["no files to check"]);
	});

	it("checks every file under the paths it is given, changed or not, from the working directory", async () => {
		await sandbox.fs.mkdir(`${sandbox.root}/src`);
		await sandbox.fs.write(`${sandbox.root}/src/b.ts`, "const foo = 2;\n");
		await sandbox.fs.write(`${sandbox.root}/src/.gitignore`, "ignored.ts\n");
		await sandbox.git("add", "src");
		await sandbox.git("commit", "-qm", "b");
		await sandbox.fs.write(`${sandbox.root}/src/c.ts`, "const foo = 3;\n");
		await sandbox.fs.write(
			`${sandbox.root}/src/ignored.ts`,
			"const foo = 4;\n",
		);
		sandbox.proc.chdir(`${sandbox.root}/src`);

		await sandbox.run("text", ["."]);

		expect(sandbox.printed()).toEqual(
			[
				"src/b.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"src/c.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 2 problems (2 errors, 0 warnings) in 2 files",
			].join("\n"),
		);
	});

	it("checks a file it is given by name", async () => {
		await sandbox.git("commit", "-qam", "change");

		await sandbox.run("json", ["a.ts"]);

		expect(JSON.parse(sandbox.printed())).toMatchObject({
			files: 1,
			problems: [{ path: "a.ts", line: 1, rule: "no-foo" }],
		});
		expect(JSON.parse(sandbox.printed()).since).toBeUndefined();
	});

	it("checks only the files under the paths that changed since a ref it is given", async () => {
		await sandbox.fs.mkdir(`${sandbox.root}/src`);
		await sandbox.fs.write(`${sandbox.root}/src/b.ts`, "const foo = 2;\n");
		await sandbox.git("add", ".");
		await sandbox.git("commit", "-qm", "b");
		await sandbox.fs.write(`${sandbox.root}/src/c.ts`, "const foo = 3;\n");

		await check({
			paths: ["src"],
			since: "HEAD",
			format: "text",
			...sandbox.deps,
		});

		expect(sandbox.printed()).toEqual(
			[
				"src/c.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file since HEAD",
			].join("\n"),
		);
	});

	it("checks none of the files the config excludes", async () => {
		await sandbox.fs.write(
			`${sandbox.root}/scry.config.ts`,
			'export default { exclude: ["vendor/**"] };\n',
		);
		await sandbox.fs.mkdir(`${sandbox.root}/vendor`);
		await sandbox.fs.write(`${sandbox.root}/vendor/b.ts`, "const foo = 2;\n");

		await sandbox.run("json");

		expect(JSON.parse(sandbox.printed()).problems).toMatchObject([
			{ path: "a.ts", line: 1, rule: "no-foo" },
		]);
	});

	it("says where it looked when there is no file under the paths", async () => {
		await sandbox.fs.mkdir(`${sandbox.root}/src`);

		await sandbox.run("text", ["src"]);

		expect(sandbox.warned()).toEqual(["no files to check in src"]);
	});

	it("says where it looked when nothing changed under the paths since a ref", async () => {
		await sandbox.fs.mkdir(`${sandbox.root}/src`);

		await check({
			paths: ["src"],
			since: "HEAD",
			format: "text",
			...sandbox.deps,
		});

		expect(sandbox.warned()).toEqual(["nothing changed since HEAD in src"]);
	});
});
