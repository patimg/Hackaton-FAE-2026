import { getEnv } from '@/server/config';
import { parseIngest } from '@/server/files/validate';
import { ingestMessage } from '@/server/services/ingest';
import { ingestDependencies } from '@/server/services/dependencies';
import { AppError,errorResponse } from '@/server/errors';
export const runtime = 'nodejs';
export async function POST(request:Request) {
  try {
    const env = getEnv();
    const bearer = request.headers.get('authorization');
    const internal = Boolean(env.INGEST_API_TOKEN && bearer === `Bearer ${env.INGEST_API_TOKEN}`);
    if (!internal) throw new AppError('UNAUTHORIZED','Se requiere el token de ingestión del conector.',401);
    const input = await parseIngest(request, env);
    const output = await ingestMessage(input,{operatorId:env.OPERATOR_USER_ID},ingestDependencies());
    return Response.json(output.result,{status:output.httpStatus,headers:{'Cache-Control':'private, no-store'}});
  } catch (error) { return errorResponse(error); }
}
