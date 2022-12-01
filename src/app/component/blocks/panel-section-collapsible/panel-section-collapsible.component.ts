import { Component, ContentChildren, Input, QueryList } from '@angular/core';
import { TitleBlock } from '../title/title.component';

@Component({
  selector: 'panel-section-collapsible',
  templateUrl: './panel-section-collapsible.component.html',
  styleUrls: ['./panel-section-collapsible.component.scss'],
})
export class PanelSectionCollapsibleComponent {
  @Input() expanded: number = 1;

  @ContentChildren(TitleBlock) titleBlock?: QueryList<TitleBlock>;

  ngAfterContentInit() {
    this.titleBlock?.first.nestedComponentChange.subscribe(() => this.toggleExpand());
  }

  toggleExpand() {
    this.expanded = this.expanded == 1 ? 0 : 1;
  }
}
