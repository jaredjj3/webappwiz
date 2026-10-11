import { describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
});
