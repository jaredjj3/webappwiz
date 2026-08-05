import { expect, test } from "bun:test";

import { FakeFs } from "../index";

test("reads back what it writes and lists a directory's direct children", async () => {
	const fs = new FakeFs();

	await fs.mkdir("/app");
	await fs.mkdir("/app/nested");
	await fs.write("/app/a.txt", "a");
	await fs.write("/app/nested/b.txt", "b");

	expect(await fs.read("/app/a.txt")).toBe("a");
	expect((await fs.readdir("/app")).sort()).toEqual(["a.txt", "nested"]);
	expect(await fs.stat("/app")).toMatchObject({
		isDirectory: expect.any(Function),
	});
	expect((await fs.stat("/app")).isDirectory()).toBe(true);
	expect((await fs.stat("/app/a.txt")).isDirectory()).toBe(false);
});

test("rm requires the path to exist unless forced, and recurses when asked", async () => {
	const fs = new FakeFs();

	await fs.write("/app/a.txt", "a");
	await fs.write("/app/b/c.txt", "c");

	expect(fs.rm("/missing")).rejects.toThrow("Path does not exist");
	await fs.rm("/missing", { force: true });

	await fs.rm("/app", { recursive: true, force: true });
	expect(await fs.exists("/app/a.txt")).toBe(false);
	expect(await fs.exists("/app/b/c.txt")).toBe(false);
});

test("read fails on a missing file and on a directory", async () => {
	const fs = new FakeFs();
	await fs.mkdir("/app");

	expect(fs.read("/app")).rejects.toThrow("File does not exist");
	expect(fs.read("/nope.txt")).rejects.toThrow("File does not exist");
});
