import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { HammerModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { GridComponent } from './component/grid/grid.component';
import { LinkageTableComponent } from './component/linkage-table/linkage-table.component';
import { ToolbarComponent } from './component/toolbar/toolbar.component';
import { AnalysisPopupComponent } from './component/analysis-popup/analysis-popup.component';
import { AnimationBarComponent } from './component/animation-bar/animation-bar.component';
import { ShapeSelectorComponent } from './component/shape-selector/shape-selector.component';
import { FormsModule } from '@angular/forms';
import { NgApexchartsModule } from 'ng-apexcharts';
import { TemplatesPopupComponent } from './component/templates-popup/templates-popup.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { MaterialModule } from './material/material.module';
import { LeftTabsComponent } from './component/left-tabs/left-tabs.component';
import { TabComponent } from './component/tab/tab.component';
import { TitleBlock } from './component/BLOCKS/title/title.component';
import { EditPanelComponent } from './component/edit-panel/edit-panel.component';
import { InputComponent } from './component/BLOCKS/input/input.component';
import { ButtonComponent } from './component/BLOCKS/button/button.component';
import { PanelSectionComponent } from './component/BLOCKS/panel-section/panel-section.component';
import { PanelSectionCollapsibleComponent } from './component/BLOCKS/panel-section-collapsible/panel-section-collapsible.component';
import { ToggleComponent } from './component/BLOCKS/toggle/toggle.component';
import { SubtitleComponent } from './component/BLOCKS/subtitle/subtitle.component';
import { RadioComponent } from './component/BLOCKS/radio/radio.component';
import { DualInputComponent } from './component/BLOCKS/dual-input/dual-input.component';

import { ReactiveFormsModule } from '@angular/forms';
import { AnalysisPanelComponent } from './component/analysis-panel/analysis-panel.component';
import { AnalysisGraphComponent } from './component/analysis-graph/analysis-graph.component';
import { RightPanelComponent } from './component/right-panel/right-panel.component';
import { SettingsPanelComponent } from './component/settings-panel/settings-panel.component';
import { SynthesisPanelComponent } from './component/synthesis-panel/synthesis-panel.component';
import { NewGridComponent } from './component/new-grid/new-grid.component';
import { CdkMenuModule } from '@angular/cdk/menu';
import { ContextMenuComponent } from './component/context-menu/context-menu.component';
import { TouchscreenWarningComponent } from './component/MODALS/touchscreen-warning/touchscreen-warning.component';

@NgModule({
  declarations: [
    AppComponent,
    GridComponent,
    LinkageTableComponent,
    ToolbarComponent,
    AnalysisPopupComponent,
    AnimationBarComponent,
    ShapeSelectorComponent,
    TemplatesPopupComponent,
    LeftTabsComponent,
    TabComponent,
    TitleBlock,
    EditPanelComponent,
    InputComponent,
    ButtonComponent,
    PanelSectionComponent,
    PanelSectionCollapsibleComponent,
    ToggleComponent,
    SubtitleComponent,
    RadioComponent,
    DualInputComponent,
    AnalysisPanelComponent,
    AnalysisGraphComponent,
    RightPanelComponent,
    SettingsPanelComponent,
    SynthesisPanelComponent,
    NewGridComponent,
    ContextMenuComponent,
    TouchscreenWarningComponent,
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    NgApexchartsModule,
    BrowserAnimationsModule,
    MaterialModule,
    ReactiveFormsModule,
    CdkMenuModule,
    HammerModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
