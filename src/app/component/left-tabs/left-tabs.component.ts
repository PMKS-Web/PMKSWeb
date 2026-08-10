import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  QueryList,
  ViewChildren,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { RealJoint } from 'src/app/model/joint';
import { RealLink } from 'src/app/model/link';
import { Force } from 'src/app/model/force';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { AnalyticsService } from '../../services/analytics.service';
import { SelectedTabService, TabID } from 'src/app/selected-tab.service';
import { MatDialog } from '@angular/material/dialog';
import { SynthesisWarningComponent } from '../MODALS/synthesis-warning/synthesis-warning.component';
import { MechanismService } from 'src/app/services/mechanism.service';
import { SaveHistoryService } from 'src/app/services/save-history.service';

@Component({
  selector: 'app-left-tabs',
  templateUrl: './left-tabs.component.html',
  styleUrls: ['./left-tabs.component.scss'],
  animations: [
    // A mode's controls unfold with it rather than popping in. Same duration and
    // easing as the pill's CSS transition (see the SCSS) so the highlight and the
    // tools grow in lockstep.
    trigger('grow', [
      transition(':enter', [
        style({ height: 0, opacity: 0 }),
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ height: '*', opacity: 1 })),
      ]),
      transition(':leave', [
        animate('200ms cubic-bezier(0.4, 0, 0.2, 1)', style({ height: 0, opacity: 0 })),
      ]),
    ]),
    trigger('openClose', [
      // ...
      state(
        'open',
        style({
          transform: 'translateX(0)',
          width: '270px', //Be careful, there are multiple places to change this value
        })
      ),
      state(
        'closed',
        style({
          transform: 'translateX(calc(-100% - 100px))',
        })
      ),
      state(
        'openWide',
        style({
          width: '420px', //Be careful, there are multiple places to change this value
        })
      ),
      transition('open => openWide', [animate('0.1s ease-in-out')]),
      transition('openWide => open', [animate('0.1s ease-in-out')]),
      transition('* => *', [animate('0.3s ease-in-out')]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class LeftTabsComponent implements AfterViewInit, OnDestroy {
  private analytics: AnalyticsService = inject(AnalyticsService);

  @ViewChildren('tabGroup') tabGroups!: QueryList<ElementRef<HTMLElement>>;

  pillTop = 0;
  pillHeight = 0;
  private pendingFrame = 0;

  constructor(
    public tabs: SelectedTabService,
    private mechanism: MechanismService,
    private saveHistoryService: SaveHistoryService,
    public dialog: MatDialog
  ) {}

  public get TabID(): typeof TabID {
    return TabID;
  }

  private readonly onResize = () => this.schedulePillUpdate();

  ngAfterViewInit(): void {
    this.schedulePillUpdate();
    // A short viewport hides the animation bar's slider, changing the active
    // group's height, so the pill must re-measure when the window resizes.
    window.addEventListener('resize', this.onResize);
  }

  ngOnDestroy(): void {
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    window.removeEventListener('resize', this.onResize);
  }

  /**
   * The pill's target top/height are computed once per tab change and applied as
   * plain values; a single CSS transition on the element eases it there in step
   * with the tools' own grow animation. Nothing runs per frame, so the motion
   * can't stutter or stall midway the way the old resize-tracked pill did.
   *
   * Every tab is the same fixed height and only the active one carries tools, so
   * the active group's final top is just its index times that height, and its
   * final height is that plus the tools' natural (scroll) height — both known
   * immediately, even while the tools are still animating open.
   */
  private updatePill(): void {
    const groups = this.tabGroups;
    if (!groups || groups.length === 0) return;
    const tabHeight = groups.get(0)!.nativeElement.offsetHeight;
    const index = this.activeTabIndex();
    const tools = groups.get(index)?.nativeElement.querySelector('.tabTools') as HTMLElement | null;
    this.pillTop = index * tabHeight;
    this.pillHeight = tabHeight + (tools ? tools.scrollHeight : 0);
  }

  /** Measure after the new tab's tools have rendered, off the CD pass. */
  private schedulePillUpdate(): void {
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      this.updatePill();
    });
  }

  private activeTabIndex(): number {
    switch (this.tabs.getCurrentTab()) {
      case TabID.SYNTHESIZE:
        return 0;
      case TabID.EDIT:
        return 1;
      default:
        return 2;
    }
  }

  /** A tab is only "active" while its panel is open, so its tools hide with it. */
  isActive(tabID: TabID): boolean {
    return this.tabs.isTabVisible() && this.tabs.getCurrentTab() === tabID;
  }

  // No snackbar on either of these. "Undo Called!" was a developer's breadcrumb
  // from when undo was being built, and it survived into a shipped app: it says
  // nothing a user does not already know, it says it in the voice of a stack
  // trace, and it takes over the one channel the app has for telling them
  // something they could not see for themselves. The canvas moving is the
  // feedback.
  handleUndo() {
    this.saveHistoryService.undo();
  }

  canUndo(): boolean {
    if (this.mechanism.isAnimating()) return false;
    return this.saveHistoryService.canUndo();
  }

  handleRedo() {
    this.saveHistoryService.redo();
  }

  canRedo(): boolean {
    if (this.mechanism.isAnimating()) return false;
    return this.saveHistoryService.canRedo();
  }

  tabClicked(tabID: TabID) {
    if (!this.tabs.isTabVisible()) {
      this.tabs.setTab(tabID);
    } else {
      if (this.tabs.getCurrentTab() === tabID) {
        this.tabs.hideTab();
      } else {
        this.tabs.setTab(tabID);
      }
    }

    if (this.tabs.isTabVisible()) {
      switch (this.tabs.getCurrentTab()) {
        case TabID.SYNTHESIZE:
          this.analytics.logEvent('open_synthesis_tab');
          break;
        case TabID.EDIT:
          this.analytics.logEvent('open_edit_tab');
          break;
        case TabID.ANALYZE:
          this.analytics.logEvent('open_analysis_tab');
          break;
      }
    }
    this.schedulePillUpdate();
  }
}
