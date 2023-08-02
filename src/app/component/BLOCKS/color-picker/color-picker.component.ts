import { Component, Input, OnChanges, OnInit } from '@angular/core';
import { ColorService } from '../../../services/color.service';
import { RealLink } from '../../../model/link';
import { link } from 'fs';
import { RealJoint } from '../../../model/joint';
import { Force } from '../../../model/force';

@Component({
  selector: 'color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
})
export class ColorPickerComponent implements OnInit, OnChanges {
  @Input() link: RealLink | undefined;
  @Input() joint: RealJoint | undefined;
  @Input() force: Force | undefined;
  @Input() tooltip: string | undefined;
  @Input() type: string | undefined;

  constructor(public colorService: ColorService) {}

  ngOnChanges(): void {
    if (this.link) {
      this.selectColor(this.colorService.getIndexFromLinkColor(this.link.fill));
    }
  }

  // The index of the selected color, or -1 if none is selected
  selectedIndex: number = 0;

  ngOnInit(): void {}

  // A method that handles the click event on a color swatch
  selectColor(index: number) {
    this.selectedIndex = index;
    switch (this.type) {
      case 'link':
        if (this.link) {
          this.link.fill = this.colorService.getLinkColorFromIndex(index);
        }
        break;
      case 'joint':
        if (this.joint) {
          // this.joint.fill = this.colorService.getJointColorFromIndex(index);
        }
        break;
    }
  }

  getCorrectColors(): string[] {
    switch (this.type) {
      case 'link':
        return this.colorService.getLinkColorOptions();
      case 'joint':
        return this.colorService.getJointColorOptions();
      case 'force':
        return this.colorService.getForceColorOptions();
      default:
        return [];
    }
  }
}
