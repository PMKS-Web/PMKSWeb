import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { GridComponent } from './component/grid/grid.component';
import { LinkageTableComponent } from './component/linkage-table/linkage-table.component';
import { ToolbarComponent } from './component/toolbar/toolbar.component';
import { AnalysisPopupComponent } from './component/analysis-popup/analysis-popup.component';

@NgModule({
  declarations: [
    AppComponent,
    GridComponent,
    LinkageTableComponent,
    ToolbarComponent,
    AnalysisPopupComponent,
  ],
  imports: [
    BrowserModule
  ],
  providers: [

  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
