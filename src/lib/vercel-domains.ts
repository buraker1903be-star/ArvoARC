type DomainKind="panel"|"storefront";

type VercelErrorBody={error?:{code?:string;message?:string};message?:string};
type VercelProjectDomain={name?:string;verified?:boolean;verification?:unknown[]};
type VercelDomainConfig={misconfigured?:boolean};

export type DomainProvisionResult={
  active:boolean;
  verified:boolean;
  misconfigured:boolean;
};

function configuration(kind:DomainKind){
  const token=process.env.VERCEL_AUTOMATION_TOKEN;
  const teamId=process.env.VERCEL_AUTOMATION_TEAM_ID;
  const projectId=kind==="panel"
    ?process.env.VERCEL_PANEL_PROJECT_ID
    :process.env.VERCEL_STOREFRONT_PROJECT_ID;
  if(!token||!teamId||!projectId){
    throw new Error("Vercel domain otomasyonu henüz yapılandırılmadı.");
  }
  return {token,teamId,projectId};
}

async function vercelRequest<T>(path:string,token:string,init?:RequestInit){
  const response=await fetch(`https://api.vercel.com${path}`,{
    ...init,
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json",...(init?.headers??{})},
    cache:"no-store",
  });
  const body=await response.json().catch(()=>({})) as T&VercelErrorBody;
  if(!response.ok){
    const message=body.error?.message??body.message??`Vercel API hatası (${response.status})`;
    const error=new Error(message) as Error&{status?:number;code?:string};
    error.status=response.status;error.code=body.error?.code;
    throw error;
  }
  return body;
}

async function findProjectDomain(domain:string,projectId:string,teamId:string,token:string){
  const query=new URLSearchParams({teamId,limit:"100"});
  const result=await vercelRequest<{domains?:VercelProjectDomain[]}>(`/v9/projects/${encodeURIComponent(projectId)}/domains?${query}`,token);
  return result.domains?.find(item=>item.name===domain)??null;
}

async function getDomainConfig(domain:string,teamId:string,token:string){
  const query=new URLSearchParams({teamId});
  return vercelRequest<VercelDomainConfig>(`/v6/domains/${encodeURIComponent(domain)}/config?${query}`,token);
}

export async function ensureVercelProjectDomain(domain:string,kind:DomainKind):Promise<DomainProvisionResult>{
  const {token,teamId,projectId}=configuration(kind);
  const query=new URLSearchParams({teamId});
  let projectDomain:VercelProjectDomain|null=null;
  try{
    projectDomain=await vercelRequest<VercelProjectDomain>(`/v10/projects/${encodeURIComponent(projectId)}/domains?${query}`,token,{
      method:"POST",body:JSON.stringify({name:domain}),
    });
  }catch(error){
    const apiError=error as Error&{status?:number};
    if(apiError.status!==400)throw error;
    projectDomain=await findProjectDomain(domain,projectId,teamId,token);
    if(!projectDomain)throw error;
  }
  const config=await getDomainConfig(domain,teamId,token);
  const verified=projectDomain?.verified===true;
  const misconfigured=config.misconfigured!==false;
  return {active:verified&&!misconfigured,verified,misconfigured};
}

export async function verifyVercelProjectDomain(domain:string,kind:DomainKind):Promise<DomainProvisionResult>{
  const {token,teamId,projectId}=configuration(kind);
  const query=new URLSearchParams({teamId});
  try{
    await vercelRequest<VercelProjectDomain>(`/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(domain)}/verify?${query}`,token,{method:"POST"});
  }catch(error){
    const apiError=error as Error&{status?:number};
    if(apiError.status!==400)throw error;
  }
  const projectDomain=await findProjectDomain(domain,projectId,teamId,token);
  if(!projectDomain)throw new Error("Alan adı Vercel projesinde bulunamadı.");
  const config=await getDomainConfig(domain,teamId,token);
  const verified=projectDomain.verified===true;
  const misconfigured=config.misconfigured!==false;
  return {active:verified&&!misconfigured,verified,misconfigured};
}
