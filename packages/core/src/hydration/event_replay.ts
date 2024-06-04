/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {
  EventDispatcher,
  EarlyJsactionDataContainer,
  EventContract,
  EventContractContainer,
  registerDispatcher,
  isSupportedEvent,
  isCaptureEvent,
} from '@angular/core/primitives/event-dispatch';

import {APP_BOOTSTRAP_LISTENER, ApplicationRef, whenStable} from '../application/application_ref';
import {APP_ID} from '../application/application_tokens';
import {ENVIRONMENT_INITIALIZER, Injector} from '../di';
import {inject} from '../di/injector_compatibility';
import {Provider} from '../di/interface/provider';
import {setDisableEventReplayImpl} from '../render3/instructions/listener';
import {TNode, TNodeType} from '../render3/interfaces/node';
import {RElement, RNode} from '../render3/interfaces/renderer_dom';
import {CLEANUP, LView, TView} from '../render3/interfaces/view';
import {isPlatformBrowser} from '../render3/util/misc_utils';
import {unwrapRNode} from '../render3/util/view_utils';

import {IS_EVENT_REPLAY_ENABLED} from './tokens';

export const EVENT_REPLAY_ENABLED_DEFAULT = false;
export const CONTRACT_PROPERTY = 'ngContracts';

declare global {
  var ngContracts: {[key: string]: EarlyJsactionDataContainer};
  interface Element {
    __jsaction_fns: Map<string, Function[]> | undefined;
  }
}

// TODO: Upstream this back into event-dispatch.
function getJsactionData(container: EarlyJsactionDataContainer) {
  return container._ejsa;
}

const JSACTION_ATTRIBUTE = 'jsaction';

/**
 * A set of DOM elements with `jsaction` attributes.
 */
const jsactionSet = new Set<Element>();

/**
 * Returns a set of providers required to setup support for event replay.
 * Requires hydration to be enabled separately.
 */
export function withEventReplay(): Provider[] {
  return [
    {
      provide: IS_EVENT_REPLAY_ENABLED,
      useValue: true,
    },
    {
      provide: ENVIRONMENT_INITIALIZER,
      useValue: () => {
        setDisableEventReplayImpl((rEl: RElement, eventName: string, listenerFn: VoidFunction) => {
          if (rEl.hasAttribute(JSACTION_ATTRIBUTE)) {
            const el = rEl as unknown as Element;
            // We don't immediately remove the attribute here because
            // we need it for replay that happens after hydration.
            if (!jsactionSet.has(el)) {
              jsactionSet.add(el);
              el.__jsaction_fns = new Map();
            }
            const eventMap = el.__jsaction_fns!;
            if (!eventMap.has(eventName)) {
              eventMap.set(eventName, []);
            }
            eventMap.get(eventName)!.push(listenerFn);
          }
        });
      },
      multi: true,
    },
    {
      provide: APP_BOOTSTRAP_LISTENER,
      useFactory: () => {
        if (isPlatformBrowser()) {
          const injector = inject(Injector);
          const appRef = inject(ApplicationRef);
          return () => {
            // Kick off event replay logic once hydration for the initial part
            // of the application is completed. This timing is similar to the unclaimed
            // dehydrated views cleanup timing.
            whenStable(appRef).then(() => {
              const appId = injector.get(APP_ID);
              // This is set in packages/platform-server/src/utils.ts
              // Note: globalThis[CONTRACT_PROPERTY] may be undefined in case Event Replay feature
              // is enabled, but there are no events configured in an application.
              const container = globalThis[CONTRACT_PROPERTY]?.[appId];
              const earlyJsactionData = getJsactionData(container);
              if (earlyJsactionData) {
                const eventContract = new EventContract(
                  new EventContractContainer(earlyJsactionData.c),
                );
                for (const et of earlyJsactionData.et) {
                  eventContract.addEvent(et);
                }
                for (const et of earlyJsactionData.etc) {
                  eventContract.addEvent(et);
                }
                eventContract.replayEarlyEvents(container);
                const dispatcher = new EventDispatcher(handleEvent);
                registerDispatcher(eventContract, dispatcher);
                for (const el of jsactionSet) {
                  el.removeAttribute(JSACTION_ATTRIBUTE);
                  el.__jsaction_fns = undefined;
                }
                // After hydration, we shouldn't need to do anymore work related to
                // event replay anymore.
                setDisableEventReplayImpl(() => {});
              }
            });
          };
        }
        return () => {}; // noop for the server code
      },
      multi: true,
    },
  ];
}

/**
 * Extracts information about all DOM events (added in a template) registered on elements in a give
 * LView. Maps collected events to a corresponding DOM element (an element is used as a key).
 */
export function collectDomEventsInfo(
  tView: TView,
  lView: LView,
  eventTypesToReplay: {regular: Set<string>; capture: Set<string>},
): Map<Element, string[]> {
  const events = new Map<Element, string[]>();
  const lCleanup = lView[CLEANUP];
  const tCleanup = tView.cleanup;
  if (!tCleanup || !lCleanup) {
    return events;
  }
  for (let i = 0; i < tCleanup.length; ) {
    const firstParam = tCleanup[i++];
    const secondParam = tCleanup[i++];
    if (typeof firstParam !== 'string') {
      continue;
    }
    const name: string = firstParam;
    if (!isSupportedEvent(name)) {
      continue;
    }
    if (isCaptureEvent(name)) {
      eventTypesToReplay.capture.add(name);
    } else {
      eventTypesToReplay.regular.add(name);
    }
    const listenerElement = unwrapRNode(lView[secondParam]) as any as Element;
    i++; // move the cursor to the next position (location of the listener idx)
    const useCaptureOrIndx = tCleanup[i++];
    // if useCaptureOrIndx is boolean then report it as is.
    // if useCaptureOrIndx is positive number then it in unsubscribe method
    // if useCaptureOrIndx is negative number then it is a Subscription
    const isDomEvent = typeof useCaptureOrIndx === 'boolean' || useCaptureOrIndx >= 0;
    if (!isDomEvent) {
      continue;
    }
    if (!events.has(listenerElement)) {
      events.set(listenerElement, [name]);
    } else {
      events.get(listenerElement)!.push(name);
    }
  }
  return events;
}

export function setJSActionAttribute(
  tNode: TNode,
  rNode: RNode,
  nativeElementToEvents: Map<Element, string[]>,
) {
  if (tNode.type & TNodeType.Element) {
    const nativeElement = unwrapRNode(rNode) as Element;
    const events = nativeElementToEvents.get(nativeElement) ?? [];
    const parts = events.map((event) => `${event}:`);
    if (parts.length > 0) {
      nativeElement.setAttribute(JSACTION_ATTRIBUTE, parts.join(';'));
    }
  }
}

function handleEvent(event: Event) {
  const handlerFns = (event.currentTarget as Element)?.__jsaction_fns?.get(event.type);
  if (!handlerFns) {
    return;
  }
  for (const handler of handlerFns) {
    handler(event);
  }
}
