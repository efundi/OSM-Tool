import {AnnotationFactory} from 'annotpdf';
import {PageSizes, PDFDocument, PDFPageDrawSVGOptions, rgb, PDFPageDrawTextOptions, RotationTypes, StandardFonts} from 'pdf-lib';
import {IconTypeEnum} from '@shared/info-objects/icon-type.enum';
import {HIGHLIGHT_HEIGHT as HIGHTLIGHT_HEIGHT_px} from '../constants';
import {MarkCoordinate, MarkInfo} from '@shared/info-objects/mark.info';
import {IconSvgEnum} from '@shared/info-objects/icon-svg.enum';
import {adjustPointsForResults, hexRgb, RgbaObject, rgbHex} from './pdf-utils';
import {readFile} from 'fs/promises';
import {MarkingSubmissionInfo} from '@shared/info-objects/submission.info';
import { isNil } from 'lodash';

const getRgbScale = (rgbValue: number): number => {
  return +parseFloat(((rgbValue / 255) + '')).toFixed(2);
};
const COORD_CONSTANT = 72 / 96;
const HIGHLIGHT_HEIGHT = HIGHTLIGHT_HEIGHT_px * COORD_CONSTANT;
const CIRCLE_DIAMETER = (37 * COORD_CONSTANT);
const CIRCLE_SIZE = CIRCLE_DIAMETER / 2;
const TEXT_ANNOTATION_SIZE = 20 * COORD_CONSTANT;
const MARK_FONT_SIZE = 12;

interface AnnotationSession {
  data: Uint8Array;
  totalMark: number;
  generalMarks: number;
  sectionMarks: string[];
}


function rotatePages(session: AnnotationSession, submissionInfo: MarkingSubmissionInfo): Promise<AnnotationSession> {
  return PDFDocument.load(session.data).then((pdfDoc) => {
    pdfDoc.getPages().forEach((p, index) => {
      const pageSettings = submissionInfo.pageSettings[index];

      if (pageSettings && pageSettings.rotation) {
        p.setRotation({
          type: RotationTypes.Degrees,
          angle: pageSettings.rotation
        });
      } else if (p.getRotation().type === RotationTypes.Radians) {
        // Convert radians to degrees
        p.setRotation({
          type: RotationTypes.Degrees,
          angle: p.getRotation().angle * (180 / Math.PI)
        });
      }
    });
    return pdfDoc.save();
  }).then((data) => {
    session.data = data;
    return session;
  });
}

function rotateCoord(
  coord: MarkCoordinate,
  offsetX: number,
  offsetY: number,
  angle: number,
  pageWidth: number,
  pageHeight: number): MarkCoordinate {
  if (angle === 90) {
    return {
      ...coord,
      x : coord.y - offsetY,
      y : coord.x + offsetX
    };
  } else if (angle === 180) {
    return {
      ...coord,
      x: pageWidth - coord.x - offsetX,
      y: coord.y - offsetY
    };
  } else if (angle === 270) {
    return {
      ...coord,
      x: pageWidth - (coord.y - offsetY),
      y: pageHeight - (coord.x + offsetX)
    };
  } else {
    return {
      ...coord,
      x: coord.x + offsetX,
      y : pageHeight - coord.y + offsetY
    };
  }
}

function rotateBox(
  x: number,
  y: number,
  w: number,
  h: number,
  offsetX: number,
  offsetY: number,
  angle: number,
  pageWidth: number,
  pageHeight: number): [number, number, number, number] {
  if (angle === 90) {
    return [
      /*x1 */ y - offsetY,
      /*y1 */ x + offsetX,
      /*x2 */ y + h - offsetY,
      /*y2 */ x + w + offsetX,
    ];
  } else if (angle === 180) {
    return [
      /*x1 */ pageWidth - x - w - offsetX,
      /*y1 */ y - offsetY,
      /*x2 */ pageWidth - x - offsetX,
      /*y2 */ y + h - offsetY // Down
    ];
  } else if (angle === 270) {
    return [
      /*x1 */ pageWidth  - (y - offsetY),
      /*y1 */ pageHeight - (x + offsetX),
      /*x2 */ pageWidth  - (y + h - offsetY),
      /*y2 */ pageHeight - (x + w + offsetX),
    ];
  } else {
    return [
      /*x1 */ x + offsetX,
      /*y1 */ pageHeight - y - h + offsetY,
      /*x2 */ x + w + offsetX,
      /*y2 */ pageHeight - y  + offsetY
    ];
  }
}

/**
 * Transform the coords to match the PDF scale
 * @param coords
 */
function transform(coords: MarkCoordinate): MarkCoordinate {
  return {
    ...coords,
    width: coords.width ? coords.width * COORD_CONSTANT : null,
    x:  (coords.x * COORD_CONSTANT),
    y : (coords.y * COORD_CONSTANT)
  };
}

/**
 * Use the annotation library to add annotations
 * @param session
 * @param marks
 */
function addAnnotations(session: AnnotationSession, marks: MarkInfo[][] = []): Promise<AnnotationSession> {
  const annotationFactory = new AnnotationFactory(session.data);
  let annotationsAdded = false;
  return PDFDocument.load(session.data).then((pdfDoc) => {
    pdfDoc.getPages().forEach((pdfPage, pageIndex) => {

      if (Array.isArray(marks[pageIndex])) {
        marks[pageIndex].forEach(mark => {
          const coords = transform(mark.coordinates);
          if (mark.iconType === IconTypeEnum.NUMBER) {

            session.totalMark += (mark.totalMark) ? mark.totalMark : 0;
            const sectionText = mark.sectionLabel + (isNil(mark.totalMark) ? ' ' : ' = ' + mark.totalMark);
            annotationFactory.createSquareAnnotation({
              page: pageIndex,
              rect: rotateBox(
                coords.x,
                coords.y,
                TEXT_ANNOTATION_SIZE,
                TEXT_ANNOTATION_SIZE,
                (CIRCLE_DIAMETER - TEXT_ANNOTATION_SIZE) / 2,
                (TEXT_ANNOTATION_SIZE / 2) - CIRCLE_SIZE,
                pdfPage.getRotation().angle,
                pdfPage.getWidth(),
                pdfPage.getHeight()
              ),
              color: {
                r: 255,
                g: 255,
                b: 255
              },
              opacity: 0.0001, // Make it invisible
              contents: mark.comment || ' ', // TODO check the popup goes missing
              author: sectionText
            });
            if (!isNil(mark.totalMark)) {
              session.sectionMarks.push(sectionText);
            }
            annotationsAdded = true;
          } else if (mark.iconType === IconTypeEnum.HIGHLIGHT) {
            const colorComponents = mark.colour.match(/(\d\.?)+/g);
            // const annot = annotationFactory.createSquareAnnotation({
            const annot = annotationFactory.createHighlightAnnotation({
              page: pageIndex,
              rect: rotateBox(
                coords.x,
                coords.y,
                coords.width,
                HIGHLIGHT_HEIGHT,
                0,
                0,
                pdfPage.getRotation().angle,
                pdfPage.getWidth(),
                pdfPage.getHeight()
              ),
              color: {
                r: +colorComponents[0],
                g: +colorComponents[1],
                b: +colorComponents[2]
              },
              opacity: +colorComponents[3],
              contents: mark.comment || (mark.sectionLabel ? ' ' : ''),
              author: mark.sectionLabel || ''
            });

            annot.createDefaultAppearanceStream();
            annotationsAdded = true;
          }
        });
      }
    });
    if (annotationsAdded) {
      session.data = annotationFactory.write();
    }
    return session;
  });
}

function addPdfMarks(session: AnnotationSession, marks: MarkInfo[][]): Promise<AnnotationSession> {
  return PDFDocument.load(session.data).then((pdfDoc) => {
    const font = pdfDoc.embedStandardFont(StandardFonts.CourierBold);

    pdfDoc.getPages().forEach((pdfPage, pageIndex) => {
      if (Array.isArray(marks[pageIndex])) {
        marks[pageIndex].forEach(mark => {

          if (mark.iconType === IconTypeEnum.HIGHLIGHT) {
            // Nothing to do here for a highlight
            return;
          }

          let coords = transform(mark.coordinates);
          let colours: RgbaObject = hexRgb('#6F327A');
          if (mark.colour.startsWith('#')) {
            colours = hexRgb(mark.colour);
          } else if (mark.colour.startsWith('rgb')) {
            colours = hexRgb('#' + rgbHex(mark.colour));
          }
          if (mark.iconType ===  IconTypeEnum.NUMBER) {

            if (isNil(mark.totalMark)) {

              coords = rotateCoord(
                coords,
                (36 - (24 * 96 / 72)) / 2,
                (36 - (24 * 96 / 72)) / -2,
                pdfPage.getRotation().angle,
                pdfPage.getWidth(),
                pdfPage.getHeight()
              );
              const options: PDFPageDrawSVGOptions = {
                x: coords.x,
                y: coords.y,
                color: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
                rotate: pdfPage.getRotation(),
              };

              pdfPage.drawSvgPath(IconSvgEnum.NUMBER_SVG, options);
            } else {

              const circleCoords = rotateCoord(
                coords,
                CIRCLE_SIZE,
                -CIRCLE_SIZE,
                pdfPage.getRotation().angle,
                pdfPage.getWidth(),
                pdfPage.getHeight()
              );
              const circleOptions = {
                x: circleCoords.x,
                y: circleCoords.y,
                size: CIRCLE_SIZE,
                color: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue))
              };
              pdfPage.drawCircle(circleOptions);

              const w = font.widthOfTextAtSize(mark.totalMark + '', MARK_FONT_SIZE);
              const h = font.heightAtSize(MARK_FONT_SIZE);
              coords = rotateCoord(
                coords,
                ((CIRCLE_DIAMETER - w) / 2),
                -h - (CIRCLE_SIZE / 2),
                pdfPage.getRotation().angle,
                pdfPage.getWidth(),
                pdfPage.getHeight()
              );
              const markOption: PDFPageDrawTextOptions = {
                x: coords.x,
                y: coords.y,
                size: MARK_FONT_SIZE,
                font: font,
                color: rgb(1, 1, 1),
                rotate: pdfPage.getRotation(),
              };
              pdfPage.drawText(mark.totalMark + '', markOption);
            }
          } else {

            coords = rotateCoord(
              coords,
              (36 - (24 * 96 / 72)) / 2,
              (36 - (24 * 96 / 72)) / -2,
              pdfPage.getRotation().angle,
              pdfPage.getWidth(),
              pdfPage.getHeight());
            const options: PDFPageDrawSVGOptions = {
              x: coords.x,
              y: coords.y,
              borderColor: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
              color: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
              rotate: pdfPage.getRotation(),
            };

            session.totalMark += (mark.totalMark) ? mark.totalMark : 0;
            session.generalMarks += (mark.totalMark) ? mark.totalMark : 0;

            if (mark.iconType === IconTypeEnum.FULL_MARK) {
              pdfPage.drawSvgPath(IconSvgEnum.FULL_MARK_SVG, options);
            } else if (mark.iconType === IconTypeEnum.HALF_MARK) {
              pdfPage.drawSvgPath(IconSvgEnum.FULL_MARK_SVG, options);
              pdfPage.drawSvgPath(IconSvgEnum.HALF_MARK_SVG, {
                x: coords.x,
                y: coords.y,
                borderWidth: 2,
                borderColor: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
                color: rgb(getRgbScale(colours.red), getRgbScale(colours.green), getRgbScale(colours.blue)),
                rotate: {
                  type: RotationTypes.Degrees,
                  angle: pdfPage.getRotation().angle
                }
              });
            } else if (mark.iconType === IconTypeEnum.CROSS) {
              pdfPage.drawSvgPath(IconSvgEnum.CROSS_SVG, options);
            } else if (mark.iconType === IconTypeEnum.ACK_MARK) {
              pdfPage.drawSvgPath(IconSvgEnum.ACK_MARK_SVG, options);
            }
          }
        });
      }
    });
    addResultsPage(session, pdfDoc);
    return pdfDoc.save().then((data) => {
      session.data = data;
      return session;
    });
  });
}


function addResultsPage(session: AnnotationSession, pdfDoc: PDFDocument) {
  let resultsPage = pdfDoc.addPage(PageSizes.A4);
  let y = 800;
  const xPosition = 25;
  const headerSize = 14;
  const borderColor = {red: 0.71, green: 0.71, blue: 0.71};

  resultsPage.drawText('Results', {x: resultsPage.getWidth() / 2, y, size: headerSize});
  y = adjustPointsForResults(y, 15);
  y = adjustPointsForResults(y, 15);

  resultsPage.drawText('_________________________________________________________________________________',
    {
      x: xPosition,
      y: 775,
      color: rgb(borderColor.red, borderColor.green, borderColor.blue),
      size: MARK_FONT_SIZE
    });
  y = adjustPointsForResults(y, 15);

  for (let i = 0; i < session.sectionMarks.length; i++) {
    y = adjustPointsForResults(y, 15);
    resultsPage.drawText(session.sectionMarks[i] + '', {x: xPosition, y, size: MARK_FONT_SIZE});
    resultsPage.drawText('', {x: xPosition, y, size: MARK_FONT_SIZE});

    if (y <= 5) {
      resultsPage = pdfDoc.addPage(PageSizes.A4);
      y = 800;
    }
  }
  y = adjustPointsForResults(y, 15);
  resultsPage.drawText('General Marks = ' + session.generalMarks, {x: xPosition, y, size: MARK_FONT_SIZE});
  y = adjustPointsForResults(y, 15);
  resultsPage.drawText('_________________________________________________________________________________', {
    x: xPosition,
    y,
    color: rgb(borderColor.red, borderColor.green, borderColor.blue),
    size: MARK_FONT_SIZE
  });
  y = adjustPointsForResults(y, 15);
  resultsPage.drawText('', {x: xPosition, y, size: MARK_FONT_SIZE});
  y = adjustPointsForResults(y, 15);
  resultsPage.drawText('Total = ' + session.totalMark, {x: xPosition, y, size: MARK_FONT_SIZE});
}

export function annotatePdfFile(
  filePath: string,
  submissionInfo: MarkingSubmissionInfo): Promise<{ pdfBytes: Uint8Array, totalMark: number }> {
  return readFile(filePath)
    .then((data) => {
      const session: AnnotationSession = {
        data: data,
        totalMark: 0,
        sectionMarks: [],
        generalMarks: 0
      };
      return session;
    })
    .then(session => rotatePages(session, submissionInfo))
    .then((session) => {
      return addAnnotations(session, submissionInfo.marks);
    })
    .then((session) => addPdfMarks(session, submissionInfo.marks))
    .then((session) => {
      return {
        pdfBytes: session.data,
        totalMark: session.totalMark
      };
    });
}
