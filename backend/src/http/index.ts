import Fastify, { FastifyInstance } from "fastify";
import { Dave } from "../core/app.js";
import ck from "chalk";

/**
 * Inicializa o servidor HTTP e o atribui ao Singleton Dave.
 */
export async function setupHttp(app: Dave) {
    console.log(ck.cyan("→ Inicializando servidor HTTP (Fastify)..."));

    const server: FastifyInstance = Fastify({ 
        logger: false 
    });

    const PORT = Number(process.env.PORT) || 3000;

    try {
        await server.listen({ port: PORT, host: '0.0.0.0' });
        app.http = server;
        console.log(ck.green(`✓ Servidor HTTP rodando na porta ${PORT}.`));
    } catch (error) {
        console.error(ck.red("✗ Erro ao iniciar servidor HTTP:"), error);
        process.exit(1);
    }
}
