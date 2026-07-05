import { createEvent } from "../../utils/index.js";
import { updateStatus } from "../utils/activity.js";

createEvent({
    name: "Ready",
    event: "clientReady",
    once: true,
    async run(client) {
        updateStatus(client);
    }
})