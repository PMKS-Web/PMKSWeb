import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Joint} from "../../model/joint";
import {Link} from "../../model/link";
import {Force} from "../../model/force";

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class ToolbarComponent implements OnInit {

  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];
  @Output() showcaseTable = new EventEmitter();
  selectedTab: string = 'none';
  showIdTags: boolean = true;
  showCoMTags: boolean = true;
  constructor() { }

  ngOnInit(): void {
  }

  showTable() {
    this.showcaseTable.emit();
  }

  setTab(analysis: string) {
    if (this.selectedTab === analysis) {
      this.selectedTab = 'none';
    } else {
      this.selectedTab = analysis;
    }
  }

  changeIdTag() {
    this.showIdTags = !this.showIdTags;
  }

  changeCoMTag() {
    this.showCoMTags = !this.showCoMTags;
  }
}
