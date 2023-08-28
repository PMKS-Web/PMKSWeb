import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { SelectedTabService, TabID } from 'src/app/selected-tab.service';
import { MechanismService } from 'src/app/services/mechanism.service';

@Component({
  selector: 'app-synthesis-warning',
  templateUrl: './synthesis-warning.component.html',
  styleUrls: ['./synthesis-warning.component.scss']
})
export class SynthesisWarningComponent {
  constructor(
    public dialogRef: MatDialogRef<SynthesisWarningComponent>,
    private selectedTab: SelectedTabService,
    private mechanism: MechanismService
  ) {}

  onNoClick(): void {
    this.dialogRef.close();
  }

  // delete mechanism and go to synthesis
  goToSynthesisTab(): void {
    this.mechanism.resetMechanism();
    this.selectedTab.setTab(TabID.SYNTHESIZE);
  }

}