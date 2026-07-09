import { defineCommand, createResponder, successEmbed } from '@dave/discord-kit';

// ---------------------------------------------------------------------------
// Comando /ping — exemplo de referência para novos comandos.
//
// Padrão (seção 7 do PLAN.md): usar defineCommand() com type: 'slash'.
// O TypeScript garante que description e execute estão presentes,
// e que campos exclusivos de outros tipos (como aliases) não são aceitos.
//
// Nota: o bot-worker roda sem WebSocket, então não há client.ws.ping.
// A latência é medida como round-trip do REST (tempo de defer → editReply).
// ---------------------------------------------------------------------------

export const pingCommand = defineCommand({
  type: 'slash',
  name: 'ping',
  description: 'Verifica a latência do bot com o Discord.',

  async execute(interaction) {
    const responder = createResponder(interaction);

    const start = Date.now();

    // Adia para medir o round-trip REST (o bot-worker não tem WebSocket)
    await responder.defer(true); // ephemeral = true

    const latency = Date.now() - start;

    await responder.send({
      embeds: [
        successEmbed('🏓 Pong!', `Latência REST: **${latency}ms**`),
      ],
    });
  },
});
