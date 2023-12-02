/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import * as o from '../../../../output/output_ast';
import {Identifiers} from '../../../../render3/r3_identifiers';
import * as ir from '../../ir';
import {ViewCompilationUnit, type CompilationJob, type CompilationUnit} from '../compilation';
import * as ng from '../instruction';

/**
 * Map of sanitizers to their identifier.
 */
const sanitizerIdentifierMap = new Map<ir.SanitizerFn, o.ExternalReference>([
  [ir.SanitizerFn.Html, Identifiers.sanitizeHtml],
  [ir.SanitizerFn.IframeAttribute, Identifiers.validateIframeAttribute],
  [ir.SanitizerFn.ResourceUrl, Identifiers.sanitizeResourceUrl],
  [ir.SanitizerFn.Script, Identifiers.sanitizeScript],
  [ir.SanitizerFn.Style, Identifiers.sanitizeStyle], [ir.SanitizerFn.Url, Identifiers.sanitizeUrl]
]);

/**
 * Compiles semantic operations across all views and generates output `o.Statement`s with actual
 * runtime calls in their place.
 *
 * Reification replaces semantic operations with selected Ivy instructions and other generated code
 * structures. After reification, the create/update operation lists of all views should only contain
 * `ir.StatementOp`s (which wrap generated `o.Statement`s).
 */
export function reify(job: CompilationJob): void {
  for (const unit of job.units) {
    reifyCreateOperations(unit, unit.create);
    reifyUpdateOperations(unit, unit.update);
  }
}

function reifyCreateOperations(unit: CompilationUnit, ops: ir.OpList<ir.CreateOp>): void {
  for (const op of ops) {
    ir.transformExpressionsInOp(op, reifyIrExpression, ir.VisitorContextFlag.None);

    switch (op.kind) {
      case ir.OpKind.Text:
        ir.OpList.replace(op, ng.text(op.handle.slot!, op.initialValue, op.sourceSpan));
        break;
      case ir.OpKind.ElementStart:
        ir.OpList.replace(
            op,
            ng.elementStart(
                op.handle.slot!, op.tag!, op.attributes as number | null,
                op.localRefs as number | null, op.sourceSpan));
        break;
      case ir.OpKind.Element:
        ir.OpList.replace(
            op,
            ng.element(
                op.handle.slot!, op.tag!, op.attributes as number | null,
                op.localRefs as number | null, op.sourceSpan));
        break;
      case ir.OpKind.ElementEnd:
        ir.OpList.replace(op, ng.elementEnd(op.sourceSpan));
        break;
      case ir.OpKind.ContainerStart:
        ir.OpList.replace(
            op,
            ng.elementContainerStart(
                op.handle.slot!, op.attributes as number | null, op.localRefs as number | null,
                op.sourceSpan));
        break;
      case ir.OpKind.Container:
        ir.OpList.replace(
            op,
            ng.elementContainer(
                op.handle.slot!, op.attributes as number | null, op.localRefs as number | null,
                op.sourceSpan));
        break;
      case ir.OpKind.ContainerEnd:
        ir.OpList.replace(op, ng.elementContainerEnd());
        break;
      case ir.OpKind.I18nStart:
        ir.OpList.replace(
            op, ng.i18nStart(op.handle.slot!, op.messageIndex!, op.subTemplateIndex!));
        break;
      case ir.OpKind.I18nEnd:
        ir.OpList.replace(op, ng.i18nEnd());
        break;
      case ir.OpKind.I18n:
        ir.OpList.replace(op, ng.i18n(op.handle.slot!, op.messageIndex!, op.subTemplateIndex!));
        break;
      case ir.OpKind.Template:
        if (!(unit instanceof ViewCompilationUnit)) {
          throw new Error(`AssertionError: must be compiling a component`);
        }
        if (Array.isArray(op.localRefs)) {
          throw new Error(
              `AssertionError: local refs array should have been extracted into a constant`);
        }
        const childView = unit.job.views.get(op.xref)!;
        ir.OpList.replace(
            op,
            ng.template(
                op.handle.slot!, o.variable(childView.fnName!), childView.decls!, childView.vars!,
                op.tag, op.attributes, op.localRefs, op.sourceSpan),
        );
        break;
      case ir.OpKind.DisableBindings:
        ir.OpList.replace(op, ng.disableBindings());
        break;
      case ir.OpKind.EnableBindings:
        ir.OpList.replace(op, ng.enableBindings());
        break;
      case ir.OpKind.Pipe:
        ir.OpList.replace(op, ng.pipe(op.handle.slot!, op.name));
        break;
      case ir.OpKind.Listener:
        const listenerFn =
            reifyListenerHandler(unit, op.handlerFnName!, op.handlerOps, op.consumesDollarEvent);
        const reified = op.hostListener && op.isAnimationListener ?
            ng.syntheticHostListener(op.name, listenerFn, op.sourceSpan) :
            ng.listener(op.name, listenerFn, op.sourceSpan);
        ir.OpList.replace(op, reified);
        break;
      case ir.OpKind.Variable:
        if (op.variable.name === null) {
          throw new Error(`AssertionError: unnamed variable ${op.xref}`);
        }
        ir.OpList.replace<ir.CreateOp>(
            op,
            ir.createStatementOp(new o.DeclareVarStmt(
                op.variable.name, op.initializer, undefined, o.StmtModifier.Final)));
        break;
      case ir.OpKind.Namespace:
        switch (op.active) {
          case ir.Namespace.HTML:
            ir.OpList.replace<ir.CreateOp>(op, ng.namespaceHTML());
            break;
          case ir.Namespace.SVG:
            ir.OpList.replace<ir.CreateOp>(op, ng.namespaceSVG());
            break;
          case ir.Namespace.Math:
            ir.OpList.replace<ir.CreateOp>(op, ng.namespaceMath());
            break;
        }
        break;
      case ir.OpKind.Defer:
        const timerScheduling =
            !!op.loadingMinimumTime || !!op.loadingAfterTime || !!op.placeholderMinimumTime;
        ir.OpList.replace(
            op,
            ng.defer(
                op.handle.slot!, op.mainSlot.slot!, op.resolverFn, op.loadingSlot?.slot ?? null,
                op.placeholderSlot?.slot! ?? null, op.errorSlot?.slot ?? null, op.loadingConfig,
                op.placeholderConfig, timerScheduling, op.sourceSpan));
        break;
      case ir.OpKind.DeferOn:
        let args: number[] = [];
        switch (op.trigger.kind) {
          case ir.DeferTriggerKind.Idle:
          case ir.DeferTriggerKind.Immediate:
            break;
          case ir.DeferTriggerKind.Timer:
            args = [op.trigger.delay];
            break;
          case ir.DeferTriggerKind.Interaction:
          case ir.DeferTriggerKind.Hover:
          case ir.DeferTriggerKind.Viewport:
            if (op.trigger.targetSlot?.slot == null || op.trigger.targetSlotViewSteps === null) {
              throw new Error(`Slot or view steps not set in trigger reification for trigger kind ${
                  op.trigger.kind}`);
            }
            args = [op.trigger.targetSlot.slot];
            if (op.trigger.targetSlotViewSteps !== 0) {
              args.push(op.trigger.targetSlotViewSteps);
            }
            break;
          default:
            throw new Error(`AssertionError: Unsupported reification of defer trigger kind ${
                (op.trigger as any).kind}`);
        }
        ir.OpList.replace(op, ng.deferOn(op.trigger.kind, args, op.prefetch, op.sourceSpan));
        break;
      case ir.OpKind.ProjectionDef:
        ir.OpList.replace<ir.CreateOp>(op, ng.projectionDef(op.def));
        break;
      case ir.OpKind.Projection:
        if (op.handle.slot === null) {
          throw new Error('No slot was assigned for project instruction');
        }
        ir.OpList.replace<ir.CreateOp>(
            op,
            ng.projection(op.handle.slot!, op.projectionSlotIndex, op.attributes, op.sourceSpan));
        break;
      case ir.OpKind.RepeaterCreate:
        if (op.handle.slot === null) {
          throw new Error('No slot was assigned for repeater instruction');
        }
        if (!(unit instanceof ViewCompilationUnit)) {
          throw new Error(`AssertionError: must be compiling a component`);
        }
        const repeaterView = unit.job.views.get(op.xref)!;
        if (repeaterView.fnName === null) {
          throw new Error(`AssertionError: expected repeater primary view to have been named`);
        }

        let emptyViewFnName: string|null = null;
        let emptyDecls: number|null = null;
        let emptyVars: number|null = null;
        if (op.emptyView !== null) {
          const emptyView = unit.job.views.get(op.emptyView);
          if (emptyView === undefined) {
            throw new Error(
                'AssertionError: repeater had empty view xref, but empty view was not found');
          }
          if (emptyView.fnName === null || emptyView.decls === null || emptyView.vars === null) {
            throw new Error(
                `AssertionError: expected repeater empty view to have been named and counted`);
          }
          emptyViewFnName = emptyView.fnName;
          emptyDecls = emptyView.decls;
          emptyVars = emptyView.vars;
        }

        ir.OpList.replace(
            op,
            ng.repeaterCreate(
                op.handle.slot, repeaterView.fnName, op.decls!, op.vars!, op.tag, op.attributes,
                op.trackByFn!, op.usesComponentInstance, emptyViewFnName, emptyDecls, emptyVars,
                op.sourceSpan));
        break;
      case ir.OpKind.Statement:
        // Pass statement operations directly through.
        break;
      default:
        throw new Error(
            `AssertionError: Unsupported reification of create op ${ir.OpKind[op.kind]}`);
    }
  }
}

function reifyUpdateOperations(_unit: CompilationUnit, ops: ir.OpList<ir.UpdateOp>): void {
  for (const op of ops) {
    ir.transformExpressionsInOp(op, reifyIrExpression, ir.VisitorContextFlag.None);

    switch (op.kind) {
      case ir.OpKind.Advance:
        ir.OpList.replace(op, ng.advance(op.delta, op.sourceSpan));
        break;
      case ir.OpKind.Property:
        if (op.expression instanceof ir.Interpolation) {
          ir.OpList.replace(
              op,
              ng.propertyInterpolate(
                  op.name, op.expression.strings, op.expression.expressions, op.sanitizer,
                  op.sourceSpan));
        } else {
          ir.OpList.replace(op, ng.property(op.name, op.expression, op.sanitizer, op.sourceSpan));
        }
        break;
      case ir.OpKind.StyleProp:
        if (op.expression instanceof ir.Interpolation) {
          ir.OpList.replace(
              op,
              ng.stylePropInterpolate(
                  op.name, op.expression.strings, op.expression.expressions, op.unit,
                  op.sourceSpan));
        } else {
          ir.OpList.replace(op, ng.styleProp(op.name, op.expression, op.unit, op.sourceSpan));
        }
        break;
      case ir.OpKind.ClassProp:
        ir.OpList.replace(op, ng.classProp(op.name, op.expression, op.sourceSpan));
        break;
      case ir.OpKind.StyleMap:
        if (op.expression instanceof ir.Interpolation) {
          ir.OpList.replace(
              op,
              ng.styleMapInterpolate(
                  op.expression.strings, op.expression.expressions, op.sourceSpan));
        } else {
          ir.OpList.replace(op, ng.styleMap(op.expression, op.sourceSpan));
        }
        break;
      case ir.OpKind.ClassMap:
        if (op.expression instanceof ir.Interpolation) {
          ir.OpList.replace(
              op,
              ng.classMapInterpolate(
                  op.expression.strings, op.expression.expressions, op.sourceSpan));
        } else {
          ir.OpList.replace(op, ng.classMap(op.expression, op.sourceSpan));
        }
        break;
      case ir.OpKind.I18nExpression:
        ir.OpList.replace(op, ng.i18nExp(op.expression, op.sourceSpan));
        break;
      case ir.OpKind.I18nApply:
        ir.OpList.replace(op, ng.i18nApply(op.handle.slot!, op.sourceSpan));
        break;
      case ir.OpKind.InterpolateText:
        ir.OpList.replace(
            op,
            ng.textInterpolate(
                op.interpolation.strings, op.interpolation.expressions, op.sourceSpan));
        break;
      case ir.OpKind.Attribute:
        if (op.expression instanceof ir.Interpolation) {
          ir.OpList.replace(
              op,
              ng.attributeInterpolate(
                  op.name, op.expression.strings, op.expression.expressions, op.sanitizer,
                  op.sourceSpan));
        } else {
          ir.OpList.replace(op, ng.attribute(op.name, op.expression, op.sanitizer));
        }
        break;
      case ir.OpKind.HostProperty:
        if (op.expression instanceof ir.Interpolation) {
          throw new Error('not yet handled');
        } else {
          if (op.isAnimationTrigger) {
            ir.OpList.replace(op, ng.syntheticHostProperty(op.name, op.expression, op.sourceSpan));
          } else {
            ir.OpList.replace(op, ng.hostProperty(op.name, op.expression, op.sourceSpan));
          }
        }
        break;
      case ir.OpKind.Variable:
        if (op.variable.name === null) {
          throw new Error(`AssertionError: unnamed variable ${op.xref}`);
        }
        ir.OpList.replace<ir.UpdateOp>(
            op,
            ir.createStatementOp(new o.DeclareVarStmt(
                op.variable.name, op.initializer, undefined, o.StmtModifier.Final)));
        break;
      case ir.OpKind.Conditional:
        if (op.processed === null) {
          throw new Error(`Conditional test was not set.`);
        }
        if (op.targetSlot.slot === null) {
          throw new Error(`Conditional slot was not set.`);
        }
        ir.OpList.replace(
            op, ng.conditional(op.targetSlot.slot, op.processed, op.contextValue, op.sourceSpan));
        break;
      case ir.OpKind.Repeater:
        ir.OpList.replace(op, ng.repeater(op.collection, op.sourceSpan));
        break;
      case ir.OpKind.DeferWhen:
        ir.OpList.replace(op, ng.deferWhen(op.prefetch, op.expr, op.sourceSpan));
        break;
      case ir.OpKind.Statement:
        // Pass statement operations directly through.
        break;
      default:
        throw new Error(
            `AssertionError: Unsupported reification of update op ${ir.OpKind[op.kind]}`);
    }
  }
}

function reifyIrExpression(expr: o.Expression): o.Expression {
  if (!ir.isIrExpression(expr)) {
    return expr;
  }

  switch (expr.kind) {
    case ir.ExpressionKind.NextContext:
      return ng.nextContext(expr.steps);
    case ir.ExpressionKind.Reference:
      return ng.reference(expr.targetSlot.slot! + 1 + expr.offset);
    case ir.ExpressionKind.LexicalRead:
      throw new Error(`AssertionError: unresolved LexicalRead of ${expr.name}`);
    case ir.ExpressionKind.RestoreView:
      if (typeof expr.view === 'number') {
        throw new Error(`AssertionError: unresolved RestoreView`);
      }
      return ng.restoreView(expr.view);
    case ir.ExpressionKind.ResetView:
      return ng.resetView(expr.expr);
    case ir.ExpressionKind.GetCurrentView:
      return ng.getCurrentView();
    case ir.ExpressionKind.ReadVariable:
      if (expr.name === null) {
        throw new Error(`Read of unnamed variable ${expr.xref}`);
      }
      return o.variable(expr.name);
    case ir.ExpressionKind.ReadTemporaryExpr:
      if (expr.name === null) {
        throw new Error(`Read of unnamed temporary ${expr.xref}`);
      }
      return o.variable(expr.name);
    case ir.ExpressionKind.AssignTemporaryExpr:
      if (expr.name === null) {
        throw new Error(`Assign of unnamed temporary ${expr.xref}`);
      }
      return o.variable(expr.name).set(expr.expr);
    case ir.ExpressionKind.PureFunctionExpr:
      if (expr.fn === null) {
        throw new Error(`AssertionError: expected PureFunctions to have been extracted`);
      }
      return ng.pureFunction(expr.varOffset!, expr.fn, expr.args);
    case ir.ExpressionKind.PureFunctionParameterExpr:
      throw new Error(`AssertionError: expected PureFunctionParameterExpr to have been extracted`);
    case ir.ExpressionKind.PipeBinding:
      return ng.pipeBind(expr.targetSlot.slot!, expr.varOffset!, expr.args);
    case ir.ExpressionKind.PipeBindingVariadic:
      return ng.pipeBindV(expr.targetSlot.slot!, expr.varOffset!, expr.args);
    case ir.ExpressionKind.SanitizerExpr:
      return o.importExpr(sanitizerIdentifierMap.get(expr.fn)!);
    case ir.ExpressionKind.SlotLiteralExpr:
      return o.literal(expr.slot.slot!);
    default:
      throw new Error(`AssertionError: Unsupported reification of ir.Expression kind: ${
          ir.ExpressionKind[(expr as ir.Expression).kind]}`);
  }
}

/**
 * Listeners get turned into a function expression, which may or may not have the `$event`
 * parameter defined.
 */
function reifyListenerHandler(
    unit: CompilationUnit, name: string, handlerOps: ir.OpList<ir.UpdateOp>,
    consumesDollarEvent: boolean): o.FunctionExpr {
  // First, reify all instruction calls within `handlerOps`.
  reifyUpdateOperations(unit, handlerOps);

  // Next, extract all the `o.Statement`s from the reified operations. We can expect that at this
  // point, all operations have been converted to statements.
  const handlerStmts: o.Statement[] = [];
  for (const op of handlerOps) {
    if (op.kind !== ir.OpKind.Statement) {
      throw new Error(
          `AssertionError: expected reified statements, but found op ${ir.OpKind[op.kind]}`);
    }
    handlerStmts.push(op.statement);
  }

  // If `$event` is referenced, we need to generate it as a parameter.
  const params: o.FnParam[] = [];
  if (consumesDollarEvent) {
    // We need the `$event` parameter.
    params.push(new o.FnParam('$event'));
  }

  return o.fn(params, handlerStmts, undefined, undefined, name);
}
