// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { AppModule } from '../../app/app.module';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { SaveHistoryService } from '../../app/services/save-history.service';
import { Coord } from '../../app/model/coord';
import { RevJoint, RealJoint } from '../../app/model/joint';
import { RealLink } from '../../app/model/link';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';

/**
 * A mechanism built to be awkward: four welded compounds, two cylinders, a
 * grounded joint carrying two links, and one joint welded into one compound
 * while a third link through it stayed loose.
 *
 * Kept whole rather than trimmed. Every defect below was found in it, and each
 * needed some *other* part of it to show up — the unrelated link that vanished
 * was only unrelated because there was something else on the grid to be.
 */
const STRESS =
  '2P.VC,1E8.K,0.1011.GA,A,0PU,23z,0.SB,B,0JA,02Z,0.OC,C,1ut,02Z,0.GD,D,2xB,qS,0.OE,E,3wx,Sd,0' +
  '.JF,F,2xB,qS,0,AEGH,A,E.GG,G,3PB,0dw,0.GH,H,3fu,084,0.GI,I,4y-,0c2,0.OJ,J,4FG,0LZ,0.KK,K,5YN,0pX,0' +
  '.nL,L,4FG,0LZ,0,HI,H,I.OM,M,5xI,1Ny,0.ON,N,3sj,2fC,0.OO,O,1fb,1Iz,0.HP,P,1fb,1Iz,0,AEGH,A,E' +
  '.KQ,Q,01Tf,02Z,0.GR,R,0-2,vs,0.OS,S,0u5,17a,0.nU,U,0u5,17a,0,QR,Q,R..YRABCD,ABCD,ku,2yD1Hx,11t,ir,c5cae9,A,B,C,D,,AB,BC,CD' +
  '.YPDF,DF,Fe,0,0,0,,D,F,,.YRAEGH,AEGH,VG,1cbxqB,2f8,S9,B2DFDB,A,E,G,H,,AE,EGH' +
  '.YRHI,HI,Fe,Fe,4JR,0N3,00695C,H,I,,.YRJK,JK,Fe,Fe,4uq,0aY,c5cae9,J,K,,.YPJL,JL,Fe,0,0,0,,J,L,,' +
  '.YRAKM,AKM,VG,3HfEsT,3i4,u8,303e9f,K,M,A,,KM,MA.YPOP,OP,Fe,0,0,0,,O,P,,' +
  '.YRMNO,MNO,VG,1RULl2,3pt,1nN,00695C,N,O,M,,NO,NM.YRQR,QR,Fe,Fe,01EM,Rf,00695C,Q,R,,' +
  '.YRAS,AS,Fe,Fe,0en,1bn,c5cae9,S,A,,.YPSU,SU,Fe,0,0,0,,S,U,,.NRAB,AB,Fe,Fe,0MK,10j,c5cae9,A,B,,' +
  '.NRBC,BC,Fe,Fe,os,02Z,303e9f,B,C,,.NRCD,CD,Fe,Fe,2Q1,Oz,0d125a,C,D,,.NRAE,AE,Fe,Fe,1ml,1GI,B2DFDB,A,E,,' +
  '.NREGH,EGH,Fe,Fe,3f-,06T,26A69A,E,G,H,,.NRKM,KM,Fe,Fe,5kq,ID,303e9f,K,M,,.NRMA,MA,Fe,Fe,2mw,1jz,0d125a,M,A,,' +
  '.NRNO,NO,Fe,Fe,2m9,1_4,00695C,N,O,,.NRNM,NM,Fe,Fe,4u-,20a,0d125a,N,M,,...JNq';

/** Every top-level body a joint belongs to. A welded joint should be in one. */
const bodiesAt = (mechanism: MechanismService, id: string) =>
  mechanism.links
    .filter((link): link is RealLink => link instanceof RealLink)
    .filter((link) => link.joints.some((joint) => joint.id === id))
    .map((link) => link.id);

describe('a joint is welded or it is not', () => {
  let mechanism: MechanismService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    mechanism = TestBed.inject(MechanismService);
    TestBed.inject(UrlProcessorService).updateFromURL(STRESS, false, true, false);
  });

  it('repairs a weld that only got half way, on the way in', () => {
    // As saved, joint M is flagged welded and sits in *two* compounds: AKM
    // holds KM and MA, MNO holds NM. So M drew its weld marker while one of
    // the bars through it was still free to turn — welded and pinned at once,
    // which the model has no answer for and a user cannot see the shape of.
    //
    // Repaired rather than stripped: the flag is the user's statement that this
    // joint is rigid, and one compound is simply how that gets represented.
    const M = mechanism.joints.find((joint) => joint.id === 'M') as RealJoint;
    expect(M.isWelded).toBe(true);
    expect(bodiesAt(mechanism, 'M')).toHaveLength(1);

    // And the one body is all four bars that meet there, not some of them.
    const compound = mechanism.links.find(
      (link): link is RealLink => link instanceof RealLink && link.joints.includes(M)
    )!;
    expect(compound.subset.map((leaf) => leaf.id).sort()).toEqual(['KM', 'MA', 'NM', 'NO']);
  });

  it('leaves every other weld in the mechanism exactly as it was', () => {
    // The repair is narrow. Nothing else about a mechanism that merely *loads*
    // should move.
    const welded = mechanism.joints
      .filter((joint) => joint instanceof RealJoint && joint.isWelded)
      .map((joint) => joint.id)
      .sort();
    expect(welded).toEqual(['B', 'C', 'E', 'J', 'M', 'N', 'O', 'S']);
    for (const id of welded) expect(bodiesAt(mechanism, id)).toHaveLength(1);
  });
});

describe('Un-weld All, on a link that has its own Compound Link Settings', () => {
  it('takes apart that compound and no others', () => {
    // The control lives inside a selected link's own section, so "all" has
    // always meant "all of this one". It was reading as "all in the mechanism":
    // pressing it on a two-leaf compound dissolved every other compound on the
    // grid — a large, silent, unrelated edit.
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const active = TestBed.inject(ActiveObjService);
    TestBed.inject(UrlProcessorService).updateFromURL(STRESS, false, true, false);

    const before = mechanism.joints
      .filter((joint) => joint instanceof RealJoint && joint.isWelded)
      .map((joint) => joint.id);
    const compound = mechanism.links.find(
      (link): link is RealLink => link instanceof RealLink && link.joints.some((j) => j.id === 'M')
    )!;

    active.updateSelectedObj(compound);
    mechanism.unweldAll(compound);

    const after = mechanism.joints
      .filter((joint) => joint instanceof RealJoint && joint.isWelded)
      .map((joint) => joint.id);
    // Only the welds holding *this* body together came apart.
    const released = before.filter((id) => !after.includes(id));
    expect(released.sort()).toEqual(['M', 'N', 'O']);
    expect(after.sort()).toEqual(['B', 'C', 'E', 'J', 'S']);
  });
});

describe('deleting a joint that reduces a compound to one leaf', () => {
  /**
   * A compound whose surviving leaf is named differently from the compound
   * itself — `AKM` reduces to `AM`, and the leaf that survives is `MA`.
   *
   * That mismatch is the whole point: the removal looked the surviving link up
   * by the *leaf's* id, found nothing, and `splice(-1, 1)` removed the last
   * link in the mechanism instead. It went unnoticed for as long as it did
   * because the id rewriting usually leaves a compound and its last leaf
   * sharing a name, and then the wrong lookup happens to find the right link.
   */
  function compoundPlusBystander() {
    const harness = createMechanismHarness();
    const a = new RevJoint('A', 0, 0);
    const k = new RevJoint('K', 4, 0);
    const m = new RevJoint('M', 4, 3);
    const km = new RealLink('KM', [k, m], 1, 1, new Coord(4, 1.5));
    const ma = new RealLink('MA', [m, a], 1, 1, new Coord(2, 1.5));
    // Something else entirely, and last in the list — which is what `splice(-1)`
    // reaches for.
    const x = new RevJoint('X', 20, 20);
    const y = new RevJoint('Y', 24, 20);
    const bystander = new RealLink('XY', [x, y], 1, 1, new Coord(22, 20));
    harness.service.joints.push(a, k, m, x, y);
    harness.service.links.push(km, ma, bystander);
    wireGraph(harness.service);
    harness.service.weldJoint(m);
    return { ...harness, a, k, m, bystander };
  }

  it('does not delete an unrelated link somewhere else on the grid', () => {
    const s = compoundPlusBystander();
    expect(s.service.links.some((link) => link instanceof RealLink && link.subset.length > 0)).toBe(
      true
    );

    s.active.updateSelectedObj(s.k);
    s.service.deleteJoint();

    expect(s.service.links.map((link) => link.id)).toContain('XY');
  });

  it('leaves the surviving leaf standing on its own, not beside an empty compound', () => {
    const s = compoundPlusBystander();

    s.active.updateSelectedObj(s.k);
    s.service.deleteJoint();

    const ids = s.service.links.map((link) => link.id).sort();
    expect(ids).toEqual(['MA', 'XY']);
    expect(
      s.service.links.every((link) => !(link instanceof RealLink) || link.subset.length === 0)
    ).toBe(true);
    expect((s.m as RealJoint).isWelded).toBe(false);
  });
});

describe('undo', () => {
  it('puts the mechanism back without moving the selection', () => {
    // Selection rides along in the same URL the history is made of, so undo
    // restored whatever was selected when the *earlier* state was written and
    // the panel silently re-pointed at another object. Undoing an edit to one
    // joint left you reading another joint's panel, which reads for all the
    // world like the first joint's own switches turning themselves off.
    //
    // Selecting something is not an edit. It earns no history entry, so it
    // should not be undone by one.
    TestBed.configureTestingModule({ imports: [AppModule] });
    const mechanism = TestBed.inject(MechanismService);
    const active = TestBed.inject(ActiveObjService);
    const history = TestBed.inject(SaveHistoryService);
    TestBed.inject(UrlProcessorService).updateFromURL(STRESS, false, true, false);
    mechanism.save();

    const b = mechanism.joints.find((joint) => joint.id === 'B') as RealJoint;
    active.updateSelectedObj(b);
    expect(b.ground).toBe(true);

    // toggleGround earns its own history entry; saving again here would push a
    // duplicate and undo would step back onto the same state.
    mechanism.toggleGround();
    expect((mechanism.joints.find((j) => j.id === 'B') as RealJoint).ground).toBe(false);

    history.undo();

    expect((mechanism.joints.find((j) => j.id === 'B') as RealJoint).ground).toBe(true);
    expect(active.objType).toBe('Joint');
    expect(active.selectedJoint.id, 'still looking at the joint that was edited').toBe('B');
    // And the object selected is the live one, not the copy the undo replaced.
    expect(mechanism.joints.some((joint) => joint === active.selectedJoint)).toBe(true);
  });
});
