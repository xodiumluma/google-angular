/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {
  InputIncompatibilityReason,
  pickInputIncompatibility,
} from '../input_detection/incompatibility';
import {GraphNode, topologicalSort} from '../utils/inheritance_sort';
import {CompilationUnitData} from './unit_data';

type InputData = {key: string; info: CompilationUnitData['knownInputs'][string]};

/** Merges a list of compilation units into a combined unit. */
export function mergeCompilationUnitData(
  metadataFiles: CompilationUnitData[],
): CompilationUnitData {
  const result: CompilationUnitData = {
    knownInputs: {},
  };

  const idToGraphNode = new Map<string, GraphNode<InputData>>();
  const inheritanceGraph: GraphNode<InputData>[] = [];
  const isNodeIncompatible = (node: InputData) =>
    node.info.memberIncompatibility !== null || node.info.owningClassIncompatibility !== null;

  for (const file of metadataFiles) {
    for (const [key, info] of Object.entries(file.knownInputs)) {
      const existing = result.knownInputs[key];
      if (existing === undefined) {
        result.knownInputs[key] = info;
        const node: GraphNode<InputData> = {
          incoming: new Set(),
          outgoing: new Set(),
          data: {info, key},
        };
        inheritanceGraph.push(node);
        idToGraphNode.set(key, node);
        continue;
      }

      // Merge metadata.
      if (existing.extendsFrom === null && info.extendsFrom !== null) {
        existing.extendsFrom = info.extendsFrom;
      }
      if (!existing.seenAsSourceInput && info.seenAsSourceInput) {
        existing.seenAsSourceInput = true;
      }

      // Merge member incompatibility.
      if (info.memberIncompatibility !== null) {
        if (existing.memberIncompatibility === null) {
          existing.memberIncompatibility = info.memberIncompatibility;
        } else {
          // Input might not be incompatible in one target, but others might invalidate it.
          // merge the incompatibility state.
          existing.memberIncompatibility = pickInputIncompatibility(
            {reason: info.memberIncompatibility, context: null},
            {reason: existing.memberIncompatibility, context: null},
          ).reason;
        }
      }

      // Merge incompatibility of the class owning the input.
      // Note: This metadata is stored per field for simplicity currently,
      // but in practice it could be a separate field in the compilation data.
      if (
        info.owningClassIncompatibility !== null &&
        existing.owningClassIncompatibility === null
      ) {
        existing.owningClassIncompatibility = info.owningClassIncompatibility;
      }
    }
  }

  for (const [key, info] of Object.entries(result.knownInputs)) {
    if (info.extendsFrom !== null) {
      const from = idToGraphNode.get(key)!;
      const target = idToGraphNode.get(info.extendsFrom)!;
      from.outgoing.add(target);
      target.incoming.add(from);
    }
  }

  // Sort topologically and iterate super classes first, so that we can trivially
  // propagate incompatibility statuses (and other checks) without having to check
  // in both directions (derived classes, or base classes). This simplifies the
  // propagation.
  for (const node of topologicalSort(inheritanceGraph).reverse()) {
    const existingMemberIncompatibility =
      node.data.info.memberIncompatibility !== null
        ? {reason: node.data.info.memberIncompatibility, context: null}
        : null;

    for (const parent of node.outgoing) {
      // If parent is incompatible and not migrated, then this input
      // cannot be migrated either. Try propagating parent incompatibility then.
      if (isNodeIncompatible(parent.data)) {
        node.data.info.memberIncompatibility = pickInputIncompatibility(
          {reason: InputIncompatibilityReason.ParentIsIncompatible, context: null},
          existingMemberIncompatibility,
        ).reason;
        break;
      }
    }
  }

  for (const info of Object.values(result.knownInputs)) {
    // We never saw a source file for this input, globally. Try marking it as incompatible,
    // so that all references and inheritance checks can propagate accordingly.
    if (!info.seenAsSourceInput) {
      const existingMemberIncompatibility =
        info.memberIncompatibility !== null
          ? {reason: info.memberIncompatibility, context: null}
          : null;

      info.memberIncompatibility = pickInputIncompatibility(
        {reason: InputIncompatibilityReason.OutsideOfMigrationScope, context: null},
        existingMemberIncompatibility,
      ).reason;
    }
  }

  return result;
}
