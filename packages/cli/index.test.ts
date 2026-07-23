import { test, expect } from "bun:test";
import { cli, t } from "./index";

test("dispatches to the named command with parsed, typed opts", () => {
  let got: { name: string; count: number } | undefined;
  const wiz = cli("wiz");
  wiz
    .command("greet")
    .description("greet someone")
    .option("name", t.string)
    .option("count", t.number)
    .action((o) => {
      got = o;
    });
  wiz.run(["greet", "--name", "ada", "--count", "3"]);
  expect(got).toEqual({ name: "ada", count: 3 });
});

test("routes to the right command among several", () => {
  const calls: string[] = [];
  const wiz = cli("wiz");
  wiz.command("foo").action(() => calls.push("foo"));
  wiz.command("bar").action(() => calls.push("bar"));
  wiz.run(["bar"]);
  expect(calls).toEqual(["bar"]);
});

test("supports --key=value form", () => {
  let n = 0;
  const wiz = cli("wiz");
  wiz
    .command("x")
    .option("n", t.number)
    .action((o) => {
      n = o.n;
    });
  wiz.run(["x", "--n=42"]);
  expect(n).toBe(42);
});

test("boolean is true when bare, false when =false", () => {
  const seen: boolean[] = [];
  const wiz = cli("wiz");
  wiz
    .command("f")
    .option("loud", t.boolean)
    .action((o) => seen.push(o.loud));
  wiz.run(["f", "--loud"]);
  wiz.run(["f", "--loud=false"]);
  expect(seen).toEqual([true, false]);
});

test("unknown or missing command falls back to help without throwing", () => {
  const wiz = cli("wiz");
  wiz.command("a").action(() => {});
  expect(() => wiz.run([])).not.toThrow();
  expect(() => wiz.run(["nope"])).not.toThrow();
});

test("number schema rejects non-numbers", () => {
  const wiz = cli("wiz");
  wiz
    .command("n")
    .option("x", t.number)
    .action(() => {});
  expect(() => wiz.run(["n", "--x", "abc"])).toThrow(/number/);
});

test("missing required option throws naming the option", () => {
  const wiz = cli("wiz");
  wiz
    .command("r")
    .option("must", t.string)
    .action(() => {});
  expect(() => wiz.run(["r"])).toThrow(/must/);
});

test("action opts are statically typed", () => {
  const wiz = cli("wiz");
  wiz
    .command("typed")
    .option("name", t.string)
    .option("count", t.number)
    .action((o) => {
      const name: string = o.name;
      const count: number = o.count;
      // @ts-expect-error name is a string, not a number
      const wrong: number = o.name;
      void name;
      void count;
      void wrong;
    });
});
