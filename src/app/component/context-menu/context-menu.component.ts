import { Component, Input } from '@angular/core';

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
  templateUrl: './context-menu.component.html',
  styleUrls: ['./context-menu.component.scss'],
})
export class ContextMenuComponent {
  @Input() menuItems: cMenuItem[] = [];
}
