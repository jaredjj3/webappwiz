import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc, testRule } from "@webappwiz/rules/testing";
import { FakeFs } from "webappwiz/system/testing";
import { JudgeCache } from "./cache";

describe("JudgeCache", () => {
	let fs: FakeFs;

	const one = testRule("one", { document: ruleDoc("One") });

	beforeEach(() => {
		fs = new FakeFs();
	});

	it("answers clean only for a verdict it recorded on the same bytes", async () => {
		const cache = await JudgeCache.load("/root", { fs });
		expect(cache.clean(one, "a.ts", "class A {}")).toBe(false);
		cache.record(one, "a.ts");
		await cache.save();

		const next = await JudgeCache.load("/root", { fs });
		expect(next.clean(one, "a.ts", "class A {}")).toBe(true);
		expect(next.hits).toBe(1);
		expect(next.clean(one, "a.ts", "class B {}")).toBe(false);
	});

	it("forgets a rule's verdicts when its document changes", async () => {
		const cache = await JudgeCache.load("/root", { fs });
		cache.clean(one, "a.ts", "class A {}");
		cache.record(one, "a.ts");
		await cache.save();

		const edited = testRule("one", { document: ruleDoc("One, edited") });
		const next = await JudgeCache.load("/root", { fs });
		expect(next.clean(edited, "a.ts", "class A {}")).toBe(false);
	});

	it("records nothing for a file the plan never hashed", async () => {
		const cache = await JudgeCache.load("/root", { fs });
		cache.record(one, "a.ts");
		await cache.save();

		const next = await JudgeCache.load("/root", { fs });
		expect(next.clean(one, "a.ts", "class A {}")).toBe(false);
	});

	it("starts empty on a cache too broken to read", async () => {
		await fs.mkdir("/root/.wiz");
		await fs.write("/root/.wiz/judge-cache.json", "not json");

		const cache = await JudgeCache.load("/root", { fs });

		expect(cache.clean(one, "a.ts", "class A {}")).toBe(false);
	});
});
