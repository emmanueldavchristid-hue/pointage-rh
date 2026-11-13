export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}
export const badRequest = (code: string, msg: string, d?: unknown) => new AppError(400, code, msg, d);
export const unauthorized = (msg = 'Authentification requise') => new AppError(401, 'UNAUTHENTICATED', msg);
export const forbidden = (msg = "Vous n'avez pas les droits nécessaires pour cette action") => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Ressource introuvable') => new AppError(404, 'NOT_FOUND', msg);
export const conflict = (code: string, msg: string, d?: unknown) => new AppError(409, code, msg, d);
