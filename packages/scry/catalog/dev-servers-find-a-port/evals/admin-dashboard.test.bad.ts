import { expect, it } from "bun:test";

it("reports healthy", async () => {
	const response = await fetch("http://localhost:4000/health");
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ status: "ok" });
});

it("lists the signed up users", async () => {
	const response = await fetch("http://localhost:4000/api/users?limit=5");
	const users = (await response.json()) as unknown[];
	expect(users).toHaveLength(5);
});
