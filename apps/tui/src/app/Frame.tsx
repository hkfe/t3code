import { Box, Text } from "ink";
import type { ReactNode } from "react";

import { theme } from "../theme/theme.ts";

/** Rows and columns a Frame takes around its children: border, plus 1 column of padding. */
export const FRAME_X = 4;
export const FRAME_Y = 2;

function Rule(props: {
  readonly left: string;
  readonly right: string;
  readonly label: ReactNode;
  readonly labelColor: string;
  readonly bold: boolean;
  readonly align: "left" | "right";
  readonly color: string;
}) {
  const label = props.label ? (
    <Box flexShrink={1} minWidth={0}>
      <Text color={props.labelColor} bold={props.bold} wrap="truncate">
        {" "}
        {props.label}{" "}
      </Text>
    </Box>
  ) : null;
  // Basis 0: the line takes only the room the label leaves.
  const line = (grow: number) => (
    <Box flexGrow={grow} flexBasis={0} minWidth={1} height={1} overflow="hidden">
      <Text color={props.color}>{"─".repeat(400)}</Text>
    </Box>
  );
  return (
    <Box height={1} flexShrink={0}>
      <Text color={props.color}>{props.left}</Text>
      {props.align === "left" ? (
        <>
          {line(0)}
          {label}
          {line(1)}
        </>
      ) : (
        <>
          {line(1)}
          {label}
          {line(0)}
        </>
      )}
      <Text color={props.color}>{props.right}</Text>
    </Box>
  );
}

/**
 * The one frame of the TUI: a round border, the title in its top edge and key hints in its bottom
 * edge. A focused frame has an accent border and title.
 */
export function Frame(props: {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly title?: ReactNode;
  readonly hint?: string | undefined;
  readonly focused: boolean;
  readonly children?: ReactNode;
}) {
  const color = props.focused ? theme.borderFocused : theme.border;
  return (
    <Box
      flexDirection="column"
      overflow="hidden"
      {...(props.width === undefined
        ? { flexGrow: 1, flexShrink: 1 }
        : { width: props.width, flexShrink: 0 })}
      {...(props.height === undefined ? {} : { height: props.height })}
    >
      <Rule
        left="╭"
        right="╮"
        label={props.title}
        labelColor={props.focused ? theme.accent : theme.textMuted}
        bold
        align="left"
        color={color}
      />
      <Box
        flexDirection="column"
        flexGrow={1}
        borderStyle="round"
        borderTop={false}
        borderBottom={false}
        borderColor={color}
        paddingX={1}
        overflow="hidden"
      >
        {props.children}
      </Box>
      <Rule
        left="╰"
        right="╯"
        label={props.hint}
        labelColor={theme.textFaint}
        bold={false}
        align="right"
        color={color}
      />
    </Box>
  );
}

/** A Frame centered in the overlay area, at most `maxWidth` wide; without `maxHeight` it fits its rows. */
export function Modal(props: {
  readonly width: number;
  readonly height: number;
  readonly maxWidth: number;
  readonly maxHeight?: number;
  readonly title?: string | undefined;
  readonly hint?: string | undefined;
  readonly children?: ReactNode;
}) {
  const size = modalSize(props);
  return (
    <Box width={props.width} height={props.height} justifyContent="center" alignItems="center">
      <Frame
        focused
        width={size.width}
        {...(size.height === undefined ? {} : { height: size.height })}
        title={props.title}
        hint={props.hint}
      >
        {props.children}
      </Frame>
    </Box>
  );
}

/** The outer size of a Modal; its children get FRAME_X and FRAME_Y less. */
export function modalSize(props: {
  readonly width: number;
  readonly height: number;
  readonly maxWidth: number;
  readonly maxHeight?: number;
}) {
  return {
    width: Math.min(props.maxWidth, props.width),
    height: props.maxHeight === undefined ? undefined : Math.min(props.maxHeight, props.height),
  };
}
