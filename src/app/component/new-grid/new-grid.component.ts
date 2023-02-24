import { Component } from '@angular/core';
import * as svgPanZoom from 'svg-pan-zoom';
import { SvgGridService } from '../../services/svg-grid.service';

@Component({
  selector: 'app-new-grid',
  templateUrl: './new-grid.component.html',
  styleUrls: ['./new-grid.component.scss'],
})
export class NewGridComponent {
  constructor(public svgGrid: SvgGridService) {}
  ngOnInit() {
    const svgElement = document.getElementById('canvas') as HTMLElement;
    this.svgGrid.setNewElement(svgElement);
  }
}
