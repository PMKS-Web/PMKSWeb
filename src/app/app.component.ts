import { Component } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [
    // animation triggers go here
  ],
})
export class AppComponent {
  constructor(private matIconRegistry: MatIconRegistry, private domSanitizer: DomSanitizer) {
    this.matIconRegistry.addSvgIcon(
      'com',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/com.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'com_off',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/com_off.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'abc',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/abc.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'abc_off',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/abc_off.svg')
    );
  }
}
