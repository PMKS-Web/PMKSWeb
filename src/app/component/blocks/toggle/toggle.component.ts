import { Component, Input } from '@angular/core';

@Component({
  selector: 'toggle-block',
  templateUrl: './toggle.component.html',
  styleUrls: ['./toggle.component.scss']
})
export class ToggleComponent {
  @Input() tooltip : string | undefined;  
}
