import { Coord } from "src/app/model/coord"

export enum PoseID {
    POSE_ONE,
    POSE_TWO,
    POSE_THREE,
}

export class Pose {

    constructor(
        public id: PoseID,
        public position: Coord,
        public thetaRadians: number) {
    }   
}