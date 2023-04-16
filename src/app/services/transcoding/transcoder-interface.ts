import { ForceData, JointData, LinkData } from "./transcoder-data";

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

    protected globalUnits: string = "";
    protected angleUnits: string = "";
    protected speed: number = 0;
    protected scale: number = 0;
    protected timestep: number = 0;
    protected direction: boolean = false;
    protected isGravityOn: boolean = false;
    protected isGridOn: boolean = false;
    protected isMinorGridLinesOn: boolean = false;
    
    abstract encodeURL(): string;

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

    getUnits(): [string, string] {
        return [this.globalUnits, this.angleUnits];
    }
    getInputVector(): [number, boolean] {
        return [this.speed, this.direction];
    }
    getGravityOn(): boolean {
        return this.isGravityOn;
    }
    getGrid(): [boolean, boolean] {
        return [this.isGridOn, this.isMinorGridLinesOn];
    }
    getScale(): number {
        return this.scale;
    }
    getCurrentTimestep(): number {
        return this.timestep;
    }
}