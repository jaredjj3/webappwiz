import { describe, expect, it } from "bun:test";
import { CounterIdProvider } from "webappwiz/id";
import { Takes } from "./takes";

describe("Takes", () => {
	it("finds a take by the id it was given", () => {
		const takes = new Takes(new CounterIdProvider());
		const audio = new Blob(["one"]);
		const take = takes.add(audio, "hello");
		expect(takes.get(take.id)).toEqual({
			id: take.id,
			audio,
			transcript: "hello",
		});
	});

	it("has nothing for an id it never gave", () => {
		expect(new Takes(new CounterIdProvider()).get("nope")).toBeUndefined();
	});

	it("lists the newest take first", () => {
		const takes = new Takes(new CounterIdProvider());
		takes.add(new Blob(["one"]), "first");
		takes.add(new Blob(["two"]), "second");
		expect(takes.list().map((take) => take.transcript)).toEqual([
			"second",
			"first",
		]);
	});
});
