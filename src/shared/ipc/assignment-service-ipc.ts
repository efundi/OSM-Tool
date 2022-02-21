import {UpdateAssignment} from "../info-objects/update-assignment";
import {CreateAssignmentInfo} from "../info-objects/create-assignment.info";

export interface AssignmentServiceIpc {

  getAssignments(): Promise<any>;
  createAssignment(createAssignmentInfo: CreateAssignmentInfo): Promise<any>;
  updateAssignment(updateRequest: UpdateAssignment): Promise<any>;
  saveMarks(location: any, marks: any[], totalMarks: any): Promise<any>;
  saveRubricMarks(location: string, rubricName: string, marks: any[]): Promise<any>;
  getAssignmentSettings(location: string): Promise<any>;
  getMarks(location: string): Promise<any>;
  updateAssignmentSettings(updatedSettings: any, location: string): Promise<any>;
}
