import { Injectable } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject, Subject } from 'rxjs';
import { COR, SynthesisPose } from './synthesis-util';
import { Coord } from 'src/app/model/coord';
import { SynthesisClickMode, SynthesisConstants } from './synthesis-constants';
import { NumberUnitParserService } from '../number-unit-parser.service';
import { SettingsService } from '../settings.service';

/*
Service responsible for storing end effector poses to be synthesized
into fourbars. Relevant to the Synthesis tab of the app.
*/

@Injectable({
  providedIn: 'root',
})
export class SynthesisBuilderService {
  public valueChanges: Subject<any>;

  public constants: SynthesisConstants;

  _COR: COR;
  _length: number; // length of the end-effector link
  _selectedPose: number; // currently selected pose (1-3)

  poses: { [key: number]: SynthesisPose }; // a dictionary of poses, but including each pose is optional

  constructor(private nup: NumberUnitParserService, private settings: SettingsService) {
    this.valueChanges = new Subject<any>();
    this.constants = new SynthesisConstants();

    // start with a length of 1
    this._COR = COR.CENTER;
    this._length = 5;
    this._selectedPose = 1;

    // start with no defined poses
    this.poses = {};
  }

  get COR(): COR {
    return this._COR;
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
    this.poses[id] = new SynthesisPose(
      id,
      defaultPosition,
      defaultThetaRadians,
      () => this.COR,
      () => this.length
    );
    this.valueChanges.next(true);
  }

  getPose(id: number): SynthesisPose {
    if (!this.isPoseDefined(id)) {
      throw new Error(`Pose ${id} is not defined`);
    }

    return this.poses[id]!;
  }

  // whether all poses are defined to be synthesized
  isFullyDefined(): boolean {
    return this.getAllPoses().length === 3;
  }

  setPoseTheta(pose: SynthesisPose, thetaRadians: number) {
    pose.thetaRadians = thetaRadians;
    this.valueChanges.next(true);
  }

  movePoseByOffset(pose: SynthesisPose, mode: SynthesisClickMode, dx: number, dy: number) {
    // if dragging by coordinate axis, project onto axis
    if (mode !== SynthesisClickMode.NORMAL) {
      let theta = pose.thetaRadians;
      if (mode === SynthesisClickMode.Y) theta += Math.PI / 2;

      let d = dx * Math.cos(theta) + dy * Math.sin(theta);
      dx = d * Math.cos(theta);
      dy = d * Math.sin(theta);
    }

    pose.position = new Coord(pose.position.x + dx, pose.position.y + dy);
    this.valueChanges.next(true);
  }

  // return all existing poses
  getAllPoses(): SynthesisPose[] {
    let poses: SynthesisPose[] = [];
    for (let i = 1; i <= 3; i++) {
      if (this.isPoseDefined(i)) {
        poses.push(this.getPose(i));
      }
    }
    return poses;
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

  deleteAllPoses(): void {
    this.poses = {};
    this.valueChanges.next(true);
  }

  // given form, update poses
  // if form is invalid, return false to revert form
  updatePosesFromForm(form: { [key: string]: any }): boolean {
    if (form['cor'] === '0') this._COR = COR.BACK;
    else if (form['cor'] === '1') this._COR = COR.CENTER;
    else this._COR = COR.FRONT;

    // if length is a number and positive, update length
    const [success, maybeLength] = this.nup.parseLengthString(
      form['length'],
      this.settings.lengthUnit.getValue()
    );
    if (!success) {
      console.log('invalid length');
      return false;
    }
    this.length = maybeLength;

    for (let i = 1; i <= 3; i++) {
      if (!this.isPoseDefined(i)) continue;

      // if x and y are numbers, update position
      const [successX, maybeX] = this.nup.parseLengthString(
        form[`p${i}x`],
        this.settings.lengthUnit.getValue()
      );
      const [successY, maybeY] = this.nup.parseLengthString(
        form[`p${i}y`],
        this.settings.lengthUnit.getValue()
      );
      if (!successX || !successY) {
        console.log('invalid coord');
        return false;
      }
      this.poses[i].position = new Coord(maybeX, maybeY);

      // if theta is a number, update theta
      const [successTheta, maybeTheta] = this.nup.parseAngleString(
        form[`p${i}theta`],
        this.settings.angleUnit.getValue()
      );
      if (!successTheta) {
        console.log('invalid theta');
        return false;
      }
      this.poses[i].thetaDegrees = maybeTheta;
    }

    // if we get here, form is valid
    return true;
  }
}
