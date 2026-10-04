import {
	BatchedDecider,
	CachedDecider,
	type Decider,
	type DeciderUsage,
	Decisions,
	type Span,
} from "@webappwiz/scry";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import { ProjectCredentials } from "../credentials/project-credentials";
import { OnDemandJudge } from "./on-demand-judge";
import { HostedProviders, type Providers } from "./providers";

/** Where a project keeps the answers its decider was given, between runs. */
export const DECISIONS = "node_modules/.cache/webappwiz/scry/decisions.json";

/** What a decider spent. */
export interface Spent extends DeciderUsage {
	/** Questions answered from what was kept from an earlier run. */
	cached: number;
}

export interface ProjectDeciderOptions {
	model: string;
	/** How many requests to the model are out at once. */
	jobs: number;
	/** Stops it: what is out and what waits fails. */
	signal?: AbortSignal;
	/** What makes the judge for a model; Workers AI and TypeSafe by default. */
	providers?: Providers;
	fs?: Fs;
	ps?: Ps;
}

/**
 * The decider a project's rules are built with: a decision model, asked
 * only once a rule asks and batched per file, with every answer kept for the
 * next run and for `wiz scry why`.
 */
export class ProjectDecider implements Decider {
	private constructor(
		private batched: BatchedDecider,
		private cached: CachedDecider,
		private decisions: Decisions,
	) {}

	static async open(
		dir: string,
		opts: ProjectDeciderOptions,
	): Promise<ProjectDecider> {
		const fs = opts.fs ?? new NodeFs();
		const ps = opts.ps ?? new NodePs();
		const providers =
			opts.providers ??
			new HostedProviders(
				(await ProjectCredentials.open(dir, { fs, ps })).credentials,
			);
		const batched = new BatchedDecider(
			new OnDemandJudge(providers, opts.model),
			{
				jobs: opts.jobs,
				signal: opts.signal,
			},
		);
		const decisions = await Decisions.open(`${dir}/${DECISIONS}`, { fs });
		return new ProjectDecider(
			batched,
			new CachedDecider(batched, decisions, opts.model),
			decisions,
		);
	}

	decide(question: string, about: Span): Promise<number> {
		return this.cached.decide(question, about);
	}

	get spent(): Spent {
		return { ...this.batched.usage, cached: this.cached.hits };
	}

	/** Keeps the answers for the next run. */
	save(): Promise<void> {
		return this.decisions.save();
	}
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
