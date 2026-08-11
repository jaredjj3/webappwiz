/** Row one is the header. */
export const table = (rows: string[][]): string[] => {
	const widths = rows[0]?.map((_, i) =>
		Math.max(...rows.map((r) => (r[i] ?? "").length)),
	);
	return rows.map((r) =>
		r
			.map((cell, i) => cell.padEnd(widths?.[i] ?? 0))
			.join("  ")
			.trimEnd(),
	);
};
