import {AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {AssignmentService} from "@sharedModule/services/assignment.service";
import {ActivatedRoute, NavigationEnd, PRIMARY_OUTLET, Router} from "@angular/router";
import {filter, map} from "rxjs/operators";
import {AppService} from "@coreModule/services/app.service";
import {RoutesEnum} from "@coreModule/utils/routes.enum";
import {ElectronService} from "@coreModule/services/electron.service";
import {AppVersionInfo} from "@coreModule/info-objects/app-version.info";

@Component({
  selector: 'pdf-marker-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  providers: [AssignmentService]
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly title = 'PDF Marker';
  version: AppVersionInfo;
  // isLoading$ = this.appService.isLoading$;
  isLoading$: boolean;
  breadcrumbs: any;
  isMarkingPage: boolean;
  routeList: string[] = [];

  @ViewChild("content", {static: false})
  content: ElementRef;

  constructor(private router: Router,
              private activatedRoute: ActivatedRoute,
              private appService: AppService,
              private electronService: ElectronService) {
    this.appService.isLoading.subscribe(isloading => {
      console.log('Pre: ' + this.isLoading$);
      this.isLoading$ = isloading;
      console.log('Post: ' + this.isLoading$);
    });
  }

  ngOnInit() {
    this.electronService.getAppVersionObservable().subscribe((appVersionInfo: AppVersionInfo) => {
      if(appVersionInfo && appVersionInfo.version)
        this.version = appVersionInfo;
    });
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .pipe(map(() => this.activatedRoute))
      .pipe(map((route) => {
        while (route.firstChild) { route = route.firstChild; }
        return route;
      }))
      .pipe(filter(route => route.outlet === PRIMARY_OUTLET))
      .subscribe(route => {
        let snapshot = this.router.routerState.snapshot;
        this.breadcrumbs = [];
        this.routeList = [];
        let url = snapshot.url;
        let routeData = route.snapshot.data;

        let label = routeData['breadcrumb'];
        let params = snapshot.root.params;

        this.breadcrumbs = {
          url: url,
          label: label,
          params: params
        };

        this.breadcrumbs.url.split("/").forEach(route => {
          this.routeList.push(decodeURI(route))
        });

        if (this.router.url === RoutesEnum.ASSIGNMENT_MARKER)
          this.isMarkingPage = true;
        else
          this.isMarkingPage = false;
      });
  }

  ngAfterViewInit(): void {
    this.appService.setContainerElement(this.content);
  }

  ngOnDestroy(): void {
  }

}
