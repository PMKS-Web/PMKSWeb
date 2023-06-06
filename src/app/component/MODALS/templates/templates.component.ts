import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { aliasTransformFactory } from '@angular/compiler-cli/src/ngtsc/transform';

@Component({
  selector: 'app-templates',
  templateUrl: './templates.component.html',
  styleUrls: ['./templates.component.scss'],
})
export class TemplatesComponent {
  openLinkageDialog() {
    alert('Linkage Dialog');
  }
}
