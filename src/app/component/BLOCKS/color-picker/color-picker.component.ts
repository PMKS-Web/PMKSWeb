import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { ColorService } from '../../../services/color.service';
import { RealLink } from '../../../model/link';
import { link } from 'fs';

@Component({
  selector: 'color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
})
export class ColorPickerComponent implements OnInit, OnChanges {
  @Input() link: RealLink | undefined;

  constructor(public colorService: ColorService) {}

  ngOnChanges(): void {
    if (this.link) {
      this.selectColor(this.colorService.getIndexFromColor(this.link.fill));
    }
  }

  // The index of the selected color, or -1 if none is selected
  selectedIndex: number = 0;

  ngOnInit(): void {}

  // A method that handles the click event on a color swatch
  selectColor(index: number) {
    this.selectedIndex = index;
    if (this.link) {
      this.link.fill = this.colorService.getColorFromIndex(index);
    }
  }
}
