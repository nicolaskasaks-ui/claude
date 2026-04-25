export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const NotFound = (msg = "Not found") => new HttpError(404, msg, "not_found");
export const BadRequest = (msg: string) => new HttpError(400, msg, "bad_request");
export const Unauthorized = (msg = "Unauthorized") => new HttpError(401, msg, "unauthorized");
export const Forbidden = (msg = "Forbidden") => new HttpError(403, msg, "forbidden");
export const Conflict = (msg: string) => new HttpError(409, msg, "conflict");
