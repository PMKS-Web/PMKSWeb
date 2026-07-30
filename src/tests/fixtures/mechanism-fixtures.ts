import { BehaviorSubject } from 'rxjs';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { LengthUnit } from '../../app/model/unit-enums';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';

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
  service.oneValidMechanismExists = () => mechanism.isMechanismValid();

  return { active, mechanism, service, settings };
}
