import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { pdfSafe, RiderPages, RiderPdfFooter } from "./rider-pdf";
import type {
  EventBriefDocumentData,
  EventBriefMoment,
  EventBriefRunOfShowEntry,
  EventBriefShift,
} from "./brief-types";

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
  headerLeft: { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 12 },
  title: { fontSize: 17, fontWeight: 700 },
  subtitle: { fontSize: 9.5, color: muted, marginTop: 2 },
  headerMeta: { alignItems: "flex-end", gap: 1, flexShrink: 0 },
  metaLine: { fontSize: 8.5, color: muted },
  headerQr: { alignItems: "center", gap: 2, flexShrink: 0 },
  qrImage: { width: 58, height: 58 },
  qrCaption: { fontSize: 6.5, color: muted },
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
  dayTitle: { fontSize: 9.5, fontWeight: 700, marginTop: 6, marginBottom: 4 },
  rosSection: { borderWidth: 1, borderColor: hairline, marginBottom: 6 },
  rosSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 6,
  },
  rosTime: { width: 92, fontSize: 8.5, fontWeight: 700 },
  rosChip: {
    fontSize: 6.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    borderWidth: 0.75,
    paddingVertical: 1,
    paddingHorizontal: 3,
  },
  rosLabel: { flexGrow: 1, flexShrink: 1, fontSize: 9, fontWeight: 700 },
  rosMoment: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: hairline,
    paddingVertical: 3,
    paddingLeft: 14,
    paddingRight: 6,
    gap: 6,
  },
  rosMomentTime: { width: 44, fontSize: 8.5 },
  rosDuration: { width: 34, fontSize: 7.5, color: muted },
  rosMomentLabel: { flexGrow: 1, flexShrink: 1, fontSize: 8.5 },
  rosNotes: { fontSize: 7.5, color: muted, paddingLeft: 104, paddingRight: 6, paddingBottom: 3 },
  rosSwaps: { paddingLeft: 104, paddingRight: 6, paddingBottom: 4, gap: 1 },
  rosSwap: { fontSize: 7.5, fontFamily: "Courier" },
  rosCrew: {
    borderTopWidth: 1,
    borderTopColor: hairline,
    paddingVertical: 3,
    paddingHorizontal: 6,
    gap: 1.5,
  },
  rosCrewTitle: { fontSize: 6.5, fontWeight: 700, color: muted, letterSpacing: 0.8 },
  rosCrewRow: { flexDirection: "row", gap: 6 },
  rosCrewRole: { width: 110, fontSize: 8 },
  rosCrewPerson: { width: 140, fontSize: 8, fontWeight: 700 },
  rosCrewOpen: { width: 140, fontSize: 8, fontWeight: 700, color: "#b45309" },
  rosCrewTime: { flexGrow: 1, fontSize: 8, color: muted },
});

/** Chip colors per block type; printed briefs are usually black and white, so borders carry it. */
const CHIP_COLORS: Record<string, string> = {
  Setup: "#1d4ed8",
  Show: "#047857",
  Strike: "#b45309",
  Custom: muted,
  Doors: "#334155",
  Soundcheck: "#0369a1",
  Set: "#6d28d9",
  Changeover: "#c2410c",
};

function Chip({ label }: { label: string }) {
  const color = CHIP_COLORS[label] ?? muted;
  return <Text style={[styles.rosChip, { color, borderColor: color }]}>{label.toUpperCase()}</Text>;
}

function MomentRow({ moment, nested }: { moment: EventBriefMoment; nested: boolean }) {
  return (
    <View wrap={false}>
      <View style={[styles.rosMoment, nested ? {} : { borderTopWidth: 0, paddingLeft: 6 }]}>
        <Text style={styles.rosMomentTime}>{moment.startLabel}</Text>
        <Text style={styles.rosDuration}>{moment.durationLabel}</Text>
        <Chip label={moment.typeLabel} />
        <Text style={styles.rosMomentLabel}>{moment.label}</Text>
      </View>
      {moment.notes ? <Text style={styles.rosNotes}>{moment.notes}</Text> : null}
      {moment.swaps?.length ? (
        <View style={styles.rosSwaps}>
          {moment.swaps.map((swap) => (
            <Text key={swap} style={styles.rosSwap}>
              {pdfSafe(swap)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CrewList({ crew }: { crew: EventBriefShift[] }) {
  if (!crew.length) return null;
  return (
    <View style={styles.rosCrew} wrap={false}>
      <Text style={styles.rosCrewTitle}>CREW</Text>
      {crew.map((shift, index) => (
        <View key={index} style={styles.rosCrewRow}>
          <Text style={styles.rosCrewRole}>{shift.role}</Text>
          <Text style={shift.open ? styles.rosCrewOpen : styles.rosCrewPerson}>{shift.person}</Text>
          <Text style={styles.rosCrewTime}>
            {shift.timeLabel}
            {shift.notes ? ` · ${shift.notes}` : ""}
          </Text>
        </View>
      ))}
    </View>
  );
}

function RunOfShowEntry({ entry }: { entry: EventBriefRunOfShowEntry }) {
  const { section } = entry;
  if (!section) {
    return (
      <View style={[styles.rosSection, { borderStyle: "dashed" }]}>
        {entry.moments.map((moment, index) => (
          <MomentRow key={index} moment={moment} nested={false} />
        ))}
      </View>
    );
  }
  return (
    <View style={styles.rosSection}>
      <View wrap={false} minPresenceAhead={40}>
        <View style={styles.rosSectionHeader}>
          <Text style={styles.rosTime}>{section.timeLabel}</Text>
          <Chip label={section.typeLabel} />
          <Text style={styles.rosLabel}>{section.label}</Text>
        </View>
        {section.notes ? (
          <Text style={[styles.rosNotes, { paddingLeft: 6, paddingTop: 2 }]}>{section.notes}</Text>
        ) : null}
      </View>
      {entry.moments.map((moment, index) => (
        <MomentRow key={index} moment={moment} nested />
      ))}
      <CrewList crew={section.crew} />
    </View>
  );
}

const ACT_COLUMNS = [24, 240, 142, 142];
const CREW_COLUMNS = [130, 150, 150, 118];
const PEOPLE_COLUMNS = [118, 130, 200, 100];
const PULL_LIST_COLUMNS = [330, 60, 158];

/**
 * A titled table. The title, header, and first row stay together so a page
 * never ends on a lone heading.
 */
function Table({
  title,
  columns,
  headers,
  rows,
  emptyMessage,
}: {
  title: string;
  columns: number[];
  headers: string[];
  rows: string[][];
  emptyMessage: string;
}) {
  const heading = <Text style={styles.sectionTitle}>{title}</Text>;
  if (!rows.length) {
    return (
      <View wrap={false}>
        {heading}
        <Text style={styles.emptyNote}>{emptyMessage}</Text>
      </View>
    );
  }
  // Rows inside the unbreakable lead block must not nest another wrap={false};
  // react-pdf then squeezes the block into the footer instead of moving it.
  const renderRow = (row: string[], rowIndex: number, own = true) => (
    <View key={rowIndex} style={styles.row} wrap={own ? false : undefined}>
      {row.map((cell, index) => (
        <Text key={index} style={[styles.cell, { width: columns[index] }]}>
          {cell}
        </Text>
      ))}
    </View>
  );
  return (
    <>
      <View wrap={false}>
        {heading}
        <View style={styles.tableHeader}>
          {headers.map((header, index) => (
            <Text key={header} style={[styles.headerCell, { width: columns[index] }]}>
              {header.toUpperCase()}
            </Text>
          ))}
        </View>
        {renderRow(rows[0]!, 0, false)}
      </View>
      {rows.slice(1).map((row, index) => renderRow(row, index + 1))}
    </>
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

export function EventBriefPdf({
  data,
  qrDataUri,
}: {
  data: EventBriefDocumentData;
  qrDataUri?: string;
}) {
  const actRows = data.acts.map((act, index) => [
    String(index + 1),
    act.name,
    act.soundcheckLabel ?? "",
    act.setLabel ?? "—",
  ]);

  const otherShiftRows = data.otherShifts.map((shift) => [
    shift.role,
    shift.person,
    shift.timeLabel,
    shift.notes ?? "",
  ]);

  const peopleRows = data.assignments.map((assignment) => [
    assignment.roleLabel,
    assignment.person,
    assignment.contact ?? "",
    assignment.notes ?? "",
  ]);

  const contactRows = data.contacts.map((contact) => [
    contact.roleLabel,
    contact.person,
    contact.contact ?? "",
    contact.notes ?? "",
  ]);

  const pullListRows = data.pullList.map((item) => [
    item.label,
    String(item.quantity),
    item.notes ?? "",
  ]);

  return (
    <Document title={`${data.title} — event brief`} author="Arbor Live">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.subtitle}>
              Event brief{data.eventTypeLabel ? ` · ${data.eventTypeLabel}` : ""}
            </Text>
          </View>
          <View style={styles.headerMeta}>
            <Text style={styles.metaLine}>Generated {data.generatedAtLabel}</Text>
            <Text style={styles.metaLine}>{data.statusLabel}</Text>
          </View>
          {qrDataUri ? (
            <View style={styles.headerQr}>
              <Image style={styles.qrImage} src={qrDataUri} />
              <Text style={styles.qrCaption}>Scan to open</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.facts}>
          <Fact label="When" value={data.whenLabel} />
          <Fact label="Venue" value={data.venueName} />
          <Fact label="Host" value={data.hostLabel} />
        </View>

        {data.venueAddress ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={60}>Address</Text>
            <Text style={styles.notesBody}>{data.venueAddress}</Text>
          </View>
        ) : null}

        {data.acts.length ? (
          <View style={styles.section}>
            <Table
              title="Acts"
              columns={ACT_COLUMNS}
              headers={["#", "Act", "Soundcheck", "Set"]}
              rows={actRows}
              emptyMessage="No acts yet."
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle} minPresenceAhead={60}>Run of show</Text>
          {data.runOfShow.length === 0 ? (
            <Text style={styles.emptyNote}>No run of show yet.</Text>
          ) : null}
          {data.runOfShow.map((day, dayIndex) => (
            <View key={dayIndex}>
              {day.dayLabel ? <Text style={styles.dayTitle}>{day.dayLabel}</Text> : null}
              {day.entries.map((entry, index) => (
                <RunOfShowEntry key={index} entry={entry} />
              ))}
            </View>
          ))}
        </View>

        {data.otherShifts.length ? (
          <View style={styles.section}>
            <Table
              title="Other shifts"
              columns={CREW_COLUMNS}
              headers={["Role", "Person", "Shift", "Notes"]}
              rows={otherShiftRows}
              emptyMessage=""
            />
          </View>
        ) : null}

        <View style={styles.section}>
          <Table
            title="People"
            columns={PEOPLE_COLUMNS}
            headers={["Role", "Name", "Contact", "Notes"]}
            rows={peopleRows}
            emptyMessage="No assignments yet."
          />
        </View>

        <View style={styles.section}>
          <Table
            title="Contacts"
            columns={PEOPLE_COLUMNS}
            headers={["Position", "Name", "Contact", "Notes"]}
            rows={contactRows}
            emptyMessage="No contacts yet."
          />
        </View>

        {data.pullList.length ? (
          <View style={styles.section}>
            <Table
              title="Pull list"
              columns={PULL_LIST_COLUMNS}
              headers={["Item", "Qty", "Notes"]}
              rows={pullListRows}
              emptyMessage="No equipment on the pull list yet."
            />
          </View>
        ) : null}

        {data.instructions.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle} minPresenceAhead={60}>Instructions</Text>
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
            <Text style={styles.sectionTitle} minPresenceAhead={60}>Notes</Text>
            <Text style={styles.notesBody}>{data.notes.trim()}</Text>
          </View>
        ) : null}

        <RiderPdfFooter />
      </Page>

      {data.nightRider ? <RiderPages data={data.nightRider} /> : null}
    </Document>
  );
}
