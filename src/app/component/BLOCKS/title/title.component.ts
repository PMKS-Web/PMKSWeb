import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { GridComponent } from '../../grid/grid.component';

@Component({
  selector: 'title-block',
  templateUrl: './title.component.html',
  styleUrls: ['./title.component.scss'],
})
export class TitleBlock implements OnInit {
  @Input() icon: string | undefined;
  @Input() buttonLabel: string | undefined;
  @Input() description: string | undefined;

  @Output() nestedComponentChange: EventEmitter<number> = new EventEmitter<number>();

  defaultIcon: string | undefined;
  altIcon: string | undefined;
  shownIcon: string | undefined;

  constructor() {}

  toggleExpand() {
    this.nestedComponentChange.emit(1);
    if (this.shownIcon == this.defaultIcon) {
      this.shownIcon = this.altIcon;
    } else {
      this.shownIcon = this.defaultIcon;
    }
  }

  ngOnInit(): void {
    this.defaultIcon = this.icon;
    this.shownIcon = this.defaultIcon;
    if (this.defaultIcon == 'expand_less') {
      this.altIcon = 'expand_more';
    } else if (this.defaultIcon == 'expand_more') {
      this.altIcon = 'expand_less';
    } else {
      this.altIcon = this.defaultIcon;
    }
  }
}
