"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

type Props = { children: ReactNode };
type State = { failed: boolean };

/** Keeps optional optimisation advice from taking down the pack quote. */
export class PlannerBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error("[pack-builder] Planner could not render:", error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="builder-warning" role="alert">
          <AlertCircle size={16} />
          <span>Planning tips are temporarily unavailable. Your pack and price are still editable.</span>
          <button type="button" onClick={() => this.setState({ failed: false })} aria-label="Retry planning tips"><RotateCcw size={15} /></button>
        </div>
      );
    }
    return this.props.children;
  }
}
