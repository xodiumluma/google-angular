/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import ts from 'typescript/lib/tsserverlibrary';

import {NgLanguageService, PluginConfig} from './api';

interface PluginModule extends ts.server.PluginModule {
  create(createInfo: ts.server.PluginCreateInfo): NgLanguageService;
  onConfigurationChanged?(config: PluginConfig): void;
}

export const factory: ts.server.PluginModuleFactory = (tsModule): PluginModule => {
  let plugin: PluginModule;

  return {
    create(info: ts.server.PluginCreateInfo): NgLanguageService {
      plugin = require(`./bundles/language-service.js`)(tsModule);
      return plugin.create(info);
    },
    getExternalFiles(project: ts.server.Project): string[] {
      // TODO(crisbeto): hardcoded value `2` to be replaced with `ts.ProgramUpdateLevel.Full`
      // after we drop support for TS 5.2.
      return plugin?.getExternalFiles?.(project, 2) ?? [];
    },
    onConfigurationChanged(config: PluginConfig): void {
      plugin?.onConfigurationChanged?.(config);
    },
  };
};
