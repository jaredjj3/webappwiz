import { beforeEach, describe, expect, it, mock } from "bun:test";

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
		const greeted = mock(() => {});
		const stopped = mock(() => {});
		dispatcher.on("greeted", greeted);
		dispatcher.on("stopped", stopped);

		dispatcher.dispatch("greeted", { message: "hello" });

		expect(greeted).toHaveBeenCalledWith({ message: "hello" });
		expect(stopped).not.toHaveBeenCalled();
	});

	it("stops delivery after unlistening", () => {
		const listener = mock(() => {});
		const off = dispatcher.on("greeted", listener);

		off();
		dispatcher.dispatch("greeted", { message: "hello" });

		expect(listener).not.toHaveBeenCalled();
	});

	it("delivers only the first event to a once listener", () => {
		const listener = mock(() => {});
		dispatcher.on("greeted", listener, { once: true });

		dispatcher.dispatch("greeted", { message: "hello" });
		dispatcher.dispatch("greeted", { message: "again" });

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith({ message: "hello" });
	});

	it("delivers every type to an all() listener, with the type as its first argument", () => {
		const listener = mock((_type: keyof TestEvents, _event: unknown) => {});
		dispatcher.all(listener);

		dispatcher.dispatch("greeted", { message: "hello" });
		dispatcher.dispatch("stopped");

		expect(listener).toHaveBeenCalledTimes(2);
		expect(listener).toHaveBeenNthCalledWith(1, "greeted", {
			message: "hello",
		});
		expect(listener).toHaveBeenNthCalledWith(2, "stopped", undefined);
	});

	it("runs listeners in registration order, scoped and universal alike", () => {
		const heard: string[] = [];
		dispatcher.all(() => heard.push("universal"));
		dispatcher.on("greeted", () => heard.push("scoped"));

		dispatcher.dispatch("greeted", { message: "hello" });

		expect(heard).toEqual(["universal", "scoped"]);
	});

	it("drops every listener when disposed", () => {
		const scoped = mock(() => {});
		const universal = mock(() => {});
		dispatcher.on("greeted", scoped);
		dispatcher.all(universal);

		dispatcher.dispose();
		dispatcher.dispatch("greeted", { message: "hello" });

		expect(scoped).not.toHaveBeenCalled();
		expect(universal).not.toHaveBeenCalled();
	});
});
