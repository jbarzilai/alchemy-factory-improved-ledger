// Testable entry point: parses argv, dispatches to a command, maps failures to exit codes.
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { bootstrap } from './commands/bootstrap';
import { doctor } from './commands/doctor';
import { day } from './commands/day';
import { days } from './commands/days';
import { refreshGameData } from './commands/refresh-game-data';
import { refreshIcons } from './commands/refresh-icons';
import { VERSION } from './version';
import { oneLine } from './format';

export type IO = { out(s: string): void; err(s: string): void; env: NodeJS.ProcessEnv; color?: boolean; envFile?: string; envError?: string };
export type Parsed = { values: Record<string, string | boolean | undefined>; positionals: string[] };
export type Command = {
  options: NonNullable<ParseArgsConfig['options']>;
  positionals?: boolean;
  run(args: Parsed, io: IO): Promise<number>;
};

export const EXIT = { ok: 0, failure: 1, usage: 2 } as const;

const COMMANDS: Record<string, Command> = { doctor, day, days, bootstrap, 'refresh-game-data': refreshGameData, 'refresh-icons': refreshIcons };

export const USAGE = `usage: af-ledger <command> [options]

commands:
  bootstrap [--force]   find the saves folder and game install; write .env
  doctor [--save <file|folder>]   check node, kdec, config and saves
  refresh-game-data [--game-dir <dir>] [--output <file>]   regenerate item prices from the game
  refresh-icons [--game-dir <dir>] [--output <dir>] [--size <n>]   regenerate bundled item icons
  day [N] [--save <file|folder>] [--unit mixed|gold|silver|copper] [--top <n>] [--json] [--partial] [--png [--output <file>]]
  days [--save <file|folder>] [--unit mixed|gold|silver|copper] [--last <n>] [--json] [--partial] [--png [--output <file>]]

options:
  -h, --help     show this help
  --version      print the version
`;

export async function run(argv: string[], io: IO): Promise<number> {
  const [name, ...rest] = argv;
  if (name === undefined || name === '-h' || name === '--help' || name === 'help') {
    io.out(USAGE);
    return EXIT.ok;
  }
  if (name === '--version') {
    io.out(`${VERSION}\n`);
    return EXIT.ok;
  }
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (!command) {
    io.err(`af-ledger: unknown command "${name}"\n\n${USAGE}`);
    return EXIT.usage;
  }
  let args: Parsed;
  try {
    const options = { ...command.options, help: { type: 'boolean' as const, short: 'h' } };
    // parseArgs treats a bare negative number as an option. Preserve numeric positionals so
    // commands can report their valid range, while still strictly checking flags and values.
    const negatives = new Map<string, string>();
    const normalized = [...rest];
    if (command.positionals) {
      const { tokens } = parseArgs({ args: rest, options, allowPositionals: true, strict: false, tokens: true });
      for (const token of tokens) {
        if (token.kind === 'option' && /^-\d/.test(rest[token.index])) {
          const key = `\0negative:${token.index}`;
          negatives.set(key, rest[token.index]);
          normalized[token.index] = key;
        }
      }
    }
    args = parseArgs({ args: normalized, options, allowPositionals: command.positionals ?? false, strict: true }) as Parsed;
    args.positionals = args.positionals.map((value) => negatives.get(value) ?? value);
  } catch (e) {
    io.err(`af-ledger ${name}: ${oneLine((e as Error).message)}\n`);
    return EXIT.usage;
  }
  try {
    if (args.values.help) {
      io.out(USAGE);
      return EXIT.ok;
    }
    return await command.run(args, io);
  } catch (e) {
    io.err(`af-ledger ${name}: ${oneLine((e as Error).message)}\n`);
    return EXIT.failure;
  }
}
