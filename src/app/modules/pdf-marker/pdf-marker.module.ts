import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';

import {PdfMarkerRoutingModule} from './pdf-marker-routing.module';
import {SharedModule} from "@sharedModule/shared.module";
import {LayoutModule} from "@layoutModule/layout.module";
import {HomeComponent} from '@pdfMarkerModule/components/home/home.component';
import {WelcomeComponent} from '@pdfMarkerModule/components/welcome/welcome.component';
import {ImportComponent} from '@pdfMarkerModule/components/import/import.component';
import {SettingsComponent} from '@pdfMarkerModule/components/settings/settings.component';
import {AssignmentOverviewComponent} from '@pdfMarkerModule/components/assignment-overview/assignment-overview.component';
import {SettingsService} from "@pdfMarkerModule/services/settings.service";
import {ImportService} from "@pdfMarkerModule/services/import.service";
import {IconsComponent} from './components/icons/icons.component';
import {MarkTypeIconComponent} from "@pdfMarkerModule/components/mark-type-icon/mark-type-icon.component";
import {AssignmentMarkingComponent} from "@pdfMarkerModule/components/assignment-marking/assignment-marking.component";
import {FinaliseMarkingComponent} from './components/finalise-marking/finalise-marking.component';
import {CreateAssignmentComponent} from './components/create-assignment/create-assignment.component';
import {CreateFolderComponent} from './components/create-folder/create-folder.component';

import {PdfJsViewerModule} from 'ng2-pdfjs-viewer';
import {ColorPickerModule} from "ngx-color-picker";
import {RxReactiveFormsModule} from "@rxweb/reactive-form-validators";

import {RubricImportComponent} from './components/rubric-import/rubric-import.component';
import {FileSaverModule} from "ngx-filesaver";
import {AssignmentSettingsService} from "@pdfMarkerModule/services/assingment-settings.service";
import {AssignmentMarkingRubricComponent} from './components/assignment-marking-rubric/assignment-marking-rubric.component';
import {AssignmentWorkspaceOverviewComponent} from './components/assignment-workspace-overview/assignment-workspace-overview.component';
import {GenericCommentsComponent} from './components/comments/comments.component';
import {AssignmentWorkspaceManageModalComponent} from './components/assignment-workspace-manage-modal/assignment-workspace-manage-modal.component';
import { PdfmAnnotateComponent } from './components/pdfm-annotate/pdfm-annotate.component';


@NgModule({
  declarations: [
    AssignmentMarkingComponent,
    AssignmentMarkingRubricComponent,
    AssignmentOverviewComponent,
    AssignmentWorkspaceManageModalComponent,
    AssignmentWorkspaceOverviewComponent,
    CreateAssignmentComponent,
    CreateFolderComponent,
    FinaliseMarkingComponent,
    GenericCommentsComponent,
    HomeComponent,
    ImportComponent,
    IconsComponent,
    MarkTypeIconComponent,
    RubricImportComponent,
    SettingsComponent,
    WelcomeComponent,
    PdfmAnnotateComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    LayoutModule,
    PdfMarkerRoutingModule,
    PdfJsViewerModule,
    ColorPickerModule,
    FileSaverModule,
    RxReactiveFormsModule
  ],
  providers: [SettingsService, ImportService, AssignmentSettingsService],
  exports: [HomeComponent],
  entryComponents: [MarkTypeIconComponent, FinaliseMarkingComponent, MarkTypeIconComponent, AssignmentWorkspaceManageModalComponent]
})
export class PdfMarkerModule {
}
