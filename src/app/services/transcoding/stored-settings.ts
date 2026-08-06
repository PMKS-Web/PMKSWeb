// Define all the settings attributes to be encoded and decoded

export enum EnumSetting {
  LENGTH_UNIT,
  ANGLE_UNIT,
  FORCE_UNIT,
  GLOBAL_UNIT,
}

export enum IntSetting {
  INPUT_SPEED,
  TIMESTEP,
}

export enum DecimalSetting {
  SCALE,
  /**
   * A driven prismatic joint's speed, in user length units per second.
   *
   * Appended, so URLs written before it decode with the token missing; the
   * decoder leaves those at zero and the builder reads zero as "this URL
   * predates the setting" and keeps the default. Zero is safe to spend that
   * way because a drive that does not move is not a speed anyone chose — the
   * panel refuses it.
   */
  LINEAR_INPUT_SPEED,
}

export enum BoolSetting {
  IS_INPUT_CW,
  IS_GRAVITY,
  ANIMATING,
  IS_SHOW_MAJOR_GRID,
  IS_SHOW_MINOR_GRID,
  IS_SHOW_ID,
  IS_SHOW_COM,
  IS_FORCES,
}
