import { Client, ClientOptions } from "discord.js";
import { Dave } from "./app.js";
import { env } from "./env.js";
import ck from "chalk";
import { BaseEventHandlers, BaseCommandHandlers } from "../discord/handlers/index.js";
import { glob } from "glob";
import path from "path";
import { pathToFileURL } from "url";
import { GenericAppCommandData } from "../discord/handlers/commands/types.js";

interface BootstrapOptions extends Partial<ClientOptions> {
    meta: ImportMeta;
    modules?: string[];
    beforeLoad?: (app: Dave) => Promise<void>;
}

export async function bootstrap(options: BootstrapOptions) {
    console.log(ck.blue("--- Iniciando Dave (Backend) ---"));

    const { meta, modules, beforeLoad, ...clientOptions } = options;

    const client = new Client({
        ...clientOptions,
        intents: options.intents ?? 0,
        partials: options.partials ?? [0],
        failIfNotExists: options.failIfNotExists ?? false,
    })

    const app = Dave.getInstance();

    if (options.beforeLoad) {
        console.log(ck.cyan("→ Executando hooks de pré-carregamento..."));
        await options.beforeLoad(app);
    }

    if (!app.db) {
        console.warn(ck.yellow("⚠ Aviso: app.db não foi inicializado. Verifique o beforeLoad."));
    }
    if (!app.http) {
        console.warn(ck.yellow("⚠ Aviso: app.http não foi inicializado. Verifique o beforeLoad."));
    }

    client.once("clientReady", async (client) => {
        console.log(ck.greenBright(`✓ Bot online como: ${ck.underline(client.user.tag)}`));

        await BaseCommandHandlers.register(client);

        await Promise.all(Array.from(app.events.getEvents("clientReady").values())
            .map(data => BaseEventHandlers.handler(data, [client]))
        );
    });

    await loadModules(meta.dirname, modules);

    BaseEventHandlers.register(client);

    await client.login(env.BOT_TOKEN);

    return app;
}

async function loadModules(dir: string, modules: string[] = []) {
    const app = Dave.getInstance();

    for (const relativePath of modules) {
        const moduleDir = path.resolve(dir, relativePath);
        const files = await glob("**/*.{js,ts,jsx,tsx}", { cwd: moduleDir });

        for (const file of files) {
            const filePath = path.join(moduleDir, file);
            const fileUrl = pathToFileURL(filePath).href;

            const isCommand = relativePath.includes("commands");
            const isPublic = file.includes("public");

            if (isCommand) {
                const originalSet = app.commands.set.bind(app.commands);
                app.commands.set = (data: GenericAppCommandData) => {
                    if (isPublic) data.free = true;
                    return originalSet(data);
                };
                await import(fileUrl);
                app.commands.set = originalSet;
            } else {
                await import(fileUrl);
            }
        }
    }
}