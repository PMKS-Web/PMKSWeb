import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-left-tabs',
  templateUrl: './left-tabs.component.html',
  styleUrls: ['./left-tabs.component.scss']
})
export class LeftTabsComponent implements OnInit {
  openTab = 1; //Default open tab
  constructor() { 
  }

  ngOnInit(): void {
  }

  tabClicked(tabID: number) {
    if (this.openTab === tabID) {
      this.openTab = 0;
    }else{
      this.openTab = tabID;
    }
  }



}
