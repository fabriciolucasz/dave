import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
    BOT_TOKEN: z.string().min(1),
    DATABASE_URL: z.string().url(),
    GUILD_ID: z.string().optional(),
    HTTP_PORT: z.string().default("3000").transform(Number),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
    console.error("❌ Invalid environment variables:", _env.error.format());
    process.exit(1);
}

export const env = _env.data;
