import { defineApp } from "convex/server";
import betterAuth from "./betterAuth/convex.config";
import resend from "@convex-dev/resend/convex.config";
import r2 from "@convex-dev/r2/convex.config.js";
import migrations from "@convex-dev/migrations/convex.config.js";

const app = defineApp();

app.use(betterAuth);
app.use(resend);
app.use(r2);
app.use(migrations);

export default app;
