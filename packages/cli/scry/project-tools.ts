import {
	BatchedDecider,
	CachedDecider,
	type DeciderUsage,
	Decisions,
	type Tools,
} from "@webappwiz/scry";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import type { Models } from "../config";
import { ProjectCredentials } from "../creds/project-credentials";
import { OnDemandJudge } from "./on-demand-judge";
import { HostedProviders, type Providers } from "./providers";

/** Where a project keeps the answers its decider was given, between runs. */
export const DECISIONS = "node_modules/.cache/webappwiz/scry/decisions.json";

/** What a project's models were asked, and what it cost. */
export interface Spent extends DeciderUsage {
	/** Questions answered from what was kept from an earlier run. */
	cached: number;
}

export interface ProjectToolsOptions {
	/** The models the rules' tools ask. */
	models: Models;
	/** How many requests to each model are out at once. */
	jobs: number;
	/** Stops it: what is out and what waits fails. */
	signal?: AbortSignal;
	/** What makes the judge for a model; Workers AI, TypeSafe and Anthropic by default. */
	providers?: Providers;
	fs?: Fs;
	ps?: Ps;
}

/**
 * The tools a project's rules are built with: a decision model and a
 * language model, each asked only once a rule asks it and batched per file,
 * with every answer kept for the next run and for `wiz scry why`.
 */
export class ProjectTools {
	private constructor(
		/** What rules are built with. */
		readonly tools: Tools,
		private batched: BatchedDecider[],
		private cached: CachedDecider[],
		private decisions: Decisions,
	) {}

	static async open(
		dir: string,
		opts: ProjectToolsOptions,
	): Promise<ProjectTools> {
		const fs = opts.fs ?? new NodeFs();
		const ps = opts.ps ?? new NodePs();
		const providers =
			opts.providers ??
			new HostedProviders(
				(await ProjectCredentials.open(dir, { fs, ps })).credentials,
			);
		const decisions = await Decisions.open(`${dir}/${DECISIONS}`, { fs });
		const ask = (model: string) => {
			const batched = new BatchedDecider(new OnDemandJudge(providers, model), {
				jobs: opts.jobs,
				signal: opts.signal,
			});
			return {
				batched,
				cached: new CachedDecider(batched, decisions, { model }),
			};
		};
		const decider = ask(opts.models.decider);
		const llm = ask(opts.models.llm);
		return new ProjectTools(
			{ decider: decider.cached, llm: llm.cached },
			[decider.batched, llm.batched],
			[decider.cached, llm.cached],
			decisions,
		);
	}

	/** What both models were asked, and what it cost. */
	get spent(): Spent {
		return {
			requests: sum(this.batched.map((each) => each.usage.requests)),
			questions: sum(this.batched.map((each) => each.usage.questions)),
			input: sum(this.batched.map((each) => each.usage.input)),
			cached: sum(this.cached.map((each) => each.hits)),
		};
	}

	/** Of the questions asked so far, how many the models have answered. */
	get answered(): number {
		return sum(this.batched.map((each) => each.answered));
	}

	/** Keeps the answers for the next run. */
	save(): Promise<void> {
		return this.decisions.save();
	}
}

function sum(counts: number[]): number {
	return counts.reduce((total, count) => total + count, 0);
}

/** What a decider asked, and what it cost, as a report's last line says it. */
export function asked(spent: Spent): string {
	const cached =
		spent.cached === 0 ? "" : `, ${spent.cached} answered from earlier runs`;
	const tokens =
		spent.input === 0 ? "" : `, ${thousands(spent.input)} input tokens`;
	return `  asked ${spent.questions} ${plural(spent.questions, "question")} in ${spent.requests} ${plural(spent.requests, "request")}${cached}${tokens}`;
}

export function plural(count: number, noun: string): string {
	return count === 1 ? noun : `${noun}s`;
}

function thousands(tokens: number): string {
	if (tokens < 1000) {
		return String(tokens);
	}
	// a decimal while it still tells two numbers apart: 6.5k cached of 7k
	return tokens < 10_000
		? `${Number((tokens / 1000).toFixed(1))}k`
		: `${Math.round(tokens / 1000)}k`;
}
