//@ts-ignore
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../services/ErrorService";

export default function (
  err: ApiError | Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.log("res", res);
  if (err instanceof ApiError) {
    return res?.status(err.status).json({
      message: err.message,
      errors: err?.errors ?? [],
    });
  }

  console.log(res.status || "not working");

  return res.status(500).json({
    message: "An unexpected server error occurred",
  });
}
