import { beforeEach, describe, expect, it } from "bun:test";

import { Dispatcher } from "./index";

type TestEvents = {
	greeted: { message: string };
	stopped: undefined;
};

describe("Dispatcher", () => {
	let dispatcher: Dispatcher<TestEvents>;

	beforeEach(() => {
		dispatcher = new Dispatcher<TestEvents>();
	});

	it("dispatches to listeners of that type only", () => {
		const greeted: TestEvents["greeted"][] = [];
		const stopped: TestEvents["stopped"][] = [];
		dispatcher.on("greeted", (event) => greeted.push(event));
		dispatcher.on("stopped", (event) => stopped.push(event));

		dispatcher.dispatch("greeted", { message: "hello" });

		expect(greeted).toEqual([{ message: "hello" }]);
		expect(stopped).toEqual([]);
	});

	it("stops delivery after unlistening", () => {
		const heard: TestEvents["greeted"][] = [];
		const off = dispatcher.on("greeted", (event) => heard.push(event));

		off();
		dispatcher.dispatch("greeted", { message: "hello" });

		expect(heard).toEqual([]);
	});

	it("delivers only the first event to a once listener", () => {
		const heard: TestEvents["greeted"][] = [];
		dispatcher.on("greeted", (event) => heard.push(event), { once: true });

		dispatcher.dispatch("greeted", { message: "hello" });
		dispatcher.dispatch("greeted", { message: "again" });

		expect(heard).toEqual([{ message: "hello" }]);
	});

	it("delivers every type to an all() listener, with the type as its first argument", () => {
		const heard: [keyof TestEvents, unknown][] = [];
		dispatcher.all((type, event) => heard.push([type, event]));

		dispatcher.dispatch("greeted", { message: "hello" });
		dispatcher.dispatch("stopped");

		expect(heard).toEqual([
			["greeted", { message: "hello" }],
			["stopped", undefined],
		]);
	});

	it("runs listeners in registration order, scoped and universal alike", () => {
		const heard: string[] = [];
		dispatcher.all(() => heard.push("universal"));
		dispatcher.on("greeted", () => heard.push("scoped"));

		dispatcher.dispatch("greeted", { message: "hello" });

		expect(heard).toEqual(["universal", "scoped"]);
	});

	it("drops every listener when disposed", () => {
		const heard: string[] = [];
		dispatcher.on("greeted", () => heard.push("scoped"));
		dispatcher.all(() => heard.push("universal"));

		dispatcher.dispose();
		dispatcher.dispatch("greeted", { message: "hello" });

		expect(heard).toEqual([]);
	});
});
