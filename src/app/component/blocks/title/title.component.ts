import { Component, OnInit, Input } from '@angular/core';
import { BaseBlock } from '../base-block/base-block.component';

@Component({
  selector: 'title-block',
  templateUrl: './title.component.html',
  styleUrls: ['./title.component.scss']
})
export class TitleBlock extends BaseBlock implements OnInit {
  @Input() icon : string | null = null;
  @Input() buttonLabel : string | null = null;
  @Input() description : string | null = null;

  constructor() {
    super();
  }

  ngOnInit(): void {
  }

}
