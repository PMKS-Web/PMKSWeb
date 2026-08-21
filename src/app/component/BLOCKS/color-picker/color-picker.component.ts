import { Component, OnChanges, ChangeDetectionStrategy, inject, input } from '@angular/core';
import { ColorService } from '../../../services/color.service';
import { RealLink } from '../../../model/link';
import { Joint } from '../../../model/joint';
import { Force } from '../../../model/force';
import { MechanismService } from '../../../services/mechanism.service';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { INK_FLIPS_AT, luminanceOf } from '../../../model/contrast';

@Component({
  selector: 'color-picker',
  templateUrl: './color-picker.component.html',
  styleUrls: ['./color-picker.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [MatIcon, MatTooltip],
})
export class ColorPickerComponent implements OnChanges {
  colorService = inject(ColorService);
  private mechanism = inject(MechanismService);

  readonly link = input<RealLink>();
  readonly joint = input<Joint>();
  readonly force = input<Force>();
  readonly tooltip = input<string>();
  readonly type = input<string>();

  ngOnChanges(): void {
    const link = this.link();
    if (link) this.selectedIndex = this.colorService.getIndexFromLinkColor(link.fill);
  }

  // The index of the selected color, or -1 if none is selected
  selectedIndex: number = 0;

  /**
   * Which swatch is showing as chosen.
   *
   * A joint's colour is read from the joint every time rather than remembered
   * here: one picker serves whichever joint is selected, and clicking from one
   * joint to the next has to move the tick with them.
   */
  chosenIndex(): number {
    const joint = this.joint();
    if (this.type() === 'joint' && joint) {
      return this.colorService.isDefaultJointColor(joint.color)
        ? 0
        : this.colorService.getIndexFromJointColor(joint.color);
    }
    return this.selectedIndex;
  }

  // A method that handles the click event on a color swatch
  selectColor(index: number) {
    this.selectedIndex = index;
    const link = this.link();
    const joint = this.joint();
    switch (this.type()) {
      case 'link':
        if (link) {
          link.fill = this.colorService.getLinkColorFromIndex(index);
        }
        break;
      case 'joint':
        if (!joint) break;
        // The first swatch is the colour every joint already has, so choosing
        // it means "stop being different" rather than "be this colour" -- and
        // an empty colour is what the URL leaves out.
        joint.color = index === 0 ? '' : this.colorService.getJointColorFromIndex(index);
        // Undoable, and carried in the URL: a highlight that a shared link
        // dropped, or that one undo wiped, would not be worth putting on.
        this.mechanism.updateMechanism(true);
        break;
    }
  }

  getCorrectColors(): string[] {
    switch (this.type()) {
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

  /** What each swatch is called, for the reader who is hovering one. */
  nameOf(index: number): string {
    return this.type() === 'joint' && index === 0 ? 'Default' : '';
  }

  /**
   * A tick the reader can see on the swatch it is standing on.
   *
   * It used to be white on every swatch, which was invisible on the pale end of
   * the link palette and on the first of the joint ones.
   */
  tickInk(color: string): string {
    return luminanceOf(color) > INK_FLIPS_AT ? '#263238' : '#ffffff';
  }
}
