import { Component, OnInit } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { NewGridComponent } from '../new-grid/new-grid.component';

@Component({
  selector: 'app-synthesis-panel',
  templateUrl: './synthesis-panel.component.html',
  styleUrls: ['./synthesis-panel.component.scss'],
})
export class SynthesisPanelComponent implements OnInit {
  constructor(private fb: FormBuilder) {}

  ngOnInit() {
    //Set initial values
    //(The default values are based on the image Pradeep provided but they can be easily changed below)
    this.synthesisForm.setValue({
      a0x: '6',
      a0y: '0',
      b0x: '8.1213',
      b0y: '-2.1213',
      a1x: '8',
      a1y: '-4',
      b1x: '8',
      b1y: '-7',
      a2x: '1',
      a2y: '2',
      b2x: '4',
      b2y: '2',
    });
  }

  //Angular form stuff with 12 numbers, a0x, a0y, b0x, b0y, a1x, a1y, b1x, b1y, a2x, a2y, b2x, b2y
  synthesisForm = this.fb.group({
    a0x: [''],
    a0y: [''],
    b0x: [''],
    b0y: [''],
    a1x: [''],
    a1y: [''],
    b1x: [''],
    b1y: [''],
    a2x: [''],
    a2y: [''],
    b2x: [''],
    b2y: [''],
  });

  handleButton() {
    //Send notification to grid for now
    NewGridComponent.sendNotification(
      'Call your backend function with these values! A0: (' +
        this.synthesisForm.value.a0x! +
        ',' +
        this.synthesisForm.value.a0y! +
        ') B0: (' +
        this.synthesisForm.value.b0x! +
        ',' +
        this.synthesisForm.value.b0y! +
        ') A1: (' +
        this.synthesisForm.value.a1x! +
        ',' +
        this.synthesisForm.value.a1y! +
        ') B1: (' +
        this.synthesisForm.value.b1x! +
        ',' +
        this.synthesisForm.value.b1y! +
        ') A2: (' +
        this.synthesisForm.value.a2x! +
        ',' +
        this.synthesisForm.value.a2y! +
        ') B2: (' +
        this.synthesisForm.value.b2x! +
        ',' +
        this.synthesisForm.value.b2y! +
        ')'
    );
    //If you need the values as a number instead of a string, use this:
    console.log(Number(this.synthesisForm.value.a0x!));
  }
}
