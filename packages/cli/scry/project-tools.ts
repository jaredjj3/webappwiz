import {
	BatchedDecider,
	CachedDecider,
	CountingJudge,
	type Decider,
	type DeciderUsage,
	Decisions,
	type Tools,
} from "@webappwiz/scry";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import type { ByEffort, Models, Role } from "../config";
import { ProjectCredentials } from "../creds/project-credentials";
import type { Allowance, Spending } from "./budgets";
import { EffortDecider } from "./effort-decider";
import { OnDemandJudge } from "./on-demand-judge";
import { HostedProviders, type Providers } from "./providers";

/** Where a project keeps the answers its models were given, between runs. */
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
	/**
	 * Counts what each request would spend instead of sending it, answering
	 * every question no, and keeps none of those answers. False by default.
	 */
	counting?: boolean;
	/** What each role may spend; no limit on one left out. */
	budgets?: Partial<Record<Role, Allowance>>;
	/** What makes the judge for a model; Workers AI, TypeSafe and Anthropic by default. */
	providers?: Providers;
	fs?: Fs;
	ps?: Ps;
}

/** One model a role asks, at one effort or more. */
interface Asked {
	role: Role;
	model: string;
	batched: BatchedDecider;
	cached: CachedDecider;
}

/**
 * The tools a project's rules are built with: a decision model and a
 * language model, the one for the effort each question asks at, each asked
 * only once a rule asks it and batched per file, with every answer kept for
 * the next run and for `wiz scry why`.
 */
export class ProjectTools {
	private constructor(
		/** What rules are built with. */
		readonly tools: Tools,
		private asked: Asked[],
		private decisions: Decisions,
		private counting: boolean,
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
		const asked: Asked[] = [];
		// one decider for each model a role asks, however many efforts ask
		// it, so the questions to it share requests and a tally its budget holds
		const ask = (role: Role): Decider => {
			const tally: DeciderUsage = { requests: 0, questions: 0, input: 0 };
			const chain = (model: string): Decider => {
				const known = asked.find(
					(each) => each.role === role && each.model === model,
				);
				if (known !== undefined) {
					return known.cached;
				}
				const judge = new OnDemandJudge(providers, model);
				const batched = new BatchedDecider(
					opts.counting ? new CountingJudge(judge) : judge,
					{
						jobs: opts.jobs,
						signal: opts.signal,
						budget: opts.budgets?.[role],
						tally,
					},
				);
				const cached = new CachedDecider(batched, decisions, { model });
				asked.push({ role, model, batched, cached });
				return cached;
			};
			const models: ByEffort<string> = opts.models[role];
			return new EffortDecider(
				Object.fromEntries(
					Object.entries(models).map(([effort, model]) => [
						effort,
						chain(model),
					]),
				) as ByEffort<Decider>,
			);
		};
		return new ProjectTools(
			{ som: ask("som"), llm: ask("llm") },
			asked,
			decisions,
			opts.counting ?? false,
		);
	}

	/** What both models were asked, and what it cost. */
	get spent(): Spent {
		const usage = this.asked.map((each) => each.batched.usage);
		return {
			requests: sum(usage.map((each) => each.requests)),
			questions: sum(usage.map((each) => each.questions)),
			input: sum(usage.map((each) => each.input)),
			cached: sum(this.asked.map((each) => each.cached.hits)),
		};
	}

	/** The input tokens `role` spent, or would have, when counting, over every model it asks. */
	input(role: Role): number {
		return sum(
			this.asked
				.filter((each) => each.role === role)
				.map((each) => each.batched.usage.input),
		);
	}

	/** What each model spent, for the ledger, as of `at`. */
	spending(at: number): Spending[] {
		return this.asked.map(({ role, model, batched }) => ({
			at,
			role,
			model,
			input: batched.usage.input,
		}));
	}

	/** Of the questions asked so far, how many the models have answered. */
	get answered(): number {
		return sum(this.asked.map((each) => each.batched.answered));
	}

	/** Keeps the answers for the next run; none, when it only counted. */
	async save(): Promise<void> {
		if (!this.counting) {
			await this.decisions.save();
		}
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

/**
 * What a check would cost, as `--cost` says it: an estimate first, since
 * only some providers count tokens exactly, then what it would ask.
 */
export function wouldAsk(spent: Spent, files: number): string {
	const cached =
		spent.cached === 0 ? "" : `, ${spent.cached} answered from earlier runs`;
	const scope = `${files} ${plural(files, "file")}`;
	if (spent.questions === 0) {
		return `no input tokens to check ${scope}: no questions to ask${cached}`;
	}
	return `estimated ${thousands(spent.input)} input tokens to check ${scope}: ${spent.questions} ${plural(spent.questions, "question")} in ${spent.requests} ${plural(spent.requests, "request")}${cached}`;
}

export function plural(count: number, noun: string): string {
	return count === 1 ? noun : `${noun}s`;
}

/** Tokens as a report says them: 300, 6.5k, 42k, 1.2m, 20m. */
export function thousands(tokens: number): string {
	if (tokens < 1000) {
		return String(tokens);
	}
	// a decimal while it still tells two numbers apart: 6.5k cached of 7k
	const [unit, size] = tokens < 1_000_000 ? ["k", 1000] : ["m", 1_000_000];
	return tokens < size * 10
		? `${Number((tokens / size).toFixed(1))}${unit}`
		: `${Math.round(tokens / size)}${unit}`;
}
