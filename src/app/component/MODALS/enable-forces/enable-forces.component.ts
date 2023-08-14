import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { SettingsService } from '../../../services/settings.service';
import { NewGridComponent } from '../../new-grid/new-grid.component';

@Component({
  selector: 'app-enable-forces',
  templateUrl: './enable-forces.component.html',
  styleUrls: ['./enable-forces.component.scss'],
})
export class EnableForcesComponent {
  constructor(
    public dialogRef: MatDialogRef<EnableForcesComponent>,
    public settings: SettingsService
  ) {}

  onNoClick(): void {
    this.dialogRef.close();
  }

  onYesClick(): void {
    this.settings.isForces.next(true);
    this.dialogRef.close();
    NewGridComponent.sendNotification(
      'Forces Enabled! Select a link to add forces and define mass properties.'
    );
  }
}
