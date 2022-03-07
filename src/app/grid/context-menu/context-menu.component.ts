import {Component, ElementRef, OnInit, ViewChild} from '@angular/core';

@Component({
  selector: 'app-context-menu',
  templateUrl: './context-menu.component.html',
  styleUrls: ['./context-menu.component.css']
})
export class ContextMenuComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {}

  // https://www.youtube.com/watch?v=sKjBwz_x6Ss
  @ViewChild('menu') menu!: ElementRef
  contextMenu(e: any) {
    e.preventDefault();
    this.menu.nativeElement.style.display = 'block';
    this.menu.nativeElement.style.top = e.pageY + 'px';
    this.menu.nativeElement.style.left = e.pageX + 'px';
  }

  disappearContext() {
    this.menu.nativeElement.style.display = 'none';
  }

  stopPropagation(e: any) {
    e.stopPropagation();
  }
}
