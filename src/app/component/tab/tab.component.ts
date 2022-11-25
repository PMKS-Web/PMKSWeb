import { Component, OnInit, Input, Output, EventEmitter} from '@angular/core';

@Component({
  selector: 'app-tab',
  templateUrl: './tab.component.html',
  styleUrls: ['./tab.component.scss']
})
export class TabComponent implements OnInit {
  @Input() tabLabel = 'NoName';
  @Input() activeTab = 0;
  @Input() tabID = 0;
  @Output() pressedEvent = new EventEmitter<number>();

  constructor() { }
  ngOnInit(): void {
  }

}
