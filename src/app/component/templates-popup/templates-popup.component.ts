import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-templates-popup',
  templateUrl: './templates-popup.component.html',
  styleUrls: ['./templates-popup.component.css']
})
export class TemplatesPopupComponent implements OnInit {


  private static popUpWindow: SVGElement;
  constructor() { }

  ngOnInit(): void {
    TemplatesPopupComponent.popUpWindow = document.getElementById('templatesPopup') as unknown as SVGElement;
  }

  static showTemplates() {
    TemplatesPopupComponent.popUpWindow.style.display = 'block';
  }

  closeTemplates() {
    TemplatesPopupComponent.popUpWindow.style.display = 'none';
  }

  mouseOver(num: number) {}

  mouseOut(num: number) {}

  openLinkage(num: number) {}
}
