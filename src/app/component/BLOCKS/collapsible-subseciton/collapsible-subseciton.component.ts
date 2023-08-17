import { AfterViewInit, Component, EventEmitter, Input, Output } from '@angular/core';
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
  @Input() hideHeader: boolean = false; //If this is true the content cannot be expanded

  @Input() expanded: boolean = false;
  @Input() titleLabel: string = '';

  @Output() closed: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() opened: EventEmitter<boolean> = new EventEmitter<boolean>();

  toggleExpand() {
    this.expanded = !this.expanded;

    if (this.expanded) {
      this.opened.emit(true);
    } else {
      this.closed.emit(true);
    }
  }
}
