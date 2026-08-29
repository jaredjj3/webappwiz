import { createServer } from "node:net";
import { assert } from "webappwiz/assert";
import type { PortProvider } from "./port-provider";

/** The highest port there is; a range naming one past it cannot be served. */
export const MAX_PORT = 65535;

/** The ports to consider, `to` included; `to` left out means `from` alone. */
export interface PortRange {
	from: number;
	to?: number;
}

/** How many ports to consider, counting `from` itself. */
export interface PortSpan {
	from: number;
	span: number;
}

/**
 * Finds an open port by binding one and letting it go again, which is the only
 * way to ask the machine rather than guess at what it is running.
 */
export class OpenPortProvider implements PortProvider {
	private readonly from: number;
	private readonly to: number;

	constructor({ from, to = from }: PortRange) {
		assert.integer(from, `port ${from} is not a whole number`);
		assert.integer(to, `port ${to} is not a whole number`);
		assert.inRange(
			from,
			0,
			MAX_PORT,
			`port ${from} is outside 0 to ${MAX_PORT}`,
		);
		// one check for both ends: a range that ends below where it starts covers
		// nothing, and one that ends past the last port asks for a port that cannot exist
		assert.inRange(to, from, MAX_PORT, `no ports between ${from} and ${to}`);
		this.from = from;
		this.to = to;
	}

	/** `span` ports from `from` on, which is what a dev server wants. */
	static span({ from, span }: PortSpan): OpenPortProvider {
		assert.integer(span, `a span of ${span} is not a whole number`);
		assert.inRange(span, 1, MAX_PORT + 1, `a span of ${span} covers no ports`);
		// clamped: a span is how far to look, so asking to look past the last port
		// there is means a shorter search, not a mistake
		return new OpenPortProvider({
			from,
			to: Math.min(from + span - 1, MAX_PORT),
		});
	}

	/** Any port at all: 0 comes back, and whatever binds it is what chooses. */
	static any(): OpenPortProvider {
		return new OpenPortProvider({ from: 0 });
	}

	async get(): Promise<number> {
		for (let port = this.from; port <= this.to; port++) {
			// sequential on purpose: the first open port is the answer, and probing
			// the rest in parallel would bind ports nobody asked about
			if (await this.open(port)) {
				return port;
			}
		}
		throw new Error(`no open port between ${this.from} and ${this.to}`);
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
