import { afterAll, expect, it } from "bun:test";
import { startPreview } from "./preview-server.ts";

const server = startPreview({ root: "fixtures/site" });

afterAll(() => server.stop());

it("serves the index page", async () => {
	const page = await fetch(new URL("/", server.url));
	expect(page.status).toBe(200);
	expect(await page.text()).toContain("<title>Fixture site</title>");
});

it("returns 404 for missing pages", async () => {
	const page = await fetch(new URL("/nope", server.url));
	expect(page.status).toBe(404);
});
