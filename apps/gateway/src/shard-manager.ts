import { ShardingManager } from 'discord.js';
import { join } from 'node:path';
import { env } from '@dave/config';

// ---------------------------------------------------------------------------
// shard-manager.ts — seção 3.1 do PLAN.md
//
// Único responsável por criar e monitorar os shards do Discord.
// Cada shard é um processo filho que roda apps/gateway/src/shard.ts.
//
// O ShardingManager reconecta shards automaticamente em caso de queda.
// ---------------------------------------------------------------------------

const shardFile = join(import.meta.dirname, 'shard.ts');

export const manager = new ShardingManager(shardFile, {
  token: env.DISCORD_TOKEN,
  totalShards: 'auto', // Discord calcula o número necessário com base no bot
});

manager.on('shardCreate', (shard) => {
  console.log(`[ShardingManager] Shard ${shard.id} criado.`);

  shard.on('ready', () => {
    console.log(`[ShardingManager] Shard ${shard.id} pronto.`);
  });

  shard.on('disconnect', () => {
    console.warn(`[ShardingManager] Shard ${shard.id} desconectou.`);
  });

  shard.on('reconnecting', () => {
    console.log(`[ShardingManager] Shard ${shard.id} reconectando...`);
  });

  shard.on('death', (process) => {
    // pid só existe em ChildProcess, não em Worker threads
    const pid = 'pid' in process ? process.pid : undefined;
    console.error(`[ShardingManager] Shard ${shard.id} morreu${pid ? ` (PID ${pid})` : ''}.`);
  });
});
