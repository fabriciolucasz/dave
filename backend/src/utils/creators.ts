import { ApplicationCommandOptionType, ApplicationCommandType, ClientEvents, PermissionResolvable } from "discord.js";
import {CommandsConfig, Dave, EventsConfig, RespondersConfig} from "../core/app.js";
import { env } from "../core/env.js";
import { GenericAppCommandData, CommandModule, GenericEventData, GenericResponderData } from "../discord/handlers/index.js";


interface SetupCreatorsOptions {
    commands?: Partial<CommandsConfig> & {
        defaultMemberPermissions?: PermissionResolvable[];
    };
    events?: Partial<EventsConfig>;
    responders?: Partial<RespondersConfig>;
}

export function setupCreators(options: SetupCreatorsOptions = {}) {
    const app = Dave.getInstance();

    if (options.commands) {
        app.config.commands = { ...app.config.commands, ...options.commands };
    }

    if (env.GUILD_ID) {
        app.config.commands.guilds ??= [];
        if (!app.config.commands.guilds.includes(env.GUILD_ID)) {
            app.config.commands.guilds.push(env.GUILD_ID);
        }
    }

    if (options.events) {
        app.config.events = { ...app.config.events, ...options.events };
    }

    if (options.responders) {
        app.config.responders = { ...app.config.responders, ...options.responders };
    }

    const defaultPerms = options.commands?.defaultMemberPermissions;

    return {
        createCommand: function(data: GenericAppCommandData) {
            if (defaultPerms && !data.defaultMemberPermissions) {
                data.defaultMemberPermissions = defaultPerms;
            }

            const resolved = app.commands.set(data);
            app.commands.addLog(resolved);

            if (resolved.type !== ApplicationCommandType.ChatInput) {
                return resolved;
            }

            const commandName = resolved.name;

            const createSubcommand = (group?: string) => {
                return function(data: Omit<CommandModule, "type" | "group">) {
                    app.commands.addModule(commandName, {
                        ...data,
                        group,
                        type: ApplicationCommandOptionType.Subcommand,
                    } as CommandModule);
                }
            }

            return Object.assign(data, {
                ...resolved,
                group(data: { name: string, description: string }) {
                    app.commands.addModule(commandName, {
                        ...data,
                        type: ApplicationCommandOptionType.SubcommandGroup,
                    } as any);
                    return { subcommand: createSubcommand(data.name) }
                },
                subcommand: createSubcommand()
            });
        },
        createEvent: function<EventName extends keyof ClientEvents>(data: GenericEventData & { event: EventName }) {
            const resolved = {
                ...data,
                once: data.event === "ready" ? true : data.once
            };
            app.events.addLogs(resolved);
            return app.events.add(resolved);
        },
        createResponder: function(data: GenericResponderData) {
            app.responders.addLogs(data);
            return app.responders.add(data);
        },
    }
}
