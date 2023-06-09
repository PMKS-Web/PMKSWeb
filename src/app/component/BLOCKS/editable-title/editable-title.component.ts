import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { NewGridComponent } from '../../new-grid/new-grid.component';
import { ActiveObjService } from 'src/app/services/active-obj.service';

@Component({
  selector: 'editable-title-block',
  templateUrl: './editable-title.component.html',
  styleUrls: ['./editable-title.component.scss'],
})
export class EditableTitleComponent {
  @Input() description: string = '';

  editMode = false;

  constructor(
    private fb: FormBuilder,
    public activeObjService: ActiveObjService,
    ) {}

  newIDForm = this.fb.group({ newID: [''] });

  gotoEditMode() {
    this.newIDForm.controls['newID'].setValue(this.activeObjService.getSelectedObj().name);
    this.editMode = true;
  }

  isAlphanumeric(str: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(str);
  }

  // Check whether new id name is valid
  // Return empty string if valid, or error message if not
  validateNewID(newID: string): string {

    // If the new ID only contains spaces, don't save it
    if (newID === '') {
      return 'The new ID cannot be empty.';
    }

    // If new ID is not purely alphanumeric, don't save it
    if (!this.isAlphanumeric(newID)) {
      return "The new ID must only contain letters and numbers."
    }

    return "";
  }

  saveNewID() {

    let newID = this.newIDForm.value.newID!.trim();

    // If the new ID is not valid, send error notif and do not update to new id
    let error = this.validateNewID(newID);
    if (error !== '') {
      NewGridComponent.sendNotification(error);
      this.editMode = false;
      return;
    }

    let activeObj = this.activeObjService.getSelectedObj();
    activeObj.name = newID;
    console.log("Set new name to " + newID + " for " + this.activeObjService.objType);
    this.editMode = false;
  }

  exitEditModeWithoutSaving() {
    this.editMode = false;
  }
}
