export class SaveFormatError extends Error {
  override name = 'SaveFormatError';
}

// The file is shorter than its own structure declares. Callers may retry.
export class IncompleteSaveError extends SaveFormatError {
  override name = 'IncompleteSaveError';
}

export class PropertyError extends SaveFormatError {
  override name = 'PropertyError';
}

export class SaveShapeError extends SaveFormatError {
  override name = 'SaveShapeError';
}

export class GameDataError extends Error {
  override name = 'GameDataError';
}
