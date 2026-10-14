import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "./node-fs";

describe("NodeFs", () => {
	it("tells a recursive watch of a write deep under it, until disposed", async () => {
		const fs = new NodeFs();
		const root = await mkdtemp(join(tmpdir(), "node-fs-"));
		try {
			await fs.mkdir(join(root, "a", "b"));
			const changed: string[] = [];
			const watch = fs.watch(root, (path) => changed.push(path), {
				recursive: true,
			});

			const written = join(root, "a", "b", "c.txt");
			// The OS takes a moment to start watching, and a write made before
			// then goes untold, so this writes until one is told.
			for (let i = 0; i < 50 && !changed.includes(written); i++) {
				await fs.write(written, "c");
				await Bun.sleep(50);
			}
			expect(changed).toContain(written);

			watch.dispose();
			changed.length = 0;
			await fs.write(join(root, "a", "d.txt"), "d");
			await Bun.sleep(100);
			expect(changed).toEqual([]);
			expect(() => fs.watch(join(root, "missing"), () => {})).toThrow();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("appends to a file, making it when it is missing", async () => {
		const fs = new NodeFs();
		const root = await mkdtemp(join(tmpdir(), "node-fs-"));
		try {
			await fs.append(join(root, "log"), "one\n");
			await fs.append(join(root, "log"), "two\n");

			expect(await fs.read(join(root, "log"))).toBe("one\ntwo\n");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("tells a symbolic link from the file it points at", async () => {
		const fs = new NodeFs();
		const root = await mkdtemp(join(tmpdir(), "node-fs-"));
		try {
			await fs.write(join(root, "real"), "x");
			await symlink("real", join(root, "link"));

			expect(await fs.isSymlink(join(root, "link"))).toBe(true);
			expect(await fs.isSymlink(join(root, "real"))).toBe(false);
			expect(await fs.isSymlink(join(root, "missing"))).toBe(false);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
