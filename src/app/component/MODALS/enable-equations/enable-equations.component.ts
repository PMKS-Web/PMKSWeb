import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { SettingsService } from '../../../services/settings.service';
import { NewGridComponent } from '../../new-grid/new-grid.component';
import { EnableForcesComponent } from '../enable-forces/enable-forces.component';

@Component({
  selector: 'app-enable-equations',
  templateUrl: './enable-equations.component.html',
  styleUrls: ['./enable-equations.component.scss'],
})
export class EnableEquationsComponent {
  constructor(
    public dialogRef: MatDialogRef<EnableForcesComponent>,
    public settings: SettingsService
  ) {}

  onNoClick(): void {
    this.dialogRef.close();
  }

  onYesClick(): void {
    this.settings.isEquationsEnabled.next(true);
    this.dialogRef.close();
    NewGridComponent.sendNotification('Equations Enabled!');
  }
}
