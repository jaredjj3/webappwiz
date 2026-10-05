import {
	CLEF_MODELS,
	Clef,
	type ClefModel,
	Jev,
	type Judge,
} from "@webappwiz/scry";
import type { Credentials } from "webappwiz/creds";

/** What makes the judge a model name stands for. */
export interface Providers {
	/** Throws when the name is no model it knows, or its credentials are missing. */
	judge(model: string): Promise<Judge>;
}

/**
 * Clef on Cloudflare Workers AI and Jev on TypeSafe, with their credentials
 * from the environment or the system's store: `CLOUDFLARE_ACCOUNT_ID` and
 * `CLOUDFLARE_API_TOKEN` for Clef, `TYPESAFE_API_KEY` for Jev.
 */
export class HostedProviders implements Providers {
	constructor(private readonly credentials: Credentials) {}

	async judge(model: string): Promise<Judge> {
		if (isClef(model)) {
			const [id = "", token = ""] = await this.need(
				model,
				"CLOUDFLARE_ACCOUNT_ID",
				"CLOUDFLARE_API_TOKEN",
			);
			return new Clef(model, { id, token });
		}
		if (/^jev-[\w.-]+$/.test(model)) {
			const [token = ""] = await this.need(model, "TYPESAFE_API_KEY");
			return new Jev(model, token);
		}
		throw new Error(
			`no model "${model}": scry knows ${CLEF_MODELS.join(", ")}, and Jev by TypeSafe's names, like jev-latest`,
		);
	}

	/** The values of `names`, in order, or an error naming every one that is unset. */
	private async need(model: string, ...names: string[]): Promise<string[]> {
		const values = await Promise.all(
			names.map(async (name) => (await this.credentials.get(name)) ?? ""),
		);
		const missing = names.filter((_, index) => values[index] === "");
		if (missing.length > 0) {
			throw new Error(
				`${model} needs ${missing.join(" and ")}: ask a person to run ${missing.map((name) => `\`bunx @webappwiz/cli creds add ${name}\``).join(" and ")}, or set ${missing.length === 1 ? "it" : "them"} in the environment`,
			);
		}
		return values;
	}
}

function isClef(model: string): model is ClefModel {
	return (CLEF_MODELS as readonly string[]).includes(model);
}
