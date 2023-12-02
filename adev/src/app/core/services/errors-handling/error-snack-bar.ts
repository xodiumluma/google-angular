/*!
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {Component, Inject} from '@angular/core';
import {MAT_SNACK_BAR_DATA, MatSnackBarAction, MatSnackBarRef} from '@angular/material/snack-bar';

export interface ErrorSnackBarData {
  message: string;
  actionText?: string;
}

@Component({
  selector: 'error-snack-bar',
  template: `
    {{ message }}
    <button
      class="adev-primary-btn"
      type="button"
      matSnackBarAction
      [attr.text]="actionText"
      (click)="snackBarRef.dismissWithAction()"
    >
      {{ actionText }}
    </button>
  `,
  imports: [MatSnackBarAction],
  standalone: true,
  styles: `:host { display: flex; align-items: center; button { margin-left: 16px }}`,
})
export class ErrorSnackBar {
  protected message: string;
  protected actionText?: string;

  constructor(
    protected snackBarRef: MatSnackBarRef<ErrorSnackBar>,
    @Inject(MAT_SNACK_BAR_DATA) public data: ErrorSnackBarData,
  ) {
    this.message = data.message;
    this.actionText = data.actionText;
  }
}
