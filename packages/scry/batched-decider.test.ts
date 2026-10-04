import { describe, expect, it } from "bun:test";
import { BatchedDecider } from "./batched-decider";
import type { Judge, Judgment } from "./judge";
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

	it("fails what is out, what waits, and what is asked after, once stopped", async () => {
		const cancel = new AbortController();
		const decider = new BatchedDecider(
			{ judge: () => new Promise(() => undefined) },
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
