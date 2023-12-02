/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {NgForOf, NgIf} from '@angular/common';
import {Component, inject, Input} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatTableModule} from '@angular/material/table';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Events, MessageBus, SerializedInjector, SerializedProviderRecord} from 'protocol';

@Component({
  selector: 'ng-injector-providers',
  template: `
        <h1>
          Providers for {{ injector?.name  }}
        </h1>
        <div *ngIf="injector" class="injector-providers">
            <table *ngIf="providers.length > 0" mat-table [dataSource]="providers" class="mat-elevation-z4">
              <ng-container matColumnDef="token">
                <th mat-header-cell *matHeaderCellDef> <h3 class="column-title">Token</h3> </th>
                <td mat-cell *matCellDef="let provider"> {{provider.token}} </td>
              </ng-container>

              <ng-container matColumnDef="type">
                <th mat-header-cell *matHeaderCellDef> <h3 class="column-title">Type</h3> </th>
                <td mat-cell *matCellDef="let provider">
                  @if (provider.type === 'multi') {
                    multi (x{{ provider.index.length }})
                  } @else {
                    {{typeToLabel[provider.type]}}
                  }
                </td>
              </ng-container>

              <ng-container matColumnDef="isViewProvider">
                <th mat-header-cell *matHeaderCellDef> <h3 class="column-title">Is View Provider</h3> </th>
                <td mat-cell *matCellDef="let provider"> <mat-icon>{{provider.isViewProvider ? 'check_circle' : 'cancel'}}</mat-icon> </td>
              </ng-container>

              <ng-container matColumnDef="log">
                <th mat-header-cell *matHeaderCellDef> <h3 class="column-title"></h3> </th>
                <td mat-cell *matCellDef="let provider"> <mat-icon matTooltipPosition="left" matTooltip="Log provider in console" class="select" (click)="select(provider)">send</mat-icon> </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
            </table>
        </div>
    `,
  styles: [`
        .select {
          cursor: pointer;
        }

        :host {
          display: block;
          padding: 16px;
        }

        table {
          width: 100%;
        }

        .column-title {
          margin: 0;
        }

        tr.example-detail-row {
          height: 0;
        }

        .example-element-row td {
          border-bottom-width: 0;
          cursor: pointer;
        }

        .example-element-detail {
          overflow: hidden;
          display: flex;
        }

        .example-element-diagram {
          min-width: 80px;
          border: 2px solid black;
          padding: 8px;
          font-weight: lighter;
          margin: 8px 0;
          height: 104px;
        }

        .example-element-symbol {
          font-weight: bold;
          font-size: 40px;
          line-height: normal;
        }

        .example-element-description {
          padding: 16px;
        }

        .example-element-description-attribution {
          opacity: 0.5;
        }
    `],
  standalone: true,
  imports: [NgIf, NgForOf, MatTableModule, MatIconModule, MatTooltipModule],
})
export class InjectorProvidersComponent {
  @Input() injector: SerializedInjector;
  @Input() providers: SerializedProviderRecord[] = [];

  typeToLabel = {
    type: 'Type',
    existing: 'useExisting',
    factory: 'useFactory',
    class: 'useClass',
    value: 'useValue',
  };

  messageBus = inject(MessageBus<Events>);

  select(row: SerializedProviderRecord) {
    this.messageBus.emit('logProvider', [
      {
        id: this.injector.id,
        type: this.injector.type,
        name: this.injector.name,
      },
      row
    ]);
  }

  get displayedColumns(): string[] {
    if (this.injector?.type === 'element') {
      return ['token', 'type', 'isViewProvider', 'log'];
    }
    return ['token', 'type', 'log'];
  }
}
