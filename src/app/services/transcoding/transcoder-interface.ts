import { ForceData, JointData, LinkData } from "./transcoder-data";

/*
    * This file contains the interface for the encoder and decoder,
    * which is used to encode and decode the mechanism to and from a url.
    * The goal of implementations of these interfaces is for the url
    * to be as short as possible. Data is passed through structs defined
    * in transcoder-data.ts.
*/

export abstract class GenericEncoder {

    joints: JointData[] = [];
    links: LinkData[] = [];
    forces: ForceData[] = [];

    globalUnits: string = "";
    angleUnits: string = "";
    speed: number = 0;
    scale: number = 0;
    timestep: number = 0;
    direction: boolean = false;
    isGravityOn: boolean = false;
    isGridOn: boolean = false;
    isMinorGridLinesOn: boolean = false;
    

    addJoint(joint: JointData): void {
        this.joints.push(joint);
    }
    addLink(link: LinkData) {
        this.links.push(link);
    }
    addForce(force: ForceData) {
        this.forces.push(force);
    }
    setUnits(globalUnits: string, angleUnits: string): void {
        this.globalUnits = globalUnits;
    }
    setInputVector(speed: number, direction: boolean): void {
        this.speed = speed;
        this.direction = direction;
    }
    setGravityOn(isOn: boolean): void {
        this.isGravityOn = isOn;
    }
    setGrid(isOn: boolean, isMinorGridLinesOn: boolean): void {
        this.isGridOn = isOn;
        this.isMinorGridLinesOn = isMinorGridLinesOn;
    }
    setScale(scale: number): void {
        this.scale = scale;
    }
    setCurrentTimestep(timestep: number): void {
        this.timestep = timestep;
    }

    // Note: users should still encodeURI just in case there are any special characters
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