import { Component, ChangeDetectionStrategy, DestroyRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { KeyboardShortcutsService } from '../../services/keyboard-shortcuts.service';
import { CdkMenu, CdkMenuItem, MENU_STACK } from '@angular/cdk/menu';
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
  /**
   * The stack the CDK opened this card on.
   *
   * A row is a `cdkMenuItem` and closes the card by itself; the crossing icon
   * is a plain button in the header, so it has to say so. A menu left standing
   * over a mode it no longer belongs to is the mode change half-done.
   */
  private readonly stack = inject(MENU_STACK, { optional: true });

  constructor() {
    // A shortcut acts on the selection, not on the card, and the card is a
    // snapshot: pressing K with a joint's menu open locked the joint and left
    // the menu showing the unlocked state, with a Delete row that was greyed
    // for a lock that had just been set, or live for one that had. Delete did
    // it behind the card. So any shortcut closes the card, and the next
    // right-click builds it again from what is now true.
    inject(KeyboardShortcutsService)
      .pressed.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.stack?.closeAll());
  }
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
    this.stack?.closeAll();
  }
}
