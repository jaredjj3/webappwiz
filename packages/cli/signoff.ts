import {
	type Agent,
	agentCommand,
	type Finding,
	Harness,
	type Review,
	type Rule,
	prompt as reviewPrompt,
} from "@webappwiz/rules";
import { ConsoleLogger, color, type Logger } from "webappwiz/log";
import { NodePs, type Ps } from "webappwiz/system";
import { type Clock, SystemClock } from "webappwiz/time";
import { diff } from "./changed";
import { mode } from "./mode";
import { count, divider, tokens } from "./report";

export interface SignoffRunOptions {
	/** The directory whose change is being weighed. */
	dir: string;
	agent?: string;
	exec?: string;
	/** Print the rules to the logger and spawn nothing, for the reader who is
	 * going to apply them itself. */
	print?: boolean;
	/** The ref the change is measured against: everything since it is the
	 * change. */
	since: string;
}

/**
 * Weighs a change against the rules that decide whether it can merge on its
 * own or needs a person to look at it first.
 *
 * One agent call over the diff, rather than one per file like `judge`: these
 * rules are about the change as a whole, and a run that saw one file at a time
 * could not answer them. Exits 1 with a reason when the change needs a person,
 * so it reads the same to a merge gate as to whoever ran it.
 */
/** What a `Signoff` runs through. */
export interface SignoffOptions {
	log?: Logger;
	ps?: Ps;
	clock?: Clock;
}

export class Signoff {
	private log: Logger;
	private ps: Ps;
	private clock: Clock;

	constructor(
		private rules: Rule[],
		private defaultAgent: string,
		opts: SignoffOptions = {},
	) {
		this.log = opts.log ?? new ConsoleLogger();
		this.ps = opts.ps ?? new NodePs();
		this.clock = opts.clock ?? new SystemClock();
	}

	async run(opts: SignoffRunOptions): Promise<void> {
		if (mode(opts) === "print") {
			this.print();
			return;
		}
		const dir = opts.dir.replace(/\/+$/, "") || "/";
		const { patch, added } = await diff(dir, opts.since, { ps: this.ps });
		if (patch === "" && added.length === 0) {
			this.log.info(`nothing has changed since ${opts.since}`);
			return;
		}
		const agent = agentCommand(
			opts.exec === undefined
				? { agent: opts.agent ?? this.defaultAgent }
				: opts,
		);
		const review = this.review(patch, added, opts.since);
		this.log.info(
			`weighing ${opts.since}..working tree against ` +
				`${count(this.rules.length, "rule")}, reading ` +
				`${tokens(review.bytes ?? 0)}+ tokens with ${agent.label}`,
		);
		this.say(await this.judge(review, agent, dir));
	}

	/** The one call, and what it says about the change. */
	private async judge(
		review: Review,
		agent: Agent,
		dir: string,
	): Promise<Finding[]> {
		const harness = new Harness({
			log: this.log,
			ps: this.ps,
			clock: this.clock,
		});
		harness.events.on("finished", ({ took, tokens: read }) => {
			const spent = read === undefined ? "" : `  ${read} tokens`;
			this.log.info(color.gray(`read in ${took.human()}${spent}`));
		});
		return await harness.run([review], agent, { cwd: dir });
	}

	/**
	 * The verdict, and a reason for each rule that wants a person. Throws on any
	 * of them: an agent that ran this before merging should escalate rather than
	 * merge, and an exit code is what says so whoever is reading.
	 */
	private say(findings: Finding[]): void {
		if (findings.length === 0) {
			this.log.info(color.green("✓ nothing in this change needs a person"));
			return;
		}
		for (const finding of findings) {
			const where =
				finding.file === undefined
					? ""
					: `${color.bold(finding.file + (finding.line === undefined ? "" : `:${finding.line}`))}  `;
			this.log.info(
				`  ${where}${finding.message} ${color.gray(`(${finding.rule})`)}`,
			);
		}
		throw new Error(
			`${count(findings.length, "reason")} to escalate rather than merge`,
		);
	}

	/** The change as the agent reads it, priced by the prompt: what a new file
	 * costs to open is the agent's business and unknowable from here. */
	private review(patch: string, added: string[], ref: string): Review {
		const draft: Review = {
			rules: this.rules,
			label: "signoff",
			context: [
				`The change, as \`git diff ${ref}\` prints it:`,
				`\`\`\`diff\n${patch}\n\`\`\``,
				...(added.length === 0
					? []
					: [
							"These files are new and are in no diff yet. Read each one from " +
								"your working directory:",
							added.map((file) => `- ${file}`).join("\n"),
						]),
			].join("\n\n"),
			instructions: WEIGHING,
		};
		return { ...draft, bytes: Buffer.byteLength(reviewPrompt(draft)) };
	}

	/**
	 * The rules in full, for the reader who is going to apply them. Nothing has
	 * to run these: an agent about to merge its own work can weigh it against
	 * them itself, and that is the cheapest signoff there is.
	 */
	private print(): void {
		if (this.rules.length === 0) {
			this.log.info("no signoff rules");
			return;
		}
		this.log.info(
			"Weigh your change against each rule below. Anything that needs " +
				"review goes to a person instead of trunk.",
		);
		for (const rule of this.rules) {
			this.log.info(`\n${divider(rule.id)}\n`);
			this.log.info(rule.document.trim());
		}
		this.log.info(`\n${divider()}`);
	}
}

/** What these rules are for, which the prompt's "report every violation" does
 * not say on its own: a signoff rule is broken by a change that should have
 * waited for a person, not by code that is wrong. */
const WEIGHING = [
	"These rules decide one thing: whether this change can merge on its own, " +
		"or needs a person to look at it first.",
	"",
	"Each rule's `Ships` section is what merges with nobody looking, and its " +
		"`Needs review` section is what does not. Report a violation only for " +
		"what the `Needs review` side covers, and only where the change " +
		"actually does it.",
	"",
	"These rules are about the change as a whole, so leave `file` and `line` " +
		"out unless one place in the change is the whole of the answer.",
].join("\n");
