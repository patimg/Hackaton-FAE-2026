import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { searchPlanSchema,type AIProvider,type SearchPlan } from '../providers/ai/provider';
export type SearchRow={document_id:string;original_filename:string;category:string;summary:string|null;tags:string[];classification_status:string;occurred_at:string;source:'gmail'|'whatsapp';message_text:string;subject:string|null;client_id:string|null;client_name:string|null;rank_score:number};
export type SearchResponse={plan:SearchPlan;fallback:boolean;ambiguousClients:{id:string;display_name:string}[];rows:SearchRow[]};
const fallbackPlan=(query:string):SearchPlan=>searchPlanSchema.parse({clientName:null,category:null,sourceChannel:null,dateFrom:null,dateTo:null,keywords:query.trim().split(/\s+/).map(x=>x.replace(/[^\p{L}\p{N}-]/gu,'')).filter(x=>x.length>2).slice(0,8),freeText:query.trim()||null});
export class SearchService {
  constructor(private readonly db:SupabaseClient,private readonly ai:AIProvider,private readonly timezone:string){}
  async search(query:string,selectedClientId:string|null):Promise<SearchResponse>{
    const parts=new Intl.DateTimeFormat('en',{timeZone:this.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const part=(type:string)=>parts.find(item=>item.type===type)?.value;const today=`${part('year')}-${part('month')}-${part('day')}`;
    let plan:SearchPlan;let fallback=false;try{plan=searchPlanSchema.parse(await this.ai.interpretSearchQuery({query,today,timezone:this.timezone}));}catch{plan=fallbackPlan(query);fallback=true;}
    let clientId=selectedClientId;let ambiguousClients:{id:string;display_name:string}[]=[];
    if(!clientId&&plan.clientName){const {data,error}=await this.db.from('clients').select('id,display_name').ilike('display_name',plan.clientName).limit(10);if(error)throw new Error('SEARCH_CLIENT_LOOKUP_FAILED');if(data.length===1)clientId=data[0].id;else if(data.length>1)ambiguousClients=data;}
    if(ambiguousClients.length)return {plan,fallback,ambiguousClients,rows:[]};
    const {data,error}=await this.db.rpc('search_documents',{p_client_id:clientId,p_category:plan.category,p_source:plan.sourceChannel,p_date_from:plan.dateFrom,p_date_to:plan.dateTo,p_terms:[...plan.keywords,...(plan.freeText?plan.freeText.split(/\s+/).filter(x=>x.length>2).slice(0,8):[])]});if(error)throw new Error('SEARCH_FAILED');return {plan,fallback,ambiguousClients,rows:(data||[]) as SearchRow[]};
  }
}
