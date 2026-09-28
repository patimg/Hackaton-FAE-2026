import 'server-only';
import { getOperator } from './operator';
import { getEnv } from '../config';
import { AppError } from '../errors';
import { isAllowedOrigin } from './origin';
export async function authorizeMutation(request:Request) {
  const operator = await getOperator();
  if (!operator) throw new AppError('UNAUTHORIZED','Inicia sesión con la cuenta autorizada.',401);
  if (!isAllowedOrigin(request.headers.get('origin'), getEnv().APP_BASE_URL)) throw new AppError('INVALID_ORIGIN','Origen no permitido.',403);
  return operator;
}
