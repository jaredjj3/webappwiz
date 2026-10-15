import type { Limit, Spend } from "@webappwiz/scry/config";
import { within } from "./budgets";

/**
 * What a role may spend, as written on the command line: `nothing`,
 * `unlimited`, or limits joined by commas, each tokens over a window, like
 * `5m/day` or `2m/month,300k/7d`. Throws, saying what to write, otherwise.
 */
export function parseSpend(text: string): Spend {
	const said = text.trim();
	if (said === "nothing" || said === "unlimited") {
		return said;
	}
	const limits = said.split(",").map((each): Limit => {
		const [amount, window, ...rest] = each.trim().split("/");
		if (amount === undefined || window === undefined || rest.length > 0) {
			throw new Error(
				`expected "nothing", "unlimited", or limits like 5m/day or 2m/month,300k/7d, got "${text}"`,
			);
		}
		const tokens = parseTokens(amount);
		if (PERIODS.includes(window)) {
			return { tokens, per: window as Limit["per"] & string };
		}
		within(window);
		return { tokens, within: window as `${number}d` };
	});
	return limits.length === 1 ? (limits[0] as Limit) : limits;
}

/** A count of tokens, like `300`, `300k`, `1.5m` or `5_000_000`. */
export function parseTokens(text: string): number {
	const match = /^(\d+(?:\.\d+)?)([km]?)$/i.exec(text.trim().replace(/_/g, ""));
	if (match === null) {
		throw new Error(
			`expected tokens, like 300k, 1.5m or 5_000_000, got "${text}"`,
		);
	}
	const scale = { "": 1, k: 1000, m: 1_000_000 }[
		(match[2] ?? "").toLowerCase() as "" | "k" | "m"
	];
	return Math.round(Number(match[1]) * scale);
}

/** `spend` as `parseSpend` reads it back: `5m/day`, `2m/month,300k/7d`. */
export function saySpend(spend: Spend): string {
	if (spend === "nothing" || spend === "unlimited") {
		return spend;
	}
	return (Array.isArray(spend) ? spend : [spend])
		.map((limit) => `${sayTokens(limit.tokens)}/${limit.per ?? limit.within}`)
		.join(",");
}

/** Tokens exactly, as `parseTokens` reads them: `300`, `300k`, `1.5m`. */
export function sayTokens(tokens: number): string {
	if (tokens >= 1_000_000 && Number.isInteger(tokens / 1000)) {
		return `${tokens / 1_000_000}m`;
	}
	return tokens >= 1000 && Number.isInteger(tokens / 1000)
		? `${tokens / 1000}k`
		: String(tokens);
}

const PERIODS = ["check", "day", "week", "month"];
