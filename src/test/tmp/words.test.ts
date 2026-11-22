import { it } from "vitest";
import { translateText } from "@/lib/interface-translations";
it("words", () => { for (const w of ["Online", "Offline", "Connecting"]) console.log(w, "=>", translateText("Swahili", w), "|", translateText("French", w), "|", translateText("Somali", w)); });
