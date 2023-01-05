import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

@Component({
  selector: 'app-tab',
  templateUrl: './tab.component.html',
  styleUrls: ['./tab.component.scss'],
  animations: [
    trigger('hover', [
      // ...
      state(
        'default',
        style({
          opacity: 0.5,
        })
      ),
      state(
        'hover',
        style({
          opacity: 1,
        })
      ),

      transition('default => hover', [animate('0.3s ease-in-out')]),
      transition('hover => default', [animate('0.3s ease-in-out')]),
    ]),
  ],
})
export class TabComponent implements OnInit {
  @Input() tabLabel: string = 'NoName';
  @Input() activeTab: number = 0;
  @Input() tabID: number = 0;
  @Output() pressedEvent = new EventEmitter<number>();

  constructor() {}
  ngOnInit(): void {}
}
