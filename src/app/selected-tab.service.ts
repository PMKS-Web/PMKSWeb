import { T } from '@angular/cdk/keycodes';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MechanismService } from './services/mechanism.service';
import { SynthesisBuilderService } from './services/synthesis/synthesis-builder.service';

export enum TabID {
  SYNTHESIZE,
  EDIT,
  ANALYZE
}

@Injectable({
  providedIn: 'root'
})
export class SelectedTabService {

  private _tabNum: BehaviorSubject<TabID>;
  private _tabVisible: BehaviorSubject<boolean>;

  constructor(private synthesis: SynthesisBuilderService, private mechanism: MechanismService) {
    this._tabNum = new BehaviorSubject<TabID>(TabID.EDIT);
    this._tabVisible = new BehaviorSubject<boolean>(true);
  }

  public setTab(tabID: TabID) {

    let previousTab = this.getCurrentTab();
    let isDifferentTab = previousTab !== tabID;

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

  public getCurrentTab() {
    return this._tabNum.getValue();
  }

  public isTabVisible() {
    return this._tabVisible.getValue();
  }

  private onNewTab(previousTab: TabID) {

    if (this.getCurrentTab() === TabID.SYNTHESIZE) {

      // reset flag
      this.synthesis.modifiedMechanism = false;
    }
    else if (previousTab === TabID.SYNTHESIZE && this.getCurrentTab() === TabID.EDIT) {

      // save mechanism state if modified in synthesis tab
      this.mechanism.save();
      // reset flag
      this.synthesis.modifiedMechanism = false;
    }

  }

}
