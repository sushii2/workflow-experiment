import type { SectionResult, SourceRef } from "../types";
import { SourceUnavailableError } from "./http";

export const ok = <T>(
  data: T,
  sources: SourceRef[],
  notes?: string[]
): SectionResult<T> => ({
  status: "ok",
  data,
  sources,
  ...(notes?.length ? { notes } : {}),
});

export const notFound = <T>(
  message: string,
  sources: SourceRef[]
): SectionResult<T> => ({ status: "not_found", message, sources });

const messageOf = (error: unknown) => {
  // A request cut off by the lookup's shared deadline.
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return "Timed out: the place lookup ran out of time for this source";
  }

  return error instanceof Error ? error.message : "Unknown error";
};

/**
 * Runs one section, turning thrown errors into a result so sections fail
 * independently. A caller abort still propagates.
 */
export const runSection = async <T>(
  task: () => Promise<SectionResult<T>>,
  signal?: AbortSignal
): Promise<SectionResult<T>> => {
  try {
    return await task();
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason;
    }

    return error instanceof SourceUnavailableError
      ? { status: "unavailable", message: error.message }
      : { status: "error", message: messageOf(error) };
  }
};

/** Message for a settled source that failed, for an ok result's notes. */
export const failureNote = (result: PromiseSettledResult<unknown>) =>
  result.status === "rejected" ? messageOf(result.reason) : undefined;

/** Finite number, or undefined for missing, blank or zero placeholder values. */
export const toNumber = (value: unknown, { allowZero = false } = {}) => {
  if (value === null || value === undefined || value === "") {
    return;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || (number === 0 && !allowZero)) {
    return;
  }

  return number;
};

/** Trimmed string, or undefined when blank. */
export const toText = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") {
    return;
  }

  const text = String(value).trim();
  return text || undefined;
};
