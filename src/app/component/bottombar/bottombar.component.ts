import { Component, ChangeDetectionStrategy } from '@angular/core';
import { GlobalUnit } from '../../model/utils';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-bottombar',
  templateUrl: './bottombar.component.html',
  styleUrls: ['./bottombar.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class BottombarComponent {
  constructor(
    public settings: SettingsService,
    public mechanismSrv: MechanismService
  ) {}

  /**
   * The mobility, or a dash where there is no such number.
   *
   * `determineDegreesOfFreedom` answers NaN for a linkage with nothing pinned
   * down, which is right — mobility is counted against the world, and there is
   * no world yet — but it was going to the screen verbatim. That made "Degrees
   * of Freedom: NaN" the first thing anyone saw, because the first bar anybody
   * draws is not grounded yet. A dash says the same thing without asking the
   * reader to know what a floating-point value is; the Analyze panel is where
   * the reason belongs.
   */
  get degreesOfFreedom(): string {
    const dof = this.mechanismSrv.mechanisms[0]?.dof;
    return typeof dof === 'number' && Number.isFinite(dof) ? String(dof) : '—';
  }

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
