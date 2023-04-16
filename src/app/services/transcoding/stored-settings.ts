// Define all the settings attributes to be encoded and decoded

export enum EnumSetting {
    LENGTH_UNIT,
    ANGLE_UNIT,
    FORCE_UNIT,
    GLOBAL_UNIT,
}

export enum IntSetting {
    INPUT_SPEED,
}

export enum DecimalSetting {
    SCALE,
}

export enum BoolSetting {
    IS_INPUT_CW,
    IS_GRAVITY,
    ANIMATING,
    IS_SHOW_MAJOR_GRID,
    IS_SHOW_MINOR_GRID,
    IS_SHOW_ID,
    IS_SHOW_COM,
}