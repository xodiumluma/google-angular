import {Component, ViewEncapsulation} from '@angular/core';
import {NoEncapsulationComponent} from './no-encapsulation.component';
import {ShadowDomEncapsulationComponent} from './shadow-dom-encapsulation.component';
import {EmulatedEncapsulationComponent} from './emulated-encapsulation.component';

@Component({
  standalone: true,
  selector: 'app-root',
  template: `
    <app-no-encapsulation></app-no-encapsulation>
    <app-emulated-encapsulation></app-emulated-encapsulation>
    <app-shadow-dom-encapsulation></app-shadow-dom-encapsulation>
  `,
  styles: [
    `
      app-no-encapsulation,
      app-emulated-encapsulation,
      app-shadow-dom-encapsulation {
        display: block;
        max-width: 500px;
        padding: 5px;
        margin: 5px 0;
      }
    `,
    'app-no-encapsulation { border: solid 2px red; }',
    'app-emulated-encapsulation { border: solid 2px green; }',
    'app-shadow-dom-encapsulation { border: solid 2px blue; }',
  ],
  encapsulation: ViewEncapsulation.None,
  imports: [
    NoEncapsulationComponent,
    ShadowDomEncapsulationComponent,
    EmulatedEncapsulationComponent,
  ],
})
export class AppComponent {}
