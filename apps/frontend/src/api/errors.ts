/**
 * Extracts a human-readable message from an axios error response.
 * Handles both { error: "..." } and { message: "..." } shapes from the backend.
 */
export function extractErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const data = (err as { response?: { data?: { error?: string; message?: string } } })
    ?.response?.data
  return data?.error ?? data?.message ?? fallback
}
