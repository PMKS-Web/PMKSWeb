/*
    * This file contains the data structures used by the transcoder.
    * These data structures are used to store the data in a format that is
    * easy to encode and decode.
*/

export enum JOINT_TYPE {PRISMATIC, REVOLUTE};
export enum LINK_TYPE {REAL, PISTON};

export class JointData {
    constructor(
        public type: JOINT_TYPE,
        public id: string,
        public x: number,
        public y: number,
        public isGrounded: boolean,
        public isInput: boolean,
        public isWelded: boolean,
        public angleRadians: number
    ) {}
}

export class LinkData {
    constructor(
        public isRoot: boolean,
        public type: LINK_TYPE,
        public id: string,
        public mass: number,
        public massMoI: number = 0,
        public xCoM: number = 0,
        public yCoM: number = 0,
        public jointIDs: string[] = [],
        public subsetLinkIDs: string[] = [],
    ) {}
}

export class ForceData {
    constructor(
        public id: string,
        public linkID: string,
        public startX: number,
        public startY: number,
        public endX: number,
        public endY: number,
        public isLocal: boolean,
        public isFacingOut: boolean,
        public magnitude: number
    ) {}
}