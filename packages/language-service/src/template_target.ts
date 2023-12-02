/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {ParseSourceSpan, ParseSpan, TmplAstBoundEvent} from '@angular/compiler';
import {NgCompiler} from '@angular/compiler-cli/src/ngtsc/core';
import {findFirstMatchingNode} from '@angular/compiler-cli/src/ngtsc/typecheck/src/comments';
import * as e from '@angular/compiler/src/expression_parser/ast';  // e for expression AST
import * as t from '@angular/compiler/src/render3/r3_ast';         // t for template AST
import tss from 'typescript/lib/tsserverlibrary';

import {isBoundEventWithSyntheticHandler, isTemplateNodeWithKeyAndValue, isWithin, isWithinKeyValue, TemplateInfo} from './utils';

/**
 * Contextual information for a target position within the template.
 */
export interface TemplateTarget {
  /**
   * Target position within the template.
   */
  position: number;

  /**
   * The template (or AST expression) node or nodes closest to the search position.
   */
  context: TargetContext;

  /**
   * The `t.Template` which contains the found node or expression (or `null` if in the root
   * template).
   */
  template: t.Template|null;

  /**
   * The immediate parent node of the targeted node.
   */
  parent: t.Node|e.AST|null;
}

/**
 * A node or nodes targeted at a given position in the template, including potential contextual
 * information about the specific aspect of the node being referenced.
 *
 * Some nodes have multiple interior contexts. For example, `t.Element` nodes have both a tag name
 * as well as a body, and a given position definitively points to one or the other. `TargetNode`
 * captures the node itself, as well as this additional contextual disambiguation.
 */
export type TargetContext = SingleNodeTarget|MultiNodeTarget;

/** Contexts which logically target only a single node in the template AST. */
export type SingleNodeTarget = RawExpression|CallExpressionInArgContext|RawTemplateNode|
    ElementInBodyContext|ElementInTagContext|AttributeInKeyContext|AttributeInValueContext;

/**
 * Contexts which logically target multiple nodes in the template AST, which cannot be
 * disambiguated given a single position because they are all equally relevant. For example, in the
 * banana-in-a-box syntax `[(ngModel)]="formValues.person"`, the position in the template for the
 * key `ngModel` refers to both the bound event `ngModelChange` and the input `ngModel`.
 */
export type MultiNodeTarget = TwoWayBindingContext;

/**
 * Differentiates the various kinds of `TargetNode`s.
 */
export enum TargetNodeKind {
  RawExpression,
  CallExpressionInArgContext,
  RawTemplateNode,
  ElementInTagContext,
  ElementInBodyContext,
  AttributeInKeyContext,
  AttributeInValueContext,
  TwoWayBindingContext,
}

/**
 * An `e.AST` expression that's targeted at a given position, with no additional context.
 */
export interface RawExpression {
  kind: TargetNodeKind.RawExpression;
  node: e.AST;
  parents: e.AST[];
}

/**
 * An `e.Call` expression with the cursor in a position where an argument could appear.
 *
 * This is returned when the only matching node is the method call expression, but the cursor is
 * within the method call parentheses. For example, in the expression `foo(|)` there is no argument
 * expression that the cursor could be targeting, but the cursor is in a position where one could
 * appear.
 */
export interface CallExpressionInArgContext {
  kind: TargetNodeKind.CallExpressionInArgContext;
  node: e.Call|e.SafeCall;
}

/**
 * A `t.Node` template node that's targeted at a given position, with no additional context.
 */
export interface RawTemplateNode {
  kind: TargetNodeKind.RawTemplateNode;
  node: t.Node;
}

/**
 * A `t.Element` (or `t.Template`) element node that's targeted, where the given position is within
 * the tag name.
 */
export interface ElementInTagContext {
  kind: TargetNodeKind.ElementInTagContext;
  node: t.Element|t.Template;
}

/**
 * A `t.Element` (or `t.Template`) element node that's targeted, where the given position is within
 * the element body.
 */
export interface ElementInBodyContext {
  kind: TargetNodeKind.ElementInBodyContext;
  node: t.Element|t.Template;
}

export interface AttributeInKeyContext {
  kind: TargetNodeKind.AttributeInKeyContext;
  node: t.TextAttribute|t.BoundAttribute|t.BoundEvent;
}

export interface AttributeInValueContext {
  kind: TargetNodeKind.AttributeInValueContext;
  node: t.TextAttribute|t.BoundAttribute|t.BoundEvent;
}

/**
 * A `t.BoundAttribute` and `t.BoundEvent` pair that are targeted, where the given position is
 * within the key span of both.
 */
export interface TwoWayBindingContext {
  kind: TargetNodeKind.TwoWayBindingContext;
  nodes: [t.BoundAttribute, t.BoundEvent];
}

/**
 * Special marker AST that can be used when the cursor is within the `sourceSpan` but not
 * the key or value span of a node with key/value spans.
 */
class OutsideKeyValueMarkerAst extends e.AST {
  override visit(): null {
    return null;
  }
}

/**
 * This special marker is added to the path when the cursor is within the sourceSpan but not the key
 * or value span of a node with key/value spans.
 */
const OUTSIDE_K_V_MARKER =
    new OutsideKeyValueMarkerAst(new ParseSpan(-1, -1), new e.AbsoluteSourceSpan(-1, -1));

/**
 * Return the template AST node or expression AST node that most accurately
 * represents the node at the specified cursor `position`.
 *
 * @param template AST tree of the template
 * @param position target cursor position
 */
export function getTargetAtPosition(template: t.Node[], position: number): TemplateTarget|null {
  const path = TemplateTargetVisitor.visitTemplate(template, position);
  if (path.length === 0) {
    return null;
  }

  const candidate = path[path.length - 1];
  // Walk up the result nodes to find the nearest `t.Template` which contains the targeted node.
  let context: t.Template|null = null;
  for (let i = path.length - 2; i >= 0; i--) {
    const node = path[i];
    if (node instanceof t.Template) {
      context = node;
      break;
    }
  }

  // Given the candidate node, determine the full targeted context.
  let nodeInContext: TargetContext;
  if ((candidate instanceof e.Call || candidate instanceof e.SafeCall) &&
      isWithin(position, candidate.argumentSpan)) {
    nodeInContext = {
      kind: TargetNodeKind.CallExpressionInArgContext,
      node: candidate,
    };
  } else if (candidate instanceof e.AST) {
    const parents = path.filter((value: e.AST|t.Node): value is e.AST => value instanceof e.AST);
    // Remove the current node from the parents list.
    parents.pop();

    nodeInContext = {
      kind: TargetNodeKind.RawExpression,
      node: candidate,
      parents,
    };
  } else if (candidate instanceof t.Element) {
    // Elements have two contexts: the tag context (position is within the element tag) or the
    // element body context (position is outside of the tag name, but still in the element).

    // Calculate the end of the element tag name. Any position beyond this is in the element body.
    const tagEndPos =
        candidate.sourceSpan.start.offset + 1 /* '<' element open */ + candidate.name.length;
    if (position > tagEndPos) {
      // Position is within the element body
      nodeInContext = {
        kind: TargetNodeKind.ElementInBodyContext,
        node: candidate,
      };
    } else {
      nodeInContext = {
        kind: TargetNodeKind.ElementInTagContext,
        node: candidate,
      };
    }
  } else if (
      (candidate instanceof t.BoundAttribute || candidate instanceof t.BoundEvent ||
       candidate instanceof t.TextAttribute) &&
      candidate.keySpan !== undefined) {
    const previousCandidate = path[path.length - 2];
    if (candidate instanceof t.BoundEvent && previousCandidate instanceof t.BoundAttribute &&
        candidate.name === previousCandidate.name + 'Change') {
      const boundAttribute: t.BoundAttribute = previousCandidate;
      const boundEvent: t.BoundEvent = candidate;
      nodeInContext = {
        kind: TargetNodeKind.TwoWayBindingContext,
        nodes: [boundAttribute, boundEvent],
      };
    } else if (isWithin(position, candidate.keySpan)) {
      nodeInContext = {
        kind: TargetNodeKind.AttributeInKeyContext,
        node: candidate,
      };
    } else {
      nodeInContext = {
        kind: TargetNodeKind.AttributeInValueContext,
        node: candidate,
      };
    }
  } else {
    nodeInContext = {
      kind: TargetNodeKind.RawTemplateNode,
      node: candidate,
    };
  }

  let parent: t.Node|e.AST|null = null;
  if (nodeInContext.kind === TargetNodeKind.TwoWayBindingContext && path.length >= 3) {
    parent = path[path.length - 3];
  } else if (path.length >= 2) {
    parent = path[path.length - 2];
  }

  return {position, context: nodeInContext, template: context, parent};
}

function findFirstMatchingNodeForSourceSpan(
    tcb: tss.Node, sourceSpan: ParseSourceSpan|e.AbsoluteSourceSpan) {
  return findFirstMatchingNode(
      tcb,
      {
        withSpan: sourceSpan,
        filter: (node: tss.Node): node is tss.Node => true,
      },
  );
}

/**
 * A tcb nodes for the template at a given position, include the tcb node of the template.
 */
interface TcbNodesInfoForTemplate {
  componentTcbNode: tss.Node;
  nodes: tss.Node[];
}

/**
 * Return the nodes in `TCB` of the node at the specified cursor `position`.
 *
 */
export function getTcbNodesOfTemplateAtPosition(
    templateInfo: TemplateInfo, position: number, compiler: NgCompiler): TcbNodesInfoForTemplate|
    null {
  const target = getTargetAtPosition(templateInfo.template, position);
  if (target === null) {
    return null;
  }

  const tcb = compiler.getTemplateTypeChecker().getTypeCheckBlock(templateInfo.component);
  if (tcb === null) {
    return null;
  }

  const tcbNodes: (tss.Node|null)[] = [];
  if (target.context.kind === TargetNodeKind.RawExpression) {
    const targetNode = target.context.node;
    if (targetNode instanceof e.PropertyRead) {
      const tsNode = findFirstMatchingNode(tcb, {
        withSpan: targetNode.nameSpan,
        filter: (node): node is tss.PropertyAccessExpression => tss.isPropertyAccessExpression(node)
      });
      tcbNodes.push(tsNode?.name ?? null);
    } else {
      tcbNodes.push(findFirstMatchingNodeForSourceSpan(tcb, target.context.node.sourceSpan));
    }
  } else if (target.context.kind === TargetNodeKind.TwoWayBindingContext) {
    const targetNodes = target.context.nodes.map(n => n.sourceSpan).map((node) => {
      return findFirstMatchingNodeForSourceSpan(tcb, node);
    });
    tcbNodes.push(...targetNodes);
  } else {
    tcbNodes.push(findFirstMatchingNodeForSourceSpan(tcb, target.context.node.sourceSpan));
  }

  return {
    nodes: tcbNodes.filter((n): n is tss.Node => n !== null),
    componentTcbNode: tcb,
  };
}

/**
 * Visitor which, given a position and a template, identifies the node within the template at that
 * position, as well as records the path of increasingly nested nodes that were traversed to reach
 * that position.
 */
class TemplateTargetVisitor implements t.Visitor {
  // We need to keep a path instead of the last node because we might need more
  // context for the last node, for example what is the parent node?
  readonly path: Array<t.Node|e.AST> = [];

  static visitTemplate(template: t.Node[], position: number): Array<t.Node|e.AST> {
    const visitor = new TemplateTargetVisitor(position);
    visitor.visitAll(template);
    const {path} = visitor;

    const strictPath = path.filter(v => v !== OUTSIDE_K_V_MARKER);
    const candidate = strictPath[strictPath.length - 1];
    const matchedASourceSpanButNotAKvSpan = path.some(v => v === OUTSIDE_K_V_MARKER);
    if (matchedASourceSpanButNotAKvSpan &&
        (candidate instanceof t.Template || candidate instanceof t.Element)) {
      // Template nodes with key and value spans are always defined on a `t.Template` or
      // `t.Element`. If we found a node on a template with a `sourceSpan` that includes the cursor,
      // it is possible that we are outside the k/v spans (i.e. in-between them). If this is the
      // case and we do not have any other candidate matches on the `t.Element` or `t.Template`, we
      // want to return no results. Otherwise, the `t.Element`/`t.Template` result is incorrect for
      // that cursor position.
      return [];
    }
    return strictPath;
  }

  // Position must be absolute in the source file.
  private constructor(private readonly position: number) {}

  visit(node: t.Node) {
    const {start, end} = getSpanIncludingEndTag(node);
    if (end !== null && !isWithin(this.position, {start, end})) {
      return;
    }

    const last: t.Node|e.AST|undefined = this.path[this.path.length - 1];
    const withinKeySpanOfLastNode =
        last && isTemplateNodeWithKeyAndValue(last) && isWithin(this.position, last.keySpan);
    const withinKeySpanOfCurrentNode =
        isTemplateNodeWithKeyAndValue(node) && isWithin(this.position, node.keySpan);
    if (withinKeySpanOfLastNode && !withinKeySpanOfCurrentNode) {
      // We've already identified that we are within a `keySpan` of a node.
      // Unless we are _also_ in the `keySpan` of the current node (happens with two way bindings),
      // we should stop processing nodes at this point to prevent matching any other nodes. This can
      // happen when the end span of a different node touches the start of the keySpan for the
      // candidate node. Because our `isWithin` logic is inclusive on both ends, we can match both
      // nodes.
      return;
    }
    if (last instanceof t.UnknownBlock && isWithin(this.position, last.nameSpan)) {
      // Autocompletions such as `@\nfoo`, where a newline follows a bare `@`, would not work
      // because the language service visitor sees us inside the subsequent text node. We deal with
      // this with using a special-case: if we are completing inside the name span, we don't
      // continue to the subsequent text node.
      return;
    }

    if (isTemplateNodeWithKeyAndValue(node) && !isWithinKeyValue(this.position, node)) {
      // If cursor is within source span but not within key span or value span,
      // do not return the node.
      this.path.push(OUTSIDE_K_V_MARKER);
    } else {
      this.path.push(node);
      node.visit(this);
    }
  }

  visitElement(element: t.Element) {
    this.visitElementOrTemplate(element);
  }


  visitTemplate(template: t.Template) {
    this.visitElementOrTemplate(template);
  }

  visitElementOrTemplate(element: t.Template|t.Element) {
    this.visitAll(element.attributes);
    this.visitAll(element.inputs);
    // We allow the path to contain both the `t.BoundAttribute` and `t.BoundEvent` for two-way
    // bindings but do not want the path to contain both the `t.BoundAttribute` with its
    // children when the position is in the value span because we would then logically create a path
    // that also contains the `PropertyWrite` from the `t.BoundEvent`. This early return condition
    // ensures we target just `t.BoundAttribute` for this case and exclude `t.BoundEvent` children.
    if (this.path[this.path.length - 1] !== element &&
        !(this.path[this.path.length - 1] instanceof t.BoundAttribute)) {
      return;
    }
    this.visitAll(element.outputs);
    if (element instanceof t.Template) {
      this.visitAll(element.templateAttrs);
    }
    this.visitAll(element.references);
    if (element instanceof t.Template) {
      this.visitAll(element.variables);
    }

    // If we get here and have not found a candidate node on the element itself, proceed with
    // looking for a more specific node on the element children.
    if (this.path[this.path.length - 1] !== element) {
      return;
    }

    this.visitAll(element.children);
  }

  visitContent(content: t.Content) {
    t.visitAll(this, content.attributes);
  }

  visitVariable(variable: t.Variable) {
    // Variable has no template nodes or expression nodes.
  }

  visitReference(reference: t.Reference) {
    // Reference has no template nodes or expression nodes.
  }

  visitTextAttribute(attribute: t.TextAttribute) {
    // Text attribute has no template nodes or expression nodes.
  }

  visitBoundAttribute(attribute: t.BoundAttribute) {
    if (attribute.valueSpan !== undefined) {
      this.visitBinding(attribute.value);
    }
  }

  visitBoundEvent(event: t.BoundEvent) {
    if (!isBoundEventWithSyntheticHandler(event)) {
      this.visitBinding(event.handler);
    }
  }

  visitText(text: t.Text) {
    // Text has no template nodes or expression nodes.
  }

  visitBoundText(text: t.BoundText) {
    this.visitBinding(text.value);
  }

  visitIcu(icu: t.Icu) {
    for (const boundText of Object.values(icu.vars)) {
      this.visit(boundText);
    }
    for (const boundTextOrText of Object.values(icu.placeholders)) {
      this.visit(boundTextOrText);
    }
  }

  visitDeferredBlock(deferred: t.DeferredBlock) {
    deferred.visitAll(this);
  }

  visitDeferredBlockPlaceholder(block: t.DeferredBlockPlaceholder) {
    this.visitAll(block.children);
  }

  visitDeferredBlockError(block: t.DeferredBlockError) {
    this.visitAll(block.children);
  }

  visitDeferredBlockLoading(block: t.DeferredBlockLoading) {
    this.visitAll(block.children);
  }

  visitDeferredTrigger(trigger: t.DeferredTrigger) {
    if (trigger instanceof t.BoundDeferredTrigger) {
      this.visitBinding(trigger.value);
    }
  }

  visitSwitchBlock(block: t.SwitchBlock) {
    this.visitBinding(block.expression);
    this.visitAll(block.cases);
    this.visitAll(block.unknownBlocks);
  }

  visitSwitchBlockCase(block: t.SwitchBlockCase) {
    block.expression && this.visitBinding(block.expression);
    this.visitAll(block.children);
  }

  visitForLoopBlock(block: t.ForLoopBlock) {
    this.visit(block.item);
    this.visitAll(Object.values(block.contextVariables));
    this.visitBinding(block.expression);
    this.visitBinding(block.trackBy);
    this.visitAll(block.children);
    block.empty && this.visit(block.empty);
  }

  visitForLoopBlockEmpty(block: t.ForLoopBlockEmpty) {
    this.visitAll(block.children);
  }

  visitIfBlock(block: t.IfBlock) {
    this.visitAll(block.branches);
  }

  visitIfBlockBranch(block: t.IfBlockBranch) {
    block.expression && this.visitBinding(block.expression);
    block.expressionAlias && this.visit(block.expressionAlias);
    this.visitAll(block.children);
  }

  visitUnknownBlock(block: t.UnknownBlock) {}

  visitAll(nodes: t.Node[]) {
    for (const node of nodes) {
      this.visit(node);
    }
  }

  private visitBinding(expression: e.AST) {
    const visitor = new ExpressionVisitor(this.position);
    visitor.visit(expression, this.path);
  }
}

class ExpressionVisitor extends e.RecursiveAstVisitor {
  // Position must be absolute in the source file.
  constructor(private readonly position: number) {
    super();
  }

  override visit(node: e.AST, path: Array<t.Node|e.AST>) {
    if (node instanceof e.ASTWithSource) {
      // In order to reduce noise, do not include `ASTWithSource` in the path.
      // For the purpose of source spans, there is no difference between
      // `ASTWithSource` and underlying node that it wraps.
      node = node.ast;
    }
    // The third condition is to account for the implicit receiver, which should
    // not be visited.
    if (isWithin(this.position, node.sourceSpan) && !(node instanceof e.ImplicitReceiver)) {
      path.push(node);
      node.visit(this, path);
    }
  }
}

function getSpanIncludingEndTag(ast: t.Node) {
  const result = {
    start: ast.sourceSpan.start.offset,
    end: ast.sourceSpan.end.offset,
  };
  // For Element and Template node, sourceSpan.end is the end of the opening
  // tag. For the purpose of language service, we need to actually recognize
  // the end of the closing tag. Otherwise, for situation like
  // <my-component></my-comp¦onent> where the cursor is in the closing tag
  // we will not be able to return any information.
  if (ast instanceof t.Element || ast instanceof t.Template) {
    if (ast.endSourceSpan) {
      result.end = ast.endSourceSpan.end.offset;
    } else if (ast.children.length > 0) {
      // If the AST has children but no end source span, then it is an unclosed element with an end
      // that should be the end of the last child.
      result.end = getSpanIncludingEndTag(ast.children[ast.children.length - 1]).end;
    } else {
      // This is likely a self-closing tag with no children so the `sourceSpan.end` is correct.
    }
  }
  return result;
}
