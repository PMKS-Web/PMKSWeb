import { Injectable } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SynthesisPose } from './synthesis-util';
import { Coord } from 'src/app/model/coord';
import { SynthesisConstants } from './synthesis-constants';

/*
Service responsible for storing end effector poses to be synthesized
into fourbars. Relevant to the Synthesis tab of the app.
*/

@Injectable({
  providedIn: 'root'
})
export class SynthesisBuilderService {

  public constants: SynthesisConstants;

  _length: number; // length of the end-effector link
  _selectedPose: number; // currently selected pose (1-3)

  poses: { [key : number]: SynthesisPose }; // a dictionary of poses, but including each pose is optional


  constructor() { 

    this.constants = new SynthesisConstants();

    // start with a length of 1
    this._length = 1;
    this._selectedPose = 1;

    // start with no defined poses
    this.poses = {};
  }

  get length(): number {
    return this._length;
  }

  set length(length: number) {
    this._length = length;
    for (let pose of this.getAllPoses()) {
      pose.recompute();
    }
  }

  get selectedPose(): number {
    return this._selectedPose;
  }

  set selectedPose(selectedPose: number) {
    this._selectedPose = selectedPose;
  }

  isPoseDefined(id: number): boolean {
    return this.poses[id] !== undefined;
  }

  // create a new pose. put it in some preset default position
  createPose(id: number): void {

    let defaultPosition = new Coord(0, 0);
    let defaultThetaRadians = 0;

    // create pose with a callback to always get current length
    this.poses[id] = new SynthesisPose(id, defaultPosition, defaultThetaRadians, () => this.length);
  }

  getPose(id: number): SynthesisPose {

    if (!this.isPoseDefined(id)) {
      throw new Error(`Pose ${id} is not defined`);
    }

    return this.poses[id]!;
  }

  // return all existing poses
  getAllPoses(): SynthesisPose[] {
    return Object.values(this.poses);
  }

  // get the first pose that needs to be created
  getFirstUndefinedPose(): number | undefined {
    for (let i = 1; i <= 3; i++) {
      if (!this.isPoseDefined(i)) {
        return i;
      }
    }
    return undefined;
  }
}
