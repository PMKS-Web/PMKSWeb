import { Injectable } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { PoseID } from './synthesis-util';

/*
Service responsible for storing end effector poses to be synthesized
into fourbars. Relevant to the Synthesis tab of the app.
*/

@Injectable({
  providedIn: 'root'
})
export class SynthesisBuilderService {

  selectedPose: BehaviorSubject<PoseID>;

  constructor() { 

    this.selectedPose = new BehaviorSubject<PoseID>(PoseID.POSE_ONE);

  }


}
