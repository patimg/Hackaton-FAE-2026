export class AppError extends Error {
  constructor(public code: string, message: string, public status = 422, public eventId?: string) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  const known = error instanceof AppError;
  const retryable = known && (error.status === 408 || error.status === 429 || error.status >= 500);
  return Response.json({
    error: { code: known ? error.code : 'INTERNAL_ERROR', message: known ? error.message : 'No se pudo completar la operación.', retryable },
    ...(known && error.eventId ? { event_id: error.eventId } : {}),
  }, { status: known ? error.status : 500 });
}
