import {Client, ClientOptions, CommandInteraction} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { FastifyInstance } from "fastify";
import { GenericResponderInteraction, EventPropData, CommandManager, EventManager, ResponderManager } from "../discord/handlers/index.js";

export interface CommandsConfig {
    guilds?: string[];
    verbose?: boolean;
    middleware?(interaction: CommandInteraction, block: () => void): Promise<void> | void;
    onNotFound?(interaction: CommandInteraction): void;
    onError?(error: unknown, interaction: CommandInteraction): void;
}

export interface RespondersConfig {
    middleware?(interaction: GenericResponderInteraction, block: () => void, params: object): Promise<void> | void;
    onNotFound?(interaction: GenericResponderInteraction): void;
    onError?(error: unknown, interaction: GenericResponderInteraction, params: object): void;
}

export interface EventsConfig {
    middleware?(event: EventPropData, block: (...tags: string[]) => void): Promise<void> | void;
    onError?(error: unknown, event: EventPropData): void;
}

export interface Config {
    commands: CommandsConfig;
    events: EventsConfig;
    responders: RespondersConfig;
}

export class Dave {
    private static instance: Dave | null = null;

    public db!: PrismaClient;
    public http!: FastifyInstance;

    public readonly commands: CommandManager;
    public readonly events: EventManager;
    public readonly responders: ResponderManager;
    public readonly config: Config;

    private constructor() {
        this.events = new EventManager();
        this.commands = new CommandManager();
        this.responders = new ResponderManager();

        this.config = {
            commands: {},
            events: {},
            responders: {},
        }
    }

    public static getInstance() {
        if (!Dave.instance) {
            Dave.instance = new Dave();
        }
        return Dave.instance;
    }
}
