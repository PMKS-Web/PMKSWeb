import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { Subscription } from 'rxjs';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { SelectedTabService } from '../../selected-tab.service';
import { TimeUnit } from '../../model/utils';
import { Mechanism } from '../../model/mechanism/mechanism';
import { MODEL_SCALE } from '../../model/render-scale';
import { MatIcon } from '@angular/material/icon';
import { ViewControlsComponent } from '../view-controls/view-controls.component';
import { MatTooltip } from '@angular/material/tooltip';
import { KeyboardShortcutsService, ShortcutId } from '../../services/keyboard-shortcuts.service';

/** How far the cluster floats above the status strip, matching its own CSS. */
const BOTTOM_OFFSET = 38;
/** The one gap the chrome keeps between any two cards. */
const CARD_GAP = 12;

/**
 * What the input does when it reaches the end of its track.
 *
 * Two facts, not a good one and a bad one, so both are drawn in the same grey:
 * a crank comes round again, a ram turns back. On the combined row one of these
 * stands for every machine that behaves that way, which is why the words are
 * carried rather than derived from a flag at the point of drawing.
 */
export interface CycleEnd {
  /** `loop` for a machine that comes round again, `swap_horiz` for one that turns back. */
  glyph: string;
  /** "Loops", "Reverses" -- or, on the combined row, "M1, M2 reverse". */
  text: string;
}

/** One line in the transport: a machine, or all of them together. */
export interface PlaybackRow {
  id: string;
  /** -1 for the combined row, which stands for every machine at once. */
  index: number;
  /** The machine the row's handle is measured against. */
  leader: number;
  /** Whether this line is one machine, and so has a direction to flip. */
  isMechanism: boolean;
  /** The line the shared scrubber and the time field belong to. */
  master: boolean;
  /** How long this machine has been going, from its start pose. */
  time: string;
  /** Where its input is, in the input's own units. */
  position: string;
  /**
   * 0–1000 along the track.
   *
   * For a machine that reverses this runs up and back down again, because the
   * input does: it is the drive's position, not an index into the samples.
   */
  scrub: number;
  clockwise: boolean;
  /** Which way the input is going right now: "Clockwise", "Retracting", ... */
  note: string;
  playing: boolean;
  /** Whether this line carries a play button of its own. */
  ownPlay: boolean;
  /**
   * What happens at the end of the cycle: one entry for a machine, and for the
   * combined row one per behaviour present among the machines it stands for.
   */
  ends: CycleEnd[];
  period: number;
}

/**
 * The transport: what is playing, how fast, and where each machine is in its
 * own cycle.
 *
 * One row per mechanism that can actually run. A mechanism that cannot is not
 * listed at all — a disabled scrubber for a linkage that has no cycle is a
 * control that can only disappoint, and what to do about it is the Analysis
 * setup drawer's job, not a row's.
 *
 * Neither degrees of freedom nor readiness appear here. Being in this list is
 * what "ready" means, so saying it again beside every row is a word that can
 * never read anything but yes.
 */
@Component({
  selector: 'app-playback-bar',
  templateUrl: './playback-bar.component.html',
  styleUrls: ['./playback-bar.component.scss'],
  // Off the bottom of the window and back, rather than fading in place: these
  // cards belong to the analysis modes, and a transport arriving from the edge
  // it lives on reads as the mode bringing its own controls with it.
  animations: [
    trigger('riseFromBottom', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(calc(100% + 38px))' }),
        animate('260ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'none' })),
      ]),
      transition(':leave', [
        animate(
          '200ms cubic-bezier(0.4, 0, 1, 1)',
          style({ opacity: 0, transform: 'translateY(calc(100% + 38px))' })
        ),
      ]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip, ViewControlsComponent],
})
export class PlaybackBarComponent implements OnInit, AfterViewInit, OnDestroy {
  mechanism = inject(MechanismService);
  settings = inject(SettingsService);
  activeObj = inject(ActiveObjService);
  tabs = inject(SelectedTabService);
  private nup = inject(NumberUnitParserService);
  shortcuts = inject(KeyboardShortcutsService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  private positionSub?: Subscription;
  private wasAnimating = false;
  private wasRowAnimating = false;

  ngOnInit(): void {
    // The rows are rebuilt from the service on every change detection, and the
    // pose moving is what has to trigger one.
    this.positionSub = this.mechanism.onMechPositionChange.subscribe(() => undefined);
  }

  /**
   * Tell the rest of the chrome how much room this cluster is taking.
   *
   * The panels stop short of the bottom of the window so they do not run under
   * the transport, and that was a fixed 110px -- the height of a transport with
   * one row in it. Unsynced, this card carries a row per machine and grows to
   * twice that, and the setup drawer came down through it. Measured rather than
   * guessed, so a drawing with six machines in it works out the same way.
   */
  ngAfterViewInit(): void {
    const row = this.host.nativeElement.querySelector('.playbackRow') as HTMLElement | null;
    if (!row || typeof ResizeObserver === 'undefined') return;
    this.publishHeight(row);
    this.heightWatch = new ResizeObserver(() => this.publishHeight(row));
    this.heightWatch.observe(row);
  }

  private heightWatch?: ResizeObserver;

  private publishHeight(row: HTMLElement): void {
    // The card's own height, the gap it floats above the status strip, and one
    // more gap between it and whatever stops above it.
    const clearance = Math.round(row.getBoundingClientRect().height) + BOTTOM_OFFSET + CARD_GAP;
    document.documentElement.style.setProperty('--playback-clearance', `${clearance}px`);
  }

  /**
   * The transport's own keys. Each goes through the button's own method -- and
   * only where that button is: the transport belongs to the analysis modes, so
   * Space in Edit would be a key with no control behind it, playing a drawing
   * the reader is in the middle of changing.
   */
  private readonly keyed: Partial<Record<ShortcutId, () => void>> = {
    'playback.toggle': () => this.play(),
    'playback.back': () => this.stepBy(-1),
    'playback.forward': () => this.stepBy(1),
    'playback.speed': () => this.canPlay && this.cycleSpeed(),
  };

  private keySub = this.shortcuts.pressed.subscribe((id) => {
    if (!this.tabs.isAnalysisMode()) return;
    this.keyed[id]?.();
  });

  ngOnDestroy(): void {
    this.keySub.unsubscribe();
    this.positionSub?.unsubscribe();
    this.heightWatch?.disconnect();
    document.documentElement.style.removeProperty('--playback-clearance');
  }

  private format(seconds: number): string {
    return this.nup.formatValueAndUnit(seconds, TimeUnit.SECOND);
  }

  get playing(): boolean {
    return this.mechanism.isPlaying;
  }

  get canPlay(): boolean {
    return this.mechanism.oneValidMechanismExists();
  }

  get speed(): number {
    return this.mechanism.animationSpeedMultiplier;
  }

  /** The scrubber spans the longest cycle in the drawing; shorter ones wrap. */
  get maxStep(): number {
    const master = this.mechanism.masterMechanism();
    return master ? master.joints.length - 1 : 0;
  }

  get step(): number {
    return this.mechanism.mechanismTimeStep;
  }

  /**
   * One line per machine that can run — or one line for all of them, synced.
   *
   * Synced, the machines move together and there is nothing to say about them
   * separately, so they collapse to a single `All` row. A row carries a play
   * button only when it is one of several being controlled apart; otherwise the
   * transport's own button is the only one, and two buttons doing the same
   * thing side by side is worse than one.
   */
  get rows(): PlaybackRow[] {
    const runnable = this.mechanism.mechanisms
      .map((mechanism, index) => ({ mechanism, index }))
      .filter(({ mechanism }) => mechanism.isMechanismValid());

    if (runnable.length === 0) {
      return [];
    }

    // Synced, the machines are started and stopped together and there is one
    // answer about what is running -- but not one answer about where anything
    // is, because each measures a different thing. The combined row follows the
    // first machine and says nothing about direction.
    if (this.mechanism.syncMechanisms) {
      // The longest cycle in the drawing, so one handle can reach every frame
      // of every machine. Following the first one instead left the slower
      // machines with a stretch at the end of their cycles the handle could
      // not get to.
      const lead = runnable.reduce((longest, candidate) =>
        candidate.mechanism.cyclePeriod > longest.mechanism.cyclePeriod ? candidate : longest
      );
      const alone = runnable.length === 1;
      if (alone) {
        return [this.rowFor(lead.index, true, false)];
      }
      // Synced, the row stands for every machine at once, so what happens at
      // the end of the cycle is said about the group rather than about the one
      // machine the handle happens to follow.
      return [
        this.rowFor(
          lead.index,
          true,
          false,
          'All',
          this.combinedEnds(runnable.map((r) => r.index))
        ),
      ];
    }

    return runnable.map(({ index }, position) =>
      this.rowFor(index, position === 0, runnable.length > 1)
    );
  }

  private rowFor(
    index: number,
    master: boolean,
    ownPlay: boolean,
    name?: string,
    ends?: CycleEnd[]
  ): PlaybackRow {
    const mechanism = this.mechanism.mechanisms[index];
    const seconds = this.mechanism.secondsOf(index);
    const combined = name !== undefined;
    return {
      id: name ?? this.nameOf(index),
      index: combined ? -1 : index,
      leader: index,
      isMechanism: !combined,
      master,
      time: this.format(seconds),
      position: combined ? '' : this.positionLabel(index),
      // A machine's own handle is where its input has got to; the combined one
      // is where the clock has got to. See `seekAllAlong`: an input that rocks
      // is in the same place twice a cycle, and a handle that means two times
      // at once cannot be dragged.
      scrub: combined
        ? Math.round(Math.min(Math.max(seconds / (mechanism.cyclePeriod || 1), 0), 1) * 1000)
        : Math.round((this.mechanism.travelOf(index) ?? 0) * 1000),
      clockwise: this.drivenSpeedOf(mechanism) < 0,
      note: combined ? '' : this.noteFor(index),
      playing: this.mechanism.isMechanismPlaying(index),
      ownPlay,
      ends: ends ?? [this.endOf(index)],
      period: mechanism.cyclePeriod || 1,
    };
  }

  /**
   * Where the input is, in the units the input is measured in.
   *
   * The handle says how far along; this says how far along *what*. A crank
   * reads in degrees of its own turn, a ram in the length its rod has come out
   * past the shortest it gets.
   */
  private positionLabel(index: number): string {
    const profile = this.mechanism.driveProfileOf(index);
    const along = this.mechanism.travelOf(index);
    if (!profile || along === undefined) {
      return '';
    }
    if (!profile.linear) {
      const bearing = this.mechanism.inputAngleDegrees(index);
      return bearing === undefined ? '' : `${Math.round(bearing)}\u00b0`;
    }
    if (!(profile.span > 0)) {
      return `${Math.round(along * 100)}%`;
    }
    return this.nup.formatValueAndUnit(
      (along * profile.span) / MODEL_SCALE,
      this.settings.lengthUnit.value
    );
  }

  /**
   * Which way the input is travelling at this moment, in words.
   *
   * A linear drive extends and retracts; a rotary one turns one way or the
   * other. "Reciprocating" said only that the machine was of a kind that turns
   * around, which is not something the reader needs told twice a cycle.
   */
  private noteFor(index: number): string {
    const profile = this.mechanism.driveProfileOf(index);
    const outward = this.mechanism.travellingForward(index);
    if (profile?.linear) {
      return outward ? 'Extending' : 'Retracting';
    }
    return outward ? 'Clockwise' : 'Counter-clockwise';
  }

  /** Only worth offering when there is more than one machine to get out of step. */
  get canSync(): boolean {
    return this.mechanism.mechanisms.filter((m) => m.isMechanismValid()).length > 1;
  }

  get synced(): boolean {
    return this.mechanism.syncMechanisms;
  }

  toggleSync(): void {
    this.mechanism.setSyncMechanisms(!this.mechanism.syncMechanisms);
  }

  /** The chip names a machine, so pressing it selects that machine. */
  selectMechanism(row: PlaybackRow): void {
    if (row.index >= 0) {
      this.activeObj.selectMechanism(row.index);
    }
  }

  /** Light the machine up on the canvas while the reader points at its name. */
  hoverMechanism(row: PlaybackRow, over: boolean): void {
    this.mechanism.hoveredMechanismIndex = over && row.index >= 0 ? row.index : -1;
  }

  isSelected(row: PlaybackRow): boolean {
    return (
      this.activeObj.getSelectedObjType() === 'Mechanism' &&
      this.activeObj.selectedMechanismIndex === row.index
    );
  }

  toggleRow(row: PlaybackRow): void {
    this.mechanism.toggleMechanismPlaying(row.index);
  }

  /**
   * Drag a row's handle to a place along its input's travel.
   *
   * The handle is a position, so this is a position. What time that is, is the
   * service's problem -- and on a machine that turns back it is two times, one
   * on each leg, which is why it is told where the machine is now.
   */
  scrubRow(row: PlaybackRow, event: Event): void {
    const along = Number((event.target as HTMLInputElement).value) / 1000;
    if (row.index === -1) {
      // The combined row stands for all of them, so all of them go -- led by
      // the longest cycle, which is the one whose frames the handle spans.
      this.mechanism.seekAllAlong(row.leader, along);
      return;
    }
    const index = row.index;
    this.mechanism.seekMechanismTo(index, along);
  }

  /** What the machine is called, everywhere the transport has to name it. */
  private nameOf(index: number): string {
    return this.mechanism.partitions[index]?.id ?? `M${index + 1}`;
  }

  /**
   * What this machine does when its handle reaches the end of the track.
   *
   * The row said where the input was and which way it was going, and nothing at
   * all about either end of the track -- so a handle that jumped back to the
   * start and a handle that turned round and came back looked the same until
   * you watched one happen.
   */
  private endOf(index: number): CycleEnd {
    return this.endWords(!this.isReciprocating(this.mechanism.mechanisms[index]));
  }

  private endWords(loops: boolean): CycleEnd {
    return { glyph: loops ? 'loop' : 'swap_horiz', text: loops ? 'Loops' : 'Reverses' };
  }

  /**
   * The same fact about several machines at once.
   *
   * Grouped by behaviour rather than listed per machine: what the reader wants
   * from the combined row is how many kinds of ending there are, and with one
   * kind the names are noise -- the row is already called All.
   */
  private combinedEnds(indices: number[]): CycleEnd[] {
    const groups = new Map<boolean, string[]>();
    indices.forEach((index) => {
      const loops = !this.isReciprocating(this.mechanism.mechanisms[index]);
      groups.set(loops, [...(groups.get(loops) ?? []), this.nameOf(index)]);
    });
    if (groups.size === 1) {
      return [this.endWords([...groups.keys()][0])];
    }
    return [...groups].map(([loops, names]) => {
      // One machine is the subject of a singular verb, several of a plural one.
      const verb = loops ? 'loop' : 'reverse';
      return {
        glyph: this.endWords(loops).glyph,
        text: `${names.join(', ')} ${names.length === 1 ? verb + 's' : verb}`,
      };
    });
  }

  /**
   * Out-and-back rather than round and round.
   *
   * From the sign of the recorded input velocity, which the solver flips at
   * each reversal: a cycle holding both signs is one that turned around.
   */
  private isReciprocating(mechanism: Mechanism): boolean {
    const speeds = mechanism.inputAngularVelocities;
    return speeds.some((speed) => speed > 0) && speeds.some((speed) => speed < 0);
  }

  private drivenSpeedOf(mechanism: Mechanism): number {
    return mechanism.inputAngularVelocities[0] ?? 0;
  }

  /**
   * One frame along, the way the handle moves it.
   *
   * Through the same seek the scrubber uses, so a keyed step and a nudge of
   * the handle are the same motion -- and paused first, because a step is a
   * look at one pose and playback would carry it off before it could be read.
   */
  stepBy(delta: number): void {
    if (!this.canPlay) return;
    const master = this.rows.find((row) => row.master);
    if (!master) return;
    if (this.mechanism.isPlaying) this.mechanism.setAllPlaying(false);
    const frames = Math.max(this.maxStep, 1);
    const along = Math.min(1, Math.max(0, master.scrub / 1000 + delta / frames));
    if (master.index === -1) {
      this.mechanism.seekAllAlong(master.leader, along);
    } else {
      this.mechanism.seekMechanismTo(master.index, along);
    }
    this.settings.animating.next(along !== 0);
  }

  play(): void {
    if (!this.canPlay) return;
    // Every row, not just the shared flag: unsynced it is the rows that run,
    // and a master button that left them alone showed a pause icon over a
    // drawing standing still.
    this.mechanism.setAllPlaying(!this.mechanism.isPlaying);
    this.settings.animating.next(this.mechanism.mechanismTimeStep !== 0);
  }

  /**
   * Whether there is anything to come back from.
   *
   * A machine at the start of its cycle is already showing the pose it was
   * drawn in, and a button that does nothing when pressed is worse than one
   * that says so.
   */
  get canStop(): boolean {
    return this.canPlay && !this.mechanism.isAtStartPose();
  }

  /**
   * Back to the pose the mechanism was drawn in.
   *
   * Eased rather than cut, and by whichever way round is shorter for each
   * machine: a linkage that teleports reads as the drawing breaking, where the
   * same move played over a fifth of a second reads as playback ending.
   */
  stop(): void {
    if (!this.canPlay) return;
    this.mechanism.setAllPlaying(false);
    this.settings.animating.next(false);
    this.mechanism.easeToStart();
  }

  cycleSpeed(): void {
    // 1x plays back in real time: one revolution takes 60/RPM seconds. The
    // other stops are explicit fast-forwards for slow input speeds.
    const rates = [1, 2, 4];
    const next = rates.indexOf(this.mechanism.animationSpeedMultiplier) + 1;
    this.mechanism.animationSpeedMultiplier = rates[next % rates.length];
  }

  /**
   * Turn this machine round.
   *
   * A continuously driven machine is turned round by reversing its drive; a
   * machine whose input already reverses on its own has no other direction to
   * be driven in, so the only thing left to turn round is playback, and that is
   * a view of the same motion rather than a change to the drawing.
   *
   * Either way nothing moves. The linkage holds the pose it was in and the
   * handle holds its place; the time is what jumps.
   */
  flipDirection(row: PlaybackRow): void {
    const mechanism = this.mechanism.mechanisms[row.index];
    if (mechanism && this.isReciprocating(mechanism)) {
      this.mechanism.setPlaybackDirection(row.index, -this.mechanism.directionOf(row.index));
      return;
    }
    this.mechanism.reverseDrive(row.index);
  }

  /**
   * Dragging one machine's handle stops that machine, not the drawing.
   *
   * The rows have their own clocks precisely so they can be read apart; pausing
   * everything to scrub one of them threw that away.
   */
  onScrubDown(row?: PlaybackRow): void {
    if (row && row.ownPlay && row.index >= 0) {
      this.wasRowAnimating = this.mechanism.isMechanismPlaying(row.index);
      if (this.wasRowAnimating) this.mechanism.toggleMechanismPlaying(row.index);
      return;
    }
    this.wasAnimating = this.mechanism.isPlaying;
    this.mechanism.isPlaying = false;
  }

  onScrubUp(row?: PlaybackRow): void {
    if (row && row.ownPlay && row.index >= 0) {
      if (this.wasRowAnimating && !this.mechanism.isMechanismPlaying(row.index)) {
        this.mechanism.toggleMechanismPlaying(row.index);
      }
      this.wasRowAnimating = false;
      return;
    }
    if (this.wasAnimating) {
      this.mechanism.isPlaying = true;
      this.mechanism.animate(this.mechanism.mechanismTimeStep, true);
    }
  }

  onScrub(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.mechanism.animate(value, this.mechanism.isPlaying);
    this.settings.animating.next(value !== 0);
  }
}
