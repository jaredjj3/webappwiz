import { createServer, type Server } from "node:http";
import { serveStatic } from "./serve-static.ts";

export async function startDocsServer(root: string, from = 4321): Promise<Server> {
	for (let port = from; port < from + 50; port++) {
		const server = createServer(serveStatic(root));
		const listening = await new Promise<boolean>((resolve, reject) => {
			server.once("error", (error: NodeJS.ErrnoException) =>
				error.code === "EADDRINUSE" ? resolve(false) : reject(error),
			);
			server.listen(port, () => resolve(true));
		});
		if (listening) {
			const { port: actual } = server.address() as { port: number };
			console.log(`docs on http://localhost:${actual}`);
			return server;
		}
	}
	throw new Error(`no free port from ${from} to ${from + 49}`);
}
