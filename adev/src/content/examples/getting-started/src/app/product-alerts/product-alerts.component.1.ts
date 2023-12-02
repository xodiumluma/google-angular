// #docplaster
// #docregion imports
import { Component, Input } from '@angular/core';
import { Product } from '../products';
// #enddocregion imports
// #docregion as-generated

@Component({
  selector: 'app-product-alerts',
  templateUrl: './product-alerts.component.html',
  styleUrls: ['./product-alerts.component.css']
})
// #docregion input-decorator
export class ProductAlertsComponent {

// #enddocregion as-generated
  @Input() product: Product | undefined;
// #docregion as-generated

}
