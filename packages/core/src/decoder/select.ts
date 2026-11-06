// AF_DECODER=auto|kdec. kdec is the only decoder: the game links Oodle statically (docs/SAVE_FORMAT.md §8).
import { KdecDecoder } from './kdec';
import type { Decoder } from './types';

export function selectDecoder(choice: string = process.env.AF_DECODER ?? 'auto'): Decoder {
  if (choice === 'auto' || choice === 'kdec') return new KdecDecoder();
  throw new Error(`unknown decoder "${choice}" (expected auto or kdec)`);
}
