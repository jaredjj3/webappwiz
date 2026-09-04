---
name: dev-servers-find-a-port
description: A dev server tries the next port when its default is taken, and reports the one it got.
files: "**/*.ts"
level: error
complexity: low
version: 0.0.12
---
# Dev servers find a port

A dev server that insists on one port fails the moment a second copy of it,
or anything else, is already there. Name a default port so the URL is
predictable, then keep trying the next one until you get a listener, and
report the port you actually got rather than the one you asked for. Ports
belong in a default argument or a flag, never buried in a fetch, a config
file, or a test.

## Good

```ts
export function serve(handler: (req: Request) => Response, from = 5173) {
	for (let port = from; port < from + 20; port++) {
		try {
			return Bun.serve({ port, fetch: handler });
		} catch (error) {
			if (!String(error).includes("EADDRINUSE")) throw error;
		}
	}
	throw new Error(`no free port between ${from} and ${from + 20}`);
}

const server = serve(handler);
console.log(`dev on http://localhost:${server.port}`);
```

## Bad

```ts
export function serve(handler: (req: Request) => Response) {
	// Dies with EADDRINUSE the second time you run it, and the URL is a guess:
	// nothing here reports the port the server is really on.
	Bun.serve({ port: 5173, fetch: handler });
	console.log("dev on http://localhost:5173");
}

it("serves the page", async () => {
	const page = await fetch("http://localhost:5173/");
	expect(page.status).toBe(200);
});
```
