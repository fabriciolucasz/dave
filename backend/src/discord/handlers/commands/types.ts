import { 
    ApplicationCommandData, 
    ApplicationCommandOptionData, 
    AutocompleteInteraction, 
    ChatInputApplicationCommandData, 
    CommandInteraction 
} from "discord.js";

export type CommandType = ApplicationCommandData["type"];

export interface GenericAppCommandData extends ChatInputApplicationCommandData {
    global?: boolean;
    free?: boolean;
    run(interaction: CommandInteraction, ...args: any[]): Promise<any> | any;
    autocomplete?(interaction: AutocompleteInteraction): Promise<any> | any;
}

export interface CommandModule {
    name: string;
    type: number;
    group?: string;
    run(interaction: CommandInteraction, ...args: any[]): Promise<any> | any;
    options?: ApplicationCommandOptionData[];
}

export type SlashCommandOptionData<T extends boolean> = ApplicationCommandOptionData;

export type AutocompleteRun<T, U extends boolean> = (interaction: AutocompleteInteraction) => Promise<any> | any;

export class RunBlockError extends Error {}
