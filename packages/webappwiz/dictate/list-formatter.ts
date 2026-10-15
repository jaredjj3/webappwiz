import type { Answer, Decider, Question } from "webappwiz/decide";
import type { Cleaned, DictationEdit } from "./dictation-message";
import type { Cleanup } from "./dictation-relay";

/**
 * How sure a segment must be to start a list item (`apply`), and below which
 * it is never offered as one (`leave`); one in between joins the item before
 * it, with an edit to split it off. A segment ends with a colon before a list
 * above `intro`, and a list is numbered when its items average above
 * `ordered` as steps.
 */
export const LIST_THRESHOLDS = {
	apply: 0.6,
	leave: 0.2,
	intro: 0.5,
	ordered: 0.7,
} as const;

/** What a segment can do, as the Choice about it offers. */
const KINDS = {
	intro:
		'It announces a list that follows, such as "I want three things" or "here is the plan".',
	item: "It names one entry in a list of parallel items or steps, one of several sibling entries.",
	continues:
		"It picks up the entry or sentence of the segment before it, finishing it or adding detail, rather than naming a new entry.",
	prose:
		"It is running prose of its own, a sentence that is no part of a list.",
};

/**
 * A {@link Cleanup} that lays out the lists a take speaks as markdown lists:
 * each item on a line of its own without the cue word that opened it,
 * numbered when the items are steps, after a colon on the sentence that
 * announced them. Every word left is one the speaker said. It asks
 * `decider` once per take, and nothing of a take too short to hold a list.
 */
export class ListFormatter implements Cleanup {
	readonly kind = "item";

	constructor(private readonly decider: Decider) {}

	async clean(text: string): Promise<Cleaned> {
		// Dictation has no line breaks, so code proposes where items may
		// start, the decider judges every segment, and code renders.
		const segments = segmentsOf(text);
		if (!mayList(text, segments)) {
			return { text, edits: [] };
		}
		const { answers } = await this.decider.decide(
			segments
				.map((segment, index) => `S${index}| ${slice(text, segment)}`)
				.join("\n"),
			questions(segments.length),
		);
		return render(text, segments, judge(answers, segments.length));
	}
}

/** Words that open a list item when spoken, after an optional "and". */
const CUE =
	"(?:and\\s+)?(?:then|next|also|finally|lastly|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:ly)?|(?:number|step)\\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\\d+))\\b";

/** A list marker already opening a line: `-`, `*` or `1.`, then a space. */
const MARKER = "(?:[-*]|\\d+[.)])[ \\t]+(?=\\S)";

/**
 * Where one segment ends: a sentence end that is no number of a marker, a
 * comma before a cue word, or a line break before a marker.
 */
const BOUNDARY = new RegExp(
	`(?<!(?:^|\\n)[ \\t]*\\d+)[.!?](?=\\s+\\S)|,(?=\\s+${CUE})|(?<=\\S)(?=[ \\t]*\\n[ \\t]*${MARKER})`,
	"giu",
);

/** A marker leading a segment, which a rendered item replaces. */
const LEADING_MARKER = new RegExp(`^${MARKER}`, "u");

/** A cue word leading a segment, with the comma or colon after it. */
const LEADING_CUE = new RegExp(`^${CUE}[,:]?\\s+(?=\\S)`, "iu");

/** A run of the text, `[start, end)`, its punctuation included. */
interface Segment {
	start: number;
	end: number;
}

/** What the decider said about one segment. */
interface Judged {
	/** How likely it starts a new list item. */
	item: number;
	/** How likely it announces a list. */
	intro: number;
	/** What it most likely is, other than an item. */
	otherwise: keyof typeof KINDS;
	/** How likely `otherwise` is. */
	otherwiseLikely: number;
	/** How likely it is one step of an ordered procedure. */
	step: number;
}

function segmentsOf(text: string): Segment[] {
	const segments: Segment[] = [];
	let start = text.search(/\S/);
	if (start < 0) {
		return segments;
	}
	for (const match of text.matchAll(BOUNDARY)) {
		const end = match.index + match[0].length;
		segments.push({ start, end });
		start = end + text.slice(end).search(/\S/);
	}
	segments.push({ start, end: text.trimEnd().length });
	return segments;
}

/**
 * Whether `segments` could hold a list worth a request: three or more, or
 * two with a cue word opening the second, so a take of a sentence or two
 * asks nothing.
 */
function mayList(text: string, segments: Segment[]): boolean {
	return (
		segments.length >= 3 ||
		segments.slice(1).some((segment) => LEADING_CUE.test(slice(text, segment)))
	);
}

/** A Choice on what each segment does, and a Noul on whether it is a step. */
function questions(count: number): Record<string, Question> {
	const asked: Record<string, Question> = {};
	// The first segment has nothing before it to continue.
	const first = Object.fromEntries(
		Object.entries(KINDS).filter(([kind]) => kind !== "continues"),
	);
	for (let index = 0; index < count; index++) {
		asked[`kind.${index}`] = {
			type: "choice",
			instructions: `What does segment S${index} do in the text?`,
			criteria: index === 0 ? first : KINDS,
		};
		asked[`step.${index}`] = {
			type: "noul",
			instructions: `Is segment S${index} one step of a procedure, where the entries around it must happen in order?`,
			criteria: {
				true: "It is one step of a procedure: the entries around it must happen in that order.",
				false:
					"Order is irrelevant: it is one of a loose collection, or no list entry at all.",
			},
		};
	}
	return asked;
}

function judge(answers: Record<string, Answer>, count: number): Judged[] {
	return Array.from({ length: count }, (_, index) => {
		const kind = answers[`kind.${index}`];
		const step = answers[`step.${index}`];
		const probabilities = kind?.type === "choice" ? kind.probabilities : {};
		let otherwise: keyof typeof KINDS = "prose";
		for (const each of ["intro", "continues", "prose"] as const) {
			if ((probabilities[each] ?? 0) > (probabilities[otherwise] ?? 0)) {
				otherwise = each;
			}
		}
		return {
			item: probabilities.item ?? 0,
			intro: probabilities.intro ?? 0,
			otherwise,
			otherwiseLikely: probabilities[otherwise] ?? 0,
			step: step?.type === "noul" ? step.noul : 0,
		};
	});
}

/** A run of segments rendered as one list, `first` to `last` inclusive. */
interface List {
	first: number;
	last: number;
	ordered: boolean;
}

/**
 * The lists in `judged`: each starts at a sure item and runs on through
 * sure items, unsure ones and segments that continue the one before, but
 * not into a last unsure one more likely prose or an intro than an item;
 * at least two sure items make a list.
 */
function listsOf(judged: Judged[]): List[] {
	const lists: List[] = [];
	const sure = (each: Judged | undefined) =>
		(each?.item ?? 0) > LIST_THRESHOLDS.apply;
	const open = (each: Judged | undefined) =>
		(each?.item ?? 0) >= LIST_THRESHOLDS.leave;
	let index = 0;
	while (index < judged.length) {
		if (!sure(judged[index])) {
			index++;
			continue;
		}
		let last = index;
		for (let next = index + 1; next < judged.length; next++) {
			const each = judged[next];
			if (sure(each) || open(each) || each?.otherwise === "continues") {
				last = next;
			} else {
				break;
			}
		}
		while (
			last > index &&
			!sure(judged[last]) &&
			judged[last]?.otherwise !== "continues" &&
			(judged[last]?.item ?? 0) < (judged[last]?.otherwiseLikely ?? 0)
		) {
			last--;
		}
		const items = judged.slice(index, last + 1).filter(sure);
		if (items.length >= 2) {
			const steps = items.reduce((sum, each) => sum + each.step, 0);
			lists.push({
				first: index,
				last,
				ordered: steps / items.length > LIST_THRESHOLDS.ordered,
			});
		}
		index = last + 1;
	}
	return lists;
}

/**
 * `text` with each list in `judged` laid out in markdown, and an edit for
 * each unsure item, which joins the item before it until the person splits
 * it off.
 */
function render(text: string, segments: Segment[], judged: Judged[]): Cleaned {
	const edits: DictationEdit[] = [];
	let out = "";
	let from = 0;
	for (const list of listsOf(judged)) {
		const first = segments[list.first] ?? { start: 0, end: 0 };
		let before = text.slice(from, first.start).trimEnd();
		// A clause left on a comma can only lead into the list.
		if (
			((judged[list.first - 1]?.intro ?? 0) > LIST_THRESHOLDS.intro ||
				before.endsWith(",")) &&
			!/[?!]$/.test(before)
		) {
			before = `${before.replace(/[.,;:]$/, "")}:`;
		}
		out += before === "" ? "" : `${before}\n`;
		let number = 1;
		let item = out.length;
		const marker = () => (list.ordered ? `${number}. ` : "- ");
		for (let index = list.first; index <= list.last; index++) {
			const segment = segments[index] ?? first;
			const said = slice(text, segment);
			// The speaker's own marker is the item's: its text stays as written.
			const marked = LEADING_MARKER.test(said);
			const bare = said.replace(LEADING_MARKER, "").replace(LEADING_CUE, "");
			const probability = judged[index]?.item ?? 0;
			if (index === list.first || probability > LIST_THRESHOLDS.apply) {
				if (index !== list.first) {
					out = `${endItem(out, item)}\n`;
				}
				out += marker();
				item = out.length;
				out += marked ? bare : capitalized(bare);
				number++;
				continue;
			}
			const joint = text.slice(segments[index - 1]?.end ?? 0, segment.start);
			if (probability >= LIST_THRESHOLDS.leave) {
				const start = out.replace(/[.,;]$/, "").length;
				const end = out.length + joint.length + said.length - bare.length + 1;
				edits.push({
					type: "item",
					start,
					end,
					text: `\n${marker()}${capitalized(bare.slice(0, 1))}`,
					probability,
				});
			}
			out += joint + said;
		}
		out = endItem(out, item);
		from = (segments[list.last] ?? first).end;
		const rest = text.slice(from);
		if (rest.trim() !== "") {
			out += "\n\n";
			from += rest.search(/\S/);
		}
	}
	return { text: out + text.slice(from), edits };
}

/**
 * `out` with the item that starts at `item` ended: no trailing comma or
 * semicolon, nor a full stop when the item is a sentence alone.
 */
function endItem(out: string, item: number): string {
	const trimmed = out.replace(/[,;]$/, "");
	const body = trimmed.slice(item, -1);
	return trimmed.endsWith(".") && !/[.!?]\s/.test(body)
		? trimmed.slice(0, -1)
		: trimmed;
}

function capitalized(said: string): string {
	return said.charAt(0).toUpperCase() + said.slice(1);
}

function slice(text: string, segment: Segment): string {
	return text.slice(segment.start, segment.end);
}
