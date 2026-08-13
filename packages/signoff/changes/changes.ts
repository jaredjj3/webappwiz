import type { Changeset } from "../changeset";

/** Reads what a working tree has changed since a ref. */
export interface Changes {
	since(base: string): Promise<Changeset>;
}
