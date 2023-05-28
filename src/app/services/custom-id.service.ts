import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CustomIdService {

  //A map between strings and strings
  private customIDMap: Map<string, string> = new Map();

  addVisualID(originalID: string, customID: string) {
    //Remove trailing and leading spaces
    originalID = originalID.trim();
    //Make the originalID upperscase
    originalID = originalID.toUpperCase();
    //Add the customID to the map
    this.customIDMap.set(originalID, customID);
  }

  getVisualID(originalID: string) {
    //Make the originalID upperscase
    originalID = originalID.toUpperCase();
    //Get the customID from the map, if it doesn't exist, return the originalID
    return this.customIDMap.get(originalID) || originalID;
  }

  getMap(): Map<string, string> {
    return this.customIDMap;
  }

  setMap(map: Map<string, string>) {
    this.customIDMap = map;
  }

  constructor() {
  }
}
