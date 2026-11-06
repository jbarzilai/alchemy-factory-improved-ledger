export type WebArgs = { mode: 'dev' | 'prod'; save?: string };
export function parseWebArgs(argv: string[]): WebArgs {
  const result: WebArgs = { mode: 'dev' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--prod') result.mode = 'prod';
    else if (arg === '--save') {
      const save = argv[++i];
      if (!save || save.startsWith('--')) throw new Error('--save needs a file or folder');
      result.save = save;
    } else if (arg === '--port' || arg === '--host') {
      throw new Error(`unknown option ${arg}; the port is set in config/settings.json`);
    } else throw new Error(`unknown option ${arg}`);
  }
  return result;
}
