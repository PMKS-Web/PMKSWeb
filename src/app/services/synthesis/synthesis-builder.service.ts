import { Injectable } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
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

  public valueChanges: Subject<any>;

  public constants: SynthesisConstants;

  _length: number; // length of the end-effector link
  _selectedPose: number; // currently selected pose (1-3)

  poses: { [key : number]: SynthesisPose }; // a dictionary of poses, but including each pose is optional


  constructor() { 

    this.valueChanges = new Subject<any>();
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

    let defaultPosition = new Coord(id, id);
    let defaultThetaRadians = 0;

    // create pose with a callback to always get current length
    this.poses[id] = new SynthesisPose(id, defaultPosition, defaultThetaRadians, () => this.length);
    this.valueChanges.next(true);
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

  // given form, update poses
  // if form is invalid, return false to revert form
  updatePosesFromForm(form: {[key: string]: any}): boolean {
    console.log(form);

    // if length is a number and positive, update length
    let maybeLength = Number(form["length"]);
    if (isNaN(maybeLength) || maybeLength <= 0) return false;
    this.length = maybeLength;

    for (let i = 1; i <= 3; i++) {
      if (!this.isPoseDefined(i)) continue;

      // if x and y are numbers, update position
      let maybeX = Number(form[`p${i}x`]);
      let maybeY = Number(form[`p${i}y`]);
      if (isNaN(maybeX) || isNaN(maybeY)) return false;
      this.poses[1].position = new Coord(maybeX, maybeY);

      // if theta is a number, update theta
      let maybeTheta = Number(form[`p${i}theta`]);
      if (isNaN(maybeTheta)) return false;
      this.poses[i].thetaRadians = maybeTheta;
    }

    // if we get here, form is valid
    console.log(this);
    return true;
  }


}
