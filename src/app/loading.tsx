export default function Loading(){
  return <div className="route-loading" role="status" aria-live="polite">
    <div className="route-loading-head"><span/><span/></div>
    <div className="route-loading-metrics">{Array.from({length:4},(_,index)=><i key={index}/>)}</div>
    <div className="route-loading-grid"><section/><section/></div>
    <div className="route-loading-table"/>
    <b><i/> Panel hazırlanıyor…</b>
  </div>;
}
