import {setupCreators} from "./creators.js";
import {checkSubscription} from "../middlewares/SubscriptionMiddleware.js";

export * from "./creators.js";
export * from "./Cooldown.js";
export * from "./Store.js";
export * from "./URLStore.js";
export * from "./Params.js";

export const { createCommand, createEvent, createResponder } = setupCreators({
    commands: {
        middleware: checkSubscription
    }
});