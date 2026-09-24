import { readFile } from 'node:fs/promises';
import type { IncomingEvent } from '../../src/contracts/ingest';
export const limits={MAX_FILES_PER_MESSAGE:5,MAX_FILE_BYTES:5242880,MAX_TOTAL_ATTACHMENT_BYTES:15728640,MAX_REQUEST_BYTES:16777216,DEFAULT_PHONE_COUNTRY:'CL'};
export async function fixture(name='A') {
  const event=JSON.parse(await readFile(`fixtures/events/${name}.json`,'utf8')) as IncomingEvent;
  const files=await Promise.all(event.attachments.map(file=>readFile(`fixtures/files/${file.filename}`)));
  return {event,files};
}
export function requestFor(event:IncomingEvent,files:Uint8Array[],extra?:{name:string;value:string}) {
  const form=new FormData();form.set('event',JSON.stringify(event));
  event.attachments.forEach((file,index)=>{if(files[index]) form.append(file.file_field,new File([new Uint8Array(files[index])],file.filename,{type:file.mime_type}));});
  if(extra) form.append(extra.name,extra.value);
  return new Request('http://localhost:3000/api/v1/ingest',{method:'POST',body:form});
}
