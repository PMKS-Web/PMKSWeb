import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
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
  imports: [MatIcon],
})
export class TutorialPanelComponent {
  tutorial = inject(TutorialService);
  private mechanism = inject(MechanismService);
  private urlGeneration = inject(UrlGenerationService);
  private notify = inject(NotificationService);
  private exportFlow = inject(ExportFlowService);
  private dialog = inject(MatDialog);

  /** One segment per step, filled behind the student and hollow ahead of them. */
  get bars(): { done: boolean; here: boolean }[] {
    const step = this.tutorial.step();
    return Array.from({ length: this.tutorial.stepCount() }, (_, index) => ({
      done: step > index + 1,
      here: step === index + 1,
    }));
  }

  get lead(): string {
    return `Step ${this.tutorial.step()} of ${this.tutorial.stepCount()}. Build a four-bar and read a velocity.`;
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
    return this.tutorial.step() === 4;
  }

  close(): void {
    RightPanelComponent.dismiss();
  }

  exit(): void {
    this.tutorial.exit();
    RightPanelComponent.dismiss();
  }

  restart(): void {
    this.tutorial.restart();
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
