import { BehaviorSubject } from 'rxjs';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { LengthUnit } from '../../app/model/unit-enums';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { Joint } from '../../app/model/joint';
import { Link } from '../../app/model/link';
import {
  cylinderOfJointIn,
  cylinderOfLinkIn,
  sealedCylinderStructures,
} from '../../app/model/cylinder';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';
import { labelForBody } from 'src/app/model/body-label';

export const COMPLEX_WELDED_MECHANISM =
  '2P.TY.K,20.1010.MA,A,015C,1ft,0.GB,B,0iQ,I4,0.GC,C,2Z0,1Yv,0.OD,D,2W2,KQ,0.GE,E,3jZ,I9,0.GF,F,Nh,0cX,0.GG,G,V8,l5,0.KH,H,CD,25W,0..YRAB,AB,Fe,Fe,0up,z_,c5cae9,A,B,,.YRBCG,BC,Fe,Fe,nw,sh,303e9f,B,C,G,,.YRFGH,FGH,Fe,Fe,ML,lN,00695C,F,G,H,,.YRCDE,CDE,VG,1-v,2qA,dU,c5cae9,C,D,E,,CD,DE.YRDF,DF,Fe,Fe,1Rs,094,303e9f,D,F,,.NRCD,CD,Fe,Fe,2XX,xg,0d125a,C,D,,.NRDE,DE,Fe,Fe,36p,JI,B2DFDB,D,E,,...LFGHJ';

/**
 * A four-bar whose coupler is drawn as two links — ternary CDF and welded
 * compound CDK — both pinned at C and D. The second pin is redundant, which a
 * plain Gruebler count reads as DOF 0.
 */
export const OVER_CLOSED_COUPLER_MECHANISM =
  '2v.VG.K,0.1011.GC,C,01I7,hP,0.GD,D,02r2,eI,0.GF,F,01vm,1VL,0.MH,H,038J,0C3,0.KJ,J,0Aa,0gX,0.OK,K,020n,3U,0..YRCDF,CDF,Fe,Fe,020J,xh,00695C,C,D,F,,.YRDH,DH,Fe,Fe,02_h,E8,B2DFDB,D,H,,.YRCJ,CJ,Fe,Fe,0kL,S,00695C,C,J,,.YRCDK,CDK,VG,1jd,022f,T3,c5cae9,C,K,D,,CK,KD.NRCK,CK,Fe,Fe,01fS,NS,c5cae9,C,K,,.NRKD,KD,Fe,Fe,02Qv,Lu,303e9f,K,D,,...N_O';

export const LOOPLESS_WELDED_MECHANISM =
  '2P.TY.K,0.1010.MA,A,0mv,0VU,0.OB,B,0nV,ni,0.GC,C,0,13H,0..YRABC,ABC,VG,20N,0a_,Xp,303e9f,A,B,C,,AB,BC.NRAB,AB,Fe,Fe,0nC,97,c5cae9,A,B,,.NRBC,BC,Fe,Fe,0Ol,wU,c5cae9,B,C,,...JBo';

export const LEGACY_FORCE_MECHANISM =
  '0v.cc.K,0.101.Ma,a,0,0,0.Gb,b,fk,1Jz,0.Gc,c,2o7,1sD,0.Kd,d,3Qm,0,0..YRab,Crank,Fe,Fe,Kt,f-,c5cae9,a,b,,.YRbc,Coupler,Fe,Fe,1jw,1b5,303e9f,b,c,,.YRcd,Follower,Fe,Fe,36S,x7,c5cae9,c,d,,..2F1,bc,F1,1AR,1SH,1AR,JF,Fe.R';

export interface MechanismFixture {
  active: ActiveObjService;
  mechanism: Mechanism;
  service: MechanismService;
  settings: SettingsService;
}

function mechanismLengthUnit(lengthUnit: LengthUnit): string {
  switch (lengthUnit) {
    case LengthUnit.INCH:
      return 'in';
    case LengthUnit.METER:
      return 'm';
    default:
      return 'cm';
  }
}

/** Decode a production URL payload into the same editable/simulated state used by the UI. */
export function buildMechanismFixture(payload: string): MechanismFixture {
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);

  const settings = new SettingsService();
  const active = new ActiveObjService();
  const service = {
    joints: [],
    links: [],
    forces: [],
    mechanisms: [],
    mechanismTimeStep: 0,
    onMechUpdateState: new BehaviorSubject(0),
    onMechPositionChange: new BehaviorSubject(0),
    // The real `driveSpeedOf` falls back to the document default, so the stub
    // has to be able to reach the same settings the panel reads.
    settingsService: settings,
    // A stub, not the real thing: the panel renders this and the fixtures here
    // are all well-proportioned, so the default answer is "nothing to say".
    // A spec that wants the warning rendered overrides it.
    cylinderReachWarning: () => undefined,
    // Implemented, from the same function the service calls: what counts as a
    // cylinder decides which parts a panel offers and which it folds away, so
    // a stub here could make a drawer look right about a machine it had wrong.
    sealedStructures: () => sealedCylinderStructures(service.joints),
    // This one is not stubbed but implemented, because a panel that changes
    // what it shows for a cylinder has to be tested against a real one. It is
    // the same resolution the service does, over the same joints.
    cylinderAt: (obj: Joint | Link | undefined) => {
      const structures = sealedCylinderStructures(service.joints);
      if (obj instanceof Joint) return cylinderOfJointIn(structures, obj);
      return cylinderOfLinkIn(structures, obj as Link | undefined);
    },
    // Implemented, not stubbed, and from the same function the service calls:
    // the panels put these words on their graphs, so a stub that invented its
    // own would let the labels drift without a spec noticing.
    bodyLabel: (body: Link) =>
      labelForBody(body, cylinderOfLinkIn(sealedCylinderStructures(service.joints), body)),
  } as unknown as MechanismService;
  new MechanismBuilder(service, decoder, settings, active).build(true);

  const inputSpeedRadPerSecond =
    settings.inputSpeed.value * (Math.PI / 30) * (settings.isInputCW.value ? -1 : 1);

  const mechanism = new Mechanism(
    service.joints,
    service.links,
    service.forces,
    [],
    true,
    mechanismLengthUnit(settings.lengthUnit.value),
    inputSpeedRadPerSecond
  );
  service.mechanisms = [mechanism];
  // The editable objects each mechanism was built from, in the same order.
  // applyPose walks these rather than the whole drawing, so a harness that
  // leaves them empty draws no pose at all.
  service.partitions = [
    {
      id: 'M1',
      joints: service.joints,
      // One mechanism holding the whole drawing, so everything in it is its own.
      ownJoints: service.joints,
      links: service.links,
      forces: service.forces,
    },
  ];
  service.oneValidMechanismExists = () => mechanism.isMechanismValid();
  // One machine, so its own place in its cycle is the shared step. The real
  // one reads a per-machine clock the harness has no reason to run.
  service.currentSampleOf = () => service.mechanismTimeStep;
  // Borrowed rather than restated: the panels now ask which machine owns the
  // part they are drawing, and the real lookup reads exactly the two fields
  // set above, so a copy here could only drift away from it.
  service.indexOfMechanismContaining =
    MechanismService.prototype.indexOfMechanismContaining.bind(service);
  service.mechanismContaining = MechanismService.prototype.mechanismContaining.bind(service);
  service.partitionContaining = MechanismService.prototype.partitionContaining.bind(service);
  service.driveSpeedOf = MechanismService.prototype.driveSpeedOf.bind(service);
  // Which part the canvas is holding, borrowed rather than restated. The
  // panels ask this to mark the row a reader has already picked, and a copy
  // here could disagree with the canvas about what "selected" means -- a
  // cylinder in particular, which answers for all of its pieces.
  (service as { activeObjService: ActiveObjService }).activeObjService = active;
  // The slot a pin rides in, from the same lookup the service does: what a
  // panel calls a slider, and which reactions belong to it, both hang off this.
  (service as unknown as Record<string, unknown>)['sliderOf'] = (
    MechanismService.prototype as unknown as Record<string, (joint: Joint | undefined) => unknown>
  )['sliderOf'].bind(service);
  service.sliderFor = MechanismService.prototype.sliderFor.bind(service);
  // What a slider's reactions are called, from the same rule the panels and the
  // export both read: a slot has no name a reader has been shown, so both name
  // it after the pin, and a copy here could let the two drift apart.
  service.slotReactionOf = MechanismService.prototype.slotReactionOf.bind(service);
  service.slotName = MechanismService.prototype.slotName.bind(service);
  service.isSelectedJoint = MechanismService.prototype.isSelectedJoint.bind(service);
  service.isSelectedBody = MechanismService.prototype.isSelectedBody.bind(service);

  return { active, mechanism, service, settings };
}
