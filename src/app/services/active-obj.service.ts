import { Injectable, EventEmitter } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ActiveObjService {
  storedPhrase = 'Hello World';

  constructor() { }

  onActiveObjChange  = new EventEmitter<string>;

  updateSelectedObj(newPhrase: string) {
    this.storedPhrase = newPhrase;
    this.onActiveObjChange.emit(this.storedPhrase);
  }

}
