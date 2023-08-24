import { SettingsService } from '../settings.service';

export enum SynthesisStatus {
  DISABLED = 'DISABLED',
  INVALID = 'INVALID',
  VALID = 'VALID',
}

export enum SynthesisClickMode {
  NORMAL = 'NORMAL',
  X = 'X',
  Y = 'Y',
  ROTATE = 'ROTATE',
}

export class SynthesisConstants {
  public CIRCLE_RADIUS: number = 0.15;
  public LINK_CIRCLE_RADIUS: number = 0.25;
  public CIRCLE_COLOR: string = 'rgb(255,255,255)';
  public CIRCLE_COLOR_H: string = 'rgb(245,245,245)';

  public LINK_COLOR: { [key in SynthesisStatus]: string } = {
    [SynthesisStatus.DISABLED]: 'rgb(100,100,100)',
    [SynthesisStatus.INVALID]: 'rgb(255,0,0)',
    [SynthesisStatus.VALID]: 'rgb(0,255,0)',
  };

  // slightly darkened when hovering
  public LINK_COLOR_H: { [key in SynthesisStatus]: string } = {
    [SynthesisStatus.DISABLED]: 'rgb(80,80,80)',
    [SynthesisStatus.INVALID]: 'rgb(200,0,0)',
    [SynthesisStatus.VALID]: 'rgb(0,200,0)',
  };

  public COR_RADIUS: number = 0.1;
  public COR_COLOR: string = 'black';

  public ROTATION_SIZE: number = 0.2;

  public ARROW_X_COLOR: string = 'rgba(255,0,0,0.3)';
  public ARROW_X_COLOR_H: string = 'rgba(255,0,0,1)';

  public ARROW_Y_COLOR: string = 'rgba(0,0,230,0.3)';
  public ARROW_Y_COLOR_H: string = 'rgba(0,0,230,1)';

  public ROTATION_CIRCLE_RADIUS: number = 0.15;
  public ROTATION_CIRCLE_LOCATION_SCALAR = 0.5;
  public ROTATION_CIRCLE_COLOR: string = 'rgb(0, 125, 0)';
  public ROTATION_CIRCLE_COLOR_H: string = 'rgb(0,255,0)';

  constructor() {}
}
