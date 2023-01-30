import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';

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
import { TitleBlock } from './component/blocks/title/title.component';
import { EditPanelComponent } from './component/edit-panel/edit-panel.component';
import { InputComponent } from './component/blocks/input/input.component';
import { ButtonComponent } from './component/blocks/button/button.component';
import { PanelSectionComponent } from './component/blocks/panel-section/panel-section.component';
import { PanelSectionCollapsibleComponent } from './component/blocks/panel-section-collapsible/panel-section-collapsible.component';
import { ToggleComponent } from './component/blocks/toggle/toggle.component';
import { SubtitleComponent } from './component/blocks/subtitle/subtitle.component';
import { RadioComponent } from './component/blocks/radio/radio.component';
import { DualInputComponent } from './component/blocks/dual-input/dual-input.component';

import { ReactiveFormsModule } from '@angular/forms';
import { AnalysisPanelComponent } from './component/analysis-panel/analysis-panel.component';
import { AnalysisGraphComponent } from './component/analysis-graph/analysis-graph.component';
import { RightPanelComponent } from './component/right-panel/right-panel.component';

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
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    NgApexchartsModule,
    BrowserAnimationsModule,
    MaterialModule,
    ReactiveFormsModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
