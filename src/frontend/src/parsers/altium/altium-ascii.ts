/**
 * Altium PCB ASCII Version 5.0 variant.
 *
 * One record per line: `|RECORD=<type>|KEY=VALUE|…|`. The record-type
 * dispatch matches the binary stream names without the "6" suffix:
 *   Board → ABoard6
 *   Net → ANet6
 *   Component → AComponent6
 *   Pad → APad6
 *   Text → AText6 (only component Comment / Designator strings are used)
 *
 * Field keys are case-sensitive uppercase, matching the binary streams'
 * property-bag keys.
 */

import type { BoardData } from '../types';
import {
  parsePropBagText,
  readPropString,
  readPropInt,
  readPropFloat,
  readPropBool,
} from './altium-props';
import { parseAltiumLayerName, ALTIUM_LAYER } from './altium-layers';
import { assembleBoardData } from './altium-assembler';
import type { AltiumPcbDb, ABoard6, AComponent6, APad6, ANet6, AText6 } from './altium-types';

/**
 * A Text record's string. Exports seen in the wild (e.g. EasyEDA's
 * "Altium ASCII" output) carry it as `WIDESTRING=` — comma-separated UTF-16
 * code units, `WIDESTRING=85,49` → "U1" — and some writers add a plain
 * `TEXT=`; prefer the wide form, which is lossless.
 */
function asciiTextString(props: Map<string, string>): string {
  const wide = props.get('WIDESTRING');
  if (wide) {
    const units = wide.split(',').map(v => parseInt(v, 10));
    if (units.length > 0 && units.every(u => Number.isInteger(u) && u >= 0 && u <= 0xFFFF)) {
      return String.fromCharCode(...units);
    }
  }
  return readPropString(props, 'TEXT', '');
}

export function parseAltiumAscii(buffer: ArrayBuffer): BoardData {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  const lines = text.split(/\r?\n/);
  let board: ABoard6 = { name: '', originX: 0, originY: 0, layerNames: [], formatVersion: '' };
  const components: AComponent6[] = [];
  const pads: APad6[] = [];
  const nets: ANet6[] = [];
  const texts: AText6[] = [];

  for (const line of lines) {
    if (!line.includes('|RECORD=')) continue;
    const props = parsePropBagText(line);
    const type = readPropString(props, 'RECORD', '');
    switch (type) {
      case 'Board': {
        const layerNames: string[] = [];
        for (let i = 1; i <= 82; i++) {
          layerNames.push(readPropString(props, `LAYER${i}NAME`, ''));
        }
        while (layerNames.length > 0 && layerNames[layerNames.length - 1] === '') layerNames.pop();
        board = {
          name: readPropString(props, 'BOARDDESCRIPTION', ''),
          originX: readPropInt(props, 'ORIGINX', 0),
          originY: readPropInt(props, 'ORIGINY', 0),
          layerNames,
          formatVersion: readPropString(props, 'VERSION', ''),
        };
        break;
      }
      case 'Net':
        nets.push({ name: readPropString(props, 'NAME', '') });
        break;
      case 'Component':
        components.push({
          designator: readPropString(props, 'SOURCEDESIGNATOR', ''),
          pattern: readPropString(props, 'PATTERN', ''),
          componentName: readPropString(props, 'COMPONENT', ''),
          description: readPropString(props, 'COMPONENTDESCRIPTION', ''),
          layer: parseAltiumLayerName(readPropString(props, 'LAYER', 'TOP')),
          x: readPropInt(props, 'X', 0),
          y: readPropInt(props, 'Y', 0),
          rotation: readPropFloat(props, 'ROTATION', 0),
          locked: readPropBool(props, 'LOCKED', false),
          uniqueId: readPropString(props, 'UNIQUEID', ''),
        });
        break;
      case 'Text': {
        // `COMPONENT=<n>` is the owning component's index in record order
        // (the binary Texts6 `component` field); a free board text has none.
        // COMPONENTINDEX accepted too, the key this parser's Pad case reads.
        const comp = readPropInt(props, 'COMPONENT', readPropInt(props, 'COMPONENTINDEX', -1));
        texts.push({
          componentIndex: comp,
          isComment: readPropBool(props, 'COMMENT', false),
          isDesignator: readPropBool(props, 'DESIGNATOR', false),
          text: asciiTextString(props).replace(/\r\n/g, '\n'),
        });
        break;
      }
      case 'Pad': {
        const layer = parseAltiumLayerName(readPropString(props, 'LAYER', 'TOP'));
        pads.push({
          name: readPropString(props, 'NAME', ''),
          componentIndex: readPropInt(props, 'COMPONENTINDEX', -1),
          netIndex: readPropInt(props, 'NETINDEX', -1),
          layer,
          x: readPropInt(props, 'X', 0),
          y: readPropInt(props, 'Y', 0),
          xsize: readPropInt(props, 'XSIZE', 0),
          ysize: readPropInt(props, 'YSIZE', 0),
          topShape: readPropInt(props, 'TOPSHAPE', 1),
          holeSize: readPropInt(props, 'HOLESIZE', 0),
          rotation: readPropFloat(props, 'ROTATION', 0),
          isThroughHole: layer === ALTIUM_LAYER.MULTI_LAYER,
        });
        break;
      }
    }
  }

  const db: AltiumPcbDb = {
    board,
    components,
    pads,
    tracks: [],
    vias: [],
    arcs: [],
    fills: [],
    regions: [],
    texts,
    componentParams: [],
    nets,
    classes: [],
    wideStrings: { byIndex: () => '' },
  };
  return assembleBoardData(db);
}
