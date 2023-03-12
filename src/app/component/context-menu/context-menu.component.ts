import { Component, Input } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

export class cMenuItem {
  public label: string = 'none';
  public action: Function = () => {
    console.error('Not implemented');
  };
  public icon: string = 'none';

  constructor(_label: string, _action: Function, _icon: string) {
    this.label = _label;
    this.action = _action;
    this.icon = _icon;
  }
}

@Component({
  selector: 'app-context-menu',
  animations: [
    trigger('openClose', [
      state(
        'open',
        style({
          opacity: 1,
          transform: 'scale(1)',
        })
      ),
      state(
        'closed',
        style({
          opacity: 0,
          transform: 'scale(0.5)',
        })
      ),
      transition('closed => open', [animate('0.2s ease-out')]),
      transition('open => closed', [animate('0.2s ease-in')]),
    ]),
  ],
  templateUrl: './context-menu.component.html',
  styleUrls: ['./context-menu.component.scss'],
})
export class ContextMenuComponent {
  @Input() menuItems: cMenuItem[] = [];
  private contextMenu!: HTMLElement;

  ngAfterViewInit() {
    this.contextMenu = document.querySelector('#contextMenu') as HTMLElement;
    console.log(this.contextMenu);
    setTimeout(() => {
      this.contextMenu.classList.add('show');
    }, 1);
  }
}
