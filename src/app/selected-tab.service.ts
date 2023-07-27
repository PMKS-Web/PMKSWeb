import { T } from '@angular/cdk/keycodes';
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export enum TabID {
  SYNTHESIZE,
  EDIT,
  ANALYZE
}

@Injectable({
  providedIn: 'root'
})
export class SelectedTabService {

  public tabNum: BehaviorSubject<TabID>;
  public tabVisible: BehaviorSubject<boolean>;

  constructor() {
    this.tabNum = new BehaviorSubject<TabID>(TabID.EDIT);
    this.tabVisible = new BehaviorSubject<boolean>(true);
  }
}
