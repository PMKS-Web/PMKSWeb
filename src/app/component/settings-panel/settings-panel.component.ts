import { Component } from '@angular/core';
import { SettingsService } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, TorqueUnit } from 'src/app/model/utils';

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
})
export class SettingsPanelComponent {
  constructor(private settingsService: SettingsService) {}
  currentLengthUnit!: LengthUnit; //This is the current length unit, every time it changes, the value will be updated

  ngOnInit(): void {
    //This is the subscription to the length unit, every time it changes, the value will be updated
    this.settingsService.length.subscribe({
      next: (length) => (this.currentLengthUnit = length),
    });

    //This is how you update the length unit
    this.settingsService.length.next(LengthUnit.METER);
  }
}
