import {Component} from '@angular/core';

@Component({
  template: `
    @for (item of items; track item) {
      <ng-template foo="1" bar="2">{{item}}</ng-template>
    }
  `,
})
export class MyApp {
  items = [1, 2, 3];
}
