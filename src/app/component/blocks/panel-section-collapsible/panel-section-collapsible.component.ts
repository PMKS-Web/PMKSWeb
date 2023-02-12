import { Component, ContentChildren, EventEmitter, Input, Output, QueryList } from '@angular/core';
import { TitleBlock } from '../title/title.component';

@Component({
  selector: 'panel-section-collapsible',
  templateUrl: './panel-section-collapsible.component.html',
  styleUrls: ['./panel-section-collapsible.component.scss'],
})
export class PanelSectionCollapsibleComponent {
  @Input() expanded: boolean = true;

  @ContentChildren(TitleBlock) titleBlock?: QueryList<TitleBlock>;

  @Output() closed: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() opened: EventEmitter<boolean> = new EventEmitter<boolean>();

  ngAfterContentInit() {
    this.titleBlock?.first.nestedComponentChange.subscribe(() => this.toggleExpand());
  }

  toggleExpand() {
    this.expanded = !this.expanded;
    if (this.expanded) {
      this.opened.emit(true);
    } else {
      this.closed.emit(true);
    }
  }
}
