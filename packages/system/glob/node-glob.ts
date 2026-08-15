import { matchesGlob } from "node:path";
import type { Glob } from "./glob";

/**
 * Matches with `node:path`, so the same code runs anywhere Node's API is
 * implemented. Stateless: `matchesGlob` compiles nothing worth keeping.
 *
 * ponytail: `matchesGlob` is still marked experimental in Node, though it is
 * stable in 24 and Bun implements it. If it ever disagrees with `Bun.Glob`,
 * `BunGlob` is a small class beside this one holding a `Map` of compiled
 * patterns, and the only other change is which one gets constructed.
 */
export class NodeGlob implements Glob {
	matches(pattern: string, path: string): boolean {
		return matchesGlob(path, pattern);
	}
}
