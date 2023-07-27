import { Injectable } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { Pose, PoseID } from './synthesis-util';
import { Coord } from 'src/app/model/coord';

/*
Service responsible for storing end effector poses to be synthesized
into fourbars. Relevant to the Synthesis tab of the app.
*/

@Injectable({
  providedIn: 'root'
})
export class SynthesisBuilderService {

  length: BehaviorSubject<number>; // length of the end-effector link
  poses: { [key in PoseID]?: Pose }; // a dictionary of poses, but including each pose is optional

  selectedPose: BehaviorSubject<PoseID>;


  constructor() { 

    // start with a length of 1
    this.length = new BehaviorSubject<number>(1);

    // start with no defined poses
    this.poses = {};
    this.selectedPose = new BehaviorSubject<PoseID>(PoseID.POSE_ONE);
  }

  isPoseDefined(id: PoseID): boolean {
    return this.poses[id] !== undefined;
  }

  definePose(id: PoseID, pose: Pose): void {
    this.poses[id] = pose;
  }

  // calculate and return the coordinates of the end effector for a given pose
  getPoseCoords(id: PoseID): [Coord, Coord] {

    if (this.poses[id] === undefined) {
      throw new Error("Pose is not defined");
    }

    let pose = this.poses[id]!;
    let halfLength = this.length.getValue() / 2;

    let dx = Math.cos(pose.thetaRadians) * halfLength;
    let dy = Math.sin(pose.thetaRadians) * halfLength;

    let coord1 = new Coord(pose.position.x - dx, pose.position.y - dy);
    let coord2 = new Coord(pose.position.x + dx, pose.position.y + dy);

    return [coord1, coord2];
  }

}
