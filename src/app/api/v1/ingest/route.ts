import { authorizeMutation } from '@/server/auth/mutation';
import { getEnv } from '@/server/config';
import { parseIngest } from '@/server/files/validate';
import { ingestMessage } from '@/server/services/ingest';
import { ingestDependencies } from '@/server/services/dependencies';
import { AppError,errorResponse } from '@/server/errors';
export const runtime = 'nodejs';
export async function POST(request:Request) {
  try {
    const operator = await authorizeMutation(request);
    const input = await parseIngest(request,getEnv());
    if (input.event.source_account_id !== `demo-${input.event.source}`) throw new AppError('INVALID_SOURCE_ACCOUNT','El simulador solo admite su cuenta demo.',403);
    const output = await ingestMessage(input,{operatorId:operator.id,origin:'simulator'},ingestDependencies());
    return Response.json(output.result,{status:output.httpStatus,headers:{'Cache-Control':'private, no-store'}});
  } catch (error) { return errorResponse(error); }
}
