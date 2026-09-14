import { useEffect, useState, type ReactNode } from 'react';
import { getCloudSession } from './cloud';
import { useLocation } from '@tanstack/react-router';

export function AccessGate({children}: {children: ReactNode}) {
  const [state,setState]=useState<'checking'|'allowed'|'denied'>('checking');
  const [checkedPath,setCheckedPath]=useState<string|null>(null);
  const enabled=import.meta.env['VITE_LANDDRAFT_ACCESS_ENFORCEMENT']==='true';
  const pathname=useLocation({select:location=>location.pathname});
  useEffect(()=>{
    if(!enabled) return;
    setState('checking');
    let disposed=false;
    async function check() {
      try {
        const session=await getCloudSession();
        const module=pathname.startsWith('/weather')?'weather.core':pathname.startsWith('/pipeline')?'pipeline.core':pathname.startsWith('/water')?'water.hydrogeology':'mapping.core';
        const response=await fetch(`/api/access/session?module=${encodeURIComponent(module)}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`},cache:'no-store'});
        if(!disposed){setCheckedPath(pathname);setState(response.ok?'allowed':'denied');}
      } catch {if(!disposed)setState('denied');}
    }
    void check(); const timer=setInterval(check,30_000); window.addEventListener('focus',check);
    return ()=>{disposed=true;clearInterval(timer);window.removeEventListener('focus',check);};
  },[enabled,pathname]);
  if(!enabled||(state==='allowed'&&checkedPath===pathname))return children;
  return <div className="app-scroll-viewport flex items-center justify-center bg-background p-6"><div className="max-w-md text-center">
    <h1 className="text-xl font-semibold">{state==='checking'?'Checking access…':'Access unavailable'}</h1>
    {state==='denied'&&<><p className="my-4">Your account does not currently have access to this workspace, or access could not be verified. Your saved projects have not been deleted.</p><a href="/" className="underline">Return to mapping</a><p><a href="mailto:dev@glab.co">Contact support</a></p><button onClick={()=>location.reload()}>Try again</button></>}
  </div></div>;
}
