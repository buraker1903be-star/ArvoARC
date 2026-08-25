import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "arc-product-images";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

function assertShopifyImageUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "cdn.shopify.com" || !url.pathname.startsWith("/s/files/")) {
    throw new Error("Unsupported image source");
  }
  return url;
}

export async function copyShopifyImages(
  supabase: SupabaseClient,
  organizationId: string,
  productId: string,
  sources: string[],
) {
  const paths: string[] = [];
  const errors: string[] = [];

  for (const [index, source] of sources.entries()) {
    try {
      const url = assertShopifyImageUrl(source);
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Image download failed (${response.status})`);

      const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      const extension = CONTENT_TYPES[contentType];
      if (!extension) throw new Error("Unsupported image type");

      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > MAX_IMAGE_BYTES) throw new Error("Image exceeds 10 MB");
      const body = await response.arrayBuffer();
      if (body.byteLength > MAX_IMAGE_BYTES) throw new Error("Image exceeds 10 MB");

      const path = `${organizationId}/${productId}/image-${String(index + 1).padStart(2, "0")}.${extension}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
        contentType,
        cacheControl: "31536000",
        upsert: true,
      });
      if (error) throw error;

      paths.push(path);
    } catch (error) {
      errors.push(`${index + 1}: ${error instanceof Error ? error.message : "Image migration failed"}`);
    }
  }

  return { paths, errors };
}

export async function createProductImageUrls(supabase:SupabaseClient,paths:string[]){
  if(!paths.length)return [];
  const {data,error}=await supabase.storage.from(BUCKET).createSignedUrls(paths,3600);
  if(error)return [];
  return data.map(item=>item.signedUrl).filter((url):url is string=>Boolean(url));
}
