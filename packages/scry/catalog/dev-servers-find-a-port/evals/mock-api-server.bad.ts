import { fixtures } from "./fixtures.ts";

export function startMockApi() {
	const server = Bun.serve({
		port: 3001,
		fetch(request) {
			const { pathname } = new URL(request.url);
			const body = fixtures[pathname];
			return body ? Response.json(body) : new Response("not found", { status: 404 });
		},
	});
	console.log("mock api on http://localhost:3001");
	return server;
}
