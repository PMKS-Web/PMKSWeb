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
  @Output() animateGridEmitter = new EventEmitter();
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
      this.animateGridEmitter.emit();
      // for (let i = 0; i < 360; i++) {
      for (let i = 0; i < 100; i++) {
        setTimeout(() => {
          // console.log("this is the first message")
          document.getElementById('slider')!.setAttribute('value', i.toString());
          console.log(i.toString());

        }, 10 * i);
      }
    } else {
      document.getElementById('slider')!.setAttribute('value','0');
    }
  }
}
