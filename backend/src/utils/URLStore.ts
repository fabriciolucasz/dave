import { Store } from "./Store.js";

export class URLStore extends Store<string> {
    public navigate(path: string): void {
        this.set("current", path);
    }

    public current(): string | undefined {
        return this.get("current");
    }

    public push(path: string): void {
        const history = this.getHistory();
        history.push(path);
        this.set("history", JSON.stringify(history));
        this.navigate(path);
    }

    public back(): string | undefined {
        const history = this.getHistory();
        if (history.length <= 1) return undefined;
        
        history.pop(); // Remove current
        const previous = history[history.length - 1];
        this.set("history", JSON.stringify(history));
        this.navigate(previous);
        return previous;
    }

    private getHistory(): string[] {
        const historyRaw = this.get("history");
        return historyRaw ? JSON.parse(historyRaw) : [];
    }
}
