/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as o from '../../../../output/output_ast';
import * as ir from '../../ir';
import type {CompilationJob, CompilationUnit} from '../compilation';

/**
 * Any variable inside a listener with the name `$event` will be transformed into a output lexical
 * read immediately, and does not participate in any of the normal logic for handling variables.
 */
export function resolveDollarEvent(job: CompilationJob): void {
  for (const unit of job.units) {
    transformDollarEvent(unit, unit.create);
    transformDollarEvent(unit, unit.update);
  }
}

function transformDollarEvent(
    unit: CompilationUnit, ops: ir.OpList<ir.CreateOp>|ir.OpList<ir.UpdateOp>): void {
  for (const op of ops) {
    if (op.kind === ir.OpKind.Listener) {
      ir.transformExpressionsInOp(op, (expr) => {
        if (expr instanceof ir.LexicalReadExpr && expr.name === '$event') {
          op.consumesDollarEvent = true;
          return new o.ReadVarExpr(expr.name);
        }
        return expr;
      }, ir.VisitorContextFlag.InChildOperation);
    }
  }
}
