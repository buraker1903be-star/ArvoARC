"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveAndPublishTheme, saveThemeDraft, uploadThemeAsset } from "./actions";

type LayoutItem = { id: string; type: string; enabled: boolean };
export type Theme = Record<string, string | number | boolean | undefined | LayoutItem[]>;
type Field = { key: string; label: string; type?: "textarea" | "number"; min?: number; max?: number };
type ImageSlot = { slot: "hero_image" | "campaign_image"; label: string };
type Section = { type: string; label: string; group: "Şablon" | "Altbilgi"; fields: Field[]; image?: ImageSlot };
type Device = "desktop" | "tablet" | "mobile";

const catalog: Section[] = [
  {
    type: "hero", label: "Hero", group: "Şablon", image: { slot: "hero_image", label: "Hero görseli" },
    fields: [
      { key: "hero_eyebrow", label: "Üst etiket" }, { key: "hero_title", label: "Ana başlık" }, { key: "hero_emphasis", label: "Vurgulu başlık" },
      { key: "hero_description", label: "Açıklama", type: "textarea" },
      { key: "primary_cta_label", label: "Birinci buton" }, { key: "primary_cta_href", label: "Birinci bağlantı" },
      { key: "secondary_cta_label", label: "İkinci buton" }, { key: "secondary_cta_href", label: "İkinci bağlantı" },
    ],
  },
  { type: "manifest", label: "Marka manifestosu", group: "Şablon", fields: [{ key: "manifest_title", label: "Başlık" }, { key: "manifest_description", label: "Açıklama", type: "textarea" }] },
  {
    type: "worlds", label: "Ana koleksiyonlar", group: "Şablon",
    fields: [{ key: "apparel_title", label: "Giyim başlığı" }, { key: "apparel_description", label: "Giyim açıklaması" }, { key: "beauty_title", label: "Bakım başlığı" }, { key: "beauty_description", label: "Bakım açıklaması" }],
  },
  {
    type: "featured", label: "Çok satanlar", group: "Şablon",
    fields: [{ key: "featured_eyebrow", label: "Üst etiket" }, { key: "featured_title", label: "Başlık" }, { key: "products_per_row", label: "Satırdaki ürün (2–5)", type: "number", min: 2, max: 5 }],
  },
  {
    type: "campaign", label: "Kampanya alanı", group: "Şablon", image: { slot: "campaign_image", label: "Kampanya görseli" },
    fields: [{ key: "campaign_title", label: "Başlık" }, { key: "campaign_description", label: "Açıklama", type: "textarea" }],
  },
  {
    type: "values", label: "Neden ArvoCulture", group: "Şablon",
    fields: [{ key: "trust_one", label: "Avantaj 1" }, { key: "trust_two", label: "Avantaj 2" }, { key: "trust_three", label: "Avantaj 3" }, { key: "trust_four", label: "Avantaj 4" }],
  },
  {
    type: "footer", label: "Altbilgi", group: "Altbilgi",
    fields: [{ key: "footer_tagline", label: "Alt bilgi metni", type: "textarea" }, { key: "instagram_url", label: "Instagram URL" }, { key: "facebook_url", label: "Facebook URL" }],
  },
];

const colorFields = [
  { key: "primary_color", label: "Ana renk", hint: "Metin ve butonlar" },
  { key: "accent_color", label: "Vurgu rengi", hint: "Rozet ve kampanyalar" },
  { key: "background_color", label: "Arka plan", hint: "Sayfa zemini" },
];

const choiceFields: { key: string; label: string; options: [string, string][] }[] = [
  { key: "typography", label: "Yazı karakteri", options: [["editorial", "Editoryal"], ["modern", "Modern"], ["minimal", "Minimal"]] },
  { key: "hero_style", label: "Hero stili", options: [["editorial-orbs", "Editoryal"], ["minimal", "Sade"], ["split", "İkiye bölünmüş"]] },
  { key: "header_layout", label: "Üst menü düzeni", options: [["centered", "Logo ortada"], ["logo-left", "Logo solda"], ["minimal", "Sade"]] },
  { key: "product_card_style", label: "Ürün kartı", options: [["editorial", "Editoryal"], ["bordered", "Çerçeveli"], ["minimal", "Sade"]] },
  { key: "product_image_ratio", label: "Ürün görsel oranı", options: [["portrait", "Dikey (3:4)"], ["square", "Kare (1:1)"], ["landscape", "Yatay (4:3)"]] },
];

const switchFields: [string, string][] = [
  ["sticky_header", "Üst menü sabit kalsın"],
  ["show_search", "Arama simgesi"],
  ["show_account", "Hesap simgesi"],
  ["show_vendor", "Kartta marka adı"],
  ["show_badges", "Kartta rozetler"],
  ["show_quick_add", "Hızlı sepete ekle"],
];

/*
  Form tek kaynaktan beslenir: görünür kontrollerin adı yok, sunucuya
  giden değerler aşağıda gizli alanlar olarak durur. Eskiden açık
  olmayan bölümün alanları ayrı ayrı gizli girdi olarak basılıyor,
  tema ayarlarının ise hiç düzenleme ekranı yoktu.
*/
const formKeys = Array.from(new Set([
  ...catalog.flatMap((section) => section.fields.map((field) => field.key)),
  "announcement",
  ...colorFields.map((field) => field.key),
  ...choiceFields.map((field) => field.key),
  ...switchFields.map(([key]) => key),
]));

const standard = ["hero", "manifest", "worlds", "featured", "campaign", "values", "footer"];
const devices: [Device, string][] = [["desktop", "Masaüstü"], ["tablet", "Tablet"], ["mobile", "Mobil"]];
const THEME_PANEL = "__theme";

const initialLayout = (theme: Theme): LayoutItem[] =>
  Array.isArray(theme.section_layout)
    ? (theme.section_layout as LayoutItem[])
    : standard.map((type) => ({ id: type, type, enabled: theme[`show_${type}`] !== false }));

const formValue = (value: Theme[string]) => (typeof value === "boolean" ? (value ? "on" : "") : String(value ?? ""));

export function ThemeEditor({ initial, store }: { initial: Theme; store: string }) {
  const [config, setConfig] = useState(initial);
  const [layout, setLayout] = useState(() => initialLayout(initial));
  const [baseline] = useState(() => JSON.stringify({ config: initial, layout: initialLayout(initial) }));
  const [panel, setPanel] = useState("");
  const [device, setDevice] = useState<Device>("desktop");
  const [past, setPast] = useState<LayoutItem[][]>([]);
  const [future, setFuture] = useState<LayoutItem[][]>([]);
  const [adding, setAdding] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const drag = useRef("");

  const selectedItem = layout.find((item) => item.id === panel);
  const active = catalog.find((section) => section.type === selectedItem?.type);
  const selectedType = selectedItem?.type ?? "";
  const missing = catalog.filter((section) => !layout.some((item) => item.type === section.type));
  const dirty = useMemo(() => JSON.stringify({ config, layout }) !== baseline, [config, layout, baseline]);

  const previewConfig = useMemo(() => {
    const next: Theme = { ...config };
    layout.forEach((item, index) => {
      next[`show_${item.type}`] = item.enabled;
      next[`order_${item.type}`] = (index + 1) * 10;
    });
    return next;
  }, [config, layout]);

  const send = useCallback(() => {
    frame.current?.contentWindow?.postMessage({ type: "ARVO_THEME_PREVIEW", selected: selectedType, config: previewConfig }, "*");
  }, [previewConfig, selectedType]);
  useEffect(() => { send(); }, [send]);

  /* Kaydedilmemiş değişiklikle sekme kapanır ya da yenilenirse tarayıcı sorar. */
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const commit = (next: LayoutItem[]) => {
    setPast((items) => [...items, layout].slice(-30));
    setFuture([]);
    setLayout(next);
  };
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setFuture((items) => [layout, ...items]);
    setLayout(previous);
    setPast((items) => items.slice(0, -1));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items, layout]);
    setLayout(next);
    setFuture((items) => items.slice(1));
  };
  const update = (key: string, value: string | number | boolean) => setConfig((current) => ({ ...current, [key]: value }));
  const remove = () => {
    if (!selectedItem) return;
    commit(layout.filter((item) => item.id !== selectedItem.id));
    setPanel("");
  };
  const add = (type: string) => {
    if (layout.some((item) => item.type === type)) return;
    const item = { id: type, type, enabled: true };
    commit(type === "footer" ? [...layout, item] : [...layout.filter((x) => x.type !== "footer"), item, ...layout.filter((x) => x.type === "footer")]);
    setPanel(type);
    setAdding(false);
  };
  const drop = (target: string) => {
    const source = drag.current;
    drag.current = "";
    if (!source || source === target) return;
    const from = layout.find((item) => item.id === source);
    if (!from || from.type === "footer") return;
    const rest = layout.filter((item) => item.id !== source);
    const index = rest.findIndex((item) => item.id === target);
    commit([...rest.slice(0, index), from, ...rest.slice(index)]);
  };
  /* Sürükle-bırak dokunmatikte çalışmıyor; oklar her cihazda sıralar. */
  const move = (id: string, step: -1 | 1) => {
    const index = layout.findIndex((item) => item.id === id);
    const target = index + step;
    if (index < 0 || target < 0 || target >= layout.length || layout[target].type === "footer") return;
    const next = [...layout];
    [next[index], next[target]] = [next[target], next[index]];
    commit(next);
  };

  return (
    <form action={saveThemeDraft} className="visual-editor">
      <header className="visual-editor-bar">
        <div className="theme-bar-title">
          <b>ARVO Signature</b>
          <span>Etkin tema · Ana sayfa</span>
        </div>
        <div className="theme-bar-tools">
          <div className="theme-history">
            <button type="button" aria-label="Geri al" title="Geri al" disabled={!past.length} onClick={undo}>↶</button>
            <button type="button" aria-label="Yinele" title="Yinele" disabled={!future.length} onClick={redo}>↷</button>
          </div>
          <div className="device-switch" role="group" aria-label="Önizleme cihazı">
            {devices.map(([value, label]) => (
              <button type="button" key={value} aria-pressed={device === value} onClick={() => setDevice(value)}>{label}</button>
            ))}
          </div>
        </div>
        <BarActions dirty={dirty} />
      </header>

      <aside className="visual-editor-sidebar">
        {panel === THEME_PANEL ? (
          <section className="editor-settings theme-fields">
            <button type="button" className="editor-back" onClick={() => setPanel("")}>← Bölümler</button>
            <div className="editor-section-title"><h3>Tema ayarları</h3></div>
            <p className="theme-hint">Renkler önizlemede anında değişir. Yazı, düzen ve kart ayarları yayınladıktan sonra mağazada görünür.</p>
            <div className="theme-group">
              <h4>Duyuru çubuğu</h4>
              <label>Metin<input value={String(config.announcement ?? "")} maxLength={180} onChange={(event) => update("announcement", event.target.value)} /></label>
            </div>
            <div className="theme-group">
              <h4>Renkler</h4>
              {colorFields.map((field) => (
                <label className="theme-color" key={field.key}>
                  <input type="color" value={String(config[field.key] ?? "#000000").toLowerCase()} onChange={(event) => update(field.key, event.target.value.toUpperCase())} />
                  <span><b>{field.label}</b><small>{field.hint} · {String(config[field.key] ?? "").toUpperCase()}</small></span>
                </label>
              ))}
            </div>
            <div className="theme-group">
              <h4>Yazı ve düzen</h4>
              {choiceFields.map((field) => (
                <label key={field.key}>{field.label}
                  <select value={String(config[field.key] ?? "")} onChange={(event) => update(field.key, event.target.value)}>
                    {field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="theme-group">
              <h4>Menü ve ürün kartları</h4>
              {switchFields.map(([key, label]) => (
                <label className="theme-switch" key={key}>
                  <span>{label}</span>
                  <input type="checkbox" checked={config[key] === true} onChange={(event) => update(key, event.target.checked)} />
                  <i aria-hidden="true" />
                </label>
              ))}
            </div>
          </section>
        ) : active && selectedItem ? (
          <section className="editor-settings theme-fields">
            <button type="button" className="editor-back" onClick={() => setPanel("")}>← Bölümler</button>
            <div className="editor-section-title">
              <h3>{active.label}</h3>
              <button type="button" className="ac-btn ac-btn-danger" onClick={remove}>Kaldır</button>
            </div>
            <label className="theme-switch">
              <span>Bölümü göster</span>
              <input type="checkbox" checked={selectedItem.enabled} onChange={(event) => commit(layout.map((item) => item.id === selectedItem.id ? { ...item, enabled: event.target.checked } : item))} />
              <i aria-hidden="true" />
            </label>
            {active.fields.map((field) => (
              <label key={field.key}>{field.label}
                {field.type === "textarea"
                  ? <textarea rows={4} value={String(config[field.key] ?? "")} onChange={(event) => update(field.key, event.target.value)} />
                  : <input type={field.type ?? "text"} min={field.min} max={field.max} value={String(config[field.key] ?? "")} onChange={(event) => update(field.key, field.type === "number" ? Number(event.target.value) : event.target.value)} />}
              </label>
            ))}
            {active.image ? <ImageUpload image={active.image} url={typeof config[`${active.image.slot}_url`] === "string" ? String(config[`${active.image.slot}_url`]) : ""} /> : null}
          </section>
        ) : (
          <>
            <div className="editor-page-title">
              <b>Ana sayfa</b>
              <small>Bölümleri sürükleyin ya da oklarla sıralayın.</small>
            </div>
            <button type="button" className="theme-settings-link" onClick={() => { setPanel(THEME_PANEL); setAdding(false); }}>
              <span className="theme-swatches" aria-hidden="true">
                {colorFields.map((field) => <i key={field.key} style={{ background: String(config[field.key] ?? "") }} />)}
              </span>
              <span><b>Tema ayarları</b><small>Renk, yazı, üst menü, ürün kartları</small></span>
              <em aria-hidden="true">›</em>
            </button>
            {(["Şablon", "Altbilgi"] as const).map((group) => (
              <section className="editor-section-group" key={group}>
                <b>{group}</b>
                {layout.map((item, index) => ({ item, index, section: catalog.find((section) => section.type === item.type) }))
                  .filter(({ section }) => section?.group === group)
                  .map(({ item, index, section }) => (
                    <div
                      className="theme-row"
                      key={item.id}
                      data-hidden={item.enabled ? undefined : ""}
                      draggable={item.type !== "footer"}
                      onDragStart={() => { drag.current = item.id; }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => drop(item.id)}
                    >
                      <button type="button" className="theme-row-main" onClick={() => setPanel(item.id)}>
                        <span aria-hidden="true">⠿</span>{section?.label}{item.enabled ? null : <i>Gizli</i>}
                      </button>
                      {item.type === "footer" ? null : (
                        <>
                          <button type="button" className="theme-row-move" aria-label={`${section?.label} yukarı`} disabled={index === 0} onClick={() => move(item.id, -1)}>↑</button>
                          <button type="button" className="theme-row-move" aria-label={`${section?.label} aşağı`} disabled={index >= layout.length - 1 || layout[index + 1]?.type === "footer"} onClick={() => move(item.id, 1)}>↓</button>
                        </>
                      )}
                    </div>
                  ))}
                {group === "Şablon" ? (
                  <button type="button" className="add-section" aria-expanded={adding} onClick={() => setAdding(!adding)}>＋ Bölüm ekle</button>
                ) : null}
                {group === "Şablon" && adding ? (
                  <div className="section-library">
                    {missing.map((section) => <button type="button" key={section.type} onClick={() => add(section.type)}>＋ {section.label}</button>)}
                    {missing.length ? null : <small>Tüm bölümler kullanımda.</small>}
                  </div>
                ) : null}
              </section>
            ))}
          </>
        )}
        {formKeys.map((key) => <input key={key} type="hidden" name={key} value={formValue(config[key])} />)}
        <input type="hidden" name="section_layout_json" value={JSON.stringify(layout)} />
      </aside>

      <div className={`visual-preview device-${device}`}>
        <div className="preview-shell">
          <iframe ref={frame} src={store} title="Canlı mağaza önizlemesi" onLoad={send} />
        </div>
      </div>
    </form>
  );
}

/* Form gönderilirken iki buton da kilitlenir; hangisi çalışıyorsa onun etiketi değişir. */
function BarActions({ dirty }: { dirty: boolean }) {
  const { pending, action } = useFormStatus();
  const busy = (fn: unknown) => pending && action === fn;

  return (
    <div className="theme-bar-actions">
      {dirty ? <span className="theme-dirty" role="status"><i aria-hidden="true" />Kaydedilmemiş değişiklik</span> : null}
      <button type="submit" className="ac-btn" formAction={saveThemeDraft} disabled={pending}>
        {busy(saveThemeDraft) ? "Kaydediliyor…" : "Taslağı kaydet"}
      </button>
      <button
        type="submit"
        className="ac-btn ac-btn-primary"
        formAction={saveAndPublishTheme}
        disabled={pending}
        onClick={(event) => { if (!window.confirm("Tema kaydedilip mağazada yayına alınacak. Devam edilsin mi?")) event.preventDefault(); }}
      >
        {busy(saveAndPublishTheme) ? "Yayınlanıyor…" : "Kaydet ve yayınla"}
      </button>
    </div>
  );
}

/* Sunucu 4 MB üstünü reddeder; sınırı aşan dosya gönderilmeden yakalanır. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function ImageUpload({ image, url }: { image: ImageSlot; url: string }) {
  const { pending } = useFormStatus();
  const [problem, setProblem] = useState("");

  return (
    <div className="theme-group theme-image">
      <h4>{image.label}</h4>
      <div className="theme-image-preview" style={url ? { backgroundImage: `url(${JSON.stringify(url)})` } : undefined}>
        {url ? null : <span>Henüz görsel yok</span>}
      </div>
      <input type="hidden" name="slot" value={image.slot} />
      <input
        type="file"
        name="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        aria-label={`${image.label} dosyası`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && file.size > MAX_IMAGE_BYTES) {
            event.target.value = "";
            setProblem("Dosya 4 MB’tan büyük. Daha küçük bir görsel seçin.");
          } else {
            setProblem("");
          }
        }}
      />
      {problem ? <small className="theme-image-error" role="alert">{problem}</small> : null}
      <small>PNG, JPG, WebP veya AVIF, en fazla 4 MB. Yüklerken taslak da kaydedilir; görsel mağazada yayından sonra görünür.</small>
      <button type="submit" className="ac-btn" formAction={uploadThemeAsset} disabled={pending}>{pending ? "Yükleniyor…" : "Görseli yükle"}</button>
    </div>
  );
}
