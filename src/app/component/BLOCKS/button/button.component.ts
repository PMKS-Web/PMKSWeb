import { Component, Input } from '@angular/core';
import { ActiveObjService } from 'src/app/services/active-obj.service';

@Component({
  selector: 'button-block',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent {
  constructor(public activeSrv: ActiveObjService) {}

  @Input() icon: string | undefined;
  @Input() click!: () => void;
}
