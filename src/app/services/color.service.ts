import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ColorService {
  //Create a static instance of the color service
  public static instance: ColorService;

  constructor() {
    //Create a static instance of the color service
    ColorService.instance = this;
  }

  private linkColorOptions = [
    '#9fa8da',
    '#303e9f',
    '#0d125a',
    // '#283493',
    // '#3948ab',
    // '#3f50b5',
    // '#5c6ac0',
    // '#7986cb',
    // '#c5cae9',
    '#B2DFDB',
    '#26A69A',
    '#00695C',
  ];

  private linkLastColorIndex = 0;

  public getNextColor(): string {
    let color = this.linkColorOptions[this.linkLastColorIndex];
    this.linkLastColorIndex = (this.linkLastColorIndex + 1) % this.linkColorOptions.length;
    return color;
  }

  public linkNumColors(): number {
    return this.linkColorOptions.length;
  }

  public getLinkColorOptions(): string[] {
    return this.linkColorOptions;
  }

  getIndexFromColor(fill: string) {
    return this.linkColorOptions.indexOf(fill);
  }

  getColorFromIndex(index: number) {
    return this.linkColorOptions[index];
  }
}
