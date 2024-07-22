export class ApiError extends Error {
  status: number;
  errors: any[];

  constructor(status: number, message: string, errors: any[] = []) {
    super();
    this.message = message;
    this.status = status;
    this.errors = errors;
  }

  static UnauthorizedError(): ApiError {
    return new ApiError(401, "User is not authorized");
  }

  static BadRequest(
    message: ApiError["message"],
    errors: ApiError["errors"]
  ): ApiError {
    return new ApiError(400, message, errors);
  }
}
