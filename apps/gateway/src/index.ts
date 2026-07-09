// ---------------------------------------------------------------------------
// apps/gateway/src/index.ts — entry point do gateway
//
// Este processo é o único que se conecta ao Discord.
// Inicia o ShardingManager, que por sua vez spawna os processos de shard.
// ---------------------------------------------------------------------------

import { manager } from './shard-manager.js';

console.log('[Gateway] Iniciando ShardingManager...');

await manager.spawn();

console.log('[Gateway] Todos os shards iniciados.');
