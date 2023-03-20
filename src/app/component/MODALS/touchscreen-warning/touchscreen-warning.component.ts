import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-touchscreen-warning',
  templateUrl: './touchscreen-warning.component.html',
  styleUrls: ['./touchscreen-warning.component.scss'],
})
export class TouchscreenWarningComponent {
  constructor(public dialogRef: MatDialogRef<TouchscreenWarningComponent>) {}

  onNoClick(): void {
    this.dialogRef.close();
  }
}
