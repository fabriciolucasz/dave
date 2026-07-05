import { createEvent } from "../../utils/index.js";
import { updateStatus } from "../utils/activity.js";

createEvent({
    name: "Guild Join Status Update",
    event: "guildCreate",
    async run(guild) {
        updateStatus(guild.client);
    }
});
