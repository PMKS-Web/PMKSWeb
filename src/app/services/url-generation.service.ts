import { Injectable } from '@angular/core';
import { MechanismService } from './mechanism.service';
import { Link, Piston, RealLink } from '../model/link';
import { LengthUnit, AngleUnit, ForceUnit, GlobalUnit } from '../model/utils';
import { EnumSetting, BoolSetting, IntSetting, DecimalSetting } from './transcoding/stored-settings';
import { StringTranscoder } from './transcoding/string-transcoder';
import { Force } from '../model/force';
import { Joint, RevJoint, PrisJoint } from '../model/joint';
import { JointData, JOINT_TYPE, LinkData, LINK_TYPE, ForceData, ActiveObjData, ACTIVE_TYPE } from './transcoding/transcoder-data';
import { SettingsService } from './settings.service';
import { ActiveObjService } from './active-obj.service';

/*
  * This service is responsible for generating the URL from the current mechanism.
  * It is not responsible for decoding the URL.
*/

@Injectable({
  providedIn: 'root'
})
export class UrlGenerationService {


  constructor(
    private mechanism: MechanismService,
    private settings: SettingsService,
    private activeObj: ActiveObjService,
  ) {}


  _addJointToEncoder(encoder: StringTranscoder, joint: Joint) {
    if (joint instanceof RevJoint) {
      encoder.addJoint(
        new JointData(
          JOINT_TYPE.REVOLUTE,
          joint.id,
          joint.name,
          joint.x,
          joint.y,
          joint.ground,
          joint.input,
          joint.isWelded,
          0,
          joint.showCurve
        )
      );
    } else if (joint instanceof PrisJoint) {
      encoder.addJoint(
        new JointData(
          JOINT_TYPE.PRISMATIC,
          joint.id,
          joint.name,
          joint.x,
          joint.y,
          joint.ground,
          joint.input,
          joint.isWelded,
          joint.angle_rad,
          joint.showCurve
        )
      );
    }
  }

  _addLinkToEncoder(encoder: StringTranscoder, link: Link, isRoot: boolean) {
    if (link instanceof RealLink) {
      encoder.addLink(
        new LinkData(
          isRoot,
          LINK_TYPE.REAL,
          link.id,
          link.name,
          link.mass,
          link.massMoI,
          link.CoM.x,
          link.CoM.y,
          link.fill,
          link.joints.map((joint) => joint.id),
          link.subset.map((subset) => subset.id)
        )
      );
    } else if (link instanceof Piston) {
      encoder.addLink(
        new LinkData(
          isRoot,
          LINK_TYPE.PISTON,
          link.id,
          link.name,
          link.mass,
          0,
          0,
          0,
          '',
          link.joints.map((joint) => joint.id),
          []
        )
      );
    }
  }

  _addForceToEncoder(encoder: StringTranscoder, force: Force) {
    encoder.addForce(
      new ForceData(
        force.id,
        force.link.id,
        force.name,
        force.startCoord.x,
        force.startCoord.y,
        force.endCoord.x,
        force.endCoord.y,
        force.local,
        force.arrowOutward,
        force.mag
      )
    );
  }

  generateUrlQuery(): string {
    // First, reset animation to the beginning, but cache animation frame to restore afterwards
    let cachedAnimationFrame = this.mechanism.mechanismTimeStep;
    if (cachedAnimationFrame > 0) this.mechanism.animate(0, false);

    let encoder = new StringTranscoder();

    // add each joint
    this.mechanism.joints.forEach((joint) => {
      this._addJointToEncoder(encoder, joint);
    });

    // add each (non-subset) link
    this.mechanism.links.forEach((link) => {
      this._addLinkToEncoder(encoder, link, true);
    });

    // for each link, add subset links
    this.mechanism.links.forEach((link) => {
      if (link instanceof RealLink) {
        link.subset.forEach((subsetLink) => {
          this._addLinkToEncoder(encoder, subsetLink, false);
        });
      }
    });

    this.mechanism.forces.forEach((force) => {
      this._addForceToEncoder(encoder, force);
    });

    // Encode global settings
    encoder.addEnumSetting(
      EnumSetting.LENGTH_UNIT,
      LengthUnit,
      this.settings.lengthUnit.getValue()
    );
    encoder.addEnumSetting(EnumSetting.ANGLE_UNIT, AngleUnit, this.settings.angleUnit.getValue());
    encoder.addEnumSetting(EnumSetting.FORCE_UNIT, ForceUnit, this.settings.forceUnit.getValue());
    encoder.addEnumSetting(
      EnumSetting.GLOBAL_UNIT,
      GlobalUnit,
      this.settings.globalUnit.getValue()
    );
    encoder.addBoolSetting(BoolSetting.IS_INPUT_CW, this.settings.isInputCW.getValue());
    //encoder.addBoolSetting(BoolSetting.IS_GRAVITY, this.settings.isGravity.getValue());
    encoder.addIntSetting(IntSetting.INPUT_SPEED, this.settings.inputSpeed.getValue());
    encoder.addBoolSetting(
      BoolSetting.IS_SHOW_MAJOR_GRID,
      this.settings.isShowMajorGrid.getValue()
    );
    encoder.addBoolSetting(
      BoolSetting.IS_SHOW_MINOR_GRID,
      this.settings.isShowMinorGrid.getValue()
    );
    encoder.addBoolSetting(BoolSetting.IS_SHOW_ID, this.settings.isShowID.getValue());
    encoder.addBoolSetting(BoolSetting.IS_SHOW_COM, this.settings.isShowCOM.getValue());
    encoder.addDecimalSetting(DecimalSetting.SCALE, this.settings.objectScale);

    encoder.addIntSetting(IntSetting.TIMESTEP, cachedAnimationFrame);

    let type: ACTIVE_TYPE;
    let exists = true;
    if (this.activeObj.objType === 'Joint') type = ACTIVE_TYPE.JOINT;
    else if (this.activeObj.objType === 'Link') type = ACTIVE_TYPE.LINK;
    else if (this.activeObj.objType === 'Force') type = ACTIVE_TYPE.FORCE;
    else {
      type = ACTIVE_TYPE.NOTHING;
      exists = false;
    }

    let id;
    if (exists) id = this.activeObj.getSelectedObj().id;
    else id = '_';
    encoder.setActiveObj(new ActiveObjData(type, id));

    let urlRaw = encoder.encodeURL();

    // Restore animation frame
    if (cachedAnimationFrame > 0) this.mechanism.animate(cachedAnimationFrame, false);

    return urlRaw;
  }

  getURLPrefix(): string {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    const port = window.location.port;
    return `${protocol}//${hostname}${port ? `:${port}` : ''}${pathname}`;
  }

  generateFullUrl(): string {
    let urlQuery = this.generateUrlQuery();

    const url = this.getURLPrefix();
    const dataURLString = `${url}?${urlQuery}`;
    const dataURL = encodeURI(dataURLString);
    return dataURL;
  }

}
