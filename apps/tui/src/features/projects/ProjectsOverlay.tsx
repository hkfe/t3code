import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import {
  findExistingAddProject,
  resolveAddProjectPath,
} from "@t3tools/client-runtime/operations/projects";
import {
  inferProjectTitleFromPath,
  planProjectRemoval,
} from "@t3tools/client-runtime/state/projects";
import { ProjectId, type ServerConfig } from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import { Atom } from "effect/reactivity";
import { Box, usePaste } from "ink";
import { useContext, useState } from "react";

import { Text } from "../../app/text.tsx";
import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { environmentCatalog } from "../../state/catalog.ts";
import { environmentProjects, projectEnvironment } from "../../state/projects.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { environmentThreadShells } from "../../state/threadShells.ts";
import { overlayAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { modelPickerRows } from "../composer/settings.ts";
import { canOperateAtom, copyToClipboard, runCommand } from "../thread-actions/actions.ts";
import { Dialog, editText, MenuRows, TextField, useListCursor } from "../thread-actions/ui.tsx";
import { buildProjectRows, projectColor, projectKey } from "./model.ts";

type Page = "list" | "add" | "rename" | "settings" | "model" | "remove";

interface PageProps {
  readonly width: number;
  readonly height: number;
  readonly project: EnvironmentProject | undefined;
  readonly go: (page: Page, error?: string | null) => void;
  readonly error: string | null;
}

const noAccess = Atom.make(false);
const random = SecureRandom.make((size) => globalThis.crypto.getRandomValues(new Uint8Array(size)));

function modelLabel(config: ServerConfig | null, project: EnvironmentProject) {
  const selection = project.defaultModelSelection;
  if (!selection) return "Server default";
  const provider = config?.providers.find((entry) => entry.instanceId === selection.instanceId);
  const model = provider?.models.find((entry) => entry.slug === selection.model);
  return `${provider?.displayName ?? selection.instanceId} · ${model?.name ?? selection.model}`;
}

interface ListView {
  /** The selected row's key; the index is the fallback when that row leaves the list. */
  readonly key: string;
  readonly cursor: number;
  readonly expanded: ReadonlySet<string>;
}

function ListPage({
  width,
  height,
  error,
  go,
  view,
  setView,
  select,
}: PageProps & {
  readonly view: ListView;
  readonly setView: (view: ListView) => void;
  readonly select: (project: EnvironmentProject | undefined) => void;
}) {
  const registry = useContext(RegistryContext);
  const projects = useAtomValue(environmentProjects.projectsAtom);
  const threads = useAtomValue(environmentThreadShells.quietThreadShellsAtom);
  const { expanded } = view;
  const rows = buildProjectRows(projects, threads, expanded);
  const found = rows.findIndex((entry) => entry.key === view.key);
  const cursor = found >= 0 ? found : Math.min(view.cursor, Math.max(0, rows.length - 1));
  const row = rows[cursor];
  const project =
    row?.kind === "project"
      ? row.project
      : projects.find((entry) => row !== undefined && row.key.startsWith(`${projectKey(entry)}:`));
  const canOperate = useAtomValue(project ? canOperateAtom(project.environmentId) : noAccess);
  const move = (by: number) => {
    const next = Math.max(0, Math.min(cursor + by, rows.length - 1));
    setView({ ...view, key: rows[next]?.key ?? "", cursor: next });
  };
  const toggle = (key: string) => {
    const next = new Set(expanded);
    if (!next.delete(key)) next.add(key);
    setView({ key: row?.key ?? "", cursor, expanded: next });
  };
  // Pin and rename reorder the list; the cursor stays on the row it acted on.
  const keep = () => setView({ ...view, key: row?.key ?? "", cursor });
  const open = (page: Page) => {
    keep();
    select(project);
    go(page);
  };

  useRegionInput("overlay", (press) => {
    if (isKey(press, "arrowdown") || isKey(press, "j")) move(1);
    else if (isKey(press, "arrowup") || isKey(press, "k")) move(-1);
    else if (isKey(press, "a")) open("add");
    else if (!row || !project) return false;
    else if (isKey(press, "enter") && row.kind === "thread") {
      registry.set(routeAtom, { view: "thread", thread: row.ref });
      registry.set(overlayAtom, null);
    } else if (isKey(press, "enter") || isKey(press, "space")) toggle(projectKey(project));
    else if (isKey(press, "arrowright") || isKey(press, "l")) {
      if (!expanded.has(projectKey(project))) toggle(projectKey(project));
    } else if (isKey(press, "arrowleft") || isKey(press, "h")) {
      if (expanded.has(projectKey(project))) toggle(projectKey(project));
    } else if (isKey(press, "y")) copyToClipboard(project.workspaceRoot);
    else if (isKey(press, "s")) open("settings");
    else if (!canOperate && (isKey(press, "p") || isKey(press, "r") || isKey(press, "d"))) {
      go("list", "This connection cannot change projects.");
    } else if (isKey(press, "p")) {
      keep();
      void runCommand(registry, projectEnvironment.update, {
        environmentId: project.environmentId,
        input: { projectId: project.id, pinned: project.pinnedAt == null },
      }).then((failure) => go("list", failure));
    } else if (isKey(press, "r")) open("rename");
    else if (isKey(press, "d")) open("remove");
    else return false;
    return true;
  });

  const visible = Math.max(1, height - 6);
  const first = Math.max(0, Math.min(cursor - visible + 1, rows.length - visible));
  return (
    <Box width={width} height={height} flexDirection="column" paddingX={1}>
      <Text color={theme.textMuted} bold>
        Projects
      </Text>
      {rows.length === 0 ? (
        <Text color={theme.textFaint}>No projects yet. Press a to add one.</Text>
      ) : null}
      {rows.slice(first, first + visible).map((entry, offset) => {
        const selected = first + offset === cursor;
        const background = selected ? { backgroundColor: theme.selection } : {};
        if (entry.kind === "thread") {
          return (
            <Text key={entry.key} wrap="truncate" color={theme.text} {...background}>
              {"     "}
              {entry.title}
            </Text>
          );
        }
        const { project: item } = entry;
        return (
          <Box key={entry.key} gap={1}>
            <Text color={theme.textFaint}>{entry.expanded ? "▾" : "▸"}</Text>
            <Text color={theme.project[projectColor(item)]}>●</Text>
            <Text color={theme.text} bold={selected} {...background} wrap="truncate">
              {item.title}
            </Text>
            {item.pinnedAt != null ? <Text color={theme.accent}>pinned</Text> : null}
            <Text color={theme.textMuted}>{entry.threadCount}</Text>
            <Text color={theme.textFaint} wrap="truncate-start">
              {item.workspaceRoot}
            </Text>
          </Box>
        );
      })}
      <Box flexGrow={1} />
      {error ? (
        <Text color={theme.danger} wrap="truncate">
          {error}
        </Text>
      ) : null}
      <Text color={theme.textFaint} wrap="truncate">
        ↑↓ move · enter open · h/l fold · a add · p pin · r rename · s settings · y copy path · d
        remove · esc close
      </Text>
    </Box>
  );
}

function TextPage(
  props: PageProps & {
    title: string;
    initial: string;
    hint: string;
    submit: (value: string) => void;
  },
) {
  const [value, setValue] = useState(props.initial);
  usePaste((text) => setValue((current) => current + text.replace(/\s+/g, " ")));
  useRegionInput("overlay", (press) => {
    if (isKey(press, "enter")) props.submit(value);
    else if (isKey(press, "arrowleft") && value.length === 0) props.go("list");
    else {
      const next = editText(press, value);
      if (next === null) return false;
      setValue(next);
    }
    return true;
  });
  return (
    <Dialog {...props} title={props.title} hint={props.hint} error={props.error}>
      <TextField value={value} />
    </Dialog>
  );
}

function AddPage(props: PageProps) {
  const registry = useContext(RegistryContext);
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const projects = useAtomValue(environmentProjects.projectsAtom);
  const environmentId =
    props.project?.environmentId ?? Array.from(enabledEnvironmentIds(catalog))[0] ?? null;
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const label = environmentId ? catalog.entries.get(environmentId)?.target.label : undefined;
  return (
    <TextPage
      {...props}
      title={`Add project${label ? ` on ${label}` : ""}`}
      initial=""
      hint="absolute path of an existing folder · enter add · esc cancel"
      submit={(raw) => {
        if (environmentId === null) return props.go("add", "Pair a server first.");
        const resolved = resolveAddProjectPath({
          rawPath: raw,
          currentProjectCwd: props.project?.workspaceRoot ?? null,
          platform: config?.environment.platform.os ?? "",
        });
        if (!resolved.ok) return props.go("add", resolved.error);
        const existing = findExistingAddProject({ projects, environmentId, path: resolved.path });
        if (existing) return props.go("add", `Already added as "${existing.title}".`);
        // Unlike mobile, a typo must not create a folder: the server rejects missing paths.
        void runCommand(registry, projectEnvironment.create, {
          environmentId,
          input: {
            projectId: ProjectId.make(Effect.runSync(random.uuidV4())),
            title: inferProjectTitleFromPath(resolved.path),
            workspaceRoot: resolved.path,
            createWorkspaceRootIfMissing: false,
          },
        }).then((failure) =>
          // The server reports every create failure as one generic message.
          failure === null
            ? props.go("list")
            : props.go("add", "Could not add it. Check that the folder exists."),
        );
      }}
    />
  );
}

function RenamePage(props: PageProps & { project: EnvironmentProject }) {
  const registry = useContext(RegistryContext);
  return (
    <TextPage
      {...props}
      title="Rename project"
      initial={props.project.title}
      hint="enter save · esc cancel"
      submit={(raw) => {
        const title = raw.trim();
        if (title.length === 0) return props.go("rename", "Enter a name.");
        if (title === props.project.title) return props.go("list");
        void runCommand(registry, projectEnvironment.update, {
          environmentId: props.project.environmentId,
          input: { projectId: props.project.id, title },
        }).then((failure) => props.go(failure === null ? "list" : "rename", failure));
      }}
    />
  );
}

function SettingsPage(props: PageProps & { project: EnvironmentProject }) {
  const { project } = props;
  const config = useAtomValue(serverEnvironment.configValueAtom(project.environmentId));
  const canOperate = useAtomValue(canOperateAtom(project.environmentId));
  useRegionInput("overlay", (press) => {
    if (isKey(press, "arrowleft") || isKey(press, "h")) props.go("list");
    else if (isKey(press, "r") && canOperate) props.go("rename");
    else if (isKey(press, "m") && canOperate) props.go("model");
    else if (isKey(press, "y")) copyToClipboard(project.workspaceRoot);
    else return false;
    return true;
  });
  const line = (name: string, value: string) => (
    <Text wrap="truncate">
      <Text color={theme.textMuted}>{name.padEnd(15)}</Text>
      <Text color={theme.text}>{value}</Text>
    </Text>
  );
  return (
    <Dialog
      {...props}
      title={project.title}
      hint={`${canOperate ? "r rename · m model · " : ""}y copy path · ←/h back · esc close`}
      error={props.error ?? (canOperate ? null : "This connection cannot change projects.")}
    >
      {line("Path", project.workspaceRoot)}
      {line("Default model", modelLabel(config, project))}
      {line("Scripts", project.scripts.length === 0 ? "None" : "")}
      {project.scripts.map((script) => (
        <Text key={script.id} wrap="truncate" color={theme.text}>
          {"  "}
          {script.name}
          <Text color={theme.textFaint}> {script.command}</Text>
        </Text>
      ))}
    </Dialog>
  );
}

function ModelPage(props: PageProps & { project: EnvironmentProject }) {
  const registry = useContext(RegistryContext);
  const config = useAtomValue(serverEnvironment.configValueAtom(props.project.environmentId));
  const choices = [null, ...modelPickerRows(config, "")];
  const [cursor, move] = useListCursor(choices.length);
  useRegionInput("overlay", (press) => {
    if (move(press)) return true;
    if (isKey(press, "arrowleft") || isKey(press, "h")) props.go("settings");
    else if (isKey(press, "enter")) {
      const choice = choices[cursor];
      void runCommand(registry, projectEnvironment.update, {
        environmentId: props.project.environmentId,
        input: {
          projectId: props.project.id,
          defaultModelSelection: choice
            ? createModelSelection(choice.provider.instanceId, choice.model.slug)
            : null,
        },
      }).then((failure) => props.go(failure === null ? "settings" : "model", failure));
    } else return false;
    return true;
  });
  return (
    <Dialog {...props} title="Default model" hint="↑↓ move · enter pick · ←/h back · esc close">
      <MenuRows
        cursor={cursor}
        height={props.height}
        items={choices.map((choice) => ({
          id: choice ? `${choice.provider.instanceId}/${choice.model.slug}` : "default",
          label: choice
            ? `${choice.provider.displayName ?? choice.provider.driver} · ${choice.model.name}`
            : "Server default",
        }))}
      />
    </Dialog>
  );
}

function RemovePage(props: PageProps & { project: EnvironmentProject }) {
  const registry = useContext(RegistryContext);
  const threads = useAtomValue(environmentThreadShells.quietThreadShellsAtom);
  const { project } = props;
  const { confirmationMessage } = planProjectRemoval({
    members: [project],
    groupMemberCount: 1,
    hasOtherMembers: false,
    displayName: project.title,
    threads,
  });
  const [question, ...details] = confirmationMessage.split("\n");
  // Only y removes: enter, a stray key or esc keeps the project.
  useRegionInput("overlay", (press) => {
    // Escape and ctrl/alt keys (quit, palette) go on to the global bindings.
    if (isKey(press, "escape") || press.key.ctrl || press.key.meta) return false;
    if (!isKey(press, "y")) {
      props.go("list");
      return true;
    }
    void runCommand(registry, projectEnvironment.delete, {
      environmentId: project.environmentId,
      input: { projectId: project.id, force: true },
    }).then((failure) => props.go(failure === null ? "list" : "remove", failure));
    return true;
  });
  return (
    <Dialog
      {...props}
      title={question ?? "Remove project?"}
      hint="y remove · any other key keeps it"
    >
      {details.map((detail) => (
        <Text key={detail} color={theme.warning} wrap="wrap">
          {detail}
        </Text>
      ))}
    </Dialog>
  );
}

export function ProjectsOverlay({ width, height }: TuiViewProps) {
  const projects = useAtomValue(environmentProjects.projectsAtom);
  const [state, setState] = useState<{
    page: Page;
    key: string | null;
    error: string | null;
  }>({ page: "list", key: null, error: null });
  const [view, setView] = useState<ListView>({ key: "", cursor: 0, expanded: new Set() });
  const project = projects.find((entry) => projectKey(entry) === state.key);
  const go = (page: Page, error: string | null = null) =>
    setState((current) => ({ ...current, page, error }));
  const props = { width, height, project, go, error: state.error };
  // A project removed elsewhere drops back to the list.
  if (state.page === "list" || state.page === "add" || project === undefined) {
    return state.page === "add" ? (
      <AddPage {...props} />
    ) : (
      <ListPage
        {...props}
        view={view}
        setView={setView}
        select={(next) =>
          setState((current) => ({ ...current, key: next ? projectKey(next) : null }))
        }
      />
    );
  }
  const Page = { rename: RenamePage, settings: SettingsPage, model: ModelPage, remove: RemovePage }[
    state.page
  ];
  return <Page key={state.page} {...props} project={project} />;
}
