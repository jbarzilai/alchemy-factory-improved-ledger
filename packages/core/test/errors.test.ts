import { expect, it } from 'vitest';
import * as api from '../src/index';
import { SaveFormatError, IncompleteSaveError } from '../src/container';
import { PropertyError } from '../src/uprop';
import { SaveShapeError } from '../src/access';

it('exports one save-error hierarchy through existing and package paths', () => {
  for (const ErrorClass of [SaveFormatError, IncompleteSaveError, PropertyError, SaveShapeError]) {
    const error = new ErrorClass('bad save');
    expect(error).toBeInstanceOf(SaveFormatError);
    expect(error.name).toBe(ErrorClass.name);
    expect(error.message).toBe('bad save');
    expect(api).toHaveProperty(ErrorClass.name, ErrorClass);
  }
});
