import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { NewGridComponent } from './component/new-grid/new-grid.component';
import { TopBarComponent } from './component/top-bar/top-bar.component';
import { BottombarComponent } from './component/bottombar/bottombar.component';
import { LeftTabsComponent } from './component/left-tabs/left-tabs.component';
import { PlaybackBarComponent } from './component/playback-bar/playback-bar.component';
import { RightPanelComponent } from './component/right-panel/right-panel.component';
import { NotificationComponent } from './component/notification/notification.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  animations: [
    // animation triggers go here
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    NewGridComponent,
    TopBarComponent,
    BottombarComponent,
    LeftTabsComponent,
    PlaybackBarComponent,
    RightPanelComponent,
    NotificationComponent,
  ],
})
export class AppComponent {
  private matIconRegistry = inject(MatIconRegistry);
  private domSanitizer = inject(DomSanitizer);

  constructor() {
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
      'add_cylinder',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/add_cylinder.svg')
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
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/trash.svg')
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
      'make_circular',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/make_circular.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'make_bar',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/make_bar.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'github',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/github.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'edit_outline',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/edit.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'background_image',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/background_image.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'synthesis',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/synthesis.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'lock',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/lock.svg')
    );
    this.matIconRegistry.addSvgIcon(
      'unlock',
      this.domSanitizer.bypassSecurityTrustResourceUrl('assets/icons/unlock.svg')
    );
  }
}
