import { expect, mock, test } from "bun:test";

import { Dispatcher } from "./index";

type TestEvents = {
	greeted: { message: string };
	stopped: undefined;
};

test("dispatches to listeners of that type only", () => {
	const dispatcher = new Dispatcher<TestEvents>();
	const greeted = mock(() => {});
	const stopped = mock(() => {});
	dispatcher.on("greeted", greeted);
	dispatcher.on("stopped", stopped);

	dispatcher.dispatch("greeted", { message: "hello" });

	expect(greeted).toHaveBeenCalledWith({ message: "hello" });
	expect(stopped).not.toHaveBeenCalled();
});

test("unlistening stops delivery", () => {
	const dispatcher = new Dispatcher<TestEvents>();
	const listener = mock(() => {});
	const off = dispatcher.on("greeted", listener);

	off();
	dispatcher.dispatch("greeted", { message: "hello" });

	expect(listener).not.toHaveBeenCalled();
});

test("a once listener hears the first event and no more", () => {
	const dispatcher = new Dispatcher<TestEvents>();
	const listener = mock(() => {});
	dispatcher.on("greeted", listener, { once: true });

	dispatcher.dispatch("greeted", { message: "hello" });
	dispatcher.dispatch("greeted", { message: "again" });

	expect(listener).toHaveBeenCalledTimes(1);
	expect(listener).toHaveBeenCalledWith({ message: "hello" });
});

test("all() hears every type, with the type as its first argument", () => {
	const dispatcher = new Dispatcher<TestEvents>();
	const listener = mock((_type: keyof TestEvents, _event: unknown) => {});
	dispatcher.all(listener);

	dispatcher.dispatch("greeted", { message: "hello" });
	dispatcher.dispatch("stopped");

	expect(listener).toHaveBeenCalledTimes(2);
	expect(listener).toHaveBeenNthCalledWith(1, "greeted", { message: "hello" });
	expect(listener).toHaveBeenNthCalledWith(2, "stopped", undefined);
});

test("listeners run in registration order, scoped and universal alike", () => {
	const dispatcher = new Dispatcher<TestEvents>();
	const heard: string[] = [];
	dispatcher.all(() => heard.push("universal"));
	dispatcher.on("greeted", () => heard.push("scoped"));

	dispatcher.dispatch("greeted", { message: "hello" });

	expect(heard).toEqual(["universal", "scoped"]);
});

test("dispose drops every listener", () => {
	const dispatcher = new Dispatcher<TestEvents>();
	const scoped = mock(() => {});
	const universal = mock(() => {});
	dispatcher.on("greeted", scoped);
	dispatcher.all(universal);

	dispatcher.dispose();
	dispatcher.dispatch("greeted", { message: "hello" });

	expect(scoped).not.toHaveBeenCalled();
	expect(universal).not.toHaveBeenCalled();
});
