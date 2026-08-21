import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * A set of joint colours, offered whole rather than one shade at a time.
 *
 * A joint is drawn in three states -- resting, pointed at, and picked -- and
 * they only read as the same object in three moods if they come from one
 * family. Picked is deliberately not part of a scheme: the amber a selection
 * wears is the app's accent, worn by the outline of a selected link and by
 * every pressed control, and a selection that meant a different colour on the
 * canvas than in the panel beside it would be a worse trade than any palette
 * is worth.
 *
 * `ink` is what is drawn *on* a joint -- the padlock a locked one carries --
 * which has to turn light when the joint underneath turns dark.
 */
export interface JointScheme {
  id: string;
  name: string;
  rest: string;
  hover: string;
  ink: string;
}

/**
 * Four families that sit with the link palette, which runs indigo and teal.
 *
 * All of them pale, which is not timidity: a link is drawn mid to dark and a
 * selected joint is amber, so a joint has to be lighter than the bar it sits on
 * to read as a pin at all and cooler than amber to not read as picked. A dark
 * family was tried and thrown out -- on the navy end of the link palette the
 * joints vanished into the bar, which is the one thing a joint may not do.
 * What is left to differ is temperature, and each of these is the pale end of a
 * colour the app already draws with: the accent, the neutral the greys come
 * from, and the two link families.
 *
 * Cream is first because it is what every drawing has always been drawn in:
 * this is a preference, so it starts where the reader left it, and where nobody
 * has left it is where the app already was.
 */
export const JOINT_SCHEMES: readonly JointScheme[] = [
  { id: 'cream', name: 'Cream', rest: '#fff8e1', hover: '#ffecb3', ink: '#263238' },
  { id: 'steel', name: 'Steel', rest: '#eceff1', hover: '#cfd8dc', ink: '#263238' },
  { id: 'mint', name: 'Mint', rest: '#e0f2f1', hover: '#b2dfdb', ink: '#263238' },
  { id: 'sky', name: 'Sky', rest: '#e3f2fd', hover: '#bbdefb', ink: '#263238' },
];

const JOINT_SCHEME_KEY = 'jointScheme';

@Injectable({
  providedIn: 'root',
})
export class ColorService {
  //Create a static instance of the color service
  public static instance: ColorService;

  constructor() {
    //Create a static instance of the color service
    ColorService.instance = this;
    this.useJointScheme(this.storedJointScheme());
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
   * Which family the joints are drawn in.
   *
   * Kept on this machine rather than in the URL: it is how a reader likes to
   * look at linkages, not a property of the one they are looking at, and a
   * shared link that repainted the receiver's joints would be carrying a
   * preference that was never theirs. Link and force colours are the other way
   * round -- those are chosen per part and travel with the drawing.
   */
  readonly jointScheme = new BehaviorSubject<JointScheme>(JOINT_SCHEMES[0]);

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
    return JOINT_SCHEMES.map((scheme) => scheme.rest);
  }

  /**
   * Paint the joints in one of the families.
   *
   * Written as custom properties on the document rather than by swapping a
   * class, because the same three colours are wanted by rules in several
   * stylesheets and by marks drawn on top of a joint: one place to set them,
   * and every rule that needs one already names it.
   */
  public useJointScheme(id: string): void {
    const scheme = JOINT_SCHEMES.find((option) => option.id === id) ?? JOINT_SCHEMES[0];
    this.jointScheme.next(scheme);
    this.paintJoints(scheme);
    try {
      localStorage.setItem(JOINT_SCHEME_KEY, scheme.id);
    } catch {
      // A preference that cannot be remembered is not worth failing over.
    }
  }

  private paintJoints(scheme: JointScheme): void {
    const style = document.documentElement.style;
    style.setProperty('--joint-rest', scheme.rest);
    style.setProperty('--joint-hover', scheme.hover);
    style.setProperty('--joint-ink', scheme.ink);
  }

  private storedJointScheme(): string {
    try {
      return localStorage.getItem(JOINT_SCHEME_KEY) ?? JOINT_SCHEMES[0].id;
    } catch {
      return JOINT_SCHEMES[0].id;
    }
  }

  public getForceColorOptions(): string[] {
    return this.forceColorOptions;
  }

  getIndexFromLinkColor(fill: string) {
    return this.linkColorOptions.indexOf(fill);
  }

  getIndexFromJointColor(fill: string) {
    return JOINT_SCHEMES.findIndex((scheme) => scheme.rest === fill);
  }

  getIndexFromForceColor(fill: string) {
    return this.forceColorOptions.indexOf(fill);
  }

  getLinkColorFromIndex(index: number) {
    return this.linkColorOptions[index];
  }

  getJointColorFromIndex(index: number) {
    return JOINT_SCHEMES[index]?.rest ?? JOINT_SCHEMES[0].rest;
  }

  getForceColorFromIndex(index: number) {
    return this.forceColorOptions[index];
  }
}
