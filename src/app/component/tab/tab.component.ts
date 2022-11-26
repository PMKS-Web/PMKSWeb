import { Component, OnInit, Input, Output, EventEmitter} from '@angular/core';

@Component({
  selector: 'app-tab',
  templateUrl: './tab.component.html',
  styleUrls: ['./tab.component.scss']
})
export class TabComponent implements OnInit {
  @Input() tabLabel:string = 'NoName';
  @Input() activeTab:number = 0;
  @Input() tabID:number = 0;
  @Output() pressedEvent = new EventEmitter<number>();

  constructor() { }
  ngOnInit(): void {
  }

}
