import { Component, Input } from '@angular/core';

@Component({
  selector: 'dual-input-block',
  templateUrl: './dual-input.component.html',
  styleUrls: ['./dual-input.component.scss']
})
export class DualInputComponent {
  @Input() tooltip : string | undefined;  
  @Input() value1 : number | undefined;  
  @Input() value2 : number | undefined;  
  @Input() unit : string | undefined;  
}
