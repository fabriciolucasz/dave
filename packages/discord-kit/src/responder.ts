import {
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type UserSelectMenuInteraction,
  type RoleSelectMenuInteraction,
  type MentionableSelectMenuInteraction,
  type ChannelSelectMenuInteraction,
  type InteractionReplyOptions,
  type InteractionUpdateOptions,
  type InteractionEditReplyOptions,
  type ModalComponentData,
  type EmbedBuilder,
  type ContainerBuilder,
  MessageFlags,
} from 'discord.js';

// ---------------------------------------------------------------------------
// responder.ts — seção 6.3 do PLAN.md
//
// Abstrai COMO responder a uma interação, independente do seu tipo.
// Handlers de comando nunca chamam interaction.reply() diretamente —
// sempre passam pelo Responder.
//
// PADRÃO: Instância nova por chamada (factory function), não singleton.
// Motivo: o estado (`interaction`, `replied`) é específico de cada chamada.
// ---------------------------------------------------------------------------

/** Tipos de interação suportados pelo Responder. */
export type AnyInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | RoleSelectMenuInteraction
  | MentionableSelectMenuInteraction
  | ChannelSelectMenuInteraction;

/** Payload de resposta — embed(s) ou container(s) de Components v2. */
export interface ResponderPayload {
  embeds?: EmbedBuilder[];
  components?: ContainerBuilder[];
  content?: string;
  /** Se true, a resposta é visível apenas para quem executou o comando. Padrão: false. */
  ephemeral?: boolean;
  /** Flags adicionais para a mensagem. */
  flags?: number;
}

// ---------------------------------------------------------------------------
// Classe Responder — instância nova por interação via createResponder()
// ---------------------------------------------------------------------------

class Responder {
  constructor(private readonly interaction: AnyInteraction) {}

  /**
   * Responde à interação com embeds ou containers.
   * Decide automaticamente entre reply, editReply ou followUp com base no
   * estado atual da interação.
   */
  async send(payload: ResponderPayload): Promise<void> {
    if (this.interaction.deferred) {
      await this.interaction.editReply(this.buildEditOptions(payload));
    } else if (this.interaction.replied) {
      await this.interaction.followUp(this.buildReplyOptions(payload));
    } else {
      await this.interaction.reply(this.buildReplyOptions(payload));
    }
  }

  /**
   * Resposta efêmera (só visível para quem executou).
   * Atalho para `send({ ...payload, ephemeral: true })`.
   */
  async sendEphemeral(payload: Omit<ResponderPayload, 'ephemeral'>): Promise<void> {
    await this.send({ ...payload, ephemeral: true });
  }

  /**
   * Adia a resposta (mostra "pensando...") para operações que levam mais de 3s.
   * Após isso, use `send()` para editar com o resultado.
   */
  async defer(ephemeral = false): Promise<void> {
    if (!this.interaction.deferred && !this.interaction.replied) {
      await this.interaction.deferReply({
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }

  /**
   * Atualiza a mensagem original da interação (válido para ButtonInteraction,
   * Select menus e similares).
   * Para ChatInputCommandInteraction, faz editReply.
   */
  async update(payload: ResponderPayload): Promise<void> {
    if (
      'update' in this.interaction &&
      !this.interaction.deferred &&
      !this.interaction.replied
    ) {
      await (this.interaction as ButtonInteraction).update(
        this.buildEditOptions(payload) as InteractionUpdateOptions,
      );
    } else {
      await this.send(payload);
    }
  }

  /**
   * Exibe um modal como resposta à interação.
   * Só válido para ButtonInteraction e ChatInputCommandInteraction (antes de reply/defer).
   */
  async showModal(modal: ModalComponentData): Promise<void> {
    if ('showModal' in this.interaction) {
      await (this.interaction as ChatInputCommandInteraction).showModal(modal);
    } else {
      throw new Error('Esta interação não suporta showModal.');
    }
  }

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  private buildReplyOptions(payload: ResponderPayload): InteractionReplyOptions {
    const hasContainers = payload.components && payload.components.length > 0;
    const flags = this.computeFlags(payload, hasContainers ?? false);

    const opts: InteractionReplyOptions = {
      ...(payload.content !== undefined && { content: payload.content }),
      ...(flags && { flags }),
    };

    if (hasContainers) {
      opts.components = payload.components as unknown as never[];
    } else if (payload.embeds) {
      opts.embeds = payload.embeds;
    }

    return opts;
  }

  private buildEditOptions(payload: ResponderPayload): InteractionEditReplyOptions {
    const hasContainers = payload.components && payload.components.length > 0;
    const flags = this.computeFlags(payload, hasContainers ?? false);

    const opts: InteractionEditReplyOptions = {
      ...(payload.content !== undefined && { content: payload.content }),
      ...(flags && { flags }),
    };

    if (hasContainers) {
      opts.components = payload.components as unknown as never[];
    } else if (payload.embeds) {
      opts.embeds = payload.embeds;
    }

    return opts;
  }

  private computeFlags(payload: ResponderPayload, hasContainers: boolean): number | undefined {
    const flags: number[] = [];

    if (payload.ephemeral) flags.push(MessageFlags.Ephemeral);
    if (payload.flags) flags.push(payload.flags);
    // IS_COMPONENTS_V2 flag — obrigatório quando se usam ContainerBuilders
    if (hasContainers) flags.push(MessageFlags.IsComponentsV2);

    const combined = flags.reduce((acc, f) => acc | f, 0);
    return combined !== 0 ? combined : undefined;
  }
}

// ---------------------------------------------------------------------------
// Factory function — instância nova por interação (padrão seção 7.3)
// ---------------------------------------------------------------------------

/**
 * Cria um Responder para a interação fornecida.
 *
 * @example
 * export async function execute(interaction: ChatInputCommandInteraction) {
 *   const responder = createResponder(interaction);
 *   await responder.send({ embeds: [successEmbed('Pong!')] });
 * }
 */
export function createResponder(interaction: AnyInteraction): Responder {
  return new Responder(interaction);
}
