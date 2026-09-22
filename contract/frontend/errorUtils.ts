export const getPayloadMessage = (data: unknown): string | undefined => {
  if (typeof data === "string") return data || undefined;
  if (typeof data !== "object" || data === null) return undefined;
  for (const key of ["message", "error", "detail"] as const) {
    const value: unknown = Reflect.get(data, key);
    if (typeof value === "string" && value) return value;
  }
  return undefined;
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly data?: unknown;
  readonly cause?: unknown;

  constructor(
    message: string,
    details: {
      status?: number;
      code?: string;
      data?: unknown;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = details.status;
    this.code = details.code;
    this.data = details.data;
    this.cause = details.cause;
  }
}

export const toApiError = (error: unknown, fallback: string): ApiError => {
  if (error instanceof ApiError) return error;
  return new ApiError(getErrorMessage(error, fallback), { cause: error });
};
