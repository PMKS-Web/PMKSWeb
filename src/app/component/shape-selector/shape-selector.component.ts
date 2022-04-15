import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';

@Component({
  selector: 'app-shape-selector',
  templateUrl: './shape-selector.component.html',
  styleUrls: ['./shape-selector.component.css']
})
export class ShapeSelectorComponent implements OnInit {

  @Input() showcaseShapeSelector: boolean = false;
  @Output() saveEdit = new EventEmitter();
  @Output() cancelEdit = new EventEmitter();
  @Output() revertEdit = new EventEmitter();
  shapes:string[] = ['../../assets/shapes/line.svg',
    '../../assets/shapes/bar.svg',
    '../../assets/shapes/eTriangle.svg',
    '../../assets/shapes/rTriangle.svg',
    '../../assets/shapes/rectangle.svg',
    '../../assets/shapes/square.svg',
    '../../assets/shapes/circle.svg',
    '../../assets/shapes/cShape.svg',
    '../../assets/shapes/tShape.svg',
    '../../assets/shapes/lShape.svg'];

  constructor() { }

  ngOnInit(): void {
  }

  save() {
    this.saveEdit.emit();
  }

  cancel() {
    this.cancelEdit.emit();
  }

  revert() {
    this.revertEdit.emit();
  }

}
