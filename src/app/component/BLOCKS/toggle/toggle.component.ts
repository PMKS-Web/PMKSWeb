import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'toggle-block',
  templateUrl: './toggle.component.html',
  styleUrls: ['./toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ToggleComponent {
  @Input() tooltip: string | undefined;
  @Input() formGroup!: FormGroup;
  @Input() _formControl!: string;

  @Input() addInput: boolean = false;
  @Input() _formControlForInput!: string;
  @Input() disableInput: boolean = false;

  /**
   * Pointed at or typed in, for a caller that draws the field's meaning on the
   * canvas. The Slider toggle carries the slot's angle, and an angle is the
   * kind of number far easier to show than to describe; this is what replaced
   * the sentence that used to sit under it.
   *
   * A boolean, unlike `input-block`'s numeric version. That one identifies
   * *which* of several fields is being pointed at and reports `-2` for none —
   * which means its default id is also `-2`, so a caller who forgets to set one
   * gets "nothing" on the way in and "nothing" on the way out, and no overlay
   * ever appears. This control has one field. It can just say so.
   */
  @Output() fieldEntry: EventEmitter<boolean> = new EventEmitter();

  private mouseOver = false;
  private focused = false;
  private showing = false;

  setMouseOver(over: boolean): void {
    this.mouseOver = over;
    this.updateOverlay();
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
    this.updateOverlay();
  }

  private updateOverlay(): void {
    const wants = this.mouseOver || this.focused;
    if (wants === this.showing) return;
    this.showing = wants;
    this.fieldEntry.emit(wants);
  }

  @ViewChild('field', { static: false }) field!: ElementRef;

  // ngOnChanges() {
  //   //Get the #field input element
  //   // const field = document.getElementById('field');
  //   console.log(this.field.nativeElement);
  //   (this.field.nativeElement as HTMLInputElement).select();
  //   (this.field.nativeElement as HTMLInputElement).blur();
  // }
}
