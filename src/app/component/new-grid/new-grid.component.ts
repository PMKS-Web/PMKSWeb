import { SvgGridService } from '../../services/svg-grid.service';
import { Component, HostListener, OnInit } from '@angular/core';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
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

    fromEvent(window, 'resize')
      .pipe(debounceTime(25))
      .subscribe((event) => {
        console.log('resize');
        this.svgGrid.panZoomObject.resetZoom();
        this.svgGrid.panZoomObject.resize();
        this.svgGrid.panZoomObject.center();
      });
  }
}
