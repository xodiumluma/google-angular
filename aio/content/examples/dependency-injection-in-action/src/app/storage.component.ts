// #docregion
import { Component, OnInit, Self, SkipSelf } from '@angular/core';
import { BROWSER_STORAGE, BrowserStorageService } from './storage.service';

@Component({
  standalone: true,
  selector: 'app-storage',
  template: `
    Open the inspector to see the local/session storage keys:

    <h3>Session Storage</h3>
    <button type="button" (click)="setSession()">Set Session Storage</button>

    <h3>Local Storage</h3>
    <button type="button" (click)="setLocal()">Set Local Storage</button>
  `,
  providers: [
    BrowserStorageService,
    { provide: BROWSER_STORAGE, useFactory: () => sessionStorage }
  ]
})
export class StorageComponent {

  constructor(
    @Self() private sessionStorageService: BrowserStorageService,
    @SkipSelf() private localStorageService: BrowserStorageService,
  ) { }

  setSession() {
    this.sessionStorageService.set('hero', 'Dr Nice - Session');
  }

  setLocal() {
    this.localStorageService.set('hero', 'Dr Nice - Local');
  }
}
