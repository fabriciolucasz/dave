import { BaseCommandHandlers, BaseResponderHandlers } from "../handlers/index.js";

import { createEvent } from "../../utils/index.js"

createEvent({
    name: "Interaction Create",
    event: "interactionCreate",
    async run(interaction) {
        if (interaction.isCommand()) {
            await BaseCommandHandlers.command(interaction);
        }
        if (interaction.isAutocomplete()) {
            await BaseCommandHandlers.autocomplete(interaction);
        }
        if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
            await BaseResponderHandlers.handler(interaction);
        }
    }
});
