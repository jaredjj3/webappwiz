/**
 * How far a check or an evaluation has got, counted as it goes: files for a
 * check, labeled cases for an evaluation. Whoever shows it reads the counts
 * when it likes, so the work never waits on the showing.
 */
export class Progress {
	/** How many there are to look at, known before the first is done. */
	total = 0;
	/** How many of those every rule has finished with. */
	done = 0;
}
