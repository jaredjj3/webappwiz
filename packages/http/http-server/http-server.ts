import type { Duration } from "@webappwiz/time";

/**
 * HttpServer is the seam that binds a port. Typically, this is assigned the
 * variable name `http`.
 *
 * What it serves is a plain `fetch`, the shape every fetch-style runtime
 * already takes, so a handler written against this runs unchanged on whatever
 * ends up listening for it.
 */
export interface HttpServer {
	serve(handler: Handler, opts: ServeOptions): Promise<Listening>;
}

export type Handler = (request: Request) => Response | Promise<Response>;

export interface ServeOptions {
	/** Pass 0 to take whatever port is free, then read `Listening.port` back. */
	port: number;
	/**
	 * How long a connection may sit idle before it is closed. Zero never closes
	 * one, which is what a server-sent-events stream needs: it is idle by design
	 * between the things it has to say.
	 */
	idleTimeout: Duration;
}

/** A bound port, and the one thing a caller ever wants to do with it. */
export interface Listening {
	/** What was actually bound, which is the point of asking for port 0. */
	port: number;
	/** Resolves once open connections are closed. */
	stop(): Promise<void>;
}
