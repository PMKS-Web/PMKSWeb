import { SvgGridService } from '../../services/svg-grid.service';
import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { fromEvent } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { MatMenuTrigger } from '@angular/material/menu';
import { MechanismService } from '../../services/mechanism.service';
import { UrlProcessorService } from '../../services/url-processor.service';
import { GridUtilsService } from '../../services/grid-utils.service';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';

@Component({
  selector: 'app-new-grid',
  templateUrl: './new-grid.component.html',
  styleUrls: ['./new-grid.component.scss'],
})
export class NewGridComponent {
  constructor(
    public svgGrid: SvgGridService,
    public mechanismSrv: MechanismService,
    private urlParser: UrlProcessorService,
    public gridUtils: GridUtilsService,
    public settings: SettingsService,
    public activeObjService: ActiveObjService
  ) {}

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
