import { PrismaClient } from "@prisma/client";
import { Dave } from "../core/app.js";
import ck from "chalk";

/**
 * Inicializa a conexão com o banco de dados e a atribui ao Singleton Dave.
 */
export async function setupDatabase(app: Dave) {
    console.log(ck.cyan("→ Inicializando banco de dados..."));
    
    const prisma = new PrismaClient();
    
    try {
        await prisma.$connect();
        app.db = prisma;
        console.log(ck.green("✓ Conectado ao PostgreSQL via Prisma."));
    } catch (error) {
        console.error(ck.red("✗ Erro ao conectar ao banco de dados:"), error);
        process.exit(1);
    }
}
