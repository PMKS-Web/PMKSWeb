import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {GridComponent} from "../grid/grid.component";
import {RealLink, Shape} from "../../model/link";
import {Coord} from "../../model/coord";

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
  @Output() updateMechanismEmitter = new EventEmitter();
  shapes: Shape[] = [Shape.line,
    Shape.bar,
    Shape.eTriangle,
    Shape.rTriangle,
    Shape.rectangle,
    Shape.square,
    Shape.circle,
    Shape.cShape,
    Shape.tShape,
    Shape.lShape
  ];

  getURL(shape: Shape) {
    switch (shape) {
      case Shape.line:
        return '../../assets/shapes/line.svg';
      case Shape.bar:
        return '../../assets/shapes/bar.svg';
      case Shape.eTriangle:
        return '../../assets/shapes/eTriangle.svg';
      case Shape.rTriangle:
        return '../../assets/shapes/rTriangle.svg';
      case Shape.rectangle:
        return '../../assets/shapes/rectangle.svg';
      case Shape.square:
        return '../../assets/shapes/square.svg';
      case Shape.circle:
        return '../../assets/shapes/circle.svg';
      case Shape.cShape:
        return '../../assets/shapes/cShape.svg';
      case Shape.tShape:
        return '../../assets/shapes/tShape.svg';
      case Shape.lShape:
        return '../../assets/shapes/lShape.svg';
      default:
        return '';
    }
  }

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

  changeShape(shape: Shape) {
    GridComponent.selectedLink.shape = shape;
    GridComponent.selectedLink.bound = RealLink.getBounds(new Coord(GridComponent.selectedLink.joints[0].x,
      GridComponent.selectedLink.joints[0].y), new Coord(GridComponent.selectedLink.joints[1].x,
      GridComponent.selectedLink.joints[1].y), shape);
    GridComponent.selectedLink.d = RealLink.getPointsFromBounds(GridComponent.selectedLink.bound, shape);
    // TODO: When you insert a joint onto a link, be sure to utilize this function call
    GridComponent.selectedLink.CoM = RealLink.determineCenterOfMass(GridComponent.selectedLink.joints);
    this.updateMechanismEmitter.emit();
  }
}
