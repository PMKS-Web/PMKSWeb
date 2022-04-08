import {AfterViewInit, Component, OnInit} from '@angular/core';

@Component({
  selector: 'app-analysis-popup',
  templateUrl: './analysis-popup.component.html',
  styleUrls: ['./analysis-popup.component.css']
})
export class AnalysisPopupComponent implements OnInit, AfterViewInit {
  private static popUpWindow: SVGElement;
  private static exportButton: SVGElement;
  private static showPlotsButton: SVGElement;
  private static showEqsButton: SVGElement;
  selectedTab: number = 0;
  selectedAnalysis: string = '';

  constructor() { }

  ngOnInit(): void {
  }

  ngAfterViewInit(): void {
    AnalysisPopupComponent.popUpWindow = document.getElementById('analysisPopup') as unknown as SVGElement;
    AnalysisPopupComponent.exportButton = document.getElementById('exportButton') as unknown as SVGElement;
    AnalysisPopupComponent.showPlotsButton = document.getElementById('showPlotsButton') as unknown as SVGElement;
    AnalysisPopupComponent.showEqsButton = document.getElementById('showEqsButton') as unknown as SVGElement;
  }

  showAnalysis($event: string) {
    AnalysisPopupComponent.popUpWindow.style.display='block';
    this.selectedAnalysis = $event;
  }

  closeAnalysis() {
    AnalysisPopupComponent.popUpWindow.style.display='none';
  }


  setTab(tabNum: number) {
    this.selectedTab = tabNum;
    // TODO: If possible, put this as hover within css
    switch (tabNum) {
      case 0:
        AnalysisPopupComponent.exportButton.setAttribute('style',
          'color: black; background-color: gray');
        AnalysisPopupComponent.showPlotsButton.setAttribute('style',
          'color: gray; background-color: white');
        AnalysisPopupComponent.showEqsButton.setAttribute('style',
          'color: gray; background-color: white');
        break;
      case 1:
        AnalysisPopupComponent.exportButton.setAttribute('style',
          'color: gray; background-color: white');
        AnalysisPopupComponent.showPlotsButton.setAttribute('style',
          'color: black; background-color: gray');
        AnalysisPopupComponent.showEqsButton.setAttribute('style',
          'color: gray; background-color: white');
        break;
      case 2:
        AnalysisPopupComponent.exportButton.setAttribute('style',
          'color: gray; background-color: white');
        AnalysisPopupComponent.showPlotsButton.setAttribute('style',
          'color: gray; background-color: white');
        AnalysisPopupComponent.showEqsButton.setAttribute('style',
          'color: black; background-color: gray');
        break;
    }
  }

  mouseOver(number: number) {

  }

  mouseOut(number: number) {

  }
}
