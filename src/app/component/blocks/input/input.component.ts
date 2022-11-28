import { Component, Input } from '@angular/core';

@Component({
  selector: 'input-block',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss']
})
export class InputComponent {
  @Input() units : string | undefined;  
  @Input() tooltip : string | undefined;  
  @Input() value : number | undefined;  
}
