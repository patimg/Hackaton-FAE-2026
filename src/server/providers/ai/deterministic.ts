import type { AIProvider, Classification, ClassificationInput, SearchInput, SearchPlan } from './provider';
import type { DocumentCategory } from '../../../domain/documents';
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const rules:{category:DocumentCategory;expression:RegExp;tags:string[]}[]=[
  {category:'comprobante_pago',expression:/\b(comprobante|transferencia|deposito|pago realizado)\b/,tags:['pago']},
  {category:'diseno',expression:/\b(logo|disenos?|logotipo|arte para)\b/,tags:['diseño']},
  {category:'cotizacion',expression:/\b(cotizaciones?|presupuesto)\b/,tags:['cotización']},
  {category:'entregable',expression:/\b(entrega final|entregable|version final)\b/,tags:['entregable']},
  {category:'referencia',expression:/\b(ejemplo de referencia|como referencia|referencia para|inspiracion)\b/,tags:['referencia']},
];
export class DeterministicAIProvider implements AIProvider {
  readonly info={kind:'deterministic' as const,provider:'deterministic',model:null,promptVersion:'rules-v2'};
  async classifyDocument(document:ClassificationInput):Promise<Classification> {
    const rawContext=normalize(`${document.subject||''} ${document.message_text} ${document.document_text||''}`);
    // Un mensaje que intenta dar órdenes al clasificador no cuenta como evidencia documental.
    const context=/ignora.*instrucciones|clasifica.*todos.*archivos/.test(rawContext)?normalize(`${document.subject||''} ${document.document_text||''}`):rawContext;const matches=rules.filter(rule=>rule.expression.test(context));
    const nameMatches=matches.filter(rule=>rule.expression.test(normalize(document.filename).replace(/[^a-z0-9]+/g,' ')));const match=matches.length===1?matches[0]:nameMatches.length===1?nameMatches[0]:undefined;
    return {document_id:document.document_id,category:match?.category||'otro',summary:match?`Documento ${match.category.replaceAll('_',' ')} recibido: ${document.filename}`:`Archivo sin contexto suficiente: ${document.filename}`,tags:match?.tags||[],confidence:match?0.92:0.25,reason:match?'Regla determinista: el contexto contiene una referencia explícita a esta categoría.':'Clasificación simulada: el nombre del archivo no basta y el mensaje es ambiguo.'};
  }
  async interpretSearchQuery(input:SearchInput):Promise<SearchPlan> {
    const query=input.query.trim(),normal=normalize(query);const category=rules.find(rule=>rule.expression.test(normal))?.category||null;const clientName=query.match(/\b(?:de|del|para)\s+([A-ZÁÉÍÓÚÑ][\p{L}'-]*(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}'-]*)?)/u)?.[1]||null;
    const base=new Date(`${input.today}T12:00:00Z`);let dateFrom:string|null=null,dateTo:string|null=null;const range=(year:number,month:number)=>{dateFrom=new Date(Date.UTC(year,month,1)).toISOString().slice(0,10);dateTo=new Date(Date.UTC(year,month+1,0)).toISOString().slice(0,10);};
    if(/este mes/.test(normal))range(base.getUTCFullYear(),base.getUTCMonth());else if(/mes pasado/.test(normal))range(base.getUTCMonth()===0?base.getUTCFullYear()-1:base.getUTCFullYear(),(base.getUTCMonth()+11)%12);else if(/\bhoy\b/.test(normal))dateFrom=dateTo=input.today;else if(/\bayer\b/.test(normal)){const yesterday=new Date(base);yesterday.setUTCDate(yesterday.getUTCDate()-1);dateFrom=dateTo=yesterday.toISOString().slice(0,10);}else{const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];const month=months.findIndex(name=>new RegExp(`\\b${name}\\b`).test(normal));if(month>=0)range(Number(normal.match(/\b(20\d{2})\b/)?.[1]||base.getUTCFullYear()),month);}
    const ignored=new Set(['archivos','archivo','disenos','diseños','cotizaciones','comprobante','comprobantes','enviados','enviado','mandó','mando','para','por','del','whatsapp','gmail','este','esta','mes','pasado','hoy','ayer']);const keywords=query.split(/\s+/).map(word=>word.replace(/[^\p{L}\p{N}-]/gu,'')).filter(word=>word.length>2&&!ignored.has(normalize(word))).slice(0,8);
    return {clientName,category,sourceChannel:/whatsapp/.test(normal)?'whatsapp':/gmail/.test(normal)?'gmail':null,dateFrom,dateTo,keywords,freeText:query||null};
  }
  async classifyDocuments(input:{text:string;subject:string|null;documents:{document_id:string;filename:string;mime_type:string;text:string|null}[]}) {return {schema_version:'1' as const,results:await Promise.all(input.documents.map(document=>this.classifyDocument({document_id:document.document_id,filename:document.filename,mime_type:document.mime_type,document_text:document.text,message_text:input.text,subject:input.subject,source:'gmail',client_name:null})))};}
  async interpretSearch(input:{query:string}) {const plan=await this.interpretSearchQuery({query:input.query,today:new Date().toISOString().slice(0,10),timezone:'UTC'});return {schema_version:'1' as const,mode:'lexical' as const,terms:plan.keywords};}
}
