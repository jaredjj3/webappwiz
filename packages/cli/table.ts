/** Row one is the header. */
export const table = (rows: string[][]): string[] => {
	const widths = rows[0]?.map((_, i) =>
		Math.max(...rows.map((row) => (row[i] ?? "").length)),
	);
	return rows.map((row) =>
		row
			.map((cell, i) => cell.padEnd(widths?.[i] ?? 0))
			.join("  ")
			.trimEnd(),
	);
};
