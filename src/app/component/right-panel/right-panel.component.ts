import { TabID } from '../../selected-tab.service';
import { CHROME_MOVED } from '../../model/chrome-motion';
import { Component, inject, ChangeDetectionStrategy, DoCheck } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { NewGridComponent } from '../new-grid/new-grid.component';
import { gridStates, jointStates, linkStates, forceStates } from '../../model/utils';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { RealLink } from '../../model/link';
import { AnalyticsService } from '../../services/analytics.service';
import { SettingsService } from '../../services/settings.service';
import { Arc, Line } from '../../model/line';
import { Coord } from '../../model/coord';
import { SvgGridService } from '../../services/svg-grid.service';
import { TutorialService } from '../../services/tutorial.service';
import { AnalysisSetupComponent } from '../analysis-setup/analysis-setup.component';
import { ExportPanelComponent } from '../export-panel/export-panel.component';
import { TutorialPanelComponent } from '../tutorial-panel/tutorial-panel.component';
import { SettingsPanelComponent } from '../settings-panel/settings-panel.component';
import { EquationPanelComponent } from '../equation-panel/equation-panel.component';
import { HelpPanelComponent } from '../help-panel/help-panel.component';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { LinkageTableComponent } from '../linkage-table/linkage-table.component';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-right-panel',
  templateUrl: './right-panel.component.html',
  styleUrls: ['./right-panel.component.scss'],
  animations: [
    trigger('openClose', [
      // ...
      // No width here: the drawer is as wide as the view controls it sits
      // above, which only the stylesheet can know -- see `--view-controls-width`.
      // An animation state is written onto the element and beats a stylesheet,
      // so a width here would be a second, silent opinion about it.
      state(
        'open',
        style({
          transform: 'translateX(0)',
        })
      ),
      state(
        'closed',
        style({
          // Clear of the 12px inset the drawer now floats at, plus a margin.
          // The old 10px was measured against a panel flush to the edge and
          // left a two-pixel sliver of it on screen.
          transform: 'translateX(calc(100% + 24px))',
          // And genuinely gone. Parked off the edge it still occupied the
          // page's width, so a closed drawer could be scrolled back into view.
          visibility: 'hidden',
        })
      ),
      state('openWide', style({})),
      transition('open => openWide', [animate('0.1s ease-in-out')]),
      transition('openWide => open', [animate('0.1s ease-in-out')]),
      transition('* => *', [animate('0.3s ease-in-out')]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    AnalysisSetupComponent,
    ExportPanelComponent,
    TutorialPanelComponent,
    SettingsPanelComponent,
    EquationPanelComponent,
    HelpPanelComponent,
    PanelSectionComponent,
    ButtonComponent,
    LinkageTableComponent,
    MatTooltip,
    MatIcon,
  ],
})
export class RightPanelComponent implements DoCheck {
  activeObjService = inject(ActiveObjService);
  mechanismService = inject(MechanismService);
  settingsService = inject(SettingsService);
  svgService = inject(SvgGridService);
  private tutorial = inject(TutorialService);

  /**
   * The tutorial asks to be shown rather than reaching in and setting the tab.
   *
   * A service that imported this component to open it would close the loop
   * this component's own page has already opened -- the tutorial page injects
   * the service -- so the request travels the other way.
   */
  /**
   * Whether the tutorial's card is showing above whatever page is open.
   *
   * It is pinned rather than paged: a student following a step has to be able
   * to open Settings or Export without the thing they are following being put
   * away, so it is not one of the numbered pages and does not take the drawer
   * from one.
   */
  tutorialShowing(): boolean {
    return this.tutorial.started && !this.tutorial.exited;
  }

  /** The frame stands open for a page, for the tutorial, or for both. */
  frameOpen(): boolean {
    return RightPanelComponent.isOpen || this.tutorialShowing();
  }

  private analytics: AnalyticsService = inject(AnalyticsService);

  static openTab = 0; //Default open tab to "Edit" /
  static isOpen = false; // Is the tab open?
  /**
   * The two setup drawers, one per analysis mode.
   *
   * Separate because they answer different questions with different fixes: a
   * mechanism that will not run and a force analysis that has nothing to react
   * against are not the same problem, and a reader refused by one mode should
   * not have to read past the other mode's list to find out why.
   *
   * Numbered like their neighbours because that is how this panel has always
   * been addressed; named because "5" at a call site says nothing.
   */
  static readonly KINEMATIC_SETUP_TAB = 5;
  static readonly FORCE_SETUP_TAB = 6;
  /**
   * Export Data, which is a drawer rather than a dialog for the same reason the
   * setups are: the canvas stays visible, so ticking a part is done next to the
   * drawing it is a part of.
   */
  static readonly EXPORT_TAB = 7;
  turnOnDebugger() {
    this.settingsService.isGridDebugOn = !this.settingsService.isGridDebugOn;
  }

  /**
   * Bumped when a drawer is asked for that is already showing.
   *
   * Pressing a mode that is not ready opens the setup that says why. Pressing
   * it again used to close that setup -- so the reader who did not spot it the
   * first time asked twice and got nothing. It draws attention to itself
   * instead, which is what the second press was asking for.
   */
  static attentionCount = 0;

  /** Ask for a drawer without ever closing it. */
  static insistOn(tabID: number): void {
    if (this.isOpen && this.openTab === tabID) {
      this.attentionCount++;
      return;
    }
    this.isOpen = true;
    this.openTab = tabID;
  }

  static tabClicked(tabID: number) {
    if (!this.isOpen) {
      this.isOpen = true;
      this.openTab = tabID;
    } else {
      if (this.openTab === tabID) {
        this.isOpen = false;
      } else {
        this.openTab = tabID;
      }
    }
  }

  /**
   * Whether the drawer is currently being pointed at.
   *
   * A class for one animation's length, taken off again so a second ask plays
   * it a second time rather than doing nothing.
   */
  attention = false;
  private shownAttention = 0;

  /**
   * The drawer's shape, as the canvas behind it cares about it: whether it is
   * there, and how much room it takes when it is.
   *
   * Announced from here rather than from each of the five places that open or
   * close a drawer, because that is five places to remember and this is one --
   * and the state is a static that any of them may set. Seeded with what is
   * already true, so the first check announces nothing.
   */
  private shownShape = this.drawerShape();

  private drawerShape(): string {
    return `${RightPanelComponent.isOpen}:${this.isWidePage()}`;
  }

  ngDoCheck(): void {
    const shape = this.drawerShape();
    if (shape !== this.shownShape) {
      this.shownShape = shape;
      CHROME_MOVED.next();
    }
    // The Edit panel's resume line is offered only when the card is not up, and
    // a closed drawer still *renders* the page it was last showing -- it parks
    // off the edge rather than being torn down -- so the card cannot answer
    // this from its own lifecycle.
    this.tutorial.onScreen = this.tutorialShowing();
    if (RightPanelComponent.attentionCount !== this.shownAttention && !this.attention) {
      this.shownAttention = RightPanelComponent.attentionCount;
      this.attention = true;
      setTimeout(() => (this.attention = false), 650);
    }
  }

  /** Shut the drawer, whichever one is open. */
  close(): void {
    RightPanelComponent.dismiss();
  }

  /** Shut the drawer from outside it, the mirror of `insistOn`. */
  static dismiss(): void {
    RightPanelComponent.isOpen = false;
  }

  /**
   * Close a setup drawer that no longer describes the mode being shown.
   *
   * Settings and Help are about the app rather than a mode, so they stay.
   */
  static closeSetupUnlessFor(tab: TabID): void {
    if (!this.isOpen) {
      return;
    }
    // The force drawer holds the mass table, whose own header offers "Switch
    // to Edit mode" — a switch that must not close the thing that offered it.
    // So it survives Edit as well as Force, and only leaves for Synthesis.
    const forceDrawerBelongs = tab === TabID.FORCE || tab === TabID.EDIT;
    const wanted =
      tab === TabID.FORCE
        ? RightPanelComponent.FORCE_SETUP_TAB
        : tab === TabID.ANALYZE
          ? RightPanelComponent.KINEMATIC_SETUP_TAB
          : -1;
    if (this.openTab === RightPanelComponent.FORCE_SETUP_TAB) {
      if (!forceDrawerBelongs) {
        this.isOpen = false;
      }
      return;
    }
    if (this.openTab === RightPanelComponent.KINEMATIC_SETUP_TAB && this.openTab !== wanted) {
      this.isOpen = false;
    }
    // Export is an analysis-mode command: there is nothing to take away from a
    // mechanism being drawn, and the drawer's own lists come from a solved
    // cycle that Edit is about to change.
    if (this.openTab === RightPanelComponent.EXPORT_TAB && wanted === -1) {
      this.isOpen = false;
    }
  }

  getOpenTab() {
    return RightPanelComponent.openTab;
  }

  /** Two of these pages hold a table rather than a panel, and need the room. */
  isWidePage(): boolean {
    return this.getOpenTab() === 2 || this.getOpenTab() === 4;
  }

  /**
   * The export drawer is wider than the view controls it stands over.
   *
   * Its rows are a checkbox, a part's name and what is notable about it, and at
   * the drawer's usual width the third of those was always ellipsed away.
   */
  isExportPage(): boolean {
    return this.getOpenTab() === RightPanelComponent.EXPORT_TAB;
  }

  getIsOpen() {
    return RightPanelComponent.isOpen;
  }

  debugGetGridState() {
    return (
      NewGridComponent.debugGetGridState() +
      ' (' +
      gridStates[NewGridComponent.debugGetGridState()] +
      ')'
    );
  }

  debugGetJointState() {
    return (
      NewGridComponent.debugGetJointState() +
      ' (' +
      jointStates[NewGridComponent.debugGetJointState()] +
      ')'
    );
  }

  debugGetLinkState() {
    return (
      NewGridComponent.debugGetLinkState() +
      ' (' +
      linkStates[NewGridComponent.debugGetLinkState()] +
      ')'
    );
  }

  debugGetForceState() {
    return (
      NewGridComponent.debugGetForceState() +
      ' (' +
      forceStates[NewGridComponent.debugGetForceState()] +
      ')'
    );
  }

  getLinkDesiredOrder() {
    return RealLink.debugDesiredJointsIDs;
  }

  printMechanism() {
    this.analytics.logEvent('debug_print_mechanism');
    console.log(this.mechanismService.mechanisms);
    console.log(this.mechanismService.links);
    console.log(this.mechanismService.joints);
  }

  redrawAllLinks() {
    console.log('Redrawing all links');
    this.mechanismService.links.forEach((link) => {
      (link as RealLink).reComputeDPath();
    });
  }

  printActiveObject() {
    this.analytics.logEvent('debug_print_active_object');
    switch (this.activeObjService.objType) {
      case 'Joint':
        console.log(this.activeObjService.selectedJoint);
        break;
      case 'Link':
        console.log(this.activeObjService.selectedLink);
        break;
      case 'Force':
        console.log(this.activeObjService.selectedForce);
        break;
      default:
        console.log('No active object');
    }
  }

  runGeometryUnitTests() {
    this.svgService.panZoomObject.zoomAtPoint(2, { x: 0, y: 0 });
    console.log('Running interseciton tests');
    let arc = new Arc(new Coord(0, 0), new Coord(0, 2), new Coord(0, 1));
    let arc2 = new Arc(new Coord(-1, 1), new Coord(1, 1), new Coord(0, 1));
    console.log('Arc intersects with arc2, should be infinite points:');
    console.log(arc.intersectsWith(arc2));

    let line = new Line(new Coord(1, 0), new Coord(1, 2));
    console.log('Arc intersects with line, should be one point:');
    console.log(arc.intersectsWith(line));

    let line2 = new Line(new Coord(0.8, 0), new Coord(0.8, 2));
    console.log('Arc intersects with line2, should be two points:');
    console.log(arc.intersectsWith(line2));
    console.log(line2.intersectsWith(arc));

    let line3 = new Line(new Coord(-1, 0), new Coord(0, 0));
    console.log('Arc intersects with line 3 but only at the end, no points:');
    console.log(line3.intersectsWith(arc));
    console.log(arc.intersectsWith(line3));

    let line4 = new Line(new Coord(0, 2), new Coord(-1, 2));
    console.log('Arc intersects with line 4 but only at the start, no points:');
    console.log(line4.intersectsWith(arc));
    console.log(arc.intersectsWith(line4));

    let arc3 = new Arc(new Coord(-1, 2), new Coord(-1, 0), new Coord(-1, 1));
    console.log('Arc intersects with arc3 but only at the start, no points:');
    console.log(arc3.intersectsWith(line3));
    console.log(line3.intersectsWith(arc3));

    let arcTest = new Arc(
      new Coord(-0.1926, -7.258),
      new Coord(1.038, -7.36),
      new Coord(0.422, -7.31)
    );
    let lineTest = new Line(new Coord(1, 9.95), new Coord(0.457, 0.52));
    console.log('Arc intersects with lineTest, should be undefined:');
    console.log(arcTest.intersectsWith(lineTest));
    console.log(lineTest.intersectsWith(arcTest));

    //Two circle intersection test
    let arc4 = new Arc(new Coord(0, -1), new Coord(0, 1), new Coord(0, 0));
    let arc5 = new Arc(new Coord(1, 1), new Coord(1, -1), new Coord(1, 0));
    console.log('Arc intersects with arc5, should be two points:');
    console.log(arc4.intersectsWith(arc5));
    console.log(arc5.intersectsWith(arc4));

    let arc6 = new Arc(new Coord(3.94, 3.12), new Coord(3.73, 4.33), new Coord(3.83, 3.73));
    let arc7 = new Arc(new Coord(3.49, 4.29), new Coord(3.91, 5.45), new Coord(3.67, 4.88));
    console.log('Arc intersects with arc5, should be two points:');
    console.log(arc6.intersectsWith(arc7));
    console.log(arc7.intersectsWith(arc6));

    //Check with lines that touch each other don't count as intersection
    let line5 = new Line(new Coord(0, 0), new Coord(1, 0));
    let line6 = new Line(new Coord(0.5, 0), new Coord(0.5, 1));
    console.log('Line intersects with line6, should be one point:');
    console.log(line5.intersectsWith(line6));
    console.log(line6.intersectsWith(line5));

    //These two arcs should not intersect
    let arc8 = new Arc(new Coord(0, 0.6), new Coord(0, -0.6), new Coord(0, 0));
    let arc9 = new Arc(new Coord(0.5, 0), new Coord(1.7, 0), new Coord(1.1, 0));
    console.log('Does not intersect, should be no points:');
    console.log(arc8.intersectsWith(arc9));
    console.log(arc9.intersectsWith(arc8));

    //These two arcs should not intersect
    let arc10 = new Arc(new Coord(1, 0), new Coord(-1, 0), new Coord(0, 0));
    let arc11 = new Arc(new Coord(1, 0.1), new Coord(-1, 0.1), new Coord(0, 0.1));
    console.log('Does not intersect, should be no points:');
    console.log(arc10.intersectsWith(arc11));
    console.log(arc11.intersectsWith(arc10));
  }
}
