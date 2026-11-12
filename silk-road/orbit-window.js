// A blank outer page embeds the actual site. Browser popup rules still apply.
export function openOrbitWindow(rootUrl,open=()=>window.open('about:blank','_blank')){
 const popup=open();if(!popup)return false;
 try{
  const doc=popup.document;doc.title='Orbit';doc.documentElement.lang='en';
  const meta=doc.createElement('meta');meta.name='viewport';meta.content='width=device-width,initial-scale=1,viewport-fit=cover';doc.head.append(meta);
  doc.body.style.cssText='margin:0;background:#050c40;overflow:hidden';
  const frame=doc.createElement('iframe');frame.title='Orbit';frame.src=new URL('#/chat',rootUrl).href;frame.style.cssText='display:block;border:0;width:100%;height:100dvh';frame.allow='fullscreen; autoplay; microphone; camera; clipboard-write';frame.allowFullscreen=true;doc.body.append(frame);
  popup.SilkRoadHome=()=>{try{popup.localStorage.setItem('stg_ok','0');}catch{}popup.location.replace(new URL('#top',rootUrl).href);};
  popup.opener=null;popup.focus();return true;
 }catch{try{popup.close();}catch{}return false;}
}
