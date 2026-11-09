import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { Box } from "ink";
import { useState, type ComponentType, type ReactNode } from "react";

import { Text } from "../../app/text.tsx";
import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { environmentCatalog } from "../../state/catalog.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { KeysSection } from "./KeysSection.tsx";
import { LabelsSection } from "./LabelsSection.tsx";
import { ModelsSection } from "./ModelsSection.tsx";
import { ProvidersSection } from "./ProvidersSection.tsx";
import { StorageSection } from "./StorageSection.tsx";

export interface SectionProps {
  readonly environmentId: EnvironmentId;
  readonly width: number;
  /** Rows for the section body. */
  readonly height: number;
}

const SECTIONS: ReadonlyArray<{
  readonly title: string;
  readonly component: ComponentType<SectionProps>;
}> = [
  { title: "Labels", component: LabelsSection },
  { title: "Providers", component: ProvidersSection },
  { title: "Models", component: ModelsSection },
  { title: "Storage", component: StorageSection },
  { title: "Keys", component: KeysSection },
];

// Border, tabs, blank line and the hint line.
const CHROME_ROWS = 5;

export function SettingsOverlay({ width, height }: TuiViewProps) {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const route = useAtomValue(routeAtom);
  const environments = [...catalog.entries.values()].map((entry) => entry.target);
  const [section, setSection] = useState(0);
  const [picked, setPicked] = useState<EnvironmentId | null>(null);
  const current =
    environments.find((target) => target.environmentId === picked) ??
    environments.find((target) => target.environmentId === route.thread?.environmentId) ??
    environments[0];

  // Sections mount their handlers first, so they see keys before these.
  useRegionInput("overlay", (press) => {
    const by = isKey(press, "tab") ? 1 : isKey(press, "shift+tab") ? -1 : 0;
    if (by !== 0) {
      setSection((section + by + SECTIONS.length) % SECTIONS.length);
      return true;
    }
    if (isKey(press, "e") && current && environments.length > 1) {
      const index = environments.indexOf(current);
      setPicked(environments[(index + 1) % environments.length]!.environmentId);
      return true;
    }
    return false;
  });

  const Section = SECTIONS[section]!.component;
  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={theme.borderFocused}
      paddingX={1}
    >
      <Box gap={2}>
        <Text color={theme.text} bold>
          Settings
        </Text>
        {SECTIONS.map((entry, index) => (
          <Text
            key={entry.title}
            color={index === section ? theme.accent : theme.textMuted}
            bold={index === section}
          >
            {entry.title}
          </Text>
        ))}
        {current && (
          <Text color={theme.textFaint} wrap="truncate">
            {current.label}
            {environments.length > 1 ? " (e: next server)" : ""}
          </Text>
        )}
      </Box>
      <Box flexDirection="column" flexGrow={1} marginTop={1} overflow="hidden">
        {current ? (
          <Section
            key={`${section}:${current.environmentId}`}
            environmentId={current.environmentId}
            width={width - 4}
            height={Math.max(1, height - CHROME_ROWS)}
          />
        ) : (
          <Text color={theme.textFaint}>Pair with a server to edit its settings.</Text>
        )}
      </Box>
      <Text color={theme.textFaint} wrap="truncate">
        tab/shift+tab section · esc close
      </Text>
    </Box>
  );
}

/** A section body: rows scrolled to the cursor, then a hint and a status line. */
export function SectionBody(props: {
  readonly height: number;
  readonly cursor: number;
  readonly rows: ReadonlyArray<ReactNode>;
  readonly footer?: ReactNode;
  readonly hint: string;
  readonly error?: string | null;
}) {
  const footerRows = (props.footer ? 1 : 0) + 2;
  const visible = Math.max(1, props.height - footerRows);
  const first = Math.max(0, Math.min(props.cursor - visible + 1, props.rows.length - visible));
  return (
    <Box flexDirection="column">
      {props.rows.slice(first, first + visible)}
      {props.footer}
      <Text color={props.error ? theme.danger : theme.textFaint} wrap="truncate">
        {props.error ?? " "}
      </Text>
      <Text color={theme.textMuted} wrap="truncate">
        {props.hint}
      </Text>
    </Box>
  );
}

/** One list row; the cursor row gets the selection background. */
export function Row(props: { readonly selected: boolean; readonly children: ReactNode }) {
  return (
    <Box gap={1} {...(props.selected ? { backgroundColor: theme.selection } : {})}>
      <Text color={theme.accent}>{props.selected ? "›" : " "}</Text>
      {props.children}
    </Box>
  );
}
