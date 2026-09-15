"use client";

/*
  "İçeriğe geç": klavyeyle ilk Tab'da görünür, menüdeki 15+
  bağlantıyı atlayıp odağı ana içeriğe taşır. Odak açıkça verilir:
  bazı tarayıcılar #bağlantıda tabIndex=-1 hedefe odak taşımıyor.
  Adres çubuğuna da # eklenmez.
*/
export function SkipLink() {
  return (
    <a
      className="panel-skip"
      href="#icerik"
      onClick={(event) => {
        const main = document.getElementById("icerik");
        if (!main) return;
        event.preventDefault();
        main.focus();
        main.scrollIntoView({ block: "start" });
      }}
    >
      İçeriğe geç
    </a>
  );
}
