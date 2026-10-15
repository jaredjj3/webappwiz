import "../../../setup";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { CounterIdProvider } from "webappwiz/id";
import { DictateServer } from "../dictate-server";
import { DictateService } from "../dictate-service";
import { FakeTranscriber } from "../fake-transcriber";
import { Takes } from "../takes";
import { App } from "./app";
import { DictateApi } from "./dictate-api";
import { FakeMicrophone } from "./fake-microphone";

describe("App", () => {
	let server: DictateServer;
	let api: DictateApi;

	beforeEach(() => {
		server = new DictateServer(
			new DictateService(
				new FakeTranscriber(),
				new Takes(new CounterIdProvider()),
			),
			{ port: 0 },
		);
		api = new DictateApi(server.url);
	});

	afterEach(async () => {
		cleanup();
		await server.disposeAsync();
	});

	it("shows the text as it is heard, then lists the take once stopped", async () => {
		const microphone = new FakeMicrophone();
		const view = render(<App microphone={microphone} api={api} />);
		expect(view.getByText("No takes yet.")).toBeDefined();

		view.getByRole("button", { name: "Record" }).click();
		const stop = await view.findByRole("button", { name: "Stop" });
		microphone.speak(" more");
		const live = await view.findByText("heard: something more");
		expect(live.className).toBe("live");
		stop.click();

		await waitFor(() =>
			expect(view.container.querySelector(".transcript")?.textContent).toBe(
				"heard: something more",
			),
		);
		expect(view.container.querySelector(".live")).toBeNull();
		await waitFor(() =>
			expect(view.getByRole("button", { name: "Record" })).toBeDefined(),
		);
	});

	it("says why the mic would not start", async () => {
		const microphone = new FakeMicrophone();
		microphone.failure = new Error("Permission denied");
		const view = render(<App microphone={microphone} api={api} />);
		view.getByRole("button", { name: "Record" }).click();
		expect((await view.findByRole("alert")).textContent).toBe(
			"Permission denied",
		);
	});
});
