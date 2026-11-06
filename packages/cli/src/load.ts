import { IncompleteSaveError } from '@af-ledger/core';
import { oneLine } from './format';
import type { IO } from './run';
export { loadLedger, type Ledger, type Bonuses } from '@af-ledger/core';

export function ledgerFailure(command: string, error: unknown, io: IO): number {
  const message = error instanceof IncompleteSaveError
    ? 'the save is being written by the game; try again in a moment' : (error as Error).message;
  io.err(`af-ledger ${command}: ${oneLine(message)}\n`);
  return 1;
}
