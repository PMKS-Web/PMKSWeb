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
    '#c5cae9',
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

  /**
   * The colour the next link will be, without taking it.
   *
   * For the previews the creation gestures draw. A ghost is a promise about
   * what the click will make, and a ghost in some other colour than the part
   * turns out to be is a promise broken at the moment it is kept — but asking
   * for the colour the ordinary way would spend it, so a cancelled gesture
   * would silently shuffle every colour after it.
   */
  public peekNextLinkColor(): string {
    return this.linkColorOptions[this.linkLastColorIndex];
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
