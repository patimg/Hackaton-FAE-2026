import { searchPlanSchema, type SearchPlan } from '../providers/ai/provider';

const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

export const fallbackPlan=(query:string,today:string):SearchPlan=>{
  const normalized=normalize(query);
  const categoryWord=normalized.match(/\b(cotizacion(?:es)?|presupuesto(?:s)?|comprobante(?:s)?|pago(?:s)?|diseno(?:s)?|logo(?:s)?|referencia(?:s)?|entregable(?:s)?)\b/)?.[1];
  const categoryMap:Record<string,SearchPlan['category']>={cotizacion:'cotizacion',cotizaciones:'cotizacion',presupuesto:'cotizacion',presupuestos:'cotizacion',comprobante:'comprobante_pago',comprobantes:'comprobante_pago',pago:'comprobante_pago',pagos:'comprobante_pago',diseno:'diseno',disenos:'diseno',logo:'diseno',logos:'diseno',referencia:'referencia',referencias:'referencia',entregable:'entregable',entregables:'entregable'};
  const clientName=query.match(/\b(?:de|del|para)\s+([A-ZÁÉÍÓÚÑ][\p{L}'-]*(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]*)?)/u)?.[1]||null;
  const sourceChannel=/\bwhatsapp\b/.test(normalized)?'whatsapp':/\bgmail\b/.test(normalized)?'gmail':null;
  const base=new Date(`${today}T12:00:00Z`);let dateFrom:string|null=null;let dateTo:string|null=null;
  const setMonth=(year:number,month:number)=>{dateFrom=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);dateTo=new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10);};
  if (/\bmes pasado\b/.test(normalized)) setMonth(base.getUTCMonth()===0?base.getUTCFullYear()-1:base.getUTCFullYear(),(base.getUTCMonth()+11)%12);
  else if (/\beste mes\b/.test(normalized)) setMonth(base.getUTCFullYear(),base.getUTCMonth());
  else if (/\bhoy\b/.test(normalized)) dateFrom=dateTo=today;
  else if (/\bayer\b/.test(normalized)){const yesterday=new Date(base);yesterday.setUTCDate(yesterday.getUTCDate()-1);dateFrom=dateTo=yesterday.toISOString().slice(0,10);}
  const ignored=new Set(['archivo','archivos','documento','documentos','enviado','enviada','enviados','recibido','recibida','recibidos','de','del','para','por','este','esta','mes','pasado','hoy','ayer','gmail','whatsapp',...(categoryWord?[categoryWord]:[])]);
  const keywords=query.split(/\s+/).map(word=>word.replace(/[^\p{L}\p{N}-]/gu,'')).filter(word=>word.length>2&&!ignored.has(normalize(word))).slice(0,8);
  return searchPlanSchema.parse({clientName,category:categoryWord?categoryMap[categoryWord]:null,sourceChannel,dateFrom,dateTo,keywords,freeText:query.trim()||null});
};
