import { Component, type ReactNode } from "react";

import { theme } from "../theme/theme.ts";
import { Text } from "./text.tsx";

// stderr is the alternate screen while Ink runs; run.tsx prints these after it leaves.
export const renderErrors: string[] = [];

/** Keeps one region's render error inside that region. Key it by what it shows to reset it. */
export class ErrorBoundary extends Component<
  { readonly name: string; readonly children?: ReactNode },
  { readonly error: Error | null }
> {
  override state: { readonly error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown) {
    const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
    renderErrors.push(`${this.props.name} failed to render: ${detail}`);
    if (renderErrors.length > 20) renderErrors.shift();
  }

  override render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <Text color={theme.danger} wrap="truncate">
        {this.props.name} failed: {error.message}
      </Text>
    );
  }
}
