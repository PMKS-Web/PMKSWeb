import { Injectable, inject } from '@angular/core';
import { MechanismService } from './mechanism.service';
import { Link, SliderBlock, RealLink } from '../model/link';
import { LengthUnit, AngleUnit, ForceUnit, GlobalUnit } from '../model/utils';
import {
  EnumSetting,
  BoolSetting,
  IntSetting,
  DecimalSetting,
} from './transcoding/stored-settings';
import { StringTranscoder } from './transcoding/string-transcoder';
import { Force } from '../model/force';
import { Joint, RealJoint, RevJoint, PrisJoint } from '../model/joint';
import {
  JointData,
  JOINT_TYPE,
  LinkData,
  LINK_TYPE,
  ForceData,
  ActiveObjData,
  ACTIVE_TYPE,
} from './transcoding/transcoder-data';
import { SettingsService } from './settings.service';
import { MODEL_SCALE } from '../model/render-scale';

/*
 * This service is responsible for generating the URL from the current mechanism.
 * It is not responsible for decoding the URL.
 *
 * The internal world is MODEL_SCALE times the user's units (render-scale.ts),
 * so every length divides by MODEL_SCALE on its way into the URL. Together
 * with the matching multiply in MechanismBuilder, URLs carry exactly the same
 * numbers they did before the internal scale existed.
 */

@Injectable({
  providedIn: 'root',
})
export class UrlGenerationService {
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);

  _addJointToEncoder(encoder: StringTranscoder, joint: Joint) {
    if (joint instanceof RevJoint) {
      encoder.addJoint(
        new JointData(
          JOINT_TYPE.REVOLUTE,
          joint.id,
          joint.name,
          joint.x / MODEL_SCALE,
          joint.y / MODEL_SCALE,
          joint.ground,
          joint.input,
          joint.isWelded,
          0,
          joint.showCurve,
          '',
          '',
          '',
          false,
          joint.driveSpeed
        )
      );
    } else if (joint instanceof PrisJoint) {
      encoder.addJoint(
        new JointData(
          JOINT_TYPE.PRISMATIC,
          joint.id,
          joint.name,
          joint.x / MODEL_SCALE,
          joint.y / MODEL_SCALE,
          joint.ground,
          joint.input,
          joint.isWelded,
          joint.angle_rad,
          joint.showCurve,
          joint.carrier?.id ?? '',
          joint.slotJointA?.id ?? '',
          joint.slotJointB?.id ?? '',
          joint.isSealed,
          joint.driveSpeed
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
          link.CoM.x / MODEL_SCALE,
          link.CoM.y / MODEL_SCALE,
          link.fill,
          link.joints.map((joint) => joint.id),
          link.subset.map((subset) => subset.id),
          link.moiIsCustom,
          link.comIsCustom
        )
      );
    } else if (link instanceof SliderBlock) {
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
        force.startCoord.x / MODEL_SCALE,
        force.startCoord.y / MODEL_SCALE,
        force.endCoord.x / MODEL_SCALE,
        force.endCoord.y / MODEL_SCALE,
        force.local,
        force.arrowOutward,
        force.mag
      )
    );
  }

  generateUrlQuery(): string {
    // The format stores the start pose, so encoding is a round trip through
    // t = 0 -- and every machine has to come back to its own place afterwards,
    // not to the master's, which is the mechanism service's job because the
    // clocks are its. A collaborator that has no clocks to protect -- the
    // stubs the codec is tested against -- encodes where it stands.
    const park =
      this.mechanism.encodeFromStartPose?.bind(this.mechanism) ??
      ((run: (step: number) => string) => run(this.mechanism.mechanismTimeStep ?? 0));
    return park((cachedAnimationFrame) => {
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

      // Lock marks, as type-tagged references. Only joints and forces carry
      // marks — locking a link is a shortcut that marks its joints — but the
      // decoder still honours 'L' references from earlier spellings.
      encoder.setLockedIds([
        ...this.mechanism.joints
          .filter((joint): joint is RealJoint => joint instanceof RealJoint && joint.locked)
          .map((joint) => 'J' + joint.id),
        ...this.mechanism.forces.filter((force) => force.locked).map((force) => 'F' + force.id),
      ]);

      // Encode global settings
      encoder.addEnumSetting(
        EnumSetting.LENGTH_UNIT,
        LengthUnit,
        this.settings.lengthUnit.getValue()
      );
      encoder.addEnumSetting(EnumSetting.ANGLE_UNIT, AngleUnit, this.settings.angleUnit.getValue());
      const normalizedGlobal =
        this.settings.lengthUnit.getValue() === LengthUnit.INCH
          ? GlobalUnit.ENGLISH
          : this.settings.lengthUnit.getValue() === LengthUnit.METER
            ? GlobalUnit.SI
            : GlobalUnit.METRIC;
      encoder.addEnumSetting(
        EnumSetting.FORCE_UNIT,
        ForceUnit,
        normalizedGlobal === GlobalUnit.ENGLISH ? ForceUnit.LBF : ForceUnit.NEWTON
      );
      encoder.addEnumSetting(EnumSetting.GLOBAL_UNIT, GlobalUnit, normalizedGlobal);
      encoder.addBoolSetting(BoolSetting.IS_INPUT_CW, this.settings.isInputCW.getValue());
      // Inverted on purpose: false is what every pre-flag URL unpacks, and
      // false has to keep meaning gravity on (see stored-settings.ts).
      encoder.addBoolSetting(BoolSetting.GRAVITY_OFF, !this.settings.isGravity.getValue());
      encoder.addIntSetting(IntSetting.INPUT_SPEED, this.settings.inputSpeed.getValue());
      encoder.addDecimalSetting(
        DecimalSetting.LINEAR_INPUT_SPEED,
        this.settings.linearInputSpeed.getValue()
      );
      encoder.addBoolSetting(
        BoolSetting.IS_SHOW_MAJOR_GRID,
        this.settings.isShowMajorGrid.getValue()
      );
      encoder.addBoolSetting(
        BoolSetting.IS_SHOW_MINOR_GRID,
        this.settings.isShowMinorGrid.getValue()
      );
      encoder.addBoolSetting(BoolSetting.IS_SHOW_ID, this.settings.isShowID.getValue());
      // Frozen at the old default: the CoM toggle is a machine-local display
      // preference now and the decoder no longer reads this bit. Writing the
      // live value would churn every generated URL for a bit nobody consumes.
      encoder.addBoolSetting(BoolSetting.IS_SHOW_COM, false);
      encoder.addDecimalSetting(DecimalSetting.SCALE, this.settings.objectScale / MODEL_SCALE);

      encoder.addIntSetting(IntSetting.TIMESTEP, cachedAnimationFrame);

      // Keep this legacy bit enabled so existing URL field positions remain compatible.
      encoder.addBoolSetting(BoolSetting.IS_FORCES, true);

      // Deliberately empty. What is selected is not part of the mechanism: a
      // shared link should open on the reader's own nothing-selected, not on
      // whatever the sender last clicked, and undo -- which replays these URLs --
      // should move the mechanism rather than the highlight.
      //
      // The field itself stays, always empty, because its position in the format
      // is load-bearing for every URL already shared.
      encoder.setActiveObj(new ActiveObjData(ACTIVE_TYPE.NOTHING, '_'));

      let urlRaw = encoder.encodeURL();

      return urlRaw;
    });
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

  /**
   * Put the share link on the clipboard.
   *
   * Through a scratch textarea and `execCommand` rather than the clipboard
   * API, which needs a secure context and a permission the app has never asked
   * for. Here rather than in a panel because two of them share it now.
   */
  copyFullUrl(): void {
    const url = this.generateFullUrl();
    const scratch = document.createElement('textarea');
    document.body.appendChild(scratch);
    scratch.value = url;
    scratch.textContent = url;
    scratch.select();
    document.execCommand('copy');
    document.body.removeChild(scratch);
  }
}
