import { env } from "./core/env.js";
import { GatewayIntentBits, Partials } from "discord.js";
import { bootstrap } from "./core/bootstrap.js";
import { setupDatabase } from "./database/index.js";
import { setupHttp } from "./http/index.js";
import path from "path";
import { fileURLToPath } from "url";
import { checkSubscription } from "./middlewares/SubscriptionMiddleware.js";
import { setupCreators } from "./utils/creators.js";
import { BaseCommandHandlers, BaseEventHandlers, BaseResponderHandlers } from "./discord/handlers/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

await bootstrap({
    meta: import.meta,
    modules: [
        "./discord/commands",
        "./discord/events",
        "./discord/responders"
    ],
    beforeLoad: async (app) => {
        setupCreators({
            commands: {
                verbose: true,
                guilds: env.GUILD_ID ? [env.GUILD_ID] : []
            }
        });

        // 1. Inicializa o Banco de Dados
        await setupDatabase(app);

        // 2. Inicializa o Servidor HTTP
        await setupHttp(app);

        console.log("Configurações iniciais carregadas.");
        if (app.commands.logs.length) console.log(app.commands.logs.join("\n"));
        if (app.events.logs.length) console.log(app.events.logs.join("\n"));
        if (app.responders.logs.length) console.log(app.responders.logs.join("\n"));
    }
});
