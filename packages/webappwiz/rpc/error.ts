/**
 * An error with an HTTP status. Handlers throw it to answer with a specific
 * status; the client throws it back so callers can branch on `status`.
 */
export class RpcError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "RpcError";
	}
}
