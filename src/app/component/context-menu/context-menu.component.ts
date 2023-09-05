import { Component, Inject, Input } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { MechanismService } from '../../services/mechanism.service';
import { NewGridComponent } from '../new-grid/new-grid.component';

export class cMenuItem {
  public label: string = 'none';
  public action: Function = () => {
    console.error('Not implemented');
  };
  public icon: string = 'none';
  public disabled: boolean = false;

  constructor(_label: string, _action: Function, _icon: string, _disabled: boolean = false) {
    this.label = _label;
    this.action = _action;
    this.icon = _icon;
    this.disabled = _disabled;
  }

  actionWrapper() {
    if (NewGridComponent.instance.mechanismSrv.mechanismTimeStep !== 0) {
      NewGridComponent.sendNotification('Context menu cannot be used while simulation is running');
      return;
    }
    this.action();
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

  constructor(private mechanismSrv: MechanismService) {}

  ngAfterViewInit() {
    this.contextMenu = document.querySelector('#contextMenu') as HTMLElement;
    console.log(this.contextMenu);
    setTimeout(() => {
      this.contextMenu.classList.add('show');
    }, 1);
  }
}
