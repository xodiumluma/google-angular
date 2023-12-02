import { BrowserModule } from '@angular/platform-browser';
import { ErrorHandler, NgModule } from '@angular/core';
import { HttpClientModule } from '@angular/common/http';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ServiceWorkerModule } from '@angular/service-worker';

import { Location, LocationStrategy, PathLocationStrategy } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatIconRegistry } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';

import { svg } from 'app/shared/security';
import { trustedResourceUrl, unwrapResourceUrl } from 'safevalues';

import { AppComponent } from 'app/app.component';
import { CustomIconRegistry, SVG_ICONS } from 'app/shared/custom-icon-registry';
import { Deployment } from 'app/shared/deployment.service';
import { CookiesPopupComponent } from 'app/layout/cookies-popup/cookies-popup.component';
import { DocViewerComponent } from 'app/layout/doc-viewer/doc-viewer.component';
import { DtComponent } from 'app/layout/doc-viewer/dt.component';
import { ModeBannerComponent } from 'app/layout/mode-banner/mode-banner.component';
import { AnalyticsService } from 'app/shared/analytics.service';
import { Logger } from 'app/shared/logger.service';
import { LocationService } from 'app/shared/location.service';
import { STORAGE_PROVIDERS } from 'app/shared/storage.service';
import { NavigationService } from 'app/navigation/navigation.service';
import { DocumentService } from 'app/documents/document.service';
import { SearchService } from 'app/search/search.service';
import { TopMenuComponent } from 'app/layout/top-menu/top-menu.component';
import { FooterComponent } from 'app/layout/footer/footer.component';
import { NavMenuComponent } from 'app/layout/nav-menu/nav-menu.component';
import { NavItemComponent } from 'app/layout/nav-item/nav-item.component';
import { ReportingErrorHandler } from 'app/shared/reporting-error-handler';
import { ScrollService } from 'app/shared/scroll.service';
import { ScrollSpyService } from 'app/shared/scroll-spy.service';
import { SearchBoxComponent } from 'app/search/search-box/search-box.component';
import { NotificationComponent } from 'app/layout/notification/notification.component';
import { TocService } from 'app/shared/toc.service';
import { CurrentDateToken, currentDateProvider } from 'app/shared/current-date';
import { WindowToken, windowProvider } from 'app/shared/window';

import { CustomElementsModule } from 'app/custom-elements/custom-elements.module';
import { SharedModule } from 'app/shared/shared.module';
import { ThemeToggleComponent } from 'app/shared/theme-picker/theme-toggle.component';

import { environment } from '../environments/environment';

// These are the hardcoded inline svg sources to be used by the `<mat-icon>` component.
/* eslint-disable max-len */
export const svgIconProviders = [
  {
    provide: SVG_ICONS,
    useValue: {
      name: 'close',
      svgSource: svg`<svg focusable="false" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  <path d="M0 0h24v24H0z" fill="none" />
</svg>`,
    },
    multi: true,
  },
  {
    provide: SVG_ICONS,
    useValue: {
      name: 'insert_comment',
      svgSource: svg`<svg focusable="false" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
  <path d="M0 0h24v24H0z" fill="none" />
</svg>`,
    },
    multi: true,
  },
  {
    provide: SVG_ICONS,
    useValue: {
      name: 'keyboard_arrow_right',
      svgSource: svg`<svg focusable="false" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M8.59 16.34l4.58-4.59-4.58-4.59L10 5.75l6 6-6 6z" />
</svg>`,
    },
    multi: true,
  },
  {
    provide: SVG_ICONS,
    useValue: {
      name: 'menu',
      svgSource: svg`<svg focusable="false" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
</svg>`,
    },
    multi: true,
  },

  // Namespace: logos
  {
    provide: SVG_ICONS,
    useValue: {
      namespace: 'logos',
      name: 'github',
      svgSource:
          svg`<svg focusable="false" viewBox="0 0 51.8 50.4" xmlns="http://www.w3.org/2000/svg">
  <path d="M25.9,0.2C11.8,0.2,0.3,11.7,0.3,25.8c0,11.3,7.3,20.9,17.5,24.3c1.3,0.2,1.7-0.6,1.7-1.2c0-0.6,0-2.6,0-4.8
           c-7.1,1.5-8.6-3-8.6-3c-1.2-3-2.8-3.7-2.8-3.7c-2.3-1.6,0.2-1.6,0.2-1.6c2.6,0.2,3.9,2.6,3.9,2.6c2.3,3.9,6,2.8,7.5,2.1
           c0.2-1.7,0.9-2.8,1.6-3.4c-5.7-0.6-11.7-2.8-11.7-12.7c0-2.8,1-5.1,2.6-6.9c-0.3-0.7-1.1-3.3,0.3-6.8c0,0,2.1-0.7,7,2.6
           c2-0.6,4.2-0.9,6.4-0.9c2.2,0,4.4,0.3,6.4,0.9c4.9-3.3,7-2.6,7-2.6c1.4,3.5,0.5,6.1,0.3,6.8c1.6,1.8,2.6,4.1,2.6,6.9
           c0,9.8-6,12-11.7,12.6c0.9,0.8,1.7,2.4,1.7,4.7c0,3.4,0,6.2,0,7c0,0.7,0.5,1.5,1.8,1.2c10.2-3.4,17.5-13,17.5-24.3
           C51.5,11.7,40.1,0.2,25.9,0.2z" />
</svg>`,
    },
    multi: true,
  },
  {
    provide: SVG_ICONS,
    useValue: {
      namespace: 'logos',
      name: 'twitter',
      svgSource: svg`<svg focusable="false" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>`,
    },
    multi: true,
  },
  {
    provide: SVG_ICONS,
    useValue: {
      namespace: 'logos',
      name: 'youtube',
      svgSource: svg`<svg focusable="false" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77
           C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42
           c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z" />
</svg>`,
    },
    multi: true,
  },
];
/* eslint-enable max-len */

@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule.withConfig({disableAnimations: AppComponent.reducedMotion}),
    CustomElementsModule,
    HttpClientModule,
    MatButtonModule,
    MatProgressBarModule,
    MatSidenavModule,
    MatToolbarModule,
    SharedModule,
    ServiceWorkerModule.register(
        // Make sure service worker is loaded with a TrustedScriptURL
        unwrapResourceUrl(trustedResourceUrl`/ngsw-worker.js`) as string,
        {enabled: environment.production}),
  ],
  declarations: [
    AppComponent,
    CookiesPopupComponent,
    DocViewerComponent,
    DtComponent,
    FooterComponent,
    ModeBannerComponent,
    NavMenuComponent,
    NavItemComponent,
    SearchBoxComponent,
    NotificationComponent,
    TopMenuComponent,
    ThemeToggleComponent,
  ],
  providers: [
    AnalyticsService,
    Deployment,
    DocumentService,
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
    Logger,
    Location,
    { provide: LocationStrategy, useClass: PathLocationStrategy },
    LocationService,
    { provide: MatIconRegistry, useClass: CustomIconRegistry },
    NavigationService,
    ScrollService,
    ScrollSpyService,
    SearchService,
    STORAGE_PROVIDERS,
    svgIconProviders,
    TocService,
    { provide: CurrentDateToken, useFactory: currentDateProvider },
    { provide: WindowToken, useFactory: windowProvider },
  ],
  bootstrap: [ AppComponent ]
})
export class AppModule { }
