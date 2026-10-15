import type { AppliedEdit, Cleaned } from "./dictation-message";
import type { Cleanup } from "./dictation-relay";

/**
 * Runs `cleanups` one after another, each on the text the one before left.
 * The edits an earlier one left open are carried onto each later text,
 * wherever their span came through as it was; one whose span a later
 * cleanup rewrote is dropped, since it no longer says what it replaces. A
 * cleanup that throws is skipped, so the others still apply.
 *
 * What each cleanup applied is found by comparing the text it was given with
 * the text it left, one {@link AppliedEdit} for each run of changed words,
 * labeled with the cleanup's `kind`; a cleanup with none is not reported.
 * Those carry onward the way open edits do.
 */
export class CleanupSequence implements Cleanup {
	private readonly cleanups: Cleanup[];

	constructor(...cleanups: Cleanup[]) {
		this.cleanups = cleanups;
	}

	async clean(text: string): Promise<Cleaned> {
		let cleaned: Cleaned = { text, edits: [], applied: [] };
		for (const cleanup of this.cleanups) {
			const next = await cleanup.clean(cleaned.text).catch(() => undefined);
			if (next === undefined) {
				continue;
			}
			const carried = carry(cleaned.edits, cleaned.text, next.text);
			const made =
				cleanup.kind === undefined
					? []
					: appliedBy(cleanup.kind, cleaned.text, next.text);
			cleaned = {
				text: next.text,
				edits: [...carried, ...next.edits].sort(
					(one, other) => one.start - other.start,
				),
				applied: [
					...carry(cleaned.applied ?? [], cleaned.text, next.text),
					...made,
				].sort((one, other) => one.start - other.start),
			};
		}
		return cleaned;
	}
}

/** A stretch of the old text, `[start, end)`, that became `length` new characters. */
interface Change {
	start: number;
	end: number;
	length: number;
}

/**
 * `edits`, spanning `before`, moved to where their spans sit in `after`.
 * A change in letter case is no change, so a span a cleanup capitalized
 * is still carried.
 */
function carry<Edit extends { start: number; end: number }>(
	edits: Edit[],
	before: string,
	after: string,
): Edit[] {
	if (edits.length === 0 || before === after) {
		return edits;
	}
	const changes = diff(before, after);
	const moved: Edit[] = [];
	for (const edit of edits) {
		// A change at a span's edge leaves it whole; one within it does not.
		const touched = changes.some((change) =>
			change.start === change.end
				? change.start > edit.start && change.start < edit.end
				: change.start < edit.end && change.end > edit.start,
		);
		if (touched) {
			continue;
		}
		const shift = changes
			.filter((change) => change.end <= edit.start)
			.reduce(
				(sum, change) => sum + change.length - (change.end - change.start),
				0,
			);
		moved.push({ ...edit, start: edit.start + shift, end: edit.end + shift });
	}
	return moved;
}

/**
 * What `kind` changed in turning `before` into `after`: each run of changed
 * words, and the runs with no word between them as one, so "s cry" becoming
 * "#scry" is one edit, not two.
 */
function appliedBy(
	kind: AppliedEdit["type"],
	before: string,
	after: string,
): AppliedEdit[] {
	const from = tokens(before);
	const to = tokens(after);
	const runs: { start: number; end: number; now: number; stop: number }[] = [];
	let old = 0;
	let now = 0;
	for (const [keptOld, keptNow] of [
		...kept(
			from.map((token) => token.text),
			to.map((token) => token.text),
		),
		[from.length, to.length] as [number, number],
	]) {
		if (keptOld > old || keptNow > now) {
			const run = {
				start: from[old]?.start ?? before.length,
				end: from[keptOld]?.start ?? before.length,
				now: to[now]?.start ?? after.length,
				stop: to[keptNow]?.start ?? after.length,
			};
			const last = runs.at(-1);
			const gap = last === undefined ? "" : before.slice(last.end, run.start);
			// Nothing but space, or no space at all, between two changes: one edit.
			if (last !== undefined && (gap.trim() === "" || !/\s/u.test(gap))) {
				last.end = run.end;
				last.stop = run.stop;
			} else {
				runs.push(run);
			}
		}
		old = keptOld + 1;
		now = keptNow + 1;
	}
	return runs.map((run) => {
		// A space both sides end with was kept, however the diff lined it up.
		while (
			run.end > run.start &&
			run.stop > run.now &&
			/\s/u.test(before.charAt(run.end - 1)) &&
			before.charAt(run.end - 1) === after.charAt(run.stop - 1)
		) {
			run.end--;
			run.stop--;
		}
		return {
			type: kind,
			start: run.now,
			end: run.stop,
			was: before.slice(run.start, run.end),
		};
	});
}

/** The words, spaces and marks of `text`, each with where it starts. */
function tokens(text: string): { text: string; start: number }[] {
	return [...text.matchAll(/[\p{L}\p{N}]+|\s+|[^\p{L}\p{N}\s]/gu)].map(
		(match) => ({ text: match[0], start: match.index }),
	);
}

/**
 * The fewest changes that turn `before` into `after`, in order, found by
 * Myers' diff over characters, ignoring letter case.
 */
function diff(before: string, after: string): Change[] {
	const from = before.toLowerCase();
	const to = after.toLowerCase();
	const changes: Change[] = [];
	let fromOld = 0;
	let fromNow = 0;
	for (const [keptOld, keptNow] of [
		...kept([...from], [...to]),
		[from.length, to.length] as [number, number],
	]) {
		if (keptOld > fromOld || keptNow > fromNow) {
			changes.push({ start: fromOld, end: keptOld, length: keptNow - fromNow });
		}
		fromOld = keptOld + 1;
		fromNow = keptNow + 1;
	}
	return changes;
}

/**
 * The pairs of positions `[old, now]` of the items `from` and `to` share, in
 * order, found by Myers' diff: the fewest changes that turn one into the other.
 */
function kept(from: string[], to: string[]): [number, number][] {
	const most = from.length + to.length;
	// Diagonal `k` is kept at `furthest[offset + k]`, so it can go negative.
	const offset = most + 1;
	let furthest = new Int32Array(2 * most + 3);
	const trace: Int32Array[] = [];
	const down = (row: Int32Array, k: number, depth: number) =>
		k === -depth ||
		(k !== depth && (row[offset + k - 1] ?? 0) < (row[offset + k + 1] ?? 0));
	let done = false;
	for (let depth = 0; depth <= most && !done; depth++) {
		trace.push(furthest);
		const next = furthest.slice();
		for (let k = -depth; k <= depth; k += 2) {
			let at = down(furthest, k, depth)
				? (furthest[offset + k + 1] ?? 0)
				: (furthest[offset + k - 1] ?? 0) + 1;
			while (
				at < from.length &&
				at - k < to.length &&
				from[at] === to[at - k]
			) {
				at++;
			}
			next[offset + k] = at;
			if (at >= from.length && at - k >= to.length) {
				done = true;
				break;
			}
		}
		furthest = next;
	}
	// Walk back from the end, gathering each pair of characters kept.
	const pairs: [number, number][] = [];
	let old = from.length;
	let now = to.length;
	for (let depth = trace.length - 1; depth > 0; depth--) {
		const row = trace[depth] ?? furthest;
		const k = old - now;
		const previous = down(row, k, depth) ? k + 1 : k - 1;
		const previousOld = row[offset + previous] ?? 0;
		const previousNow = previousOld - previous;
		while (old > previousOld && now > previousNow) {
			old--;
			now--;
			pairs.push([old, now]);
		}
		old = previousOld;
		now = previousNow;
	}
	while (old > 0 && now > 0) {
		old--;
		now--;
		pairs.push([old, now]);
	}
	pairs.reverse();
	return pairs;
}
