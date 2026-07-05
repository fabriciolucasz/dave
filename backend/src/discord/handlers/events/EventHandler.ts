import type { Client } from "discord.js";
import { Dave } from "../../../core/app.js";
import type { EventPropData, GenericEventArgs, GenericEventData } from "./types.js";
import { glob } from "glob";
import path from "path";
import { pathToFileURL } from "url";

export abstract class BaseEventHandlers {
    public static async handler(data: GenericEventData, args: GenericEventArgs) {
        const app = Dave.getInstance();

        const { middleware, onError } = app.config.events;

        let isBlock = false;
        const block = (...selected: string[]) => {
            const tags = data.tags ?? [];
            if (selected.length === 0) {
                isBlock = tags.length === 0;
                return;
            }
            isBlock = selected.some(tag => tags.includes(tag));
        }

        const eventData = { name: data.event, args } as EventPropData;

        if (data.free) {
            // Se for gratuito, executa diretamente
        } else if (middleware) {
            await middleware(eventData, block);
        }
        if (isBlock) return;

        try {
            await data.run(...args);
        } catch (err) {
            if (onError) {
                onError(err, eventData);
                return;
            }
            throw err;
        }

        if (data.once) {
            app.events.getEvents(data.event)?.delete(data.name);
        }
    }
    public static register(client: Client) {
        const app = Dave.getInstance();
        const collection = app.events.collection.filter(
            (_, key) => key !== "clientReady"
        );

        for (const [key, events] of collection.entries()) {
            client.on(key, (...args) => {
                Promise.all(Array.from(events.values()).map(data =>
                    BaseEventHandlers.handler(data, args)
                ))
            });
        }
    }
}
