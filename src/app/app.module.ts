import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { GridComponent } from './grid/grid.component';
import { ContextMenuComponent } from './grid/context-menu/context-menu.component';

@NgModule({
  declarations: [
    AppComponent,
    GridComponent,
    ContextMenuComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
