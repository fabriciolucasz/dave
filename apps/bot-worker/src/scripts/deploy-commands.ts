import { REST, Routes } from 'discord.js';
import { env } from '@dave/config';
import { commandRegistry } from '@dave/discord-kit';

// ---------------------------------------------------------------------------
// scripts/deploy-commands.ts — registra comandos na API do Discord
//
// Execute com: bun run deploy-commands
// Para desenvolvimento (propagação instantânea): bun run deploy-commands --guild=GUILD_ID
//
// A lista de comandos é gerenciada AUTOMATICAMENTE pelo commandRegistry:
//   - Ao importar '../commands/index.js', todos os defineCommand() são registrados.
//   - commandRegistry.getRegisterableCommands() filtra slash + user commands.
//   - Prefix commands NUNCA são enviados à API do Discord.
//
// Para adicionar um novo comando:
//   1. Crie o arquivo em src/commands/meu-comando.ts usando defineCommand()
//   2. Importe e registre em src/commands/index.ts
//   3. Rode este script novamente
// ---------------------------------------------------------------------------

// Importa commands/index.ts para disparar o registro no commandRegistry
await import('../commands/index.js');

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

const rest = new REST({ version: '10' }).setToken(env.DISCORD_TOKEN);

// Suporte a --guild=GUILD_ID para deploy por guild (dev)
const guildArg = process.argv.find((a) => a.startsWith('--guild='));
const guildId = guildArg?.split('=')[1];

// Obtém todos os payloads registráveis (slash + user commands)
const registerableCommands = commandRegistry.getRegisterableCommands();
const commandsJson = registerableCommands.map((c) => c.toJSON());

if (commandsJson.length === 0) {
  console.warn('[Deploy] ⚠️  Nenhum comando registrado. Verifique src/commands/index.ts.');
  process.exit(0);
}

console.log(`[Deploy] Comandos a registrar (${commandsJson.length}):`);
console.log(`  slash: [${commandRegistry.getRegisteredSlashNames().join(', ')}]`);
console.log(`  user:  [${commandRegistry.getRegisteredUserNames().join(', ') || 'nenhum'}]`);

try {
  if (guildId) {
    // Registro por guild — propagação instantânea, ideal para dev
    await rest.put(Routes.applicationGuildCommands(env.DISCORD_CLIENT_ID, guildId), {
      body: commandsJson,
    });
    console.log(`[Deploy] ✅ Comandos registrados na guild ${guildId} com sucesso.`);
  } else {
    // Registro global — leva ~1h para propagar
    await rest.put(Routes.applicationCommands(env.DISCORD_CLIENT_ID), {
      body: commandsJson,
    });
    console.log('[Deploy] ✅ Comandos registrados globalmente com sucesso.');
    console.log('[Deploy] ℹ️  O Discord pode demorar até 1 hora para propagar os comandos globais.');
  }
} catch (error) {
  console.error('[Deploy] ❌ Erro ao registrar comandos:', error);
  process.exit(1);
}
