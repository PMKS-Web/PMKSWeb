import { AfterViewInit, Component, Input } from '@angular/core';
import { animate, AUTO_STYLE, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'collapsible-subseciton',
  animations: [
    trigger('openClose', [
      state(
        'open',
        style({
          visibility: AUTO_STYLE,
          height: AUTO_STYLE,
          opacity: '1',
        })
      ),
      state(
        'closed',
        style({
          visibility: 'hidden',
          opacity: '0',
          height: '0px',
          padding: '0px',
          marginBottom: '-1px',
        })
      ),
      transition(':enter', []),
      transition('* => *', [animate('0.15s ease-in-out')]),
    ]),
  ],
  templateUrl: './collapsible-subseciton.component.html',
  styleUrls: ['./collapsible-subseciton.component.scss'],
})
export class CollapsibleSubsecitonComponent {
  @Input() expanded: boolean = false;
  @Input() title: string = '';

  toggleExpand() {
    this.expanded = !this.expanded;
  }
}
