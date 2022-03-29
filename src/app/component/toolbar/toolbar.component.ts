import {Component, Input, OnInit} from '@angular/core';
import {Joint} from "../../model/joint";
import {Link} from "../../model/link";
import {Force} from "../../model/force";

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.css']
})
export class ToolbarComponent implements OnInit {

  @Input() joints: Joint[] = [];
  @Input() links: Link[] = [];
  @Input() forces: Force[] = [];

  constructor() { }

  ngOnInit(): void {
  }

}
