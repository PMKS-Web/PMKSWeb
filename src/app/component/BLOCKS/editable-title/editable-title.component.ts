import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { CustomIdService } from '../../../services/custom-id.service';
import { GridComponent } from '../../grid/grid.component';
import { NewGridComponent } from '../../new-grid/new-grid.component';

@Component({
  selector: 'editable-title-block',
  templateUrl: './editable-title.component.html',
  styleUrls: ['./editable-title.component.scss'],
})
export class EditableTitleComponent {
  @Input() description: string = '';
  @Input() originalID: string = '';

  editMode = false;

  constructor(private fb: FormBuilder, public customIDService: CustomIdService) {}

  newIDForm = this.fb.group({ newID: [''] });

  gotoEditMode() {
    this.newIDForm.controls['newID'].setValue(this.customIDService.getVisualID(this.originalID));
    this.editMode = true;
  }

  saveNewID() {
    //If the new ID only contains spaces, don't save it
    if (this.newIDForm.value.newID!.trim() === '') {
      NewGridComponent.sendNotification('The new ID cannot be empty.');
      this.editMode = false;
      return;
    }
    this.customIDService.addVisualID(this.originalID, this.newIDForm.value.newID!);
    console.log(this.customIDService.getVisualID(this.originalID));
    this.editMode = false;
  }

  exitEditModeWithoutSaving() {
    this.editMode = false;
  }
}
