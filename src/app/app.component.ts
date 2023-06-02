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
    this.matIconRegistry.addSvgIcon(
      'new_link',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/new_link.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_ground',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_ground.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'remove_ground',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_ground.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_slider',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_slider.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'remove_slider',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_slider.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_input',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_input.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'remove_input',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_input.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'remove',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/remove_joint.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_force',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_force.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'add_tracer',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_tracer.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'show_path',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/show_path.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'hide_path',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/hide_path.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'switch_force_dir',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/switch_force_dir.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'force_global',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/force_global.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'force_local',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/force_local.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'weld_joint',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/weld_joint.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'unweld_joint',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/unweld_joint.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'github',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/github.svg')
    );
  }
}
