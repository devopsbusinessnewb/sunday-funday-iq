(()=>{
  const clean=text=>String(text||'')
    .replace(/("?(?:authorization|cookie|set-cookie|csrf|token|jwt|session|secret)"?\s*[:=]\s*)"[^"]*"/gi,'$1"[REDACTED]"')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/=\-]+/gi,'$1[REDACTED]');
  const pageText=()=>clean(document.body?.innerText||'').slice(0,600000);
  const snapshot=extra=>({ts:new Date().toISOString(),url:location.href,title:document.title,text:pageText(),...extra});
  const add=payload=>chrome.runtime.sendMessage({type:'ADD_SNAPSHOT',payload});
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function textKey(text){
    let hash=2166136261;
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return`${text.length}:${hash>>>0}`;
  }

  async function fullTableSnapshot(){
    const candidates=[document.scrollingElement,...document.querySelectorAll('*')].filter((el,index,array)=>{
      if(!el||array.indexOf(el)!==index)return false;
      const style=getComputedStyle(el),scrollable=/auto|scroll/.test(`${style.overflow} ${style.overflowX} ${style.overflowY}`);
      return el===document.scrollingElement||(scrollable&&(el.scrollHeight>el.clientHeight+80||el.scrollWidth>el.clientWidth+80));
    }).sort((a,b)=>(b.scrollHeight*b.scrollWidth)-(a.scrollHeight*a.scrollWidth)).slice(0,8);
    const views=[],seen=new Set();let capturedChars=0;
    for(const el of candidates){
      const startX=el.scrollLeft,startY=el.scrollTop;
      const maxX=Math.max(0,el.scrollWidth-el.clientWidth),maxY=Math.max(0,el.scrollHeight-el.clientHeight);
      const xs=maxX?[0,.25,.5,.75,1].map(f=>Math.round(maxX*f)):[0];
      const yStep=Math.max(300,Math.floor((el.clientHeight||700)*.8));
      const ys=maxY?Array.from({length:Math.min(40,Math.ceil(maxY/yStep)+1)},(_,i)=>Math.min(maxY,i*yStep)):[0];
      if(ys[ys.length-1]!==maxY)ys.push(maxY);
      positions:for(const y of ys)for(const x of xs){
        el.scrollTo(x,y);await delay(90);
        const text=pageText(),key=textKey(text);
        if(!seen.has(key)){seen.add(key);views.push({scrollX:x,scrollY:y,text});capturedChars+=text.length}
        if(views.length>=120||capturedChars>=6000000)break positions;
      }
      el.scrollTo(startX,startY);
      if(views.length>=120||capturedChars>=6000000)break;
    }
    if(!views.length)views.push({scrollX:0,scrollY:0,text:pageText()});
    const longest=[...views].sort((a,b)=>b.text.length-a.text.length)[0].text;
    await add(snapshot({text:longest,captureMode:'full-table',views}));
    return{ok:true,views:views.length};
  }

  if(location.hostname==='picks.cbssports.com'){
    window.addEventListener('message',event=>{
      if(event.source!==window||event.data?.source!=='CBSIQ4')return;
      if(event.data.type==='capture')chrome.runtime.sendMessage({type:'ADD_CAPTURE',payload:{...event.data.payload,body:clean(event.data.payload?.body)}});
      else if(event.data.type==='ready')chrome.runtime.sendMessage({type:'HOOK_READY',payload:event.data.payload});
    });
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(message?.type==='SNAPSHOT'){add(snapshot()).then(()=>respond({ok:true}));return true}
    if(message?.type==='FULL_TABLE_SNAPSHOT'){fullTableSnapshot().then(respond).catch(error=>respond({ok:false,error:error.message}));return true}
  });
  const take=()=>add(snapshot());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(take,1600),{once:true});
  else setTimeout(take,1600);
})();
