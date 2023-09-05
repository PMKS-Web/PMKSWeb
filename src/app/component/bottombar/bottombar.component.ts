import { Component } from '@angular/core';
import { GlobalUnit } from '../../model/utils';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-bottombar',
  templateUrl: './bottombar.component.html',
  styleUrls: ['./bottombar.component.scss'],
})
export class BottombarComponent {
  constructor(public settings: SettingsService, public mechanismSrv: MechanismService) {}

  humanReadableString(value: GlobalUnit) {
    switch (value) {
      case GlobalUnit.SI:
        return 'm (SI)';
      case GlobalUnit.ENGLISH:
        return 'in (english)';
      case GlobalUnit.METRIC:
        return 'cm (metric)';
      default:
        return 'Error';
    }
  }

  getVersion() {
    return environment.appVersion;
  }
}
