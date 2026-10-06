import { describe, expect, it } from "bun:test";
import { BatchedDecider } from "./batched-decider";
import type { Judge, Judgment, Verdict } from "./judge";
import { SourceFile } from "./source-file";
import { Span } from "./span";
import { FakeJudge } from "./testing";

describe("BatchedDecider", () => {
	/** Answers each question by the line it is about, so every answer is told apart. */
	const measuring = (): Judge & { judgments: Judgment[] } => {
		const judgments: Judgment[] = [];
		return {
			judgments,
			judge: async (judgment) => {
				judgments.push(judgment);
				return {
					answers: new Map(
						Object.entries(judgment.questions).map(([id, question]) => [
							id,
							Number(/line (\d+)/.exec(question.instructions)?.[1]) / 10,
						]),
					),
				};
			},
			count: async () => 0,
		};
	};
	const cart = new SourceFile("src/cart.ts", "a\nb\nc\nd\ne\n");
	const tax = new SourceFile("src/tax.ts", "a\nb\n");
	const at = (file: SourceFile, line: number) =>
		new Span(file, line, file.lines[line - 1] ?? "");

	it("asks the questions about one file asked at the same time in one request, with the file as its state", async () => {
		const judge = measuring();
		const decider = new BatchedDecider(judge);

		const answers = await Promise.all([
			decider.decide("Is it short?", at(cart, 1)),
			decider.decide("Is it long?", at(cart, 5)),
		]);

		expect(answers).toEqual([0.1, 0.5]);
		expect(judge.judgments).toHaveLength(1);
		expect(judge.judgments[0]?.state).toEqual({
			path: "src/cart.ts",
			file: "1  a\n2  b\n3  c\n4  d\n5  e\n6  ",
		});
		expect(judge.judgments[0]?.questions.q1?.instructions).toEqual(
			"About line 5 of `file`: Is it long?",
		);
	});

	it("never puts two files in one request", async () => {
		const judge = measuring();
		const decider = new BatchedDecider(judge);

		await Promise.all([
			decider.decide("Is it?", at(cart, 1)),
			decider.decide("Is it?", at(tax, 1)),
		]);

		expect(judge.judgments.map((judgment) => judgment.state.path)).toEqual([
			"src/cart.ts",
			"src/tax.ts",
		]);
	});

	it("splits a file's questions into requests of at most the question limit", async () => {
		const judge = measuring();
		const decider = new BatchedDecider(judge, { questions: 2 });

		await Promise.all(
			[1, 2, 3, 4, 5].map((line) => decider.decide("Is it?", at(cart, line))),
		);

		expect(
			judge.judgments.map((judgment) => Object.keys(judgment.questions).length),
		).toEqual([2, 2, 1]);
	});

	it("never asks two questions about the same line in one request", async () => {
		const judge = measuring();
		const decider = new BatchedDecider(judge);

		await Promise.all([
			decider.decide("Is it short?", at(cart, 1)),
			decider.decide("Is it long?", at(cart, 1)),
			decider.decide("Is it short?", at(cart, 3)),
		]);

		expect(
			judge.judgments.map((judgment) =>
				Object.values(judgment.questions).map(
					(question) => question.instructions,
				),
			),
		).toEqual([
			[
				"About line 1 of `file`: Is it long?",
				"About line 3 of `file`: Is it short?",
			],
			["About line 1 of `file`: Is it short?"],
		]);
	});

	it("never asks about overlapping lines in one request", async () => {
		const judge = measuring();
		const decider = new BatchedDecider(judge);

		await Promise.all([
			decider.decide("Is it?", new Span(cart, 1, "a\nb\nc")),
			decider.decide("Is it?", at(cart, 3)),
			decider.decide("Is it?", at(cart, 4)),
		]);

		expect(
			judge.judgments.map((judgment) =>
				Object.values(judgment.questions).map(
					(question) => question.instructions,
				),
			),
		).toEqual([
			[
				"About lines 1 to 3 of `file`: Is it?",
				"About line 4 of `file`: Is it?",
			],
			["About line 3 of `file`: Is it?"],
		]);
	});

	it("makes the same requests from the same questions, in whatever order they were asked", async () => {
		const asked = [
			{ question: "Is it?", about: at(tax, 1) },
			{ question: "Is it short?", about: at(cart, 2) },
			{ question: "Is it long?", about: at(cart, 2) },
			{ question: "Is it?", about: at(cart, 1) },
			{ question: "Is it?", about: at(cart, 4) },
		];
		const requests = async (order: typeof asked) => {
			const judge = measuring();
			const decider = new BatchedDecider(judge);
			await Promise.all(
				order.map(({ question, about }) => decider.decide(question, about)),
			);
			return judge.judgments;
		};

		expect(await requests(asked.toReversed())).toEqual(await requests(asked));
	});

	it("asks a question asked after an answer came back in a request of its own", async () => {
		const judge = measuring();
		const decider = new BatchedDecider(judge);

		await decider.decide("Is it?", at(cart, 1));
		await decider.decide("Is it?", at(cart, 2));

		expect(judge.judgments).toHaveLength(2);
	});

	it("fails every question in a request that failed", async () => {
		const decider = new BatchedDecider(new FakeJudge(new Error("down")));

		const results = await Promise.allSettled([
			decider.decide("Is it?", at(cart, 1)),
			decider.decide("Is it?", at(cart, 2)),
		]);

		expect(results.map((result) => result.status)).toEqual([
			"rejected",
			"rejected",
		]);
	});

	it("keeps at most `jobs` requests out at once, and sends the rest as they come back", async () => {
		const files = [1, 2, 3].map(
			(index) => new SourceFile(`src/${index}.ts`, "a\n"),
		);
		let out = 0;
		let most = 0;
		const judge = measuring();
		const decider = new BatchedDecider(
			{
				judge: async (judgment) => {
					out++;
					most = Math.max(most, out);
					await new Promise((resolve) => setTimeout(resolve, 5));
					out--;
					return judge.judge(judgment);
				},
				count: async () => 0,
			},
			{ jobs: 2 },
		);

		await Promise.all(
			files.map((file) => decider.decide("Is it?", at(file, 1))),
		);

		expect([most, judge.judgments.length]).toEqual([2, 3]);
	});

	it("counts the requests it sent, the questions they asked, and the input tokens they spent", async () => {
		const decider = new BatchedDecider(new FakeJudge(0.5, { input: 300 }));

		await Promise.all([
			decider.decide("Is it?", at(cart, 1)),
			decider.decide("Is it?", at(cart, 2)),
			decider.decide("Is it?", at(tax, 1)),
		]);

		expect(decider.usage).toEqual({ requests: 2, questions: 3, input: 600 });
	});

	it("counts what a request spent when the judge does not say", async () => {
		const judge = measuring();
		judge.count = async () => 120;
		const decider = new BatchedDecider(judge);

		await decider.decide("Is it?", at(cart, 1));

		expect(decider.usage.input).toEqual(120);
	});

	it("sends nothing once it has spent its budget, failing what waits with the reason", async () => {
		const judge = new FakeJudge(0.5, { input: 300 });
		const decider = new BatchedDecider(judge, {
			jobs: 1,
			budget: { input: 300, reason: "over the llm budget for today" },
		});

		const answers = await Promise.allSettled([
			decider.decide("Is it?", at(cart, 1)),
			decider.decide("Is it?", at(tax, 1)),
		]);

		expect([
			answers.map((each) =>
				each.status === "fulfilled" ? each.value : String(each.reason),
			),
			judge.judgments.length,
		]).toEqual([[0.5, "Error: over the llm budget for today"], 1]);
	});

	it("holds deciders sharing a tally to one budget, each keeping its own usage", async () => {
		const tally = { requests: 0, questions: 0, input: 0 };
		const budget = { input: 300, reason: "over the decider budget" };
		const clef = new BatchedDecider(new FakeJudge(0.5, { input: 300 }), {
			budget,
			tally,
		});
		const jev = new BatchedDecider(new FakeJudge(0.5), { budget, tally });

		await clef.decide("Is it?", at(cart, 1));
		const answer = await jev.decide("Is it?", at(cart, 1)).catch(String);

		expect([answer, clef.usage.input, jev.usage.input, tally.input]).toEqual([
			"Error: over the decider budget",
			300,
			0,
			300,
		]);
	});

	it("asks nothing on a budget of 0", async () => {
		const judge = new FakeJudge(0.5);
		const decider = new BatchedDecider(judge, {
			budget: { input: 0, reason: "scry.budgets spends nothing on the llm" },
		});

		const answer = decider.decide("Is it?", at(cart, 1));

		expect([await answer.catch(String), judge.judgments.length]).toEqual([
			"Error: scry.budgets spends nothing on the llm",
			0,
		]);
	});

	it("counts the questions answered apart from those asked, while a request is out", async () => {
		let reply: ((verdict: Verdict) => void) | undefined;
		const decider = new BatchedDecider({
			judge: () =>
				new Promise<Verdict>((resolve) => {
					reply = resolve;
				}),
			count: async () => 0,
		});
		const answers = Promise.all([
			decider.decide("Is it?", at(cart, 1)),
			decider.decide("Is it?", at(cart, 2)),
		]);
		// until the request is out, a reply would answer nothing and the
		// questions would wait forever
		while (reply === undefined) {
			await new Promise((resolve) => setTimeout(resolve, 1));
		}

		expect([decider.usage.questions, decider.answered]).toEqual([2, 0]);
		reply({
			answers: new Map([
				["q0", 0.5],
				["q1", 0.5],
			]),
		});
		await answers;
		expect([decider.usage.questions, decider.answered]).toEqual([2, 2]);
	});

	it("fails what is out, what waits, and what is asked after, once stopped", async () => {
		const cancel = new AbortController();
		const decider = new BatchedDecider(
			{ judge: () => new Promise(() => undefined), count: async () => 0 },
			{ jobs: 1, signal: cancel.signal },
		);
		const out = decider.decide("Is it?", at(cart, 1));
		const waiting = decider.decide("Is it?", at(tax, 1));
		await new Promise((resolve) => setTimeout(resolve, 5));

		cancel.abort();

		const results = await Promise.allSettled([
			out,
			waiting,
			decider.decide("Is it?", at(cart, 2)),
		]);
		expect(
			results.map((result) =>
				result.status === "rejected" ? `${result.reason}` : result.status,
			),
		).toEqual(["Error: cancelled", "Error: cancelled", "Error: cancelled"]);
		expect(decider.usage.requests).toEqual(1);
	});
});
