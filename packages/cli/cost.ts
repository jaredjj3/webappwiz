import { join } from "node:path";
import type { Fs } from "@webappwiz/sys";

/**
 * Input price in dollars per million tokens, for each model `--agent` names.
 *
 * Hardcoded because there is nothing to fetch: `/v1/models` publishes what a
 * model can do, not what it charges, and the only official price list is a
 * documentation page written for people. Check it when a model changes:
 * https://platform.claude.com/docs/en/pricing
 */
const PRICES: Record<string, number> = { haiku: 1, sonnet: 3, opus: 5 };

/** The agents an estimate can price, which is every one `--agent` accepts. */
export const priced = (): string[] => Object.keys(PRICES);

/**
 * What those tokens cost to read on that agent, or undefined for an agent with
 * no published price, which is any `--exec` command.
 *
 * A floor twice over: it counts input only, and only the input a plan can see.
 */
export function floor(agent: string, tokens: number): number | undefined {
	const price = PRICES[agent];
	return price === undefined ? undefined : (tokens / 1_000_000) * price;
}

/**
 * Dollars a single call costs beyond the files it was given, per agent.
 *
 * Everything the floor cannot see is charged per call, not per byte: the agent
 * pays for its own system prompt every time it is spawned, and on this project
 * that is most of a small call's bill. Measuring it per call is what lets a
 * figure taken from a two-call run stand up to a fifteen-call one.
 */
export type Overheads = Record<string, number>;

const FILE = join(".wiz", "judge-cost.json");

/**
 * What past runs in `root` measured, empty until one has finished there. A
 * missing or unreadable file is empty rather than an error: a calibration is a
 * convenience, and losing it costs the caller a worse estimate, not a run.
 */
export async function overheads(fs: Fs, dir: string): Promise<Overheads> {
	try {
		const parsed: unknown = JSON.parse(await fs.read(join(dir, FILE)));
		if (typeof parsed !== "object" || parsed === null) {
			return {};
		}
		return Object.fromEntries(
			Object.entries(parsed).filter(
				([, call]) => typeof call === "number" && call > 0,
			),
		);
	} catch {
		return {};
	}
}

/**
 * Records what a call on this agent costs over its floor, so the next
 * `--estimate` has something better than one. Other agents are left alone,
 * since each is a separate measurement.
 */
export async function calibrate(
	fs: Fs,
	dir: string,
	agent: string,
	call: number,
): Promise<void> {
	const recorded = { ...(await overheads(fs, dir)), [agent]: call };
	await fs.mkdir(join(dir, ".wiz"));
	await fs.write(join(dir, FILE), `${JSON.stringify(recorded, null, "\t")}\n`);
}

/**
 * What a plan costs on one agent: the price of the files it names, plus what
 * every call charges on top. Undefined for an agent with no listed price, and
 * the floor alone until a run has measured one.
 */
export function predict(
	agent: string,
	tokens: number,
	calls: number,
	measured: Overheads,
): number | undefined {
	const listed = floor(agent, tokens);
	const call = measured[agent];
	return listed === undefined || call === undefined
		? listed
		: listed + call * calls;
}
