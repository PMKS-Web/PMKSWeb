import { Injectable } from '@angular/core';
import {
  DEFAULT_FORCE_COLOR,
  JointFamily,
  JOINT_FAMILIES,
  PART_COLORS,
} from '../model/joint-colors';

export {
  JOINT_FAMILIES,
  SELECTION_RING,
  PART_COLORS,
  DEFAULT_FORCE_COLOR,
} from '../model/joint-colors';
export type { JointFamily } from '../model/joint-colors';

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

  private linkColorOptions: string[] = [...PART_COLORS];

  /**
   * The families a joint can be drawn in, each a set of three.
   *
   * A joint is drawn resting, pointed at and picked, and those only read as one
   * object in three moods if they come from one family -- so choosing a colour
   * for a joint chooses all three at once, not a fill.
   *
   * Amber through brown: warm, complementary to the indigo and teal the links
   * are drawn in, and none of it competing with the link palette. Amber is
   * first and is what every joint is drawn in until somebody says otherwise,
   * so the same row that puts a colour on a joint takes it off again.
   */
  private jointFamilies: readonly JointFamily[] = JOINT_FAMILIES;

  public getJointFamilies(): readonly JointFamily[] {
    return this.jointFamilies;
  }

  /** The family a joint belongs to; the first for anything unrecognised. */
  public jointFamily(id: string): JointFamily {
    return this.jointFamilies.find((family) => family.id === id) ?? this.jointFamilies[0];
  }

  public getJointColorOptions(): string[] {
    return this.jointFamilies.map((family) => family.normal);
  }

  public getIndexFromJointFamily(id: string): number {
    const at = this.jointFamilies.findIndex((family) => family.id === id);
    return at === -1 ? 0 : at;
  }

  public getJointFamilyFromIndex(index: number): string {
    return (this.jointFamilies[index] ?? this.jointFamilies[0]).id;
  }

  /** The same six the links use. A force is read against the link it acts on. */
  private forceColorOptions: string[] = [...PART_COLORS];

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

  public getForceColorOptions(): string[] {
    return this.forceColorOptions;
  }

  getIndexFromLinkColor(fill: string) {
    return this.linkColorOptions.indexOf(fill);
  }

  getIndexFromForceColor(fill: string) {
    // An empty colour is the default, which is one of the six -- so the picker
    // always has exactly one swatch ticked, whether or not anybody has chosen.
    const wanted = (fill || DEFAULT_FORCE_COLOR).toLowerCase();
    const at = this.forceColorOptions.findIndex((option) => option.toLowerCase() === wanted);
    return at === -1 ? this.forceColorOptions.indexOf(DEFAULT_FORCE_COLOR) : at;
  }

  getLinkColorFromIndex(index: number) {
    return this.linkColorOptions[index];
  }

  getForceColorFromIndex(index: number) {
    return this.forceColorOptions[index] ?? DEFAULT_FORCE_COLOR;
  }
}
