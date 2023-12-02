/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as o from '../../output/output_ast';
import {Identifiers as R3} from '../r3_identifiers';
import {convertFromMaybeForwardRefExpression, generateForwardRef, R3CompiledExpression} from '../util';
import {R3DirectiveMetadata, R3HostMetadata, R3QueryMetadata} from '../view/api';
import {createDirectiveType, createHostDirectivesMappingArray} from '../view/compiler';
import {asLiteral, conditionallyCreateDirectiveBindingLiteral, DefinitionMap} from '../view/util';

import {R3DeclareDirectiveMetadata, R3DeclareQueryMetadata} from './api';
import {toOptionalLiteralMap} from './util';

/**
 * Every time we make a breaking change to the declaration interface or partial-linker behavior, we
 * must update this constant to prevent old partial-linkers from incorrectly processing the
 * declaration.
 *
 * Do not include any prerelease in these versions as they are ignored.
 */
const MINIMUM_PARTIAL_LINKER_VERSION = '16.1.0';

/**
 * Compile a directive declaration defined by the `R3DirectiveMetadata`.
 */
export function compileDeclareDirectiveFromMetadata(meta: R3DirectiveMetadata):
    R3CompiledExpression {
  const definitionMap = createDirectiveDefinitionMap(meta);

  const expression = o.importExpr(R3.declareDirective).callFn([definitionMap.toLiteralMap()]);
  const type = createDirectiveType(meta);

  return {expression, type, statements: []};
}

/**
 * Gathers the declaration fields for a directive into a `DefinitionMap`. This allows for reusing
 * this logic for components, as they extend the directive metadata.
 */
export function createDirectiveDefinitionMap(meta: R3DirectiveMetadata):
    DefinitionMap<R3DeclareDirectiveMetadata> {
  const definitionMap = new DefinitionMap<R3DeclareDirectiveMetadata>();

  const hasTransformFunctions =
      Object.values(meta.inputs).some(input => input.transformFunction !== null);
  // Note: in order to allow consuming Angular libraries that have been compiled with 16.1+ in
  // Angular 16.0, we only force a minimum version of 16.1 if input transform feature as introduced
  // in 16.1 is actually used.
  const minVersion = hasTransformFunctions ? MINIMUM_PARTIAL_LINKER_VERSION : '14.0.0';

  definitionMap.set('minVersion', o.literal(minVersion));
  definitionMap.set('version', o.literal('0.0.0-PLACEHOLDER'));

  // e.g. `type: MyDirective`
  definitionMap.set('type', meta.type.value);

  if (meta.isStandalone) {
    definitionMap.set('isStandalone', o.literal(meta.isStandalone));
  }
  if (meta.isSignal) {
    definitionMap.set('isSignal', o.literal(meta.isSignal));
  }

  // e.g. `selector: 'some-dir'`
  if (meta.selector !== null) {
    definitionMap.set('selector', o.literal(meta.selector));
  }

  definitionMap.set('inputs', conditionallyCreateDirectiveBindingLiteral(meta.inputs, true));
  definitionMap.set('outputs', conditionallyCreateDirectiveBindingLiteral(meta.outputs));

  definitionMap.set('host', compileHostMetadata(meta.host));

  definitionMap.set('providers', meta.providers);

  if (meta.queries.length > 0) {
    definitionMap.set('queries', o.literalArr(meta.queries.map(compileQuery)));
  }

  if (meta.viewQueries.length > 0) {
    definitionMap.set('viewQueries', o.literalArr(meta.viewQueries.map(compileQuery)));
  }

  if (meta.exportAs !== null) {
    definitionMap.set('exportAs', asLiteral(meta.exportAs));
  }

  if (meta.usesInheritance) {
    definitionMap.set('usesInheritance', o.literal(true));
  }

  if (meta.lifecycle.usesOnChanges) {
    definitionMap.set('usesOnChanges', o.literal(true));
  }

  if (meta.hostDirectives?.length) {
    definitionMap.set('hostDirectives', createHostDirectives(meta.hostDirectives));
  }

  definitionMap.set('ngImport', o.importExpr(R3.core));

  return definitionMap;
}

/**
 * Compiles the metadata of a single query into its partial declaration form as declared
 * by `R3DeclareQueryMetadata`.
 */
function compileQuery(query: R3QueryMetadata): o.LiteralMapExpr {
  const meta = new DefinitionMap<R3DeclareQueryMetadata>();
  meta.set('propertyName', o.literal(query.propertyName));
  if (query.first) {
    meta.set('first', o.literal(true));
  }
  meta.set(
      'predicate',
      Array.isArray(query.predicate) ? asLiteral(query.predicate) :
                                       convertFromMaybeForwardRefExpression(query.predicate));
  if (!query.emitDistinctChangesOnly) {
    // `emitDistinctChangesOnly` is special because we expect it to be `true`.
    // Therefore we explicitly emit the field, and explicitly place it only when it's `false`.
    meta.set('emitDistinctChangesOnly', o.literal(false));
  } else {
    // The linker will assume that an absent `emitDistinctChangesOnly` flag is by default `true`.
  }
  if (query.descendants) {
    meta.set('descendants', o.literal(true));
  }
  meta.set('read', query.read);
  if (query.static) {
    meta.set('static', o.literal(true));
  }
  return meta.toLiteralMap();
}

/**
 * Compiles the host metadata into its partial declaration form as declared
 * in `R3DeclareDirectiveMetadata['host']`
 */
function compileHostMetadata(meta: R3HostMetadata): o.LiteralMapExpr|null {
  const hostMetadata = new DefinitionMap<NonNullable<R3DeclareDirectiveMetadata['host']>>();
  hostMetadata.set('attributes', toOptionalLiteralMap(meta.attributes, expression => expression));
  hostMetadata.set('listeners', toOptionalLiteralMap(meta.listeners, o.literal));
  hostMetadata.set('properties', toOptionalLiteralMap(meta.properties, o.literal));

  if (meta.specialAttributes.styleAttr) {
    hostMetadata.set('styleAttribute', o.literal(meta.specialAttributes.styleAttr));
  }
  if (meta.specialAttributes.classAttr) {
    hostMetadata.set('classAttribute', o.literal(meta.specialAttributes.classAttr));
  }

  if (hostMetadata.values.length > 0) {
    return hostMetadata.toLiteralMap();
  } else {
    return null;
  }
}

function createHostDirectives(hostDirectives: NonNullable<R3DirectiveMetadata['hostDirectives']>):
    o.LiteralArrayExpr {
  const expressions = hostDirectives.map(current => {
    const keys = [{
      key: 'directive',
      value: current.isForwardReference ? generateForwardRef(current.directive.type) :
                                          current.directive.type,
      quoted: false
    }];
    const inputsLiteral = current.inputs ? createHostDirectivesMappingArray(current.inputs) : null;
    const outputsLiteral =
        current.outputs ? createHostDirectivesMappingArray(current.outputs) : null;

    if (inputsLiteral) {
      keys.push({key: 'inputs', value: inputsLiteral, quoted: false});
    }

    if (outputsLiteral) {
      keys.push({key: 'outputs', value: outputsLiteral, quoted: false});
    }

    return o.literalMap(keys);
  });

  // If there's a forward reference, we generate a `function() { return [{directive: HostDir}] }`,
  // otherwise we can save some bytes by using a plain array, e.g. `[{directive: HostDir}]`.
  return o.literalArr(expressions);
}
