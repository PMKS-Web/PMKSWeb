import { ACTIVE_TYPE, ActiveObjData, ForceData, JointData, LinkData } from './transcoder-data';
import { EnumSetting, DecimalSetting, IntSetting, BoolSetting } from './stored-settings';

/*
 * This file contains the interface for the encoder and decoder,
 * which is used to encode and decode the mechanism to and from a url.
 * The goal of implementations of these interfaces is for the url
 * to be as short as possible. Data is passed through structs defined
 * in transcoder-data.ts.
 */

export abstract class GenericTranscoder {
  protected joints: JointData[] = [];
  protected links: LinkData[] = [];
  protected forces: ForceData[] = [];

  protected enumData: number[] = [];
  protected decimalData: number[] = [];
  protected intData: number[] = [];
  protected boolData: boolean[] = [];

  protected activeObjData: ActiveObjData = new ActiveObjData(ACTIVE_TYPE.NOTHING, '');

  /**
   * Type-tagged ids of every object carrying a Lock mark — 'J' + joint id,
   * 'L' + link id, 'F' + force id. A list of references rather than a flag per
   * object, because the joint flag character is full (six flags exactly fill
   * one base-64 character) and a trailing optional section is the extension
   * pattern this format already uses twice: absent decodes as "nothing
   * locked", and a lock-free URL is byte-identical to one written before
   * locks existed.
   */
  protected lockedIds: string[] = [];
  /**
   * Which links hold their centre of mass against something other than
   * themselves, as tagged references sharing the lock section. See
   * StringTranscoder for the spelling.
   */
  protected comAnchors: string[] = [];
  /**
   * The synthesis design -- three positions of an end-effector link and what a
   * solution has to satisfy -- as tagged entries sharing the same trailing
   * section. See StringTranscoder for the spelling.
   *
   * It is in the URL for the same reason the mechanism is: undo and redo are a
   * stack of these strings, so a design that was not written here could not be
   * undone, and a link shared mid-design would open on an empty panel.
   */
  protected synthesisMarks: string[] = [];
  /**
   * Parts drawn in a colour of their own, as tagged references sharing the same
   * trailing section: 'KJ' + joint id + '~' + colour family, and 'KF' + force
   * id + '~' + six hex digits. Two kinds under one tag, told apart by the
   * second character, the way the centre-of-mass anchors already are.
   *
   * In the URL rather than kept on this machine because it is a fact about the
   * drawing -- which part the reader is being asked to look at -- and because
   * undo and redo are a stack of these strings, so a colour left out of them
   * would be wiped by the next undo. Link colours are not here: those have
   * ridden in the link's own record since long before this section existed.
   */
  protected partColors: string[] = [];

  // Initialize data dictionaries based on settings enums
  constructor() {
    for (let i = 0; i < this.getNumberOfEnums(EnumSetting); i++) this.enumData.push(0);
    for (let i = 0; i < this.getNumberOfEnums(DecimalSetting); i++) this.decimalData.push(0);
    for (let i = 0; i < this.getNumberOfEnums(IntSetting); i++) this.intData.push(0);
    for (let i = 0; i < this.getNumberOfEnums(BoolSetting); i++) this.boolData.push(false);
  }

  abstract encodeURL(): string;

  addJoint(joint: JointData): void {
    this.joints.push(joint);
    console.log('save joint', joint);
  }
  addLink(link: LinkData) {
    this.links.push(link);
    console.log('save link', link);
  }
  addForce(force: ForceData) {
    this.forces.push(force);
  }

  private getNumberOfEnums(enumType: object): number {
    return Object.keys(enumType).length / 2;
  }

  // Returns the index of the given enum value within the specified enum type.
  // Example usage: getEnumIndex(Color, Color.RED)
  private getEnumIndexByValue(enumType: object, enumValue: number | string): number | undefined {
    const enumKeys = Object.keys(enumType).filter((k) => isNaN(Number(k)));
    const index = enumKeys.findIndex((k) => enumType[k as keyof typeof enumType] === enumValue);
    return index !== -1 ? index : undefined;
  }

  // Stores a global setting of type enum in the enumData dictionary.
  // Example usage: addEnumSetting("theme", Color, Color.RED)
  addEnumSetting(setting: EnumSetting, enumType: object, enumValue: number | string): void {
    const settingIndex = this.getEnumIndexByValue(EnumSetting, setting) as number;
    const index = this.getEnumIndexByValue(enumType, enumValue);
    if (index !== undefined) {
      this.enumData[settingIndex] = index;
    }
  }

  // Stores a global setting of type decimal in the decimalData dictionary.
  addDecimalSetting(setting: DecimalSetting, value: number): void {
    const settingIndex = this.getEnumIndexByValue(DecimalSetting, setting) as number;
    this.decimalData[settingIndex] = value;
  }

  // Stores a global setting of type integer in the intData dictionary.
  addIntSetting(setting: IntSetting, value: number): void {
    const settingIndex = this.getEnumIndexByValue(IntSetting, setting) as number;
    this.intData[settingIndex] = value;
  }

  // Stores a global setting of type boolean in the boolData dictionary.
  addBoolSetting(setting: BoolSetting, value: boolean): void {
    const settingIndex = this.getEnumIndexByValue(BoolSetting, setting) as number;
    this.boolData[settingIndex] = value;
  }

  setActiveObj(obj: ActiveObjData): void {
    this.activeObjData = obj;
  }

  setLockedIds(ids: string[]): void {
    this.lockedIds = ids;
  }

  getLockedIds(): string[] {
    return this.lockedIds;
  }

  setComAnchors(anchors: string[]): void {
    this.comAnchors = anchors;
  }

  getComAnchors(): string[] {
    return this.comAnchors;
  }

  setSynthesisMarks(marks: string[]): void {
    this.synthesisMarks = marks;
  }

  getSynthesisMarks(): string[] {
    return this.synthesisMarks;
  }

  setPartColors(colors: string[]) {
    this.partColors = colors;
  }

  getPartColors(): string[] {
    return this.partColors;
  }

  abstract decodeURL(url: string): void;

  getJoints(): JointData[] {
    return this.joints;
  }
  getLinks(): LinkData[] {
    return this.links;
  }
  getForces(): ForceData[] {
    return this.forces;
  }

  private getEnumValueByIndex<T extends object>(
    enumType: T,
    index: number
  ): T[keyof T] | undefined {
    const enumKeys = Object.keys(enumType).filter((k) => isNaN(Number(k)));
    const enumKey = enumKeys[index];
    return enumKey !== undefined ? enumType[enumKey as keyof T] : undefined;
  }

  // Returns the enum value linked with the setting.
  getEnumSetting<T extends object>(setting: EnumSetting, enumType: T): T[keyof T] | undefined {
    const settingIndex = this.getEnumIndexByValue(EnumSetting, setting) as number;
    const enumIndex = this.enumData[settingIndex];
    return this.getEnumValueByIndex(enumType, enumIndex);
  }

  // Returns the decimal value linked with the setting.
  getDecimalSetting(setting: DecimalSetting): number {
    const settingIndex = this.getEnumIndexByValue(DecimalSetting, setting) as number;
    return this.decimalData[settingIndex];
  }

  // Returns the integer value linked with the setting.
  getIntSetting(setting: IntSetting): number {
    const settingIndex = this.getEnumIndexByValue(IntSetting, setting) as number;
    return this.intData[settingIndex];
  }

  // Returns the boolean value linked with the setting.
  getBoolSetting(setting: BoolSetting): boolean {
    const settingIndex = this.getEnumIndexByValue(BoolSetting, setting) as number;
    return this.boolData[settingIndex];
  }

  getActiveObj(): ActiveObjData {
    return this.activeObjData;
  }
}
