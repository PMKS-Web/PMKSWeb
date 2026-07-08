// Unit enums live in their own module (re-exported by utils.ts) so that
// SettingsService can import them without pulling in the rest of utils.ts,
// which reaches Joint/Link/NewGridComponent and would otherwise close a
// module cycle through coord.ts that breaks class initialization.
export enum LengthUnit {
  INCH = 0,
  CM = 1,
  METER = 2,
  NULL = 3,
}

export enum AngleUnit {
  DEGREE = 10,
  RADIAN = 11,
  NULL = 12,
}

export enum ForceUnit {
  LBF = 20,
  NEWTON = 21,
  NULL = 22,
}

export enum GlobalUnit {
  ENGLISH = 30,
  METRIC = 31,
  SI = 32,
  NULL = 33,
}
