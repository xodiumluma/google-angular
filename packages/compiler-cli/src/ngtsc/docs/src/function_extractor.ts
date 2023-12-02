/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import ts from 'typescript';

import {EntryType, FunctionEntry, ParameterEntry} from './entities';
import {extractGenerics} from './generics_extractor';
import {extractJsDocDescription, extractJsDocTags, extractRawJsDoc} from './jsdoc_extractor';
import {extractResolvedTypeString} from './type_extractor';

export type FunctionLike = ts.FunctionDeclaration|ts.MethodDeclaration|ts.MethodSignature;

export class FunctionExtractor {
  constructor(private declaration: FunctionLike, private typeChecker: ts.TypeChecker) {}

  extract(): FunctionEntry {
    // TODO: is there any real situation in which the signature would not be available here?
    //     Is void a better type?
    const signature = this.typeChecker.getSignatureFromDeclaration(this.declaration);
    const returnType = signature ?
        this.typeChecker.typeToString(this.typeChecker.getReturnTypeOfSignature(signature)) :
        'unknown';

    return {
      params: this.extractAllParams(this.declaration.parameters),
      // We know that the function has a name here because we would have skipped it
      // already before getting to this point if it was anonymous.
      name: this.declaration.name!.getText(),
      returnType,
      entryType: EntryType.Function,
      generics: extractGenerics(this.declaration),
      description: extractJsDocDescription(this.declaration),
      jsdocTags: extractJsDocTags(this.declaration),
      rawComment: extractRawJsDoc(this.declaration),
    };
  }

  private extractAllParams(params: ts.NodeArray<ts.ParameterDeclaration>): ParameterEntry[] {
    return params.map(param => ({
                        name: param.name.getText(),
                        description: extractJsDocDescription(param),
                        type: extractResolvedTypeString(param, this.typeChecker),
                        isOptional: !!(param.questionToken || param.initializer),
                        isRestParam: !!param.dotDotDotToken,
                      }));
  }

  /** Gets all overloads for the function (excluding this extractor's FunctionDeclaration). */
  getOverloads(): ts.FunctionDeclaration[] {
    const overloads = [];

    // The symbol for this declaration has reference to the other function declarations for
    // the overloads.
    const symbol = this.getSymbol();

    const declarationCount = symbol?.declarations?.length ?? 0;
    if (declarationCount > 1) {
      // Stop iterating before the final declaration, which is the actual implementation.
      for (let i = 0; i < declarationCount - 1; i++) {
        const overloadDeclaration = symbol?.declarations?.[i];

        // Skip the declaration we started with.
        if (overloadDeclaration?.pos === this.declaration.pos) continue;

        if (overloadDeclaration && ts.isFunctionDeclaration(overloadDeclaration) &&
            overloadDeclaration.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword)) {
          overloads.push(overloadDeclaration);
        }
      }
    }

    return overloads;
  }

  private getSymbol(): ts.Symbol|undefined {
    return this.typeChecker.getSymbolsInScope(this.declaration, ts.SymbolFlags.Function)
        .find(s => s.name === this.declaration.name?.getText());
  }
}
