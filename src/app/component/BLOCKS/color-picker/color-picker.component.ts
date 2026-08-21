import { Component, OnChanges, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { ColorService, JOINT_SCHEMES } from '../../../services/color.service';
import { RealLink } from '../../../model/link';
import { RealJoint } from '../../../model/joint';
import { Force } from '../../../model/force';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

/** Above this a swatch is light enough that a white tick vanishes on it. */
const LIGHT_SWATCH = 0.55;

@Component({
  selector: 'color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip],
})
export class ColorPickerComponent implements OnChanges {
  colorService = inject(ColorService);

  readonly link = input<RealLink>();
  readonly joint = input<RealJoint>();
  readonly force = input<Force>();
  readonly tooltip = input<string>();
  readonly type = input<string>();

  ngOnChanges(): void {
    const link = this.link();
    if (link) {
      this.selectColor(this.colorService.getIndexFromLinkColor(link.fill));
    }
  }

  // The index of the selected color, or -1 if none is selected
  selectedIndex: number = 0;

  /**
   * Which swatch is showing as chosen.
   *
   * The joint families are a document-wide setting rather than something set on
   * one part, so the picker reads the setting instead of remembering what it
   * was last clicked on -- reopening Settings has to find it where it was left.
   */
  chosenIndex(): number {
    if (this.type() === 'jointScheme') {
      return JOINT_SCHEMES.findIndex((s) => s.id === this.colorService.jointScheme.value.id);
    }
    return this.selectedIndex;
  }

  // A method that handles the click event on a color swatch
  selectColor(index: number) {
    this.selectedIndex = index;
    const link = this.link();
    switch (this.type()) {
      case 'link':
        if (link) {
          link.fill = this.colorService.getLinkColorFromIndex(index);
        }
        break;
      case 'jointScheme':
        this.colorService.useJointScheme(JOINT_SCHEMES[index]?.id ?? JOINT_SCHEMES[0].id);
        break;
    }
  }

  getCorrectColors(): string[] {
    switch (this.type()) {
      case 'link':
        return this.colorService.getLinkColorOptions();
      case 'jointScheme':
        return JOINT_SCHEMES.map((scheme) => scheme.rest);
      case 'force':
        return this.colorService.getForceColorOptions();
      default:
        return [];
    }
  }

  /** What each swatch is called, for the reader who is hovering one. */
  nameOf(index: number): string {
    return this.type() === 'jointScheme' ? JOINT_SCHEMES[index]?.name : '';
  }

  /**
   * A tick the reader can see on the swatch it is standing on.
   *
   * It used to be white on every swatch, which was invisible on the pale end of
   * the link palette and would be invisible on all but one of the joint
   * families.
   */
  tickInk(color: string): string {
    return luminanceOf(color) > LIGHT_SWATCH ? '#263238' : '#ffffff';
  }
}

/** Rough perceived brightness of a `#rrggbb`, enough to choose a tick colour. */
function luminanceOf(color: string): number {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return 1;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
