import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	chmod,
	copyFile,
	mkdir,
	mkdtemp,
	realpath,
	rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NodePs } from "webappwiz/system";

/**
 * `bin/_run` is what makes `wiz` and `arbor` mean the checkout you are standing
 * in, so it is tested through a real process: which tree it picks is a fact
 * about bash, cwd and git, and nothing smaller than a spawn can tell us.
 */
describe("bin/_run", () => {
	const ps = new NodePs();
	// The tree `_run` falls back to is the one it is installed in, so the fake
	// install gets its own copy rather than the repo's.
	let installed: string;
	let checkout: string;
	let outside: string;

	/** Prints the root it was loaded from, which is the whole question here. */
	const probe = "probe.ts";

	beforeAll(async () => {
		const dir = await realpath(await mkdtemp(join(tmpdir(), "wiz-bin-")));
		installed = join(dir, "installed");
		checkout = join(dir, "checkout");
		outside = join(dir, "outside");

		await mkdir(join(installed, "bin"), { recursive: true });
		await copyFile(
			resolve(import.meta.dirname, "../../bin/_run"),
			join(installed, "bin/_run"),
		);
		await chmod(join(installed, "bin/_run"), 0o755);

		for (const root of [installed, checkout, outside]) {
			await mkdir(root, { recursive: true });
			await Bun.write(join(root, probe), "console.log(import.meta.dir);\n");
		}
		// Only `checkout` is a repo: the other two are what "not a checkout of
		// this repo" looks like from inside `_run`.
		await ps.spawnCapture(["git", "init"], { cwd: checkout });
		await rm(join(outside, probe));
	});

	afterAll(async () => {
		await rm(resolve(installed, ".."), { recursive: true, force: true });
	});

	const run = (cwd: string, pin = "") =>
		ps.spawnCapture([join(installed, "bin/_run"), probe], {
			cwd,
			env: { WEBAPPWIZ_ROOT: pin },
		});

	it("runs the checkout you are standing in", async () => {
		const { exitCode, stdout } = await run(checkout);

		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe(checkout);
	});

	it("finds the checkout from a subdirectory, which `./bin/` cannot", async () => {
		const deep = join(checkout, "packages/somewhere");
		await mkdir(deep, { recursive: true });

		const { exitCode, stdout } = await run(deep);

		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe(checkout);
	});

	it("runs the tree it was installed from when cwd is not a checkout", async () => {
		const { exitCode, stdout } = await run(outside);

		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe(installed);
	});

	it("runs the checkout WEBAPPWIZ_ROOT pins, wherever cwd is", async () => {
		const { exitCode, stdout } = await run(installed, checkout);

		expect(exitCode).toBe(0);
		expect(stdout.trim()).toBe(checkout);
	});

	it("fails rather than falling back when the pin holds no entry", async () => {
		const { exitCode, stderr } = await run(checkout, outside);

		expect(exitCode).toBe(1);
		expect(stderr).toContain(`WEBAPPWIZ_ROOT=${outside} has no ${probe}`);
	});
});
