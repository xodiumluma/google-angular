/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {CommonModule} from '@angular/common';
import {NgModule} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatMenuModule} from '@angular/material/menu';
import {MatSlideToggleModule} from '@angular/material/slide-toggle';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTooltipModule} from '@angular/material/tooltip';

import {DevToolsTabsComponent} from './devtools-tabs.component';
import {DirectiveExplorerModule} from './directive-explorer/directive-explorer.module';
import {InjectorTreeComponent} from './injector-tree/injector-tree.component';
import {ProfilerModule} from './profiler/profiler.module';
import {RouterTreeModule} from './router-tree/router-tree.module';
import {TabUpdate} from './tab-update/index';

@NgModule({
  declarations: [DevToolsTabsComponent],
  imports: [
    MatTabsModule, MatIconModule, DirectiveExplorerModule, ProfilerModule, RouterTreeModule,
    CommonModule, MatMenuModule, MatButtonModule, MatSlideToggleModule, MatTooltipModule,
    InjectorTreeComponent
  ],
  providers: [TabUpdate],
  exports: [DevToolsTabsComponent],
})
export class DevToolsTabModule {
}
