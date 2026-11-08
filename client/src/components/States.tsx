import type { ReactNode } from "react";
import { AlertTriangle, Inbox } from "lucide-react";
import { describeError } from "../lib/errors";

export function SkeletonBlock({ height = "1rem", width = "100%" }: { height?: string; width?: string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function LoadingCards({ count = 6, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">{label}</span>
      <div className="grid">
        {Array.from({ length: count }, (_, index) => (
          <div className="card" key={index}>
            <SkeletonBlock height="1.4rem" width="70%" />
            <div style={{ height: "0.75rem" }} />
            <SkeletonBlock width="45%" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state card">
      <Inbox size={32} aria-hidden="true" />
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state card" role="alert">
      <AlertTriangle size={32} aria-hidden="true" />
      <h2>That didn&apos;t load</h2>
      <p>{describeError(error)}</p>
      {onRetry && (
        <button type="button" className="button button-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
