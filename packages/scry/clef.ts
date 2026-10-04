import type { Judge, JudgeOptions, Judgment, Verdict } from "./judge";
import { SystemOneEndpoint } from "./system-one-endpoint";

/**
 * Cloudflare's decision models: `clef`, the larger and more careful, and
 * `clef-flash`, the smaller and several times faster.
 */
export type ClefModel = "clef" | "clef-flash";
export const CLEF_MODELS = ["clef", "clef-flash"] as const;

/** The Cloudflare account Workers AI bills a judgment to. */
export interface CloudflareAccount {
	/** The account id, from the dashboard. */
	id: string;
	/** An API token with Workers AI read access. */
	token: string;
}

/** Where Clef is reached. */
export interface ClefOptions {
	/** `https://api.cloudflare.com` when not given. */
	origin?: string;
}

/** Clef on Cloudflare Workers AI. */
export class Clef implements Judge {
	private endpoint: SystemOneEndpoint;

	constructor(
		readonly model: ClefModel,
		account: CloudflareAccount,
		opts: ClefOptions = {},
	) {
		const origin = opts.origin ?? "https://api.cloudflare.com";
		this.endpoint = new SystemOneEndpoint(
			`${origin}/client/v4/accounts/${account.id}/ai/run/@cf/cloudflare/${model}`,
			account.token,
		);
	}

	judge(judgment: Judgment, opts: JudgeOptions = {}): Promise<Verdict> {
		return this.endpoint.judge(judgment, opts);
	}
}
