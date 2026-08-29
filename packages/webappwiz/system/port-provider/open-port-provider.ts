import { createServer } from "node:net";
import type { PortProvider } from "./port-provider";

/** How far past the port asked for to look before giving up. */
const SPAN = 20;

/**
 * Finds an open port by binding one and letting it go again, which is the only
 * way to ask the machine rather than guess at what it is running.
 */
export class OpenPortProvider implements PortProvider {
	async get(from: number): Promise<number> {
		for (let port = from; port < from + SPAN; port++) {
			// sequential on purpose: the first open port is the answer, and probing
			// the rest in parallel would bind ports nobody asked about
			if (await this.open(port)) {
				return port;
			}
		}
		throw new Error(`no open port between ${from} and ${from + SPAN}`);
	}

	// ponytail: open now, not open when the caller binds. Nothing closes that
	// window except binding for real, so a caller that cannot afford to lose the
	// race wants a retry on EADDRINUSE rather than an answer from here.
	private open(port: number): Promise<boolean> {
		return new Promise((resolve) => {
			const socket = createServer();
			socket.once("error", () => resolve(false));
			// no host, so this is the same claim on every interface that a server
			// defaulting to 0.0.0.0 will make: a narrower probe would call a port
			// open that the real bind then loses
			socket.listen(port, () => socket.close(() => resolve(true)));
		});
	}
}
