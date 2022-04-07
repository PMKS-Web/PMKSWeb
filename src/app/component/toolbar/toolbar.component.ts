import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {Joint} from "../../model/joint";
import {Link} from "../../model/link";
import {Force} from "../../model/force";
import {interval} from "rxjs";
import {GridComponent} from "../grid/grid.component";
import {Mechanism} from "../../model/mechanism/mechanism";
import {ForceSolver} from "../../model/mechanism/force-solver";

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class ToolbarComponent implements OnInit {

  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];
  @Input() mechanisms: Mechanism[] = [];
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
    // TODO: If possible, don't have this as an emitter. Have the linkage table have an input here that determines the value,
    // TODO: that is either if it updates automoatically or if NgUpdates is needed
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

  determineForceAnalysis() {
    // ForceSolver.determineDesiredLoopLettersForce(this.mechanisms[0].requiredLoops);
    // ForceSolver.determineForceAnalysis(this.joints, this.links, 'static', this.gravity, this.unit);
  }

  popUpAnalysis(analysisType: string) {
    switch (analysisType) {
      case 'loop':
        break;
      case 'force':
        ForceSolver.determineDesiredLoopLettersForce(this.mechanisms[0].requiredLoops);
        ForceSolver.determineForceAnalysis(this.joints, this.links, 'static', this.gravity, this.unit);
        break;
      case 'stress':
        break;
      case 'kinematic':
        break;
    }
  }
}
