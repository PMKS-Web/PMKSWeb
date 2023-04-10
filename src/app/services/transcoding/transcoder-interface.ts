import { ForceData, JointData, LinkData } from "./transcoder-data";

/*
    * This file contains the interface for the encoder and decoder,
    * which is used to encode and decode the mechanism to and from a url.
    * The goal of implementations of these interfaces is for the url
    * to be as short as possible. Data is passed through structs defined
    * in transcoder-data.ts.
*/

export abstract class GenericEncoder {

    abstract addJoint(joint: JointData): void;
    abstract addLink(link: LinkData): void;
    abstract addForce(force: ForceData): void;

    abstract setUnits(globalUnits: string, angleUnits: string): void;
    abstract setInputVector(speed: number, direction: number): void;
    abstract setGravityOn(isOn: boolean): void;
    abstract setGrid(isOn: boolean, isMinorGridLinesOn: boolean): void;
    abstract setScale(scale: number): void;
    abstract setCurrentTimestep(timestep: number): void;

    abstract encodeURL(): string;
}

export abstract class GenericDecoder {

    constructor(private url: string) {}

    abstract getJoints(): JointData[]
    abstract getLinks(): LinkData[];
    abstract getForces(): ForceData[];

    abstract getUnits(): {globalUnits: string, angleUnits: string};
    abstract getInputVector(): {speed: number, direction: number};
    abstract getGravityOn(): boolean;
    abstract getGrid(): {isOn: boolean, isMinorGridLinesOn: boolean};
    abstract getScale(): number;
    abstract getCurrentTimestep(): number;
}