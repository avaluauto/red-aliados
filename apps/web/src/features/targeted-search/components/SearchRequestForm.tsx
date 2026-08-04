// Presentational (spec: Own-Inventory-First Search). Registers a sourcing
// request's criteria (make/model) -- a container composes this with
// useCreateSearchRequest and supplies tenantId/requestedBy; this component
// itself never talks to ../data or ../hooks directly (same convention as
// every other presentational component in this codebase --
// CandidateCard/ConnectionRequestCard/RequestConnectionButton/MessageThread).
import { type FormEvent, useState } from "react";

export interface SearchRequestFormProps {
  readonly isSubmitting?: boolean;
  readonly onSubmit: (criteria: { make: string; model: string }) => void;
}

export function SearchRequestForm({ isSubmitting = false, onSubmit }: SearchRequestFormProps) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const canSubmit = make.trim().length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    onSubmit({ make: make.trim(), model: model.trim() });
  }

  return (
    <form data-testid="search-request-form" onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="search-request-make-input">
          Make
        </label>
        <input
          id="search-request-make-input"
          data-testid="search-request-make-input"
          value={make}
          onChange={(event) => setMake(event.target.value)}
          disabled={isSubmitting}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium" htmlFor="search-request-model-input">
          Model
        </label>
        <input
          id="search-request-model-input"
          data-testid="search-request-model-input"
          value={model}
          onChange={(event) => setModel(event.target.value)}
          disabled={isSubmitting}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </div>

      <button
        type="submit"
        data-testid="search-request-submit-button"
        disabled={isSubmitting || !canSubmit}
        className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        Search
      </button>
    </form>
  );
}
