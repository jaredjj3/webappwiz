import { beforeEach, describe, expect, it } from "bun:test";

import { FakeFs } from "../testing";

describe("FakeFs", () => {
	let fs: FakeFs;

	beforeEach(() => {
		fs = new FakeFs();
	});

	it("reads back what it writes and lists a directory's direct children", async () => {
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

	it("rejects removing a missing path unless forced, and recurses when asked", async () => {
		await fs.write("/app/a.txt", "a");
		await fs.write("/app/b/c.txt", "c");

		expect(fs.rm("/missing")).rejects.toThrow("Path does not exist");
		await fs.rm("/missing", { force: true });

		await fs.rm("/app", { recursive: true, force: true });
		expect(await fs.exists("/app/a.txt")).toBe(false);
		expect(await fs.exists("/app/b/c.txt")).toBe(false);
	});

	it("rejects when reading a missing file or a directory", async () => {
		await fs.mkdir("/app");

		expect(fs.read("/app")).rejects.toThrow("File does not exist");
		expect(fs.read("/nope.txt")).rejects.toThrow("File does not exist");
	});
});
