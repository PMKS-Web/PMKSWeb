import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
})
export class ColorPickerComponent implements OnInit {
  // An array of six colors to choose from
  colors: string[] = [
    '#0d125a',
    // '#283493',
    '#303e9f',
    // '#3948ab',
    // '#3f50b5',
    // '#5c6ac0',
    // '#7986cb',
    '#9fa8da',
    // '#c5cae9',
    '#B2DFDB',
    '#26A69A',
    '#00695C',
  ];

  // The index of the selected color, or -1 if none is selected
  selectedIndex: number = 0;

  constructor() {}

  ngOnInit(): void {}

  // A method that handles the click event on a color swatch
  selectColor(index: number) {
    // If the clicked color is already selected, deselect it
    if (this.selectedIndex === index) {
      this.selectedIndex = -1;
    } else {
      // Otherwise, select the clicked color and update the selectedIndex
      this.selectedIndex = index;
    }
  }
}
