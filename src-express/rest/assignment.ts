import {
  asyncForEach,
  checkAccess,
  checkClient, deleteFolderRecursive, hierarchyModel, isFolder, isJson,
  isNullOrUndefined,
  readFromFile,
  sendResponse,
  sendResponseData, uploadFiles,
  validateRequest,
  writeToFile
} from '../utils';
import {
  COMMENTS_FILE,
  CONFIG_DIR,
  CONFIG_FILE, COULD_NOT_READ_RUBRIC_LIST, FEEDBACK_FOLDER,
  FORBIDDEN_RESOURCE, GRADES_FILE, INVALID_PATH_PROVIDED, INVALID_RUBRIC_JSON_FILE, INVALID_STUDENT_FOLDER, MARK_FILE,
  NOT_CONFIGURED_CONFIG_DIRECTORY, NOT_PROVIDED_RUBRIC, RUBRICS_FILE, SETTING_FILE, SUBMISSION_FOLDER
} from '../constants';
import {
  access,
  accessSync,
  constants,
  existsSync, mkdirSync,
  readdirSync,
  readFile,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs';
import * as glob from 'glob';
import * as os from 'os';
import {copySync} from 'fs-extra';
import {IComment} from '../../src/app/modules/application/core/utils/comment.class';
import {basename, dirname, sep} from 'path';
import * as csvtojson from 'csvtojson';
import {json2csv, json2csvAsync} from 'json-2-csv';
import {AssignmentSettingsInfo} from '../../src/app/modules/pdf-marker/info-objects/assignment-settings.info';
import {validationResult} from 'express-validator';
import * as zipDir from 'zip-dir';
import {annotatePdfRubric} from '../pdf/rubric-annotations';
import {annotatePdfFile} from '../pdf/marking-annotations';
import {IRubric} from '../../src/app/modules/application/core/utils/rubric.class';
import {PDFDocument} from 'pdf-lib';
import {MarkInfo} from '../../src/app/modules/application/shared/info-objects/mark.info';
import * as fs from 'fs';
import * as path from 'path';
import {ShareAssignments} from '../../src/app/modules/application/shared/info-objects/share-assignments';
import {isNil, find} from 'lodash';


// rubircFinalize
export const finalizeAssignmentRubric = async (req, res) => {
  let failed = false;
  if (!checkClient(req, res)) {
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendResponseData(req, res, 400, {errors: errors.array()});
  }

  const keys = ['workspaceFolder', 'location', 'rubricName'];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys)) {
    return sendResponse(req, res, 400, 'Invalid parameter found in request');
  }

  try {
    const data = readFileSync(CONFIG_DIR + CONFIG_FILE);
    if (!isJson(data)) {
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);
    }

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    let workspaceFolder = '';
    if (req.body.workspaceFolder) {
      workspaceFolder = req.body.workspaceFolder.replace(/\//g, sep);
    }
    const assignmentFolder = (workspaceFolder !== null && workspaceFolder !== '' && workspaceFolder !== undefined) ?
      config.defaultPath + sep + workspaceFolder + sep + loc : config.defaultPath + sep + loc;
    const gradesJSON = await csvtojson({noheader: true, trim: false}).fromFile(assignmentFolder + sep + GRADES_FILE);
    const files = glob.sync(assignmentFolder + sep + '/*');
    const assignmentSettingsBuffer = readFileSync(assignmentFolder + sep + SETTING_FILE);
    if (!isJson(assignmentSettingsBuffer)) {
      return sendResponse(req, res, 400, 'Invalid assignment settings file!');
    }

    const assignmentSettingsInfo: AssignmentSettingsInfo = JSON.parse(assignmentSettingsBuffer.toString());

    const start = async () => {
      await asyncForEach(files, async (file) => {
        if (statSync(file).isDirectory()) {
          const regEx = /(.*)\((.+)\)$/;
          if (!regEx.test(file)) {
            failed = true;
            return sendResponse(req, res, 500, INVALID_STUDENT_FOLDER + ' ' + basename(file));
          }

          const matches = regEx.exec(file);

          const submissionFiles = glob.sync(file + sep + SUBMISSION_FOLDER + '/*');
          const rubricName = req.body.rubricName.trim();

          if (isNullOrUndefined(assignmentSettingsInfo.rubric)) {
            return sendResponse(req, res, 400, 'Assignment\'s settings does not contain a rubric!');
          } else if (assignmentSettingsInfo.rubric.name !== rubricName) {
            return sendResponse(req, res, 400, 'Assignment\'s settings rubric does not match provided!');
          }

          const rubric = assignmentSettingsInfo.rubric;

          await asyncForEach(submissionFiles, async (submission) => {
            try {
              accessSync(submission, constants.F_OK);
              const studentFolder = dirname(dirname(submission));

              let marks;
              let data;
              try {
                data = readFileSync(studentFolder + sep + MARK_FILE);
              } catch (e) {
                marks = [];
              }

              if (!isJson(data)) {
                marks = [];
              } else {
                marks = JSON.parse(data.toString());
              }

              if (marks.length > 0) {
                const annotateRubricFN = async (): Promise<{ pdfBytes: Uint8Array, totalMark: number }> => {
                  return await annotatePdfRubric(res, submission, marks, assignmentSettingsInfo.rubric);
                };

                await annotateRubricFN().then(async (data) => {
                  const ext = path.extname(submission);
                  const fileName = path.basename(submission, ext) + '_MARK';
                  writeFileSync(studentFolder + sep + FEEDBACK_FOLDER + sep + fileName + '.pdf', data.pdfBytes);
                  accessSync(assignmentFolder + sep + GRADES_FILE, constants.F_OK);
                  let changed = false;
                  let assignmentHeader;
                  for (let i = 0; i < gradesJSON.length; i++) {
                    if (i === 0) {
                      const gradesKeys = Object.keys(gradesJSON[i]);
                      if (gradesKeys.length > 0) {
                        assignmentHeader = gradesKeys[0];
                      }
                    } else if (i > 1 && !isNullOrUndefined(assignmentHeader) && gradesJSON[i] && gradesJSON[i][assignmentHeader].toUpperCase() === matches[2].toUpperCase()) {
                      gradesJSON[i].field5 = data.totalMark;
                      changed = true;
                      await json2csvAsync(gradesJSON, {emptyFieldValue: '', prependHeader: false})
                        .then(csv => {
                          writeFileSync(assignmentFolder + sep + GRADES_FILE, csv);
                        })
                        .catch(() => {
                          failed = true;
                          return sendResponse(req, res, 400, 'Failed to save marks to ' + GRADES_FILE + ' file for student ' + matches[2] + '!');
                        });

                      break;
                    }
                  }
                  if (!changed) {
                    failed = true;
                    return sendResponse(req, res, 400, 'Failed to save mark');
                  }
                }, (error) => {
                  failed = true;
                  return sendResponse(req, res, 400, 'Error annotating marks to PDF [' + error.message + ']');
                });
              }
            } catch (e) {
              failed = true;
              return sendResponse(req, res, 400, e.message);
            }
          });
        }
      });
    };
    await start();
    if (!failed) {
      return zipDir((workspaceFolder !== null && workspaceFolder !== '' && workspaceFolder !== undefined) ? config.defaultPath + sep + workspaceFolder : config.defaultPath,
        {filter: (filterPath: string, stat) => (!(/\.marks\.json|.settings.json|\.zip$/.test(filterPath)) && ((filterPath.endsWith(assignmentFolder)) ? true : (filterPath.startsWith(assignmentFolder + sep))))}, (err, buffer) => {
          if (err) {
            return sendResponse(req, res, 400, 'Could not export assignment');
          }
          return sendResponseData(req, res, 200, buffer);
        });
    }
  } catch (e) {
    return sendResponse(req, res, 500, e.message);
  }
};


function cleanupTemp(tmpDir: string){
  try {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  } catch (e) {
    console.error(`An error has occurred while removing the temp folder at ${tmpDir}. Please remove it manually. Error: ${e}`);
  }
}

export const shareExport = async (req, res) => {
  if (!checkClient(req, res)) {
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendResponseData(req, res, 400, {errors: errors.array()});
  }

  const keys = ['assignmentName', 'submissions', 'workspaceFolder'];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys)) {
    return sendResponse(req, res, 400, 'Invalid parameter found in request');
  }

  try {
    const configData = readFileSync(CONFIG_DIR + CONFIG_FILE);
    if (!isJson(configData)) {
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);
    }
    const shareRequest: ShareAssignments = req.body;
    const config = JSON.parse(configData.toString());
    const assignmentName = shareRequest.assignmentName.replace(/\//g, sep);
    let workspaceFolder = '';
    if (req.body.workspaceFolder) {
      workspaceFolder = shareRequest.workspaceFolder.replace(/\//g, sep);
    }
    const originalAssignmentDirectory = (workspaceFolder !== null && workspaceFolder !== '' && workspaceFolder !== undefined) ? config.defaultPath + sep + workspaceFolder + sep + assignmentName : config.defaultPath + sep + assignmentName;
    const gradesJSON = await csvtojson({noheader: true, trim: false}).fromFile(originalAssignmentDirectory + sep + GRADES_FILE);
    let tmpDir;
    // Create a temp directory to construct files to zip
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfm-'));

    const tempAssignmentDirectory = tmpDir + sep + assignmentName;
    fs.mkdirSync(tempAssignmentDirectory);

    // Now copy each submission
    shareRequest.submissions.forEach((submission) => {
      const submissionDirectoryName = submission.studentName + '(' + submission.studentNumber + ')';
      copySync(originalAssignmentDirectory + sep + submissionDirectoryName, tempAssignmentDirectory + sep + submissionDirectoryName);
    });

    const shareGradesJson = [
      gradesJSON[0],
      gradesJSON[1],
      gradesJSON[2],
    ];
    for (let i = 3; i < gradesJSON.length; i++) {
      const gradesStudentId = gradesJSON[i].field2;
      const shouldExport = !isNil(find(shareRequest.submissions, {studentNumber: gradesStudentId}));
      if (shouldExport) {
        shareGradesJson.push(gradesJSON[i]);
      }
    }

    json2csvAsync(shareGradesJson, {emptyFieldValue: '', prependHeader: false})
      .then(csv => {
        writeFileSync(tempAssignmentDirectory + sep + GRADES_FILE, csv);
      })
      .then(() => {
        return zipDir(tmpDir);
      })
      .then((buffer) => {
        sendResponseData(req, res, 200, buffer);
        cleanupTemp(tmpDir);
      }, (error) => {
        cleanupTemp(tmpDir);
        return sendResponse(req, res, 500, error.message);
      });

  } catch (e) {
    console.error(e);
    return sendResponse(req, res, 500, 'Error trying to export share');
  }
};


export const finalizeAssignment = async (req, res) => {
  let failed = false;
  if (!checkClient(req, res)) {
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendResponseData(req, res, 400, {errors: errors.array()});
  }

  const keys = ['workspaceFolder', 'location'];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys)) {
    return sendResponse(req, res, 400, 'Invalid parameter found in request');
  }

  try {
    const configData = readFileSync(CONFIG_DIR + CONFIG_FILE);
    if (!isJson(configData)) {
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);
    }

    const config = JSON.parse(configData.toString());
    const loc = req.body.location.replace(/\//g, sep);
    let workspaceFolder = '';
    if (req.body.workspaceFolder) {
      workspaceFolder = req.body.workspaceFolder.replace(/\//g, sep);
    }
    const assignmentFolder = (workspaceFolder !== null && workspaceFolder !== '' && workspaceFolder !== undefined) ? config.defaultPath + sep + workspaceFolder + sep + loc : config.defaultPath + sep + loc;
    const gradesJSON = await csvtojson({noheader: true, trim: false}).fromFile(assignmentFolder + sep + GRADES_FILE);
    const files = glob.sync(assignmentFolder + sep + '/*');

    const start = async () => {
      await asyncForEach(files, async (file) => {
        if (statSync(file).isDirectory()) {
          const regEx = /(.*)\((.+)\)$/;
          if (!regEx.test(file)) {
            failed = true;
            return sendResponse(req, res, 500, INVALID_STUDENT_FOLDER + ' ' + basename(file));
          }

          const matches = regEx.exec(file);

          const submissionFiles = glob.sync(file + sep + SUBMISSION_FOLDER + '/*');

          await asyncForEach(submissionFiles, async (submission) => {
            try {
              accessSync(submission, constants.F_OK);
              const studentFolder = dirname(dirname(submission));

              let marks: MarkInfo[][] = [];
              let marksData;
              try {
                marksData = readFileSync(studentFolder + sep + MARK_FILE);
              } catch (e) {
                marks = [];
              }

              if (isJson(marksData)) {
                marks = JSON.parse(marksData.toString());
              }

              if (marks.length > 0) {
                const annotateFN = async (): Promise<{ pdfBytes: Uint8Array, totalMark: number }> => {
                  return await annotatePdfFile(res, submission, marks);
                };

                const ext = path.extname(submission);
                let fileName = path.basename(submission, ext);
                await annotateFN().then(async (data) => {
                  fileName += '_MARK';
                  writeFileSync(studentFolder + sep + FEEDBACK_FOLDER + sep + fileName + '.pdf', data.pdfBytes);
                  unlinkSync(submission);
                  accessSync(assignmentFolder + sep + GRADES_FILE, constants.F_OK);
                  let changed = false;
                  let assignmentHeader;
                  for (let i = 0; i < gradesJSON.length; i++) {
                    if (i === 0) {
                      const gradeKeys = Object.keys(gradesJSON[i]);
                      if (gradeKeys.length > 0) {
                        assignmentHeader = gradeKeys[0];
                      }
                    } else if (i > 1 && !isNullOrUndefined(assignmentHeader) && gradesJSON[i] && gradesJSON[i][assignmentHeader].toUpperCase() === matches[2].toUpperCase()) {
                      gradesJSON[i].field5 = data.totalMark;
                      changed = true;
                      await json2csvAsync(gradesJSON, {emptyFieldValue: '', prependHeader: false})
                        .then(csv => {
                          writeFileSync(assignmentFolder + sep + GRADES_FILE, csv);
                        })
                        .catch(() => {
                          failed = true;
                          return sendResponse(req, res, 400, 'Failed to save marks to ' + GRADES_FILE + ' file for student ' + matches[2] + '!');
                        });

                      break;
                    }
                  }
                  if (!changed) {
                    failed = true;
                    return sendResponse(req, res, 400, 'Failed to save mark');
                  }
                }, (error) => {
                  failed = true;
                  return sendResponse(req, res, 400, 'Error annotating marks to PDF ' + fileName + ' [' + error.message + ']');
                });
              }
            } catch (e) {
              failed = true;
              return sendResponse(req, res, 400, e.message);
            }
          });
        }
      });
    };
    await start();
    if (!failed) {
      return zipDir((workspaceFolder !== null && workspaceFolder !== '' && workspaceFolder !== undefined) ? config.defaultPath + sep + workspaceFolder : config.defaultPath,
        {filter: (path: string, stat) => (!(/\.marks\.json|\.settings\.json|\.zip$/.test(path)) && ((path.endsWith(assignmentFolder)) ? true : (path.startsWith((assignmentFolder) + sep))))}, (err, buffer) => {
          if (err) {
            return sendResponse(req, res, 400, 'Could not export assignment');
          }
          return sendResponseData(req, res, 200, buffer);
        });
    }
  } catch (e) {
    return sendResponse(req, res, 500, e.message);
  }
};



export const getGrades = (req, res) => {
  if (!checkClient(req, res)) {
    return sendResponse(req, res, 401, FORBIDDEN_RESOURCE);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendResponseData(req, res, 400, {errors: errors.array()});
  }

  const keys = ['location'];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys)) {
    return sendResponse(req, res, 400, 'Invalid parameter found in request');
  }

  return readFromFile(req, res, CONFIG_DIR + CONFIG_FILE, (data) => {
    if (!isJson(data)) {
      return sendResponse(req, res, 400, NOT_CONFIGURED_CONFIG_DIRECTORY);
    }

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);
    const assignmentFolder = config.defaultPath + sep + loc;

    return checkAccess(req, res, assignmentFolder + sep + GRADES_FILE, () => {
      return csvtojson({noheader: true, trim: false}).fromFile(assignmentFolder + sep + GRADES_FILE)
        .then((gradesJSON) => {
          return sendResponseData(req, res, 200, gradesJSON);
        }, reason => {
          return sendResponse(req, res, 400, reason);
        });
    });
  });
};




export const getAssignmentGlobalSettings = (req, res) => {
  if (!checkClient(req, res)) {
    return res.status(401).send({message: 'Forbidden access to resource!'});
  }
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({errors: errors.array()});
  }

  const keys = ['location'];
  const bodyKeys = Object.keys(req.body);

  if (validateRequest(keys, bodyKeys)) {
    return res.status(400).send({message: 'Invalid parameter found in request'});
  }

  readFile(CONFIG_DIR + CONFIG_FILE, (err, data) => {
    if (err) {
      return res.status(500).send({message: 'Failed to read configurations!'});
    }

    if (!isJson(data)) {
      return res.status(404).send({message: 'Configure default location to extract files to on the settings page!'});
    }

    const config = JSON.parse(data.toString());
    const loc = req.body.location.replace(/\//g, sep);

    const assignmentFolder = config.defaultPath + sep + loc;

    return access(assignmentFolder + sep + '.settings.json', constants.F_OK, (err) => {
      if (err) {
        return res.status(200).send({message: 'Could not read settings file'});
      }
      return (assignmentFolder + sep + '.settings.json');
    });
  });
};







