import {
  Circle,
  Document,
  G,
  Line,
  Link,
  Page,
  Path,
  Polygon,
  Rect,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { ArborLogoPdf } from "@arbor/invoice-document";
import { glyphNode, type GlyphComponents } from "./glyph";
import {
  computePlotLayout,
  gridLineOffsets,
  itemRect,
  itemTransform,
  labelRect,
  PLOT_COLORS,
  type PlotLayout,
} from "./plot";
import { RIDER_CATEGORY_PALETTE, riderSymbol } from "./symbols";
import {
  INPUT_TYPE_LABELS,
  MONITOR_TYPE_LABELS,
  PROVIDED_BY_LABELS,
  STAND_LABELS,
  type RiderDocumentData,
  type RiderStageItem,
} from "./types";

const PDF_GLYPH_COMPONENTS: GlyphComponents = {
  Rect,
  Circle,
  Polygon,
  Path,
  Line,
  G,
};

const ink = "#0f172a";
const muted = "#64748b";
const hairline = "#e2e8f0";

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingHorizontal: 32,
    paddingBottom: 46,
    fontFamily: "Helvetica",
    fontSize: 9,
    color: ink,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: hairline,
    paddingBottom: 8,
    marginBottom: 10,
  },
  title: { fontSize: 17, fontWeight: 700 },
  subtitle: { fontSize: 9.5, color: muted, marginTop: 2 },
  headerMeta: { alignItems: "flex-end", gap: 1 },
  metaLine: { fontSize: 8.5, color: muted },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 5,
  },
  section: { marginBottom: 14 },
  plotWrap: { position: "relative" },
  plotLabel: {
    position: "absolute",
    fontSize: 6.5,
    color: PLOT_COLORS.label,
    textAlign: "center",
  },
  edgeLabel: {
    position: "absolute",
    fontSize: 7,
    color: PLOT_COLORS.edgeLabel,
    letterSpacing: 1.1,
  },
  audienceLabel: {
    position: "absolute",
    fontSize: 8,
    fontWeight: 700,
    color: PLOT_COLORS.audienceBar,
    letterSpacing: 2,
    textAlign: "center",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  legendText: { fontSize: 7.5, color: muted },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: hairline,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: hairline,
    paddingVertical: 3.5,
  },
  cell: { fontSize: 8.5, paddingHorizontal: 4 },
  headerCell: { fontSize: 7.5, fontWeight: 700, paddingHorizontal: 4, color: muted },
  notesBody: { fontSize: 9, lineHeight: 1.4 },
  emptyNote: { fontSize: 8.5, color: muted, fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 32,
    right: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: hairline,
    paddingTop: 6,
  },
  footerBrand: { flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 6.5, color: "#94a3b8" },
  summaryRow: { flexDirection: "row", gap: 18, marginBottom: 10 },
  summaryLabel: { fontSize: 7, color: muted, letterSpacing: 0.8 },
  summaryValue: { fontSize: 12, fontWeight: 700 },
});

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <View style={styles.footerBrand}>
        <Link src="https://arborlive.stanford.edu">
          <ArborLogoPdf width={38} />
        </Link>
        <Text style={styles.footerText}>
          Generated using Arbor Live&apos;s platform — Stanford&apos;s only
          student-run live event production company
        </Text>
      </View>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

function PlotGlyph({ item, layout }: { item: RiderStageItem; layout: PlotLayout }) {
  const symbol = riderSymbol(item.symbol);
  const rect = itemRect(layout, item);
  return (
    <>
      {glyphNode({
        shapes: symbol.shapes,
        palette: RIDER_CATEGORY_PALETTE[symbol.category],
        components: PDF_GLYPH_COMPONENTS,
        rect,
        glyphViewBox: symbol.glyphViewBox,
        preserveAspect: symbol.preserveAspect,
        rotationTransform: itemTransform(rect, item.rotation),
        keyPrefix: item.id,
      })}
    </>
  );
}

function StagePlot({ data, width, height }: { data: RiderDocumentData; width: number; height: number }) {
  const layout = computePlotLayout(data.stage, { width, height, padding: 18 });
  const grid = gridLineOffsets(layout);
  const stage = layout.stage;
  const usedSymbols = [...new Set(data.items.map((item) => item.symbol))].slice(0, 12);

  return (
    <View>
      <View style={[styles.plotWrap, { width, height }]}>
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Rect
            x={stage.left}
            y={stage.top}
            width={stage.width}
            height={stage.height}
            fill={PLOT_COLORS.stageFill}
            stroke={PLOT_COLORS.stageBorder}
            strokeWidth={1.2}
          />
          {grid.vertical.map((x) => (
            <Line
              key={`v-${x}`}
              x1={x}
              y1={stage.top}
              x2={x}
              y2={stage.top + stage.height}
              stroke={PLOT_COLORS.grid}
              strokeWidth={0.5}
            />
          ))}
          {grid.horizontal.map((y) => (
            <Line
              key={`h-${y}`}
              x1={stage.left}
              y1={y}
              x2={stage.left + stage.width}
              y2={y}
              stroke={PLOT_COLORS.grid}
              strokeWidth={0.5}
            />
          ))}
          <Line
            x1={stage.left}
            y1={stage.top + stage.height}
            x2={stage.left + stage.width}
            y2={stage.top + stage.height}
            stroke={PLOT_COLORS.audienceBar}
            strokeWidth={3}
          />
          {data.items.map((item) => (
            <PlotGlyph key={item.id} item={item} layout={layout} />
          ))}
        </Svg>

        {data.items.map((item) => {
          const rect = itemRect(layout, item);
          const label = labelRect(layout, rect);
          return (
            <Text
              key={`label-${item.id}`}
              style={[
                styles.plotLabel,
                { left: label.left, top: label.top, width: label.width },
              ]}
            >
              {item.label}
            </Text>
          );
        })}

        <Text style={[styles.edgeLabel, { left: stage.left + 4, top: stage.top + 4 }]}>
          STAGE RIGHT
        </Text>
        <Text
          style={[
            styles.edgeLabel,
            { left: stage.left, top: stage.top + 4, width: stage.width - 4, textAlign: "right" },
          ]}
        >
          STAGE LEFT
        </Text>
        <Text
          style={[
            styles.edgeLabel,
            { left: stage.left, top: stage.top + 4, width: stage.width, textAlign: "center" },
          ]}
        >
          UPSTAGE · {data.stage.widthFt} × {data.stage.depthFt} FT
        </Text>
        <Text
          style={[
            styles.audienceLabel,
            { left: stage.left, top: stage.top + stage.height + 5, width: stage.width },
          ]}
        >
          AUDIENCE
        </Text>
      </View>

      {usedSymbols.length ? (
        <View style={styles.legend}>
          {usedSymbols.map((key) => {
            const symbol = riderSymbol(key);
            const palette = RIDER_CATEGORY_PALETTE[symbol.category];
            return (
              <View key={key} style={styles.legendItem}>
                <Svg width={12} height={12} viewBox="0 0 12 12">
                  {glyphNode({
                    shapes: symbol.shapes,
                    palette,
                    components: PDF_GLYPH_COMPONENTS,
                    rect: { x: 0, y: 0, width: 12, height: 12 },
                    glyphViewBox: symbol.glyphViewBox,
                    preserveAspect: true,
                    keyPrefix: `legend-${key}`,
                  })}
                </Svg>
                <Text style={styles.legendText}>{symbol.label}</Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Summary({ data }: { data: RiderDocumentData }) {
  const entries: Array<[string, string]> = [
    ["PERFORMERS", String(data.performerCount ?? data.items.filter((item) => riderSymbol(item.symbol).category === "performer").length)],
    ["CHANNELS", String(data.inputs.length)],
    ["MONITOR MIXES", String(data.monitorMixes.length)],
    ["STAGE", `${data.stage.widthFt} × ${data.stage.depthFt} ft`],
  ];
  if (data.setLengthMinutes) entries.push(["SET LENGTH", `${data.setLengthMinutes} min`]);

  return (
    <View style={styles.summaryRow}>
      {entries.map(([label, value]) => (
        <View key={label}>
          <Text style={styles.summaryLabel}>{label}</Text>
          <Text style={styles.summaryValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function Header({ data }: { data: RiderDocumentData }) {
  const contact = [data.contactName, data.contactEmail, data.contactPhone].filter(Boolean);
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.title}>{data.bandName}</Text>
        <Text style={styles.subtitle}>
          Technical rider{data.riderName ? ` · ${data.riderName}` : ""}
        </Text>
      </View>
      <View style={styles.headerMeta}>
        <Text style={styles.metaLine}>Updated {data.updatedAtLabel}</Text>
        {contact.map((line) => (
          <Text key={line} style={styles.metaLine}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}

const INPUT_COLUMNS = [24, 118, 44, 104, 62, 28, 62, 70, 98];
const MONITOR_COLUMNS = [34, 150, 66, 44, 246];
const BACKLINE_COLUMNS = [200, 40, 100, 200];

function Table({
  columns,
  headers,
  rows,
  emptyMessage,
}: {
  columns: number[];
  headers: string[];
  rows: string[][];
  emptyMessage: string;
}) {
  if (!rows.length) {
    return <Text style={styles.emptyNote}>{emptyMessage}</Text>;
  }
  return (
    <View>
      <View style={styles.tableHeader}>
        {headers.map((header, index) => (
          <Text key={header} style={[styles.headerCell, { width: columns[index] }]}>
            {header.toUpperCase()}
          </Text>
        ))}
      </View>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row} wrap={false}>
          {row.map((cell, index) => (
            <Text key={index} style={[styles.cell, { width: columns[index] }]}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function NotesSection({ title, body }: { title: string; body?: string }) {
  if (!body?.trim()) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.notesBody}>{body.trim()}</Text>
    </View>
  );
}

export function RiderPdf({ data }: { data: RiderDocumentData }) {
  const inputRows = data.inputs.map((input) => [
    input.stereo ? `${input.channel}–${input.channel + 1}` : String(input.channel),
    input.stereo ? `${input.source || "—"} (L/R)` : input.source || "—",
    INPUT_TYPE_LABELS[input.inputType],
    input.micPreference ?? "—",
    STAND_LABELS[input.stand],
    input.phantom ? "Yes" : "—",
    PROVIDED_BY_LABELS[input.providedBy],
    input.group ?? "—",
    input.notes ?? "",
  ]);

  const monitorRows = data.monitorMixes.map((mix) => [
    String(mix.mixNumber),
    mix.label || "—",
    MONITOR_TYPE_LABELS[mix.type],
    mix.type === "iem" ? "—" : String(mix.sends),
    mix.notes ?? "",
  ]);

  const backlineRows = data.backline.map((item) => [
    item.label || "—",
    String(item.quantity),
    PROVIDED_BY_LABELS[item.providedBy],
    item.notes ?? "",
  ]);

  return (
    <Document title={`${data.bandName} — technical rider`} author={data.bandName}>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <Header data={data} />
        <Summary data={data} />
        <StagePlot data={data} width={716} height={380} />
        <Footer />
      </Page>

      <Page size="LETTER" style={styles.page}>
        <Header data={data} />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Input list</Text>
          <Table
            columns={INPUT_COLUMNS}
            headers={["Ch", "Source", "Type", "Mic / DI", "Stand", "48V", "Provided", "Group", "Notes"]}
            rows={inputRows}
            emptyMessage="No input channels listed."
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monitor mixes</Text>
          <Table
            columns={MONITOR_COLUMNS}
            headers={["Mix", "For", "Type", "Sends", "Notes"]}
            rows={monitorRows}
            emptyMessage="No monitor mixes listed."
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Backline</Text>
          <Table
            columns={BACKLINE_COLUMNS}
            headers={["Item", "Qty", "Provided by", "Notes"]}
            rows={backlineRows}
            emptyMessage="No backline requirements listed."
          />
        </View>

        <NotesSection title="Power" body={data.powerNotes} />
        <NotesSection title="Notes" body={data.generalNotes} />
        <NotesSection title="Hospitality" body={data.hospitalityNotes} />
        <Footer />
      </Page>
    </Document>
  );
}
