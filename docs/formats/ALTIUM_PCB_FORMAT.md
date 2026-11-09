# Altium PCB Format

## Overview

Altium Designer `.PcbDoc` (and the sister Circuit Maker `.CMPcbDoc` / Circuit Studio `.CSPcbDoc` extensions) is the binary PCB design-file format produced by Altium Designer 6.0 and later (2005 → present). Files are **Microsoft Compound File Binary** (CFB / MS-CFBF) containers with ~45 named streams holding board metadata, component placements, copper geometry, layer stackup, design rules, and embedded 3D models.

BoardRipper supports two flavours:

- **Binary** — the default save format. CFB container with magic `D0 CF 11 E0 A1 B1 1A E1`.
- **ASCII Version 5.0** — opt-in text export (File → Save Copy As → PCB ASCII), same `.PcbDoc` extension, identical record set, no CFB envelope.

## Lineage

- Altium Designer 6.0 introduced the `6`-suffixed stream-name convention (`Board6`, `Components6`, …). Files saved by 6.0+ use these names exclusively.
- Older **Protel 99SE** `.PCB` files use a different container and stream layout — **not supported**.
- Stream layouts evolve across major Altium releases. The `FileVersionInfo/Data` stream stores a feature-evolution log (one entry per release that introduced format-affecting features). BoardRipper does not gate on this — the parser ignores unknown keys, matching KiCad's permissive approach.

## P1 (current) coverage

The parser produces a standard `BoardData` (parts + pins + nets + outline) from the following streams:

| Stream | Encoding | Purpose |
|---|---|---|
| `FileHeader` | Binary | Magic + version sniff |
| `Board6/Data` | Property bag | Origin, layer stackup, board name |
| `Components6/Data` | Property bag | Component instances |
| `Pads6/Data` | Binary records | Pin pads + through-hole pads |
| `Nets6/Data` | Property bag | Net name table (index → name) |
| `Classes6/Data` | Property bag | Net/component classes |
| `WideStrings6/Data` | Binary | Unicode string pool |
| `Texts6/Data` | Binary records | Component Comment → `Part.meta.value` (other texts not drawn) |

Multi-layer copper (`Tracks6`, `Vias6`, `Arcs6`, `Fills6`, `Regions6`, `Polygons6`) is parsed in Phase 2; annotations and mechanical bodies in Phase 3.

### P1 known limitations
- Pads with complex shape mode (Altium "PADMODE" != SIMPLE — typical BGA pad stackups) are decoded with `xsize=0, ysize=0` because the size table lives in subrecord 6 (`APAD6_SIZE_AND_SHAPE`) which P1 skips. These render as zero-size points. THT detection (`layer === MULTI_LAYER`) still works for them. Will be addressed in Phase 2.
- Pad shape mapping collapses to round-or-rect; octagon, roundrect, custom-shape pads land as rect with correct bounding rectangle but lose shape detail. Phase 2 will surface the full `PadShape` enum.

### Region vertex encoding (`Regions6` vs `ShapeBasedRegions6`)

The vertex encoding is decided by the **stream**, never by the record (KiCad: `AREGION6(reader, false)` for `Regions6`, `AREGION6(reader, true)` for `ShapeBasedRegions6`). `Regions6` vertices are plain `f64 x, f64 y` (16 bytes). `ShapeBasedRegions6` vertices are extended (`u8 isRound`, `i32` × 4 position + centre, `i32` radius, `f64` × 2 angles = 37 bytes), with one extra closing vertex. A `Regions6` record with `ISSHAPEBASED=TRUE` or `KIND=1` still uses plain vertices. Reading those as extended overran the record, and the exception failed the whole file. A board cutout is `KIND=0` + `ISBOARDCUTOUT=TRUE`. A region whose vertex count does not fit its record is skipped with a warning, and each optional geometry stream is decoded behind a guard: a stream that throws costs that layer, not the board.

### Pads on non-copper layers

A pad primitive may sit on any layer. Only pads on a copper layer (Top … Bottom), an internal plane (39–54) or Multi-Layer (74) are pins; one on paste, solder mask, overlay or a mechanical layer is a drawing and is dropped from pins and copper pads (`isAltiumPadCopperLayer`). This is KiCad's rule (`ConvertPads6ToFootprintItem` → `…OnNonCopper` imports them as graphics). Typical cases: a thermal pad whose paste is split into several `SOLDERPASTE` pads on the paste layer, and footprints that repeat a pin number on a netless paste-layer pad.

### Component Comment (`Texts6`)

`Components6` has no Comment field — `SOURCELIBREFERENCE` / `SOURCEDESCRIPTION` are library data, not the Comment. The Comment (and the Designator) are ordinary text primitives in `Texts6`, owned by the component through a component index and marked by a flag. Layout per KiCad's `ATEXT6::ATEXT6` (`altium_parser_pcb.cpp`):

| Offset in subrecord 1 | Field |
|---|---|
| +0 | `uint8` layer (v6) |
| +7 | `uint16` component index into `Components6` record order; `0xFFFF` = free board text |
| +40 | `uint8` isComment (only when subrecord 1 ≥ 123 bytes) |
| +41 | `uint8` isDesignator (same) |
| +115 | `uint32` `WideStrings6` index |

Subrecord 2 is a legacy 8-bit short-Pascal copy of the string. The text is the `WideStrings6` entry when the index resolves, else the legacy copy (KiCad's precedence). `WideStrings6` lengths include a 2-byte UTF-16 NUL, which is dropped. The text is stored even when the component hides it (`COMMENTON=FALSE`). KiCad assigns it to the footprint *Value*, so BoardRipper puts it in `Part.meta.value` (Info panel ▸ Value). A text that is an unresolved special string (`.Comment`, `.Designator` — leading `.`, no `=`, KiCad's rule) or a bare `=Parameter` reference is not a value and is dropped.

ASCII: `|RECORD=Text|COMPONENT=<n>|COMMENT=True|…|WIDESTRING=49,48,107|` — `WIDESTRING` is comma-separated UTF-16 code units (`TEXT=` accepted as a fallback).

## Coordinate system

Altium stores positions as `int32` in **1/10000 mil** units. Origin is bottom-left, Y-axis up. BoardRipper converts to plain mils with Y-axis down via `parsers/altium/altium-units.ts` — this is the **only** module performing coordinate or unit transformation.

## Property-bag format

Text-format streams encode each record as ASCII `|KEY=VALUE|KEY=VALUE|…`. Records are length-prefixed by a `uint32` byte count. Boolean values are `TRUE`/`FALSE`. Unicode strings are referenced by index into `WideStrings6`.

```
|RECORD=Component|SOURCEDESIGNATOR=R1|PATTERN=0603|LAYER=TOP|X=100000|Y=200000|ROTATION=0|
```

## Binary record format

Each record in a binary stream starts with:

- `uint8` record-type tag (typically `0x02` for primitives)
- One or more subrecords, each prefixed by `uint32` byte length

Pads6 records have 5 subrecords: name (short Pascal), three skipped padding subrecords, and the main body. Main-body fields have fixed offsets with version-conditional trailing fields — the parser uses the declared subrecord length to skip the tail safely.

## Sources & references

| Source | Description | License |
|---|---|---|
| [KiCad PCB importer](https://github.com/KiCad/kicad-source-mirror/tree/master/pcbnew/pcb_io/altium) | Canonical reference. Covers ~45 streams. Actively maintained. | GPL-2.0+ / one file GPL-3.0+ |
| [thesourcerer8/altium2kicad](https://github.com/thesourcerer8/altium2kicad) | Long-running Perl converter. Cross-reference value; issue #28 documents stream layouts. | GPL-2.0 |
| [issus/AltiumSharp](https://github.com/issus/AltiumSharp) | C#/.NET active fork. Read+write `.PcbDoc`. | Apache-2.0 |
| [SheetJS/js-cfb](https://github.com/SheetJS/js-cfb) | OLE CFB parser. Used by BoardRipper for the container layer. | Apache-2.0 |

## Local fixtures

- `src/frontend/tests/fixtures/altium-comments.PcbDoc` — **checked in.** 22-component Altium Designer board whose Comments are real part numbers, minimised by `tests/fixtures/make-altium-fixture.cjs` (parses to the same BoardData as the original).

- `samples/altium/PCB.PcbDoc` — Altium Designer 16.0+ small demo (~915 KB)
- `samples/altium/ESD_GW1N_4L.PcbDoc` — Altium Designer 15.1+ 4-layer Gowin FPGA dev board (~1.3 MB)

Both files are local-only (`samples/` is gitignored).
