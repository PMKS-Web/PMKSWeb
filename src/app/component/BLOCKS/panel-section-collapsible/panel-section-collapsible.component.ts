import {
  AfterContentInit,
  Component,
  ContentChildren,
  EventEmitter,
  Input,
  Output,
  QueryList,
} from '@angular/core';
import { TitleBlock } from '../title/title.component';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'panel-section-collapsible',
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
        })
      ),
      transition(':enter', []),
      transition('* => *', [animate('0.2s ease-in-out')]),
    ]),
  ],
  templateUrl: './panel-section-collapsible.component.html',
  styleUrls: ['./panel-section-collapsible.component.scss'],
})
export class PanelSectionCollapsibleComponent implements AfterContentInit {
  @Input() expanded: boolean = true;
  @Input() warning: boolean = false;

  public isLoaded: boolean = false;

  @ContentChildren(TitleBlock) titleBlock?: QueryList<TitleBlock>;

  @Output() closed: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() opened: EventEmitter<boolean> = new EventEmitter<boolean>();

  ngAfterContentInit() {
    this.titleBlock?.first.nestedComponentChange.subscribe(() => this.toggleExpand());
    setTimeout(() => {
      this.isLoaded = true;
    });
  }

  toggleExpand() {
    this.expanded = !this.expanded;
    console.log(this.expanded);
    if (this.expanded) {
      this.opened.emit(true);
    } else {
      this.closed.emit(true);
    }
  }
}
