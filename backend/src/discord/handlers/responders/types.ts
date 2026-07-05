import { AnySelectMenuInteraction, ButtonInteraction, CacheType, ModalSubmitInteraction } from "discord.js";

export enum ResponderType {
    Button = "button",
    StringSelect = "string_select",
    ChannelSelect = "channel_select",
    RoleSelect = "role_select",
    UserSelect = "user_select",
    MentionableSelect = "mentionable_select",
    Modal = "modal",
    ModalComponent = "modal_component"
}

export type GenericResponderInteraction<Cache extends CacheType = CacheType> =
    | ButtonInteraction<Cache>
    | AnySelectMenuInteraction<Cache>
    | ModalSubmitInteraction<Cache>;

export interface GenericResponderData<Cache extends CacheType = CacheType> {
    customId: string;
    types: readonly ResponderType[];
    parse?: (params: Record<string, string>) => any;
    run(interaction: GenericResponderInteraction<Cache>, params: any): Promise<any> | any;
}
