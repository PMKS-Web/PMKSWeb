import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-synthesis-warning',
  templateUrl: './synthesis-warning.component.html',
  styleUrls: ['./synthesis-warning.component.scss']
})
export class SynthesisWarningComponent {
  constructor(public dialogRef: MatDialogRef<SynthesisWarningComponent>) {}

  onNoClick(): void {
    this.dialogRef.close();
  }
}
