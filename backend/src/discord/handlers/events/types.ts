import { ClientEvents } from "discord.js";

export type ClientEventKey = keyof ClientEvents;

export interface GenericEventData {
    name: string;
    event: ClientEventKey;
    once?: boolean;
    free?: boolean;
    tags?: string[];
    run(...args: any[]): Promise<any> | any;
}

export type EventsCollection = Map<string, GenericEventData>;

export type GenericEventArgs = any[];

export interface EventPropData {
    name: ClientEventKey;
    args: GenericEventArgs;
}
