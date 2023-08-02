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

  private jointColorOptions = ['#ffecb2'];

  private forceColorOptions = ['#3f50b5'];

  private linkLastColorIndex = 0;

  public getNextLinkColor(): string {
    let color = this.linkColorOptions[this.linkLastColorIndex];
    this.linkLastColorIndex = (this.linkLastColorIndex + 1) % this.linkColorOptions.length;
    return color;
  }

  public getLinkColorOptions(): string[] {
    return this.linkColorOptions;
  }

  public getJointColorOptions(): string[] {
    return this.jointColorOptions;
  }

  public getForceColorOptions(): string[] {
    return this.forceColorOptions;
  }

  getIndexFromLinkColor(fill: string) {
    return this.linkColorOptions.indexOf(fill);
  }

  getIndexFromJointColor(fill: string) {
    return this.jointColorOptions.indexOf(fill);
  }

  getIndexFromForceColor(fill: string) {
    return this.forceColorOptions.indexOf(fill);
  }

  getLinkColorFromIndex(index: number) {
    return this.linkColorOptions[index];
  }

  getJointColorFromIndex(index: number) {
    return this.jointColorOptions[index];
  }

  getForceColorFromIndex(index: number) {
    return this.forceColorOptions[index];
  }
}
