/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {InputIncompatibilityReason} from './input_detection/incompatibility';
import {KnownInputs} from './input_detection/known_inputs';

/** Input reasons that cannot be ignored. */
export const nonIgnorableInputIncompatibilities: InputIncompatibilityReason[] = [
  // Outside of scope inputs should not be migrated. E.g. references to inputs in `node_modules/`.
  InputIncompatibilityReason.OutsideOfMigrationScope,
  // Explicitly filtered inputs cannot be skipped via best effort mode.
  InputIncompatibilityReason.SkippedViaConfigFilter,
  // There is no good output for accessor inputs.
  InputIncompatibilityReason.Accessor,
  // There is no good output for such inputs. We can't perform "conversion".
  InputIncompatibilityReason.RequiredInputButNoGoodExplicitTypeExtractable,
];

/** Filters ignorable input incompatibilities when best effort mode is enabled. */
export function filterIncompatibilitiesForBestEffortMode(knownInputs: KnownInputs) {
  knownInputs.knownInputIds.forEach(({container: c}) => {
    // All class incompatibilities are "filterable" right now.
    c.incompatible = null;

    for (const [key, i] of c.memberIncompatibility.entries()) {
      if (!nonIgnorableInputIncompatibilities.includes(i.reason)) {
        c.memberIncompatibility.delete(key);
      }
    }
  });
}
