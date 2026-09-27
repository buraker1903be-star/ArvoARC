/*
  ARVOARC FİYAT TOPLAYICISI — LR'ın sayfasında çalışan tarayıcı betiği.

  NEDEN TARAYICIDA: LR'ın portalı fiyat listesi indirmiyor, fiyatlar
  yalnızca ekranda görünüyor ve girişliyken alış, çıkışken müşteri
  fiyatı yazıyor. Sunucudan taramak denenmedi ve denenmemeli: site
  Apache Wicket (durum tutuyor; derin bağlantı ana sayfaya atıyor,
  27.09.2026'da ölçüldü), giriş CAS SSO ile tek kullanımlık jetonla
  yapılıyor ve taklit etmek kullanıcının LR şifresini saklamayı
  gerektirirdi. Burada şifre hiç işin içine girmiyor: kullanıcı kendi
  oturumunu kendi açıyor, betik yalnızca AÇIK SAYFAYI okuyor.

  KENDİLİĞİNDEN GÖNDERMİYOR. Ne bulduğunu ekranda listeliyor, gönderme
  kararını kullanıcı veriyor; panelde de fiyatlar önizlenip onaylanıyor.
  İki adımın ikisi de bilerek: sayfa tasarımı değişince yanlış sütun
  okunabilir ve canlı mağazada yanlış fiyat geri alınamaz bir hata.

  Yer imi (bookmarklet) yalnızca uç adresini ve jetonu window.ARC_FIYAT'a
  yazıp bu dosyayı çağırıyor; böylece toplama kuralı sunucudan
  güncellenebiliyor ve kullanıcı yer imini yeniden kurmuyor.
*/
(function () {
  "use strict";

  var AYAR = window.ARC_FIYAT || {};
  if (!AYAR.uc || !AYAR.jeton) {
    window.alert("ArvoARC: yer imi kodu eksik. Panel → Veri aktarımı ekranından kodu yeniden kopyalayın.");
    return;
  }

  /*
    FİYAT: iki ondalık haneli sayı. Para simgesi şart değil — LR bazı
    kartlarda simgeyi ayrı bir öğede yazıyor. Buna karşılık iki
    ondalıklı olması şart: "20604" gibi ürün numaralarını fiyat sanmak
    bütün toplamayı bozardı. Kuruşa çevirmek SUNUCUDA (parseMoneyToCents);
    burada metin olarak gönderiliyor ki kural tek yerde kalsın.
  */
  var FIYAT_RE = /\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}(?!\d)/g;
  /*
    Aynı kalıbın /g'siz ikizi. Genel (/g) bir düzenli ifadede .test()
    lastIndex'i ilerletiyor ve aynı metin için bir çağrıda true, bir
    sonrakinde false dönüyor — ürün adı bu yüzden rastgele eleniyordu.
  */
  var FIYAT_TEK_RE = /\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}(?!\d)/;

  /* LR'ın ürün kimliği: taban numara + varyant eki ("20604-201"). */
  var ALIAS_RE = /productAlias=([A-Za-z0-9._-]{3,40})/;
  var NUMARA_RE = /^(?:art(?:ikel)?\.?\s*(?:nr|no)\.?:?\s*)?(\d{4,6}(?:-\d{2,4})?)$/i;

  var EN_FAZLA_TIRMANMA = 8;
  /* Kabın metni bundan uzunsa ürün kartı değil, sayfanın bir bölümüdür. */
  var EN_UZUN_KAP = 700;

  /*
    BİRİM FİYAT ve ÜSTÜ ÇİZİLİ FİYAT dışarıda kalmalı. 27.09.2026'da
    lrworld.com/home/TR/tr sayfasında ölçüldü: kartta üç sayı var —
    geçerli fiyat (span), indirimden önceki fiyat (<del>, line-through)
    ve litre fiyatı (div.hint, parantez içinde: "(62.763,33 ₺ 1 l için)").
    Üçünü birlikte göndermek, litre fiyatının en düşük olduğu büyük
    ambalajlarda ürünü ONUN fiyatına satmak demekti.
  */
  var BIRIM_RE = /\bi[çc]in\b|\/\s*(?:l|ml|cl|kg|g|gr|adet)\b/i;

  function tekille(liste) {
    var tekil = [];
    for (var i = 0; i < liste.length; i++) {
      if (tekil.indexOf(liste[i]) < 0) tekil.push(liste[i]);
    }
    return tekil.slice(0, 6);
  }

  function fiyatlari(metin) {
    /* Parantez içi birim fiyat; metinden okunurken de atılıyor. */
    return tekille(String(metin || "").replace(/\([^)]*\)/g, "").match(FIYAT_RE) || []);
  }

  var duzelt = function (metin) {
    return String(metin || "").replace(/\s+/g, " ").trim();
  };

  /** Öğe ya da kabındaki bir ata üstü çizili mi (indirimden önceki fiyat). */
  function ustuCizili(oge, kapsayici) {
    for (var gecerli = oge; gecerli && gecerli !== kapsayici.parentElement; gecerli = gecerli.parentElement) {
      var etiket = gecerli.tagName;
      if (etiket === "DEL" || etiket === "S" || etiket === "STRIKE") return true;
      try {
        if (/line-through/.test(window.getComputedStyle(gecerli).textDecorationLine || "")) return true;
      } catch {
        /* Stil okunamadıysa etiket denetimi yeterli. */
      }
    }
    return false;
  }

  /*
    Kabın GEÇERLİ fiyatları: yaprak öğeler tek tek elenip okunuyor.
    Kabın metnini bütün olarak okumak, üç sayıyı ayırt edememek demekti.
  */
  function kapFiyatlari(kapsayici) {
    var bulunan = [];
    var yapraklar = kapsayici.querySelectorAll("*");
    for (var i = 0; i < yapraklar.length; i++) {
      var oge = yapraklar[i];
      if (oge.children.length) continue;
      var metin = duzelt(oge.textContent);
      if (!FIYAT_TEK_RE.test(metin)) continue;
      if (metin.charAt(0) === "(" || BIRIM_RE.test(metin)) continue;
      if (ustuCizili(oge, kapsayici)) continue;
      var parcalar = metin.match(FIYAT_RE) || [];
      for (var j = 0; j < parcalar.length; j++) bulunan.push(parcalar[j]);
    }
    /*
      Yaprak taramasından bir şey çıkmadıysa metinden okunuyor: fiyat
      bir öğenin içinde başka metinle birlikte de yazılabiliyor.
    */
    return bulunan.length ? tekille(bulunan) : fiyatlari(kapsayici.textContent);
  }

  /*
    Ürün kimliği taşıyan öğeler. Üç kaynak da deneniyor çünkü LR'ın
    liste, arama ve kampanya sayfaları aynı biçimde yazılmamış:
    bağlantıdaki productAlias, veri niteliği ve kartta yazan ürün
    numarası. Tek kaynağa güvenen bir toplayıcı bir sayfada çalışıp
    ötekinde sessizce boş dönerdi.
  */
  function adaylar() {
    var liste = [];
    var ekle = function (ogeler, kimlikCoz) {
      for (var i = 0; i < ogeler.length; i++) {
        var kimlik = kimlikCoz(ogeler[i]);
        if (kimlik) liste.push({ oge: ogeler[i], sku: kimlik });
      }
    };

    ekle(document.querySelectorAll('a[href*="productAlias"]'), function (oge) {
      var eslesme = ALIAS_RE.exec(oge.getAttribute("href") || "");
      return eslesme ? eslesme[1] : null;
    });

    ekle(
      document.querySelectorAll("[data-product-alias],[data-productalias],[data-sku],[data-article-number]"),
      function (oge) {
        return duzelt(
          oge.getAttribute("data-product-alias") ||
            oge.getAttribute("data-productalias") ||
            oge.getAttribute("data-sku") ||
            oge.getAttribute("data-article-number")
        ).slice(0, 40);
      }
    );

    if (!liste.length) {
      /*
        Son yol: kartta düz metin olarak yazan ürün numarası. Yalnızca
        başka hiçbir kaynak bulunmadığında deneniyor; metin taraması
        sayfadaki her sayıya bakmak demek ve yanlış eşleşme riski
        yüksek.
      */
      var hepsi = document.querySelectorAll("span,div,p,li,td,b,strong,small,em");
      for (var i = 0; i < hepsi.length && liste.length < 400; i++) {
        if (hepsi[i].children.length) continue;
        var eslesme = NUMARA_RE.exec(duzelt(hepsi[i].textContent));
        if (eslesme) liste.push({ oge: hepsi[i], sku: eslesme[1] });
      }
    }
    return liste;
  }

  /** Öğeden yukarı çıkarak GEÇERLİ fiyat içeren en küçük kabı bul. */
  function kap(oge) {
    var gecerli = oge;
    for (var adim = 0; adim < EN_FAZLA_TIRMANMA && gecerli; adim++) {
      if ((gecerli.textContent || "").length <= EN_UZUN_KAP) {
        var fiyat = kapFiyatlari(gecerli);
        if (fiyat.length) return { oge: gecerli, fiyatlar: fiyat };
      }
      gecerli = gecerli.parentElement;
    }
    return null;
  }

  function urunAdi(oge, kapsayici) {
    var kendi = duzelt(oge.textContent);
    if (kendi.length >= 3 && kendi.length <= 160 && /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(kendi) && !FIYAT_TEK_RE.test(kendi)) {
      return kendi;
    }
    var baslik = kapsayici.querySelector("h1,h2,h3,h4,[class*='name'],[class*='title'],[class*='Name'],[class*='Title']");
    if (baslik) {
      var metin = duzelt(baslik.textContent);
      if (metin.length >= 3) return metin.slice(0, 160);
    }
    var resim = kapsayici.querySelector("img[alt]");
    return resim ? duzelt(resim.getAttribute("alt")).slice(0, 160) : "";
  }

  function topla() {
    var satirlar = [];
    var yerler = {};
    var bulunanlar = adaylar();
    for (var i = 0; i < bulunanlar.length; i++) {
      var kapsayici = kap(bulunanlar[i].oge);
      if (!kapsayici) continue;
      var satir = {
        sku: bulunanlar[i].sku,
        ad: urunAdi(bulunanlar[i].oge, kapsayici.oge),
        fiyatlar: kapsayici.fiyatlar
      };
      var anahtar = satir.sku.toUpperCase();
      /* Aynı ürün öneri şeridinde de görünebiliyor; sonuncu kazanıyor. */
      if (yerler[anahtar] === undefined) {
        yerler[anahtar] = satirlar.length;
        satirlar.push(satir);
      } else {
        satirlar[yerler[anahtar]] = satir;
      }
    }
    return satirlar;
  }

  /* --- Ekrandaki kutu. LR'ın CSS'i karışmasın diye stiller satır içi. --- */
  var ESKI = document.getElementById("arc-fiyat-toplayici");
  if (ESKI) ESKI.remove();

  var kutu = document.createElement("div");
  kutu.id = "arc-fiyat-toplayici";
  kutu.setAttribute(
    "style",
    "position:fixed;top:16px;right:16px;z-index:2147483647;width:340px;max-height:80vh;overflow:auto;" +
      "background:#0f172a;color:#e6ebf5;font:13px/1.45 system-ui,sans-serif;border-radius:12px;" +
      "box-shadow:0 18px 48px rgba(0,0,0,.45);padding:14px 14px 12px"
  );

  var satirlar = topla();
  var baslik = document.createElement("div");
  baslik.setAttribute("style", "display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px");
  baslik.innerHTML = "<b style='font-size:14px'>ArvoARC fiyat toplayıcı</b>";
  var kapat = document.createElement("button");
  kapat.textContent = "×";
  kapat.setAttribute("style", "background:none;border:0;color:#9fb0cc;font-size:20px;cursor:pointer;line-height:1");
  kapat.onclick = function () { kutu.remove(); };
  baslik.appendChild(kapat);
  kutu.appendChild(baslik);

  var ozet = document.createElement("p");
  ozet.setAttribute("style", "margin:0 0 8px");
  ozet.innerHTML = satirlar.length
    ? "<b>" + satirlar.length + " ürün</b> okundu. Listeyi kontrol edip panele gönderin."
    : "Bu sayfada fiyatlı ürün kartı bulunamadı. Ürün listesi sayfasında, kartlar yüklendikten sonra deneyin.";
  kutu.appendChild(ozet);

  if (satirlar.length) {
    var liste = document.createElement("div");
    liste.setAttribute("style", "border-top:1px solid #24314c;margin-bottom:10px;max-height:38vh;overflow:auto");
    for (var i = 0; i < Math.min(satirlar.length, 40); i++) {
      var satir = document.createElement("div");
      satir.setAttribute("style", "display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid #1b2740");
      var sol = document.createElement("span");
      sol.setAttribute("style", "min-width:0");
      sol.innerHTML =
        "<b>" + satirlar[i].sku + "</b><br><small style='color:#9fb0cc'>" +
        (satirlar[i].ad || "ad okunamadı").replace(/</g, "&lt;").slice(0, 60) +
        "</small>";
      var sag = document.createElement("span");
      sag.setAttribute("style", "white-space:nowrap;color:#cfe0ff");
      sag.textContent = satirlar[i].fiyatlar.join(" · ");
      satir.appendChild(sol);
      satir.appendChild(sag);
      liste.appendChild(satir);
    }
    if (satirlar.length > 40) {
      var kalan = document.createElement("div");
      kalan.setAttribute("style", "padding:6px 0;color:#9fb0cc");
      kalan.textContent = "… ve " + (satirlar.length - 40) + " ürün daha";
      liste.appendChild(kalan);
    }
    kutu.appendChild(liste);
  }

  var durum = document.createElement("p");
  durum.setAttribute("style", "margin:8px 0 0;color:#9fb0cc");
  /*
    Hangi fiyatın toplandığını KULLANICI biliyor (girişli mi, çıkışlı
    mı) ve panelde söylüyor. Betik tahmin etmiyor: yanlış tahmin, alış
    fiyatının satış fiyatı olarak yazılması demekti.
  */
  durum.textContent = "Panelde bu listenin alış mı, LR müşteri fiyatı mı olduğunu siz seçeceksiniz.";

  var dugmeler = document.createElement("div");
  dugmeler.setAttribute("style", "display:flex;gap:8px;margin-top:10px");
  var gonder = document.createElement("button");
  gonder.textContent = "Panele gönder";
  gonder.setAttribute(
    "style",
    "flex:1;background:#3b82f6;color:#fff;border:0;border-radius:8px;padding:9px 10px;font:600 13px system-ui;cursor:pointer"
  );
  gonder.disabled = !satirlar.length;
  if (!satirlar.length) gonder.style.opacity = "0.5";
  gonder.onclick = function () {
    gonder.disabled = true;
    gonder.textContent = "Gönderiliyor…";
    fetch(AYAR.uc, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jeton: AYAR.jeton, sayfa: location.href, satirlar: satirlar })
    })
      .then(function (yanit) {
        return yanit.json().then(function (govde) { return { ok: yanit.ok, govde: govde }; });
      })
      .then(function (sonuc) {
        if (!sonuc.ok) throw new Error(sonuc.govde && sonuc.govde.hata ? sonuc.govde.hata : "Gönderilemedi.");
        gonder.textContent = "Gönderildi";
        durum.style.color = "#86efac";
        durum.textContent =
          sonuc.govde.alinan + " satır panele bırakıldı. Panel → Veri aktarımı → “Son toplanan listeyi getir”.";
      })
      .catch(function (hata) {
        /* Sebep gösteriliyor: sessiz başarısızlıkta kullanıcı panelde boşuna arıyor. */
        gonder.disabled = false;
        gonder.textContent = "Yeniden gönder";
        durum.style.color = "#fca5a5";
        durum.textContent = "Gönderilemedi: " + (hata && hata.message ? hata.message : hata);
      });
  };
  var yeniden = document.createElement("button");
  yeniden.textContent = "Yeniden tara";
  yeniden.setAttribute(
    "style",
    "background:#1b2740;color:#e6ebf5;border:0;border-radius:8px;padding:9px 10px;font:600 13px system-ui;cursor:pointer"
  );
  yeniden.onclick = function () {
    kutu.remove();
    var betik = document.createElement("script");
    betik.src = AYAR.betik || (AYAR.uc + "/betik");
    document.body.appendChild(betik);
  };
  dugmeler.appendChild(gonder);
  dugmeler.appendChild(yeniden);
  kutu.appendChild(dugmeler);
  kutu.appendChild(durum);

  document.body.appendChild(kutu);
})();
