export class Params {
    public static parse<T extends object = any>(pattern: string, path: string): T | null {
        const patternParts = pattern.split("/").filter(Boolean);
        const pathParts = path.split("/").filter(Boolean);

        if (patternParts.length !== pathParts.length) {
            return null;
        }

        const params: any = {};

        for (let i = 0; i < patternParts.length; i++) {
            const patternPart = patternParts[i];
            const pathPart = pathParts[i];

            if (patternPart.startsWith(":")) {
                const paramName = patternPart.slice(1);
                params[paramName] = pathPart;
                continue;
            }

            if (patternPart !== pathPart) {
                return null;
            }
        }

        return params as T;
    }

    public static resolve(pattern: string, params: Record<string, string | number>): string {
        return pattern.split("/").map(part => {
            if (part.startsWith(":")) {
                const paramName = part.slice(1);
                return params[paramName] ?? part;
            }
            return part;
        }).join("/");
    }
}
