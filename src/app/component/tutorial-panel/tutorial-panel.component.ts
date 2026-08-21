import {
  ChangeDetectionStrategy,
  Component,
  DoCheck,
  TemplateRef,
  inject,
  viewChild,
} from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import {
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TutorialService } from '../../services/tutorial.service';
import { MechanismService } from '../../services/mechanism.service';
import { UrlGenerationService } from '../../services/url-generation.service';
import { NotificationService } from '../../services/notification.service';
import { ExportFlowService } from '../../services/export/export-flow.service';
import { TemplatesComponent } from '../MODALS/templates/templates.component';
import { RightPanelComponent } from '../right-panel/right-panel.component';

/**
 * The tutorial, as a drawer page.
 *
 * In the drawer rather than the left column because the left column is already
 * that mode's own panel — it says what the selected part is, and the analysis
 * page fills it with graph cards the last step is pointing at. The drawer is
 * where the app already keeps things that run alongside the drawing instead of
 * describing a selection.
 */
@Component({
  selector: 'app-tutorial-panel',
  templateUrl: './tutorial-panel.component.html',
  styleUrls: ['./tutorial-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  animations: [
    // One step leaving as the next arrives, in the direction of travel. The
    // card used to cut from one step to the next in a single frame, at the
    // moment the student finished the move it was describing -- so the thing
    // they were reading was replaced by a thing they had not asked for, and
    // the only cue that anything had happened was that the words were now
    // different.
    trigger('stepSwap', [
      transition(':increment', arrive(26)),
      transition(':decrement', arrive(-26)),
    ]),
  ],
  imports: [MatIcon, MatButton, MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose],
})
export class TutorialPanelComponent implements DoCheck {
  tutorial = inject(TutorialService);
  private mechanism = inject(MechanismService);
  private urlGeneration = inject(UrlGenerationService);
  private notify = inject(NotificationService);
  private exportFlow = inject(ExportFlowService);
  private dialog = inject(MatDialog);

  readonly confirmRestart = viewChild.required<TemplateRef<unknown>>('confirmRestart');

  /**
   * Ask the drawing whether the step has changed, once per cycle.
   *
   * A subscription would be tidier, and there is nothing to subscribe to: an
   * edit ends in `updateMechanism`, which publishes on nothing this could
   * listen to. Change detection runs after every gesture that could move the
   * tutorial on, which makes it the honest place to ask.
   */
  ngDoCheck(): void {
    this.tutorial.noticeStep();
  }

  /**
   * One segment per step: filled behind the student, hollow ahead, and only
   * pressable as far as the drawing has actually got.
   */
  get bars(): { done: boolean; here: boolean; reachable: boolean }[] {
    const viewed = this.tutorial.viewedStep;
    const reached = this.tutorial.step();
    return Array.from({ length: this.tutorial.stepCount() }, (_, index) => ({
      done: index + 1 < reached,
      here: index + 1 === viewed,
      reachable: index + 1 <= reached,
    }));
  }

  get lead(): string {
    return `Step ${this.tutorial.viewedStep} of ${this.tutorial.stepCount()}. Build a four-bar and read a velocity.`;
  }

  /**
   * What the Kinematic Analysis chip says right now, quoted rather than
   * retyped.
   *
   * The mock spelled it "1 to set", which is the *Force* chip's wording — the
   * kinematic one counts fixes. Reading the real number is the only way the
   * sentence cannot drift from the control it is teaching.
   */
  get chipText(): string {
    const blockers = this.mechanism.blockerCount();
    return blockers === 0 ? 'Ready' : `${blockers} ${blockers === 1 ? 'fix' : 'fixes'}`;
  }

  /** Step four is the one lesson about the app rather than about linkages. */
  get showsChipHint(): boolean {
    return this.tutorial.viewedStep === 4;
  }

  /**
   * Closing happens, and then says where the tutorial went.
   *
   * A dialog asking permission first was too heavy for a thing that costs
   * nothing: the drawing is untouched either way, and the only real question —
   * "how do I get it back?" — is answered better after the fact than as a
   * question the reader has to dismiss before they can act.
   */
  close(): void {
    this.tutorial.exit();
    this.notify.success(
      'tutorial.closed',
      'Tutorial closed. It is in the project menu, at the top left, whenever you want it back.'
    );
  }

  /**
   * Starting again clears the grid, so it asks — but only where there is
   * something to lose. A confirmation over an empty drawing is a question with
   * one answer.
   */
  restart(): void {
    if (!this.tutorial.restartWouldDiscard()) {
      this.tutorial.restart();
      return;
    }
    this.dialog
      // Sized, because a Material dialog left to itself takes most of the
      // window and two sentences do not need it.
      .open(this.confirmRestart(), { width: '440px', autoFocus: false })
      .afterClosed()
      .subscribe((choice) => {
        if (choice === 'restart') this.tutorial.restart();
      });
  }

  doStepForMe(): void {
    this.tutorial.doStepForMe();
  }

  // ---------- the three doors ----------

  openExport(): void {
    this.exportFlow.reset();
    RightPanelComponent.insistOn(RightPanelComponent.EXPORT_TAB);
  }

  shareProject(): void {
    this.urlGeneration.copyFullUrl();
    this.notify.success('share.copied', 'Link copied. It opens this exact mechanism.');
  }

  openTemplates(): void {
    this.dialog.open(TemplatesComponent, { height: '90%', width: '90%', autoFocus: false });
  }
}

/**
 * The step that has just arrived comes in from the side it came from: forwards
 * from the right, backwards from the left.
 *
 * The element itself is animated rather than the two steps being crossfaded
 * past each other. A crossfade needs both on screen at once, which means either
 * the card jumping to the height of two steps stacked or the outgoing one being
 * torn out of the layout — and neither is worth it for a movement this short.
 */
function arrive(offset: number) {
  return [
    style({ opacity: 0, transform: `translateX(${offset}px)` }),
    animate('220ms cubic-bezier(0.2, 0, 0, 1)', style({ opacity: 1, transform: 'none' })),
  ];
}
