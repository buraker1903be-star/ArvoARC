/*
  Testler Node'un yerleşik test aracıyla (node --test) çalışır;
  ek bağımlılık yok. Node TypeScript tiplerini kendisi siler, ama
  uzantısız göreli importları ("./tr-time") ve "@/" kısayolunu
  çözemez. Bu kanca ikisini de çözer; uygulama koduna dokunulmaz.
*/
import { register } from "node:module";

register("./resolve-hooks.mjs", import.meta.url);
