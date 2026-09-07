"use client";

import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";

function pendingLabel(button:HTMLButtonElement){
  const text=(button.textContent??"").toLocaleLowerCase("tr-TR");
  if(text.includes("yükle")||text.includes("aktar")||text.includes("görsel"))return "Yükleniyor…";
  if(text.includes("kaydet")||text.includes("oluştur")||text.includes("yayınla"))return "Kaydediliyor…";
  if(text.includes("sil")||text.includes("kaldır"))return "İşleniyor…";
  if(text.includes("giriş"))return "Giriş yapılıyor…";
  return "Lütfen bekleyiniz…";
}

export function InteractionFeedback(){
  const pathname=usePathname();
  const [feedback,setFeedback]=useState({message:"",path:""});

  useEffect(()=>{
    const markButton=(button:HTMLButtonElement,label:string)=>{
      if(button.disabled||button.classList.contains("is-pending"))return;
      button.dataset.pendingLabel=label;
      button.classList.add("is-pending");
      button.setAttribute("aria-busy","true");
      button.disabled=true;
    };
    const onSubmit=(event:SubmitEvent)=>{
      window.setTimeout(()=>{
        if(event.defaultPrevented)return;
        const submitter=event.submitter instanceof HTMLButtonElement?event.submitter:null;
        const label=submitter?pendingLabel(submitter):"İşlem tamamlanıyor…";
        if(submitter)markButton(submitter,label);
        setFeedback({message:label,path:pathname});
      },0);
    };
    const onClick=(event:MouseEvent)=>{
      const target=event.target instanceof Element?event.target:null;
      if(!target)return;
      const anchor=target.closest("a[href]") as HTMLAnchorElement|null;
      if(anchor&&event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&!anchor.download&&anchor.target!=="_blank"){
        const url=new URL(anchor.href,window.location.href);
        if(url.origin===window.location.origin&&url.href!==window.location.href){
          anchor.classList.add("is-pending-link");
          setFeedback({message:"Sayfa yükleniyor…",path:pathname});
        }
        return;
      }
      const button=target.closest("button") as HTMLButtonElement|null;
      if(!button||button.type==="submit"||button.disabled)return;
      const label=pendingLabel(button);
      markButton(button,label);
      window.setTimeout(()=>{
        button.disabled=false;
        button.classList.remove("is-pending");
        button.removeAttribute("aria-busy");
        delete button.dataset.pendingLabel;
      },650);
    };
    document.addEventListener("submit",onSubmit);
    document.addEventListener("click",onClick);
    return()=>{document.removeEventListener("submit",onSubmit);document.removeEventListener("click",onClick)};
  },[pathname]);

  const message=feedback.path===pathname?feedback.message:"";
  return <div className={`global-progress ${message?"visible":""}`} role="status" aria-live="polite" aria-hidden={!message}>
    <span className="global-spinner" aria-hidden="true"/><b>{message}</b><small>İşleminiz güvenle tamamlanıyor.</small>
  </div>;
}
