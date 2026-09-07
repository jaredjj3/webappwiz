export type RpcErrorCode =
	| "request_invalid"
	| "output_invalid"
	| "response_invalid"
	| "handler_error"
	| "internal_error"
	| "method_not_found"
	| "method_not_allowed"
	| "request_too_large";
/** HTTP failures and local validation failures share a shape; local failures use status 0. */
export class RpcError extends Error {
	constructor(
		readonly status: number,
		message: string,
		readonly code: RpcErrorCode = "handler_error",
	) {
		super(message);
		this.name = "RpcError";
	}
}
