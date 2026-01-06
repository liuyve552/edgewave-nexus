"use client";

import React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

type State = { hasError: boolean };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.log("ErrorBoundary", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            可视化已降级，请刷新页面。
          </div>
        )
      );
    }
    return this.props.children;
  }
}

