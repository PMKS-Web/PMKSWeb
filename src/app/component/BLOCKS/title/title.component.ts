import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'title-block',
  templateUrl: './title.component.html',
  styleUrls: ['./title.component.scss'],
})
export class TitleBlock implements OnInit {
  @Input() description: string | undefined;
  @Output() nestedComponentChange: EventEmitter<number> = new EventEmitter<number>();

  constructor() {}

  ngOnInit(): void {}
}
