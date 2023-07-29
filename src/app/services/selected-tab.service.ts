import { T } from '@angular/cdk/keycodes';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MechanismService } from './mechanism.service';

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

  constructor(private mechanism: MechanismService) {
    this._tabNum = new BehaviorSubject<TabID>(TabID.EDIT);
    this._tabVisible = new BehaviorSubject<boolean>(true);
  }

  public setTab(tabID: TabID) {

    let isDifferentTab = this.getCurrentTab() !== tabID;

    this._tabNum.next(tabID);
    this._tabVisible.next(true);

    if (isDifferentTab) this.onNewTab();

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

  private onNewTab() {
    
    // if new tab is synthesis, reset mechanism
    if (this.getCurrentTab() === TabID.SYNTHESIZE) {
      this.mechanism.resetMechanism();
    }

  }

}
