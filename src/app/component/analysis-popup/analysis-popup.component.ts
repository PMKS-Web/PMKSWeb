import {AfterViewInit, Component, OnInit} from '@angular/core';

@Component({
  selector: 'app-analysis-popup',
  templateUrl: './analysis-popup.component.html',
  styleUrls: ['./analysis-popup.component.css']
})
export class AnalysisPopupComponent implements OnInit, AfterViewInit {
  private static popUpWindow: SVGElement;

  constructor() { }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    AnalysisPopupComponent.popUpWindow = document.getElementById('analysisPopup') as unknown as SVGElement;
  }

  showAnalysis() {
    AnalysisPopupComponent.popUpWindow.style.display='block';
  }

  closeAnalysis() {
    AnalysisPopupComponent.popUpWindow.style.display='none';
  }
}
