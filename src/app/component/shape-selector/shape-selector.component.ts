import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
// import { GridComponent } from '../grid/grid.component';
// import { RealLink, Shape } from '../../model/link';
// import { Coord } from '../../model/coord';
//
@Component({
  selector: 'app-shape-selector',
  templateUrl: './shape-selector.component.html',
  styleUrls: ['./shape-selector.component.scss'],
})
export class ShapeSelectorComponent {}

//   shapes: Shape[] = [
//     Shape.line,
//     Shape.bar,
//     Shape.eTriangle,
//     Shape.rTriangle,
//     Shape.rectangle,
//     Shape.square,
//     Shape.circle,
//     Shape.cShape,
//     Shape.tShape,
//     Shape.lShape,
//   ];
//
//   constructor() {}
//
//   ngOnInit(): void {}
//
//   getURL(shape: Shape) {
//     switch (shape) {
//       case Shape.line:
//         return '../../assets/shapes/line.svg';
//       case Shape.bar:
//         return '../../assets/shapes/bar.svg';
//       case Shape.eTriangle:
//         return '../../assets/shapes/eTriangle.svg';
//       case Shape.rTriangle:
//         return '../../assets/shapes/rTriangle.svg';
//       case Shape.rectangle:
//         return '../../assets/shapes/rectangle.svg';
//       case Shape.square:
//         return '../../assets/shapes/square.svg';
//       case Shape.circle:
//         return '../../assets/shapes/circle.svg';
//       case Shape.cShape:
//         return '../../assets/shapes/cShape.svg';
//       case Shape.tShape:
//         return '../../assets/shapes/tShape.svg';
//       case Shape.lShape:
//         return '../../assets/shapes/lShape.svg';
//       default:
//         return '';
//     }
//   }
//
//   getShowcaseShapeSelector() {
//     return GridComponent.showcaseShapeSelector;
//   }
//
//   save() {
//     GridComponent.showcaseShapeSelector = false;
//     GridComponent.updateMechanism();
//   }
//
//   cancel() {
//     if (GridComponent.initialLink !== undefined) {
//       // GridComponent.selectedLink.bound = GridComponent.initialLink.bound;
//       GridComponent.selectedLink.d = GridComponent.initialLink.d;
//       GridComponent.selectedLink.CoM = GridComponent.initialLink.CoM;
//     }
//     GridComponent.showcaseShapeSelector = false;
//     GridComponent.updateMechanism();
//   }
//
//   revert() {
//     // TODO: Fix a bug where a binary link returns bound when it shouldn't
//     // GridComponent.selectedLink.bound = GridComponent.initialLink.bound;
//     GridComponent.selectedLink.d = GridComponent.initialLink.d;
//     GridComponent.selectedLink.CoM = GridComponent.initialLink.CoM;
//     GridComponent.updateMechanism();
//   }
// }
