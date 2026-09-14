"use client";

import { useState } from "react";

type SeoFieldsProps = {
  defaultTitle: string;
  defaultDescription: string;
  defaultSlug: string;
  productName: string;
};

export function SeoFields({ defaultTitle, defaultDescription, defaultSlug, productName }: SeoFieldsProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [slug, setSlug] = useState(defaultSlug);

  return <section className="product-editor-section seo-editor">
    <div className="product-editor-heading"><div><small>GOOGLE VE BAĞLANTI</small><h4>Arama motoru görünümü</h4></div><span>Google önizlemesi</span></div>
    <div className="seo-preview" aria-label="Google arama sonucu önizlemesi">
      <span>https://arvoculture.com › urun › {slug || "urun-baglantisi"}</span>
      <strong>{title || productName}</strong>
      <p>{description || "Ürününüz için Google arama sonuçlarında gösterilecek açıklamayı ekleyin."}</p>
    </div>
    <div className="editor-field-grid">
      <label className="full-field">SEO başlığı <span className={title.length > 60 ? "field-count over" : "field-count"}>{title.length}/60</span>
        <input name="seo_title" value={title} onChange={(event)=>setTitle(event.target.value)} maxLength={70} placeholder={productName} />
        <small>Google için önerilen uzunluk 50–60 karakterdir.</small>
      </label>
      <label className="full-field">Meta açıklaması <span className={description.length > 160 ? "field-count over" : "field-count"}>{description.length}/160</span>
        <textarea name="seo_description" value={description} onChange={(event)=>setDescription(event.target.value)} maxLength={180} rows={4} placeholder="Ürünün faydasını ve öne çıkan özelliğini kısa biçimde açıklayın." />
        <small>Google için önerilen uzunluk 140–160 karakterdir.</small>
      </label>
      <label className="full-field">Ürün bağlantısı
        <div className="slug-input"><span>arvoculture.com/urun/</span><input name="slug" value={slug} onChange={(event)=>setSlug(event.target.value.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9-]/g,"-").replace(/-+/g,"-"))} required maxLength={160} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" /></div>
        <small>Kısa, anlaşılır ve ürün adıyla uyumlu bir bağlantı kullanın.</small>
      </label>
    </div>
  </section>;
}
