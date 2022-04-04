import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Joint} from "../../model/joint";
import {Link} from "../../model/link";
import {Force} from "../../model/force";
import {interval} from "rxjs";
import {GridComponent} from "../grid/grid.component";

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class ToolbarComponent implements OnInit {

  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];
  @Input() screenCoord: string = '';
  @Output() showcaseTable = new EventEmitter();
  selectedTab: string = 'none';
  showIdTags: boolean = false;
  showCoMTags: boolean = false;
  unit: string = 'cm';
  gravity: boolean = false;
  animate: boolean = false;
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

  animateMechanism() {
    console.log('animateMechanism');

    this.animate = !this.animate;
    if (this.animate) {
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          // console.log("this is the first message")
          document.getElementById('slider')!.setAttribute('value', i.toString());
        }, 100 * i);
      }
    } else {
      document.getElementById('slider')!.setAttribute('value','0');
    }
  }
}
