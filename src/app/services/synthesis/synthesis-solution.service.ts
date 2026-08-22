import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { Coord } from 'src/app/model/coord';
import { RealLink } from 'src/app/model/link';
import { RealJoint, RevJoint } from 'src/app/model/joint';
import { MechanismService } from '../mechanism.service';
import { ColorService } from '../color.service';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { driverDyadFor, DriverDyad } from './driver-dyad';
import {
  CandidateRejections,
  FourBarCandidate,
  drivenFromFarPin,
  enumerateCandidates,
  meet,
  rankCandidates,
  solveFourBar,
  endLetters,
} from './synthesis-candidates';

/**
 * The answers, as opposed to the question.
 *
 * SynthesisBuilderService owns what the reader asked for -- three positions of
 * an end-effector link, and what a solution has to satisfy. This owns what
 * comes back: the candidate four-bars, which one is being looked at, how it is
 * being driven, where the preview has been scrubbed to, and the single moment
 * the answer stops being a preview and becomes part of the drawing.
 *
 * Nothing here touches the grid until `insert()` is called. That is the whole
 * point of the redesign: synthesis used to rebuild the mechanism on every
 * nudge of a coordinate, which made comparing two solutions impossible --
 * looking at the second one destroyed the first.
 */
/**
 * How long the search reports itself for, at the least.
 *
 * Not a delay on the work -- the work starts at once -- but a floor under how
 * briefly the progress state may flash past. Under about a second the reader
 * sees a button flicker rather than a search happen.
 */
const MIN_SEARCH_VISIBLE_MS = 1100;

/**
 * How far a joint has to have moved to count as moved by hand.
 *
 * A tenth of a user unit. Solving is deterministic, so an untouched linkage
 * comes back at exactly the coordinates it was written at; this is only here so
 * that floating-point drift through a rebuild cannot read as an edit.
 */
const MOVED_BY_HAND = 0.1 * MODEL_SCALE;

@Injectable({ providedIn: 'root' })
export class SynthesisSolutionService {
  private design = inject(SynthesisBuilderService);
  private mechanismSrv = inject(MechanismService);
  private colors = inject(ColorService);

  /** Fires when the answer changes, for the grid and the panel to redraw. */
  public changed = new Subject<void>();

  /** Whether a search has been run against the design as it now stands. */
  public generated = false;
  /** Whether one is running: the panel shows it as work, once. */
  public generating = false;

  /** Which candidate the reader has picked, and which they are hovering. */
  public candidateKey: string | null = null;
  public hoverKey: string | null = null;
  public showAll = false;
  public dimensionsOpen = false;

  /** Drive from the far ground pin, and put a driver dyad on the input. */
  public driveOnFarPin = false;
  public driverWanted = false;
  /** Where the preview stands, in crank degrees, and whether it is running. */
  public phase: number | null = null;
  public playing = false;
  public clockwise = true;

  /**
   * Where each joint stood when synthesis last wrote it.
   *
   * The one thing that cannot be derived from the drawing: whether the linkage
   * on the grid is still the one synthesis produced, or one the reader has
   * since moved by hand.
   *
   * It used to be held in memory only, on the reasoning that after a reload
   * there was nothing to compare against and the honest default was to assume
   * nothing had been touched. That default was not honest, it was expensive:
   * assuming nothing had been touched meant Replace deleted whatever had been,
   * without the warning that exists for it. Move a joint, share the link, open
   * it, press Replace, and the joint went back where synthesis had put it. So
   * it is written down with the ids, and read back off the design.
   */
  private get writtenAt(): Map<string, { x: number; y: number }> {
    const at = this.design.ownedAt;
    return new Map(
      this.design.ownedJointIds
        .map((id, index) => [id, at[index]] as const)
        .filter((pair): pair is readonly [string, { x: number; y: number }] => !!pair[1])
        .map(([id, place]) => [id, place])
    );
  }

  private cacheKey = '';
  private cached: FourBarCandidate[] = [];
  private cachedRejections: CandidateRejections = {
    tried: 0,
    degenerate: 0,
    tooBig: 0,
    alike: 0,
    outsideRegion: 0,
  };
  /** How many of the candidates found work on a single assembly. */
  public strictCount = 0;

  private timer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Whether a gesture is in flight, so the search should hold still.
   *
   * Set by the canvas while a position is being dragged. The enumeration walks
   * a full crank revolution for every candidate; running it on each pointermove
   * would make the drag stutter for an answer nobody can read mid-gesture. The
   * positions themselves still follow the pointer -- they are drawn from the
   * design, not from the search -- and the answer catches up on release.
   */
  public interactive = false;

  /**
   * Throw away the answer because the *question* changed.
   *
   * Only for changes that alter what is being searched for: a position added
   * or removed, or a requirement switched. Those change which linkages are
   * even candidates, so the reader is sent back to Generate.
   *
   * Moving a position does not land here. It changes the answer, not the
   * question, and the search keeps up with it by itself: `candidates()` is
   * keyed on the design, so a nudge simply recomputes, and the chosen
   * candidate -- identified by where its pins sit on the link -- survives.
   */
  invalidate(): void {
    this.generated = false;
    this.generating = false;
    this.candidateKey = null;
    this.hoverKey = null;
    this.phase = null;
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.changed.next();
  }

  /** A change that leaves the candidates standing -- a different pick, say. */
  private touch(): void {
    this.phase = null;
    this.changed.next();
  }

  /**
   * Run the search.
   *
   * The enumeration is real work -- it constructs a circle centre for every
   * pair of pin positions and then walks a full crank revolution for each
   * candidate -- but on a small design it finishes in well under a tenth of a
   * second, and a button labelled "Generate solutions" that produces its answer
   * in one frame reads as though nothing happened. So the progress state has a
   * floor rather than a fake delay: the search starts immediately, and the bar
   * stays up until it has been visible long enough to be read. A slower search
   * simply takes longer, and the bar tells the truth about it.
   */
  generate(): void {
    if (this.generating || !this.design.isFullyDefined()) return;
    this.generating = true;
    this.changed.next();
    if (this.timer) clearTimeout(this.timer);
    const started = Date.now();
    // Off the frame the click landed on, so the bar is painted before the
    // enumeration blocks the thread.
    this.timer = setTimeout(() => {
      this.warmCandidates();
      const remaining = Math.max(0, MIN_SEARCH_VISIBLE_MS - (Date.now() - started));
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.generating = false;
        this.generated = true;
        this.candidateKey = null;
        this.changed.next();
      }, remaining);
    }, 30);
  }

  /** Do the search now, so the wait is spent on it rather than after it. */
  private warmCandidates(): void {
    const key = this.design.searchKey();
    if (key === this.cacheKey) return;
    const result = enumerateCandidates(this.design.search());
    this.cacheKey = key;
    this.cached = result.candidates;
    this.cachedRejections = result.rejections;
  }

  /** Every candidate the current design admits, best first, at most eight. */
  candidates(): FourBarCandidate[] {
    if (!this.generated || !this.design.isFullyDefined()) return [];
    const key = this.design.searchKey();
    // Held still through a drag: the last answer stays on screen while the
    // position moves under it, and the search runs once when the hand lets go.
    if (key !== this.cacheKey && !this.interactive) {
      const result = enumerateCandidates(this.design.search());
      this.cacheKey = key;
      this.cached = result.candidates;
      this.cachedRejections = result.rejections;
    }
    let list = this.cached;
    this.strictCount = new Set(list.filter((c) => c.defectFree).map((c) => c.pair)).size;
    if (!this.design.allowDefect) list = list.filter((c) => c.defectFree);
    return rankCandidates(list);
  }

  /**
   * Every assembly of every solution, including the ones the gallery folds
   * away. What Assembly branch reaches for, and where a picked one is found.
   */
  allAssemblies(): FourBarCandidate[] {
    if (!this.generated || !this.design.isFullyDefined()) return [];
    this.candidates();
    return this.design.allowDefect ? this.cached : this.cached.filter((c) => c.defectFree);
  }

  rejections(): CandidateRejections {
    return this.cachedRejections;
  }

  /** The candidate on screen: what is hovered wins over what is picked. */
  chosen(): FourBarCandidate | null {
    const list = this.candidates();
    if (!list.length) return null;
    // Looked up among every assembly, not only the ones on show: the crossed
    // half of a construction is picked by the branch switch and never appears
    // in the gallery.
    const all = this.allAssemblies();
    const hovered = this.hoverKey ? all.find((c) => c.key === this.hoverKey) : undefined;
    if (hovered) return hovered;
    return all.find((c) => c.key === this.candidateKey) ?? list[0];
  }

  /** The candidate that was picked, ignoring the hover, for the ghost to show. */
  picked(): FourBarCandidate | null {
    const list = this.candidates();
    if (!list.length) return null;
    return this.allAssemblies().find((c) => c.key === this.candidateKey) ?? list[0];
  }

  /** The chosen candidate as it is actually driven -- from A, or from D. */
  driven(cand: FourBarCandidate | null = this.chosen()): FourBarCandidate | null {
    if (!cand) return null;
    if (!this.driveOnFarPin) return cand;
    /*
      Read from the far pin, and remembered.

      `drivenFromFarPin` re-assesses the swapped linkage, which walks a whole
      revolution a degree at a time -- seven hundred solves. That was done on
      every call, and the calls are not few: drawing the coupler's path asks
      for this once per sample, two hundred and forty times, on every animation
      frame. Driving from Pin D therefore cost something like a hundred and
      seventy thousand solves a frame, which is as slow as it sounds. Driving
      from Pin A never noticed, because that path returns the candidate
      untouched.
    */
    const key = cand.key + ':' + this.design.searchKey();
    const remembered = this.swapped.get(key);
    if (remembered) return remembered;
    const swapped = drivenFromFarPin(cand);
    swapped.name = cand.name;
    swapped.branch = cand.branch;
    swapped.key = cand.key;
    swapped.pair = cand.pair;
    // Keyed by candidate rather than holding only the last one. Hovering a
    // card asks for that candidate while the picked one is still being drawn,
    // and a single slot let the two evict each other on every pass -- the same
    // seven hundred solves the cache exists to avoid, just less often.
    if (this.swapped.size > 64) this.swapped.clear();
    this.swapped.set(key, swapped);
    return swapped;
  }

  private swapped = new Map<string, FourBarCandidate>();

  /**
   * Why a driver cannot be fitted to the current solution, or nothing.
   *
   * Asked independently of whether one is wanted: the panel needs to know
   * before the switch is pressed, not after.
   */
  driverAvailability(): string | undefined {
    const cand = this.driven();
    if (!cand) return undefined;
    const sized = driverDyadFor(cand.A, cand.ptsA);
    if ('refusal' in sized) return sized.refusal;
    // Sized is not the same as workable. `driverDyadFor` solves for a crank and
    // coupler that carry the input across the arc the three positions need,
    // and stops there -- it never asks whether the four-bar can be closed
    // everywhere in between, and sometimes it cannot. The result is a six-bar
    // whose motor jams partway round, which is worse than no driver at all
    // because the panel promises "one full turn".
    return this.driverTravel(cand, sized.dyad).full
      ? undefined
      : 'A driver sized for these positions cannot turn a whole revolution — the ' +
          'four-bar jams partway round. Moving a position, or driving from the ' +
          'other pin, usually frees it.';
  }

  /** The driver dyad for the current solution, if one is wanted and works. */
  dyad(): DriverDyad | undefined {
    const cand = this.driven();
    if (!cand || !this.driverWanted) return undefined;
    const sized = driverDyadFor(cand.A, cand.ptsA);
    if ('refusal' in sized) return undefined;
    return this.driverTravel(cand, sized.dyad).full ? sized.dyad : undefined;
  }

  /**
   * Where the driver's elbow sits when the pin it drives is at a given place.
   *
   * The same choice `insert` makes when it builds the joint, so the preview and
   * the linkage that comes out of it are assembled the same way round.
   */
  private elbowFor(dyad: DriverDyad, drivenPin: Coord): Coord | null {
    const pair = meet(dyad.ground, dyad.crankLength, drivenPin, dyad.couplerLength);
    return pair ? pair[0] : null;
  }

  /**
   * The driver crank angle that puts the linkage at a given four-bar angle.
   *
   * Reading the train backwards: the four-bar angle fixes the pin, the pin
   * fixes the elbow, and the elbow fixes the crank. Used to find where the
   * three positions fall along the driver's own revolution.
   */
  private driverAngleAt(
    cand: FourBarCandidate,
    dyad: DriverDyad,
    fourBarDeg: number
  ): number | null {
    const solved = solveFourBar(cand, fourBarDeg, cand.sign);
    if (!solved) return null;
    const elbow = this.elbowFor(dyad, solved.B);
    if (!elbow) return null;
    return (Math.atan2(elbow.y - dyad.ground.y, elbow.x - dyad.ground.x) * 180) / Math.PI;
  }

  /**
   * The six-bar, solved forwards from the crank a motor would actually turn.
   *
   * This is the whole of the fix for a six-bar preview that would not move. It
   * used to be run the other way about: the four-bar's own crank was stepped
   * and a driver drawn onto whatever came out. But with a driver fitted the
   * four-bar's crank is not an input at all -- it is an output, rocking back
   * and forth as the driver goes round -- so stepping it covered half a stroke
   * once and then ran out of angles where the dyad could close. On one design
   * that left four degrees of travel to animate, and the linkage sat still.
   *
   * Forwards: the driver crank turns, which places the elbow, which places the
   * pin it drives, which sets the four-bar. Exactly the train the inserted
   * mechanism solves -- which is why that one always moved correctly.
   */
  private solveFromDriver(
    cand: FourBarCandidate,
    dyad: DriverDyad,
    driverDeg: number
  ): { A: Coord; B: Coord; C: Coord; D: Coord; elbow: Coord } | null {
    const phi = (driverDeg * Math.PI) / 180;
    const elbow = new Coord(
      dyad.ground.x + dyad.crankLength * Math.cos(phi),
      dyad.ground.y + dyad.crankLength * Math.sin(phi)
    );
    // Where the coupler can put the driven pin: on the four-bar's crank circle
    // and a coupler's length from the elbow.
    const pair = meet(cand.A, cand.r1, elbow, dyad.couplerLength);
    if (!pair) return null;
    const sign = this.driverAssemblySign(cand, dyad);
    const B =
      Math.sign(
        (elbow.x - cand.A.x) * (pair[0].y - cand.A.y) -
          (elbow.y - cand.A.y) * (pair[0].x - cand.A.x)
      ) === sign
        ? pair[0]
        : pair[1];
    const solved = solveFourBar(
      cand,
      (Math.atan2(B.y - cand.A.y, B.x - cand.A.x) * 180) / Math.PI,
      cand.sign
    );
    return solved ? { ...solved, elbow } : null;
  }

  /**
   * Which side of the crank the driver's coupler sits on, fixed at position 1.
   *
   * The dyad, like the four-bar, can be put together two ways; it has to stay
   * on the one it was built in or the preview flips through itself.
   */
  private driverAssemblySign(cand: FourBarCandidate, dyad: DriverDyad): number {
    const B = cand.ptsA[0];
    const elbow = this.elbowFor(dyad, B);
    if (!elbow) return 1;
    return (
      Math.sign(
        (elbow.x - cand.A.x) * (B.y - cand.A.y) - (elbow.y - cand.A.y) * (B.x - cand.A.x)
      ) || 1
    );
  }

  /**
   * How far the preview may be driven, and in what.
   *
   * Without a driver, the four-bar's own crank across its travel. With one,
   * the driver crank across as much of a revolution as it can turn -- which
   * for a dyad sized for these positions is normally the whole of it.
   */
  drivenRange(): { from: number; to: number; full: boolean } {
    const cand = this.driven();
    if (!cand) return { from: 0, to: 360, full: false };
    const dyad = this.dyad();
    if (!dyad) return cand.range;
    return this.driverTravel(cand, dyad);
  }

  /**
   * How far the driver's crank can turn before the train stops closing.
   *
   * Walked forwards from the position the linkage is drawn in. Its answer is
   * both what the transport offers and what decides whether a driver may be
   * fitted at all, so the two cannot disagree about what the machine does.
   */
  private driverTravel(
    cand: FourBarCandidate,
    dyad: DriverDyad
  ): { from: number; to: number; full: boolean } {
    const key = cand.key + ':' + this.driveOnFarPin + ':' + this.design.searchKey();
    if (this.driverRangeKey === key) return this.driverRange;

    const startPhi = this.driverAngleAt(cand, dyad, cand.thetas[0]) ?? 0;
    const STEP = 1;
    let from = startPhi;
    let to = startPhi;
    for (let k = STEP; k <= 360; k += STEP) {
      if (!this.solveFromDriver(cand, dyad, startPhi + k)) break;
      to = startPhi + k;
    }
    for (let k = STEP; k <= 360; k += STEP) {
      if (!this.solveFromDriver(cand, dyad, startPhi - k)) break;
      from = startPhi - k;
    }
    const full = to - from >= 359;
    this.driverRangeKey = key;
    this.driverRange = full
      ? { from: startPhi, to: startPhi + 360, full: true }
      : { from, to, full: false };
    return this.driverRange;
  }

  private driverRangeKey = '';
  private driverRange = { from: 0, to: 360, full: false };

  /**
   * Where the preview stands now -- in driver crank degrees when a driver is
   * fitted, in the four-bar's own crank degrees otherwise.
   */
  currentPhase(): number {
    const cand = this.driven();
    if (!cand) return 0;
    if (this.phase !== null) return this.phase;
    const dyad = this.dyad();
    if (dyad) return this.driverAngleAt(cand, dyad, cand.thetas[0]) ?? 0;
    return cand.thetas[0];
  }

  /** The linkage at an arbitrary phase, in whatever is being turned. */
  poseAtPhase(phase: number): { A: Coord; B: Coord; C: Coord; D: Coord; elbow?: Coord } | null {
    const cand = this.driven();
    if (!cand) return null;
    const dyad = this.dyad();
    if (dyad) return this.solveFromDriver(cand, dyad, phase);
    return solveFourBar(cand, phase, cand.sign);
  }

  /** Where the linkage sits when it is drawn: position 1, in whatever turns. */
  startPhase(): number {
    const cand = this.driven();
    if (!cand) return 0;
    const dyad = this.dyad();
    if (dyad) return this.driverAngleAt(cand, dyad, cand.thetas[0]) ?? 0;
    return cand.thetas[0];
  }

  /** Where each position falls along whatever is being turned. */
  positionPhases(): (number | null)[] {
    const cand = this.driven();
    if (!cand) return [];
    const dyad = this.dyad();
    if (!dyad) return cand.thetas;
    return cand.thetas.map((theta) => this.driverAngleAt(cand, dyad, theta));
  }

  /** The four pin positions of the preview at the current phase. */
  previewPose(): { A: Coord; B: Coord; C: Coord; D: Coord; elbow?: Coord } | null {
    const cand = this.driven();
    if (!cand) return null;
    const dyad = this.dyad();
    if (dyad) return this.solveFromDriver(cand, dyad, this.currentPhase());
    return solveFourBar(cand, this.currentPhase(), cand.sign);
  }

  pick(key: string): void {
    this.candidateKey = key;
    this.hoverKey = null;
    this.touch();
  }

  setHover(key: string | null): void {
    this.hoverKey = key;
    this.changed.next();
  }

  setDriveOnFarPin(far: boolean): void {
    this.driveOnFarPin = far;
    this.touch();
  }

  toggleDriver(): void {
    this.driverWanted = !this.driverWanted;
    this.touch();
  }

  setPhase(phase: number): void {
    this.phase = phase;
    this.playing = false;
    this.changed.next();
  }

  /** Take back everything: the answer and the question both. */
  reset(): void {
    this.invalidate();
    this.driverWanted = false;
    this.driveOnFarPin = false;
    this.showAll = false;
    this.releaseOwnership();
  }

  // --- committing to the drawing -----------------------------------------

  /**
   * The letters this design's pins will be built under.
   *
   * Asked by the preview as well as by insert, so that what is drawn beside a
   * pin is what that pin ends up called. Labelling the preview A-D and letting
   * insert take the next free letters agreed only on an empty grid: beside one
   * loose joint the preview said D-C-B-A over pins that arrived as E-D-C-B.
   */
  previewLetters(cand: FourBarCandidate | null = this.driven()): {
    A: string;
    B: string;
    C: string;
    D: string;
    E: string;
    F: string;
  } {
    /*
      Counted against the grid as insert will find it, not as it stands.

      Insert takes a replaceable linkage of ours away before it builds, so its
      four or six ids come free -- and counting them as taken meant a
      replacement preview promised E-J over pins that arrived as A-F. The same
      arithmetic renamed the labels out from under a linkage the moment it was
      inserted, because its own new ids were suddenly occupied. Survivors of a
      linkage that has been cut into are a different matter: those stay, so
      their ids stay taken.
    */
    const held = this.ownership();
    const freed = held === 'ours' || held === 'edited' ? this.design.ownedJointIds : [];
    const key = this.lettersKey(freed);
    if (this.lettersAt !== key) {
      this.lettersAt = key;
      this.letters = this.nextLetters(6, freed);
    }
    const letters = this.letters;
    const slot: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const mark = endLetters(cand);
    return {
      A: letters[slot[mark.A]],
      B: letters[slot[mark.B]],
      C: letters[slot[mark.C]],
      D: letters[slot[mark.D]],
      E: letters[4],
      F: letters[5],
    };
  }

  /**
   * What the six letters depend on: who is on the grid, and what is coming off
   * it. Cheap enough to build every frame, which handing out six ids -- six
   * scans of the joint list -- is not.
   */
  private lettersKey(freed: string[]): string {
    return this.mechanismSrv.joints.map((joint) => joint.id).join(',') + '|' + freed.join(',');
  }
  private lettersAt = '\u0000';
  private letters: string[] = [];

  /** As many ids as asked for, none of which anything on the grid is using. */
  private nextLetters(count: number, freed: string[] = []): string[] {
    const taken: string[] = [];
    for (let i = 0; i < count; i++) {
      taken.push(this.mechanismSrv.determineNextLetter(taken, freed));
    }
    return taken;
  }

  /**
   * What the design owns on the grid right now.
   *
   * Three states worth telling apart, because each calls for something
   * different:
   *
   *   'none'        nothing of ours is there -- the first insert, or the
   *                 reader deleted it, or Undo stepped back past it.
   *   'ours'        exactly what we wrote, untouched. Insert may replace it
   *                 without asking: it is our own previous answer.
   *   'edited'      still ours, still separable, but moved by hand. Replacing
   *                 it would throw that work away, so the reader chooses.
   *   'entangled'   joined to something else in the drawing, or half deleted.
   *                 We can no longer take it back cleanly, so we stop claiming
   *                 it and the next insert makes a new machine.
   */
  ownership(): 'none' | 'ours' | 'edited' | 'entangled' {
    const ids = new Set(this.design.ownedJointIds);
    if (ids.size === 0) return 'none';
    const owned = this.mechanismSrv.joints.filter((joint) => ids.has(joint.id));
    if (owned.length === 0) return 'none';
    if (owned.length !== ids.size) {
      /*
        Latched the moment it is noticed, not only when a URL is read back.

        Ids are handed out again after a deletion. Delete one of ours and draw
        a joint, and that joint takes the letter we just lost -- so the count
        comes back up, every id is present again, and the linkage reads as
        wholly ours with somebody else's joint standing in it. A later replace
        would take that joint away without asking. Once cut into, cut into.
      */
      this.design.ownershipPartial = true;
      return 'entangled';
    }
    // Or it was cut into earlier: the ids that survived look complete on their
    // own, and only the flag remembers that they are not all of them.
    if (this.design.ownershipPartial) return 'entangled';
    // A joint of ours pinned to a joint that is not ours means the two machines
    // have been joined. Taking ours back would either leave a link hanging off
    // nothing or cut into a machine that was never ours to touch.
    const joinedOutward = owned.some((joint) =>
      (joint as RealJoint).connectedJoints?.some((other) => !ids.has(other.id))
    );
    if (joinedOutward) return 'entangled';
    /*
      No baseline is "ask", not "help yourself".

      Every insert writes one, so the only way to be without it is a URL from
      before this was written down -- and the answer that costs nothing is to
      ask before replacing. The answer that used to be given, that the linkage
      must be untouched, cost the reader whatever they had moved.
    */
    const baseline = this.writtenAt;
    if (baseline.size === 0) return 'edited';
    const moved = owned.some((joint) => {
      const was = baseline.get(joint.id);
      return !was || Math.hypot(joint.x - was.x, joint.y - was.y) > MOVED_BY_HAND;
    });
    return moved ? 'edited' : 'ours';
  }

  /** Whether the design's own linkage is on the grid, in any condition. */
  get inserted(): boolean {
    const state = this.ownership();
    return state === 'ours' || state === 'edited';
  }

  /**
   * Whether the linkage on the grid is a different solution from the one on
   * screen -- so Insert would change the drawing rather than confirm it.
   */
  needsReinsert(): boolean {
    const cand = this.driven();
    if (!cand || this.ownership() === 'none') return true;
    const solved = solveFourBar(cand, cand.thetas[0], cand.sign);
    if (!solved) return true;
    const owned = new Map(
      this.mechanismSrv.joints
        .filter((joint) => this.design.ownedJointIds.includes(joint.id))
        .map((joint) => [joint.id, joint])
    );
    // The four pins the four-bar would be built from, in the order insert
    // writes them. Anything else on the grid under our ids means a different
    // answer is standing there.
    const wanted = [solved.A, solved.B, solved.C, solved.D];
    // The driver's two pins as well, when there is one. Comparing the four-bar
    // alone meant fitting a driver to an inserted four-bar -- or taking one off
    // an inserted six-bar -- left the panel saying "Inserted into grid" over a
    // drawing that no longer held what was being looked at, and the preview
    // stayed hidden because it agreed.
    const dyad = this.dyad();
    if (dyad) {
      const elbow = meet(dyad.ground, dyad.crankLength, solved.B, dyad.couplerLength);
      if (elbow) wanted.push(dyad.ground, elbow[0]);
    }
    const ids = this.design.ownedJointIds;
    if (owned.size !== wanted.length || ids.length !== wanted.length) return true;
    return wanted.some((point, i) => {
      const joint = owned.get(ids[i]);
      return !joint || Math.hypot(joint.x - point.x, joint.y - point.y) > MOVED_BY_HAND;
    });
  }

  /** Stop claiming the linkage on the grid, without removing it. */
  releaseOwnership(): void {
    this.design.ownedJointIds = [];
    this.design.ownedAt = [];
    this.design.ownershipPartial = false;
    this.changed.next();
  }

  /**
   * Put the chosen solution on the grid, replacing the one this design put
   * there last time.
   *
   * The one moment synthesis writes to the drawing. It builds the whole
   * linkage -- driver included -- before handing it over, so that one solve
   * sees the finished six-bar rather than a four-bar that grows a motor a
   * frame later.
   *
   * Returns 'edited' without writing anything when replacing would throw away
   * work done by hand; the caller asks, and calls again with `force` if the
   * answer is yes.
   */
  insert(force = false): 'done' | 'edited' | 'nothing' {
    const cand = this.driven();
    if (!cand) return 'nothing';
    const solution = solveFourBar(cand, cand.thetas[0], cand.sign);
    if (!solution) return 'nothing';

    const held = this.ownership();
    if (held === 'edited' && !force) return 'edited';
    if (held === 'entangled') this.releaseOwnership();
    else if (held !== 'none') this.removeOwned();

    const dyad = this.dyad();
    // The same letters the preview has been showing beside these pins.
    const { A: idA, B: idB, C: idC, D: idD, E: idE, F: idF } = this.previewLetters(cand);
    /** A link is named by its ends in alphabetical order, as everywhere else. */
    const linkId = (one: string, two: string): string => [one, two].sort().join('');
    // With a driver on the linkage neither ground pin is the input at all; the
    // motor sits on the driver's own ground and turns the whole train.
    const drivenDirectly = !dyad;

    const jointA = new RevJoint(idA, solution.A.x, solution.A.y, drivenDirectly, true);
    const jointB = new RevJoint(idB, solution.B.x, solution.B.y, false, false);
    const jointC = new RevJoint(idC, solution.C.x, solution.C.y, false, false);
    const jointD = new RevJoint(idD, solution.D.x, solution.D.y, false, true);

    jointA.connectedJoints.push(jointB);
    jointB.connectedJoints.push(jointA, jointC);
    jointC.connectedJoints.push(jointB, jointD);
    jointD.connectedJoints.push(jointC);

    const crank = new RealLink(linkId(idA, idB), [jointA, jointB]);
    crank.fill = this.colors.getLinkColorFromIndex(0);
    const coupler = new RealLink(linkId(idB, idC), [jointB, jointC]);
    coupler.fill = this.colors.getLinkColorFromIndex(1);
    const rocker = new RealLink(linkId(idC, idD), [jointC, jointD]);
    rocker.fill = this.colors.getLinkColorFromIndex(0);

    jointA.links.push(crank);
    jointB.links.push(crank, coupler);
    jointC.links.push(coupler, rocker);
    jointD.links.push(rocker);

    const joints = [jointA, jointB, jointC, jointD];
    const links = [crank, coupler, rocker];

    if (dyad) {
      // The two lengths the sizing solved for are the distances between these
      // three points, so placing the pins is all it takes to realise them.
      const elbow = meet(dyad.ground, dyad.crankLength, solution.B, dyad.couplerLength);
      if (elbow) {
        const motor = new RevJoint(idE, dyad.ground.x, dyad.ground.y, true, true);
        const knee = new RevJoint(idF, elbow[0].x, elbow[0].y, false, false);
        motor.connectedJoints.push(knee);
        knee.connectedJoints.push(motor, jointB);
        jointB.connectedJoints.push(knee);

        const driverCrank = new RealLink(linkId(idE, idF), [motor, knee]);
        driverCrank.fill = this.colors.getLinkColorFromIndex(2);
        const driverCoupler = new RealLink(linkId(idF, idB), [knee, jointB]);
        driverCoupler.fill = this.colors.getLinkColorFromIndex(3);

        motor.links.push(driverCrank);
        knee.links.push(driverCrank, driverCoupler);
        jointB.links.push(driverCoupler);

        joints.push(motor, knee);
        links.push(driverCrank, driverCoupler);
      } else {
        // Sized but not assemblable in the position the linkage is drawn in.
        // The four-bar still stands and still passes through the positions, so
        // it is left drivable by hand rather than made useless by the refusal.
        jointA.input = true;
      }
    }

    this.mechanismSrv.mergeToJoints(joints);
    this.mechanismSrv.mergeToLinks(links);
    this.design.ownedJointIds = joints.map((joint) => joint.id);
    this.design.ownedAt = joints.map((joint) => ({ x: joint.x, y: joint.y }));
    this.design.ownershipPartial = false;
    this.playing = false;
    // Eased rather than snapped: the drawing may be parked anywhere in its
    // cycle, and dropping it onto its start pose between one frame and the next
    // reads as the linkage jumping rather than as it going home. The same
    // easing leaving an analysis mode uses.
    this.mechanismSrv.easeToStart();
    this.mechanismSrv.updateMechanism(true);
    this.changed.next();
    return 'done';
  }

  /**
   * Take the design's own linkage off the grid.
   *
   * By id, and only links every one of whose joints is ours -- a link that
   * reaches outward belongs half to something else, and `ownership()` has
   * already refused to call that ours. Forces on a removed link go with it: a
   * force on a link that no longer exists belongs to no mechanism.
   */
  private removeOwned(): void {
    const ids = new Set(this.design.ownedJointIds);
    const goneLinks = new Set(
      this.mechanismSrv.links
        .filter((link) => link.joints.every((joint) => ids.has(joint.id)))
        .map((link) => link.id)
    );
    this.mechanismSrv.forces = this.mechanismSrv.forces.filter(
      (force) => !goneLinks.has(force.link?.id ?? '')
    );
    this.mechanismSrv.links = this.mechanismSrv.links.filter((link) => !goneLinks.has(link.id));
    this.mechanismSrv.joints = this.mechanismSrv.joints.filter((joint) => !ids.has(joint.id));
    this.design.ownedJointIds = [];
    this.design.ownedAt = [];
    this.design.ownershipPartial = false;
  }

  /**
   * Take back the linkage the last insert put on the grid.
   *
   * By id, and only the ids that insert recorded: anything else on the grid
   * was drawn by hand or left by an earlier insert and is not this one's to
   * remove. Forces on a removed link go with it -- a force on a link that no
   * longer exists belongs to no mechanism.
   */
  undoInsert(): void {
    if (this.ownership() === 'none') {
      this.releaseOwnership();
      return;
    }
    this.removeOwned();
    this.mechanismSrv.updateMechanism(true);
    this.changed.next();
  }
}
