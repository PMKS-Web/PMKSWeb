import { ACTIVE_TYPE, ActiveObjData, ForceData, JointData, LinkData } from "./transcoder-data";
import {EnumSetting, DecimalSetting, IntSetting, BoolSetting} from "./stored-settings";

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

    protected activeObjData: ActiveObjData = new ActiveObjData(ACTIVE_TYPE.NOTHING, "");

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
        console.log("save joint", joint);
    }
    addLink(link: LinkData) {
        this.links.push(link);
        console.log("save link", link);
    }
    addForce(force: ForceData) {
        this.forces.push(force);
    }

    private getNumberOfEnums(enumType: object): number {
        return Object.keys(enumType).length / 2;
    }

    // Returns the index of the given enum value within the specified enum type.
    // Example usage: getEnumIndex(Color, Color.RED)
    private getEnumIndexByValue(enumType: object, enumValue: any): number | undefined {
        const enumKeys = Object.keys(enumType).filter(k => isNaN(Number(k)));
        const index = enumKeys.findIndex(k => enumType[k as keyof typeof enumType] === enumValue);
        return index !== -1 ? index : undefined;
    }

    // Stores a global setting of type enum in the enumData dictionary.
    // Example usage: addEnumSetting("theme", Color, Color.RED)
    addEnumSetting(setting: EnumSetting, enumType: object, enumValue: any): void {
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

    private getEnumValueByIndex(enumType: object, index: number): any | undefined {
        const enumKeys = Object.keys(enumType).filter(k => isNaN(Number(k)));
        const enumKey = enumKeys[index];
        return enumKey !== undefined ? enumType[enumKey as keyof typeof enumType] : undefined;
      }

    // Returns the enum value linked with the setting.
    getEnumSetting(setting: EnumSetting, enumType: object): any {
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