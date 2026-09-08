import type { Middleware, RequestContext } from "webappwiz/rpc";

export interface TimingLogger {
	info(entry: { method: string; durationMs: number }): void;
}

/** A reusable middleware with an injected logger; no inheritance is required. */
export class TimingMiddleware implements Middleware {
	constructor(private readonly logger: TimingLogger) {}

	async handle(ctx: RequestContext, next: () => Promise<void>): Promise<void> {
		const start = performance.now();
		try {
			await next();
		} finally {
			this.logger.info({
				method: ctx.method,
				durationMs: performance.now() - start,
			});
		}
	}
}
