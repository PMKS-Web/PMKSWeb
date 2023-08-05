import { Component, Input, OnInit, OnChanges, Output, EventEmitter } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'dual-input-block',
  templateUrl: './dual-input.component.html',
  styleUrls: ['./dual-input.component.scss'],
})
export class DualInputComponent {
  @Input() tooltip!: string;
  @Input() unit!: string;
  @Input() formControl1!: string;
  @Input() label1: string = 'X';
  @Input() label2: string = 'Y';
  @Input() formControl2!: string;
  @Input() formGroup!: FormGroup;
  @Input() disabled: boolean = false;
  @Output() field1Entry: EventEmitter<boolean> = new EventEmitter();
  @Output() field2Entry: EventEmitter<boolean> = new EventEmitter();

  isField1MouseOver: boolean = false;
  isField1Focused: boolean = false;
  showField1Overlay: boolean = false;
  lastShowField1Overlay: boolean = false;

  isField2MouseOver: boolean = false;
  isField2Focused: boolean = false;
  showField2Overlay: boolean = false;
  lastShowField2Overlay: boolean = false;

  updateOverlay() {
    this.showField1Overlay = this.isField1MouseOver || this.isField1Focused;
    if (this.lastShowField1Overlay != this.showField1Overlay) {
      this.field1Entry.emit(this.showField1Overlay);
    }
    this.lastShowField1Overlay = this.showField1Overlay;

    this.showField2Overlay = this.isField2MouseOver || this.isField2Focused;
    if (this.lastShowField2Overlay != this.showField2Overlay) {
      this.field2Entry.emit(this.showField2Overlay);
    }
    this.lastShowField2Overlay = this.showField2Overlay;
  }

  constructor() {}
}
