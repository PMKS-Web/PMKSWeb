import {Component, Input, OnInit} from '@angular/core';
import {Force} from "../../model/force";
import {Link} from "../../model/link";
import {Joint} from "../../model/joint";

@Component({
  selector: 'app-linkage-table',
  templateUrl: './linkage-table.component.html',
  styleUrls: ['./linkage-table.component.css']
})
export class LinkageTableComponent implements OnInit {
  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];

  selectedTab: number = 0;
  // private static selectedTab: number = 0;
  constructor() { }

  ngOnInit(): void {}

  setTab(tabNum: number) {
    this.selectedTab = tabNum;
    const hello = ':)';
    // LinkageTableComponent.selectedTab = $event.index;
  }

  // showLinks() {
  //
  // }
  //
  // showForces() {
  //
  // }
}
