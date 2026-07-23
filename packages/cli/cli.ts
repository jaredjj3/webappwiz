import { Command } from "./command";

class Cli {
  private cmds = new Map<string, Command<unknown>>();

  constructor(readonly name: string) {}

  command(name: string): Command<{}> {
    const c = new Command<{}>(name);
    this.cmds.set(name, c as Command<unknown>); // registered by reference; chain mutates the same object
    return c;
  }

  run(argv: string[] = Bun.argv.slice(2)): unknown {
    const [name, ...rest] = argv;
    const cmd = name ? this.cmds.get(name) : undefined;
    if (!cmd) return this.help();
    return cmd.exec(rest);
  }

  private help(): void {
    console.log(`${this.name} <command>\n`);
    for (const c of this.cmds.values()) {
      console.log(`  ${c.name}${c.summary ? `  ${c.summary}` : ""}`);
    }
  }
}

export function cli(name: string): Cli {
  return new Cli(name);
}
