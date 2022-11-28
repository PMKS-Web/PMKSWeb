import { Component, Input } from '@angular/core';

@Component({
  selector: 'button-block',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss']
})
export class ButtonComponent {
  @Input() icon : string | undefined;

}
