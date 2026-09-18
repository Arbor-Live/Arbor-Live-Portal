import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { RiderPages, RiderPdfFooter } from "./rider-pdf";
import type { EventBriefDocumentData } from "./brief-types";

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
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontWeight: 700, marginBottom: 5 },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginBottom: 12 },
  factLabel: { fontSize: 7, color: muted, letterSpacing: 0.8 },
  factValue: { fontSize: 10, fontWeight: 700 },
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
  instructionTitle: { fontSize: 9.5, fontWeight: 700, marginBottom: 2, marginTop: 4 },
  emptyNote: { fontSize: 8.5, color: muted, fontStyle: "italic" },
});

const SCHEDULE_COLUMNS = [74, 112, 66, 66, 230];
const CREW_COLUMNS = [104, 116, 62, 116, 150];
const PEOPLE_COLUMNS = [118, 130, 200, 100];

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

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <View>
      <Text style={styles.factLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export function EventBriefPdf({ data }: { data: EventBriefDocumentData }) {
  const scheduleRows = data.blocks.map((block) => [
    block.dayLabel,
    block.label,
    block.timeLabel.split(" – ")[0] ?? "",
    block.timeLabel.split(" – ")[1] ?? "",
    block.notes ?? "",
  ]);

  const crewRows = data.shifts.map((shift) => [
    shift.role,
    shift.person,
    shift.callLabel ?? "—",
    shift.timeLabel,
    shift.notes ?? "",
  ]);

  const peopleRows = data.assignments.map((assignment) => [
    assignment.roleLabel,
    assignment.person,
    assignment.contact ?? "",
    assignment.notes ?? "",
  ]);

  return (
    <Document title={`${data.title} — event brief`} author="Arbor Live">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.subtitle}>
              Event brief{data.eventTypeLabel ? ` · ${data.eventTypeLabel}` : ""}
            </Text>
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.metaLine}>Generated {data.generatedAtLabel}</Text>
            <Text style={styles.metaLine}>{data.statusLabel}</Text>
          </View>
        </View>

        <View style={styles.facts}>
          <Fact label="When" value={data.whenLabel} />
          <Fact label="Venue" value={data.venueName} />
          <Fact label="Host" value={data.hostLabel} />
        </View>

        {data.venueAddress ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Address</Text>
            <Text style={styles.notesBody}>{data.venueAddress}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <Table
            columns={SCHEDULE_COLUMNS}
            headers={["Day", "Block", "Start", "End", "Notes"]}
            rows={scheduleRows}
            emptyMessage="No schedule blocks yet."
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crew</Text>
          <Table
            columns={CREW_COLUMNS}
            headers={["Role", "Person", "Call", "Shift", "Notes"]}
            rows={crewRows}
            emptyMessage="No crew shifts yet."
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>People &amp; contacts</Text>
          <Table
            columns={PEOPLE_COLUMNS}
            headers={["Role", "Name", "Contact", "Notes"]}
            rows={peopleRows}
            emptyMessage="No assignments yet."
          />
        </View>

        {data.instructions.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {data.instructions.map((instruction) => (
              <View key={instruction.title} wrap={false}>
                <Text style={styles.instructionTitle}>{instruction.title}</Text>
                <Text style={styles.notesBody}>{instruction.body}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {data.notes?.trim() ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.notesBody}>{data.notes.trim()}</Text>
          </View>
        ) : null}

        <RiderPdfFooter />
      </Page>

      {data.nightRider ? <RiderPages data={data.nightRider} /> : null}
    </Document>
  );
}
