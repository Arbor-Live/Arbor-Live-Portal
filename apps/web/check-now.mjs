import { ConvexHttpClient } from "convex/browser";
const client = new ConvexHttpClient("https://industrious-chinchilla-247.convex.cloud");
try {
  const res = await client.query("publicEvents:listHappeningNow", {});
  console.log("candidates:", JSON.stringify(res.map(e => ({ t: e.title, start: new Date(e.startAt).toISOString(), end: new Date(e.endAt).toISOString() })), null, 2));
} catch (e) { console.log("ERR", e.message); }
