/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {CdkDragDrop, moveItemInArray} from '@angular/cdk/drag-drop';
import {Component, EventEmitter, Input, Output} from '@angular/core';
import {DirectivePosition, SerializedInjectedService} from 'protocol';

import {DirectivePropertyResolver, DirectiveTreeData} from '../../property-resolver/directive-property-resolver';
import {FlatNode} from '../../property-resolver/element-property-resolver';

@Component({
  selector: 'ng-property-view-body',
  templateUrl: './property-view-body.component.html',
  styleUrls: ['./property-view-body.component.scss'],
})
export class PropertyViewBodyComponent {
  @Input() controller: DirectivePropertyResolver;
  @Input() directiveInputControls: DirectiveTreeData;
  @Input() directiveOutputControls: DirectiveTreeData;
  @Input() directiveStateControls: DirectiveTreeData;

  @Output() inspect = new EventEmitter<{node: FlatNode; directivePosition: DirectivePosition}>();

  categoryOrder = [0, 1, 2];

  get panels(): {
    title: string; hidden: boolean; controls: DirectiveTreeData; documentation: string,
                                                                 class: string;
  }[] {
    return [
      {
        title: '@Inputs',
        hidden: this.directiveInputControls.dataSource.data.length === 0,
        controls: this.directiveInputControls,
        documentation: 'https://angular.io/api/core/Input',
        class: 'cy-inputs',
      },
      {
        title: '@Outputs',
        hidden: this.directiveOutputControls.dataSource.data.length === 0,
        controls: this.directiveOutputControls,
        documentation: 'https://angular.io/api/core/Output',
        class: 'cy-outputs',
      },
      {
        title: 'Properties',
        hidden: this.directiveStateControls.dataSource.data.length === 0,
        controls: this.directiveStateControls,
        documentation: 'https://angular.io/guide/property-binding',
        class: 'cy-properties',
      },
    ];
  }

  get controlsLoaded(): boolean {
    return !!this.directiveStateControls && !!this.directiveOutputControls &&
        !!this.directiveInputControls;
  }

  updateValue({node, newValue}: {node: FlatNode; newValue: any}): void {
    this.controller.updateValue(node, newValue);
  }

  drop(event: CdkDragDrop<any, any>): void {
    moveItemInArray(this.categoryOrder, event.previousIndex, event.currentIndex);
  }

  handleInspect(node: FlatNode): void {
    this.inspect.emit({
      node,
      directivePosition: this.controller.directivePosition,
    });
  }
}


@Component({
  selector: 'ng-dependency-viewer',
  template: `
    <mat-accordion class="example-headers-align" multi>
      <mat-expansion-panel>
        <mat-expansion-panel-header collapsedHeight="35px" expandedHeight="35px">
          <mat-panel-title>

            <mat-chip-listbox>
              <mat-chip matTooltipPosition="left" matTooltip="Dependency injection token" (click)="$event.stopPropagation();">{{dependency.token}}</mat-chip>
            </mat-chip-listbox>
          </mat-panel-title>

          <mat-panel-description>
            <mat-chip-listbox>
              <div class="di-flags">
                <mat-chip [highlighted]="true" color="primary" *ngIf="dependency.flags?.optional">Optional</mat-chip>
                <mat-chip [highlighted]="true" color="primary" *ngIf="dependency.flags?.host">Host</mat-chip>
                <mat-chip [highlighted]="true" color="primary" *ngIf="dependency.flags?.self">Self</mat-chip>
                <mat-chip [highlighted]="true" color="primary" *ngIf="dependency.flags?.skipSelf">SkipSelf</mat-chip>
              </div>
            </mat-chip-listbox>
          </mat-panel-description>

        </mat-expansion-panel-header>

        <ng-resolution-path [path]="dependency.resolutionPath"></ng-resolution-path>
      </mat-expansion-panel>
    </mat-accordion>
  `,
  styles: [`
    .di-flags {
      display: flex;
      flex-wrap: nowrap;
    }

    :host-context(.dark-theme) ng-resolution-path {
      background: #1a1a1a;
    }

    ng-resolution-path {
      border-top: 1px solid black;
      display: block;
      overflow-x: scroll;
      background: #f3f3f3;
    }

    :host {
      mat-chip {
        --mdc-chip-container-height: 18px;
      }
    }
    `]
})
export class DependencyViewerComponent {
  @Input() dependency: SerializedInjectedService;
}

@Component({
  selector: 'ng-injected-services',
  template: `
    <ng-dependency-viewer *ngFor="let dependency of dependencies; trackBy: dependencyPosition" [dependency]="dependency">
  `,
  styles: [`
      ng-dependency-viewer {
        border-bottom: 1px solid color-mix(in srgb, currentColor, #bdbdbd 85%);
        display: block;
      }
    `]
})
export class InjectedServicesComponent {
  @Input() controller: DirectivePropertyResolver;

  get dependencies(): SerializedInjectedService[] {
    return this.controller.directiveMetadata?.dependencies ?? [];
  }

  dependencyPosition(_index, dependency: SerializedInjectedService) {
    return dependency.position[0];
  }
}
