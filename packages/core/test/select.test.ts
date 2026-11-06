import { describe, expect, it } from 'vitest';
import { selectDecoder } from '../src/decoder/select';

describe('selectDecoder', () => {
  it('uses kdec for auto and kdec', () => {
    expect(selectDecoder('auto').name).toBe('kdec');
    expect(selectDecoder('kdec').name).toBe('kdec');
  });

  it('has no oodle-dll decoder', () => {
    expect(() => selectDecoder('oodle')).toThrow('unknown decoder "oodle" (expected auto or kdec)');
  });

  it('rejects unknown names', () => {
    expect(() => selectDecoder('zstd')).toThrow(/unknown decoder "zstd"/);
  });
});
