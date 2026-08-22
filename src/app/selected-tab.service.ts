import { RightPanelComponent } from './component/right-panel/right-panel.component';
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MechanismService } from './services/mechanism.service';
import { SynthesisBuilderService } from './services/synthesis/synthesis-builder.service';
import { ActiveObjService } from 'src/app/services/active-obj.service';
import { SettingsService } from './services/settings.service';

export enum TabID {
  SYNTHESIZE,
  EDIT,
  /** Kinematic analysis: position, velocity, acceleration. */
  ANALYZE,
  /** Force analysis, which asks for more of a mechanism than kinematics does. */
  FORCE,
}

@Injectable({
  providedIn: 'root',
})
export class SelectedTabService {
  private synthesis = inject(SynthesisBuilderService);
  private mechanism = inject(MechanismService);
  private activeObjService = inject(ActiveObjService);
  private settings = inject(SettingsService);

  private _tabNum: BehaviorSubject<TabID>;
  private _tabVisible: BehaviorSubject<boolean>;

  constructor() {
    this._tabNum = new BehaviorSubject<TabID>(TabID.EDIT);
    this._tabVisible = new BehaviorSubject<boolean>(true);
  }

  public setTab(tabID: TabID) {
    let previousTab = this.getCurrentTab();
    let isDifferentTab = previousTab !== tabID;

    // when switching from synthesis to edit/analyze tab, clear selected synthesis pose, if it exists
    if (
      previousTab === TabID.SYNTHESIZE &&
      this.activeObjService.getSelectedObjType() === 'SynthesisPose'
    ) {
      this.activeObjService.updateSelectedObj(null);
    }

    this._tabNum.next(tabID);
    this._tabVisible.next(true);

    if (isDifferentTab) this.onNewTab(previousTab);
  }

  public showTab() {
    this._tabVisible.next(true);
  }

  public hideTab() {
    this._tabVisible.next(false);
  }

  /**
   * The mode, for anything that has to follow a change rather than ask about
   * the current one. The canvas listens: the panel beside it is a different
   * width in every mode, and the transport comes and goes with the analyses.
   */
  public get tabChanged() {
    return this._tabNum.asObservable();
  }

  public getCurrentTab() {
    return this._tabNum.getValue();
  }

  public isTabVisible() {
    return this._tabVisible.getValue();
  }

  /**
   * Either of the two analysis modes.
   *
   * The geometry is locked in both, and both are read-only, so almost
   * everything that used to ask "is this the Analyze tab" means this instead.
   */
  public isAnalysisMode(tab: TabID = this.getCurrentTab()) {
    return tab === TabID.ANALYZE || tab === TabID.FORCE;
  }

  /**
   * Whether the current mode's panel needs the wide drawer.
   *
   * The two analyses need it for their tables and graphs; Synthesis needs it
   * for a row of three numbers per position and a gallery of candidate
   * linkages read side by side. Edit is the only mode that still fits in the
   * narrow one.
   */
  public isWidePanel(tab: TabID = this.getCurrentTab()) {
    return this.isAnalysisMode(tab) || tab === TabID.SYNTHESIZE;
  }

  private onNewTab(previousTab: TabID) {
    // A setup drawer answers a question about one mode, so it goes when that
    // mode does -- otherwise the Force list sits over the Synthesis canvas
    // looking like the app is stuck between two places.
    RightPanelComponent.closeSetupUnlessFor(this.getCurrentTab());

    // Leaving Analyze rewinds the mechanism, so the other modes always act on
    // the pose at time 0. The transport's stop button does the same thing
    // without leaving, for a reader who wants the drawn pose back and wants to
    // stay where they are.
    if (this.isAnalysisMode(previousTab) && !this.isAnalysisMode()) {
      this.mechanism.easeToStart();
      this.settings.animating.next(false);
    }

    /*
      Leaving Synthesis no longer saves.

      It used to, because the old mode built onto the grid as the reader typed
      and nothing else was going to write that down. The redesign only ever
      touches the drawing through Insert, Undo-insert and Delete, and each of
      those saves for itself -- so this wrote a second, identical entry on the
      way out, and the first Undo after inserting appeared to do nothing at all
      because it stepped back onto the same state.

      The flag that was supposed to gate it had not been set by anything for as
      long as the redesign has existed, and is gone with it.
    */
  }
}
