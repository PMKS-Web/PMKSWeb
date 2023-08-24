import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { SettingsService } from '../../../services/settings.service';
import { NewGridComponent } from '../../new-grid/new-grid.component';

@Component({
  selector: 'app-enable-welded',
  templateUrl: './enable-welded.component.html',
  styleUrls: ['./enable-welded.component.scss'],
})
export class EnableWeldedComponent {
  constructor(
    public dialogRef: MatDialogRef<EnableWeldedComponent>,
    public settings: SettingsService
  ) {}

  onNoClick(): void {
    this.dialogRef.close();
  }

  onYesClick(): void {
    this.settings.isWeldedJointsEnabled.next(true);
    this.dialogRef.close();
    NewGridComponent.sendNotification('Welded Joints Enabled!');
  }
}
