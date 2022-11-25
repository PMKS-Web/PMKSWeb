import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { GridComponent } from './component/grid/grid.component';
import { LinkageTableComponent } from './component/linkage-table/linkage-table.component';
import { ToolbarComponent } from './component/toolbar/toolbar.component';
import { AnalysisPopupComponent } from './component/analysis-popup/analysis-popup.component';
import { AnimationBarComponent} from "./component/animation-bar/animation-bar.component";
import { ShapeSelectorComponent } from './component/shape-selector/shape-selector.component';
import {FormsModule} from "@angular/forms";
import {NgApexchartsModule} from "ng-apexcharts";
import {TemplatesPopupComponent} from "./component/templates-popup/templates-popup.component";
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { MaterialModule } from './material/material.module';
import { LeftTabsComponent } from './component/left-tabs/left-tabs.component';
import { TabComponent } from './component/tab/tab.component';

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
    ],
  imports: [
    BrowserModule,
    FormsModule,
    NgApexchartsModule,
    BrowserAnimationsModule,
    MaterialModule,
  ],
  providers: [

  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
