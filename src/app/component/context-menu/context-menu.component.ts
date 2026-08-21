import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import {
  ContextMenuModel,
  MenuCrossing,
  MenuRow,
  lastContextMenuPointer,
  menuIsEmpty,
} from './menu-model';

/**
 * The right-click menu.
 *
 * A dumb renderer: every decision about what a row says, whether it can be
 * used and why not is made by `ContextMenuBuilderService`, which reads those
 * answers out of the model that enforces them. This lays them out.
 */
@Component({
  selector: 'app-context-menu',
  templateUrl: './context-menu.component.html',
  styleUrls: ['./context-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [CdkMenu, CdkMenuItem, MatIcon, MatTooltip],
})
export class ContextMenuComponent {
  readonly model = input<ContextMenuModel>({ groups: [] });
  private contextMenu!: HTMLElement;

  ngAfterViewInit() {
    this.contextMenu = document.querySelector('#contextMenu') as HTMLElement;
    // Measured in the same tick the card is revealed, not in ngAfterViewInit:
    // the overlay has not been moved to the pointer yet at that point, so the
    // rect read there is the card sitting at the origin.
    setTimeout(() => {
      this.growFromThePointer();
      this.contextMenu.classList.add('show');
    }, 1);
  }

  /**
   * Start the scale-and-fade at the corner the pointer is in.
   *
   * The CDK flips the card at an edge, and a card that flips up and left while
   * growing down and right from its top-left reads as sliding into place from
   * somewhere else. Measured rather than predicted: whichever side of the
   * pointer the card actually landed on is the side it grows from.
   */
  private growFromThePointer(): void {
    const at = lastContextMenuPointer();
    const box = this.contextMenu.getBoundingClientRect();
    const across = box.left + box.width / 2 > at.x ? 'left' : 'right';
    const down = box.top + box.height / 2 > at.y ? 'top' : 'bottom';
    this.contextMenu.style.transformOrigin = `${down} ${across}`;
  }

  /**
   * Nothing to say, so nothing to show.
   *
   * The CDK opens the card on every right-click; a target with no rows and no
   * name would otherwise leave a blank white sliver on the canvas.
   */
  empty(): boolean {
    const model = this.model();
    return !model.header && menuIsEmpty(model);
  }

  /** Greyed is greyed: a row that says why it cannot be used does not act. */
  run(row: MenuRow): void {
    if (row.disabled) return;
    row.action();
  }

  cross(crossing: MenuCrossing): void {
    if (crossing.refusal) return;
    crossing.action();
  }
}
