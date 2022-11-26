import { Component, TemplateRef, Input, OnInit } from '@angular/core';

@Component({
  selector: 'base-block',
  templateUrl: './base-block.component.html',
  styleUrls: ['./base-block.component.scss']
})
export class BaseBlock{
  @Input() templateRef: TemplateRef<any> | null = null;

  constructor() { }

}
