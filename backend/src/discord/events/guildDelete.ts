import { createEvent } from "../../utils/index.js";
import { updateStatus } from "../utils/activity.js";

createEvent({
    name: "Guild Leave Status Update",
    event: "guildDelete",
    async run(guild) {
        updateStatus(guild.client);
    }
});
