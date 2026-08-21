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

  /**
   * Colours for one joint, to tell it apart from the others.
   *
   * The first is the one every joint is drawn in, so the swatch that undoes a
   * highlight is in the same row as the ones that make it -- there is no other
   * way to take one off. The rest are saturated on purpose: these are worn by a
   * single pin among many and have to be found at a glance, which the pale end
   * of any palette is no good for.
   *
   * Four of them, spread around the wheel rather than crowded on one side, and
   * none of them amber -- that is what a selected joint wears, and a resting
   * joint that borrowed it would be claiming to be selected. A dark grey was
   * tried and dropped: on the navy end of the link palette a dark pin is not a
   * highlight, it is a joint that has gone missing.
   */
  private jointColorOptions = ['#fff8e1', '#e53935', '#43a047', '#00acc1', '#8e24aa'];

  /** The first swatch is "no colour of its own", not a colour. */
  public isDefaultJointColor(color: string): boolean {
    return color === '' || color === this.jointColorOptions[0];
  }

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
