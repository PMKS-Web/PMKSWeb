import { Component, Input } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'collapsible-subseciton',
  animations: [
    trigger('openClose', [
      state(
        'open',
        style({
          height: '*',
          opacity: 1,
        })
      ),
      state(
        'closed',
        style({
          height: '0px',
          opacity: 0,
          padding: '0px',
        })
      ),
      transition('* => *', [animate('0.15s ease-in-out')]),
    ]),
  ],
  templateUrl: './collapsible-subseciton.component.html',
  styleUrls: ['./collapsible-subseciton.component.scss'],
})
export class CollapsibleSubsecitonComponent {
  @Input() expanded: boolean = false;

  toggleExpand() {
    this.expanded = !this.expanded;
  }
}
