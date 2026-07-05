import ck from "chalk";
import { 
    ApplicationCommandData, 
    ApplicationCommandOptionData, 
    ApplicationCommandOptionType, 
    ApplicationCommandSubCommandData, 
    ApplicationCommandSubGroupData, 
    ApplicationCommandType, 
    Collection 
} from "discord.js";
import { 
    AutocompleteRun, 
    CommandModule, 
    CommandType, 
    GenericAppCommandData, 
    SlashCommandOptionData 
} from "./types.js";

type StoredAppCommandData =
    & GenericAppCommandData
    & Required<Pick<GenericAppCommandData, "type">>
    & { modules?: CommandModule[] }

type BuildedCommandData = ApplicationCommandData & { global?: boolean };

type Runner = Function | null | undefined;

export class CommandManager {
    private readonly collection = new Collection<string, StoredAppCommandData>();
    private readonly commandRunners = new Collection<string, Runner[]>();
    private readonly autocompleteRunners = new Collection<string, AutocompleteRun<any, boolean>>();

    public readonly logs: string[] = [];

    private formatName(name: string, type = ApplicationCommandType.ChatInput) {
        if (!name) return "";
        const limited = name.length > 32 ? name.slice(0, 32) : name;
        return type === ApplicationCommandType.ChatInput
            ? limited.toLowerCase().replaceAll(" ", "")
            : limited;
    }
    public clear() {
        // Comentado para evitar perda de metadados durante a execução
        // this.collection.clear();
    }
    public getAutocompleteHandler(...path: (string | null)[]) {
        const commandName = path[0];
        const type = ApplicationCommandType.ChatInput;
        const resolved = `/${type}/${path.filter(Boolean).join("/")}`;

        return this.autocompleteRunners.get(resolved) ??
            this.autocompleteRunners.get(`/${type}/${commandName}`);
    }
    public getHandler(type: ApplicationCommandType, ...path: (string | null)[]) {
        const commandName = path[0];
        const resolved = `/${type}/${path.filter(Boolean).join("/")}`;

        const formattedName = this.formatName(commandName!, type);
        const command = this.collection.get(formattedName);

        return {
            command,
            runners: this.commandRunners.get(resolved) ??
                this.commandRunners.get(`/${type}/${commandName}`)
        };
    }
    public getTitle(type?: CommandType) {
        return ({
            [ApplicationCommandType.ChatInput]:
                ["{/}", "Slash command"],
            [ApplicationCommandType.User]:
                ["{☰}", "User context menu"],
            [ApplicationCommandType.Message]:
                ["{☰}", "Message context menu"],
        } as const)[(type ?? ApplicationCommandType.ChatInput) as 1 | 2 | 3];
    }
    private buildOptions(options: SlashCommandOptionData<boolean>[], path: string) {
        const resolved: ApplicationCommandOptionData[] = [];
        for (const option of options) {
            const description = option.description ?? option.name;

            if (
                "autocomplete" in (option as any) &&
                (option as any).autocomplete &&
                typeof (option as any).autocomplete === "function"
            ){
                this.autocompleteRunners.set(
                    `${path}/${(option as any).name}`,
                    (option as any).autocomplete
                );
            }

            switch (option.type) {
                case ApplicationCommandOptionType.SubcommandGroup: {
                    const { options: subcommands, ...data } = option as any;

                    resolved.push({
                        ...data, description,
                        options: this.buildOptions(
                            subcommands as any, `${path}/${data.name}`
                        ) as ApplicationCommandSubCommandData[]
                    });
                    continue;
                }
                case ApplicationCommandOptionType.Subcommand: {
                    const { options, ...data } = option as any;
                    resolved.push({
                        ...data,
                        description, ...(options?.length ? {
                            options: this.buildOptions(
                                options as any, `${path}/${data.name}`
                            ) as Exclude<
                                ApplicationCommandOptionData,
                                | ApplicationCommandSubGroupData
                                | ApplicationCommandSubCommandData
                            >[]
                        } : {})
                    });
                    continue;
                }
                case ApplicationCommandOptionType.String:
                case ApplicationCommandOptionType.Integer:
                case ApplicationCommandOptionType.Number: {
                    const { choices, autocomplete, ...data } = option as any;

                    const validation = data.type === ApplicationCommandOptionType.String
                        ? { minLength: data.minLength, maxLength: data.maxLength }
                        : { minValue: data.minValue, maxValue: data.maxValue }

                    const extra = autocomplete
                        ? { autocomplete: true, ...validation }
                        : choices?.length 
                            ? { choices: choices.slice(0, 25) } 
                            : validation;

                    resolved.push(Object.assign({
                        ...data, description, ...extra
                    }));
                    continue;
                }
                default: {
                    resolved.push({ ...option, description } as any);
                }
            }
        }
        return resolved;
    }
    private resolveModules(modules: CommandModule[], path: string, run?: Function): SlashCommandOptionData<boolean>[] {
        const resolved: SlashCommandOptionData<boolean>[] = [];
        if (!modules.length) return [];

        const groups = modules.filter(module =>
            module.type === ApplicationCommandOptionType.SubcommandGroup
        );
        const subcommands = modules.filter(module =>
            module.type === ApplicationCommandOptionType.Subcommand
        );

        if (groups.length >= 1) {
            for (const group of groups) {
                const data = [
                    ...(group.options ?? []).map(data => ({
                        ...data,
                        type: ApplicationCommandOptionType.Subcommand as const,
                    })),
                    ...subcommands.filter(
                        sub => sub.group === group.name
                    )
                ]
                resolved.push({ ...group, options: data } as any);

                for (const subcommand of data) {
                    this.commandRunners.set(
                        `${path}/${group.name}/${(subcommand as any).name}`,
                        [run, group.run, (subcommand as CommandModule).run]
                    );
                }
            };
        }
        for (const subcommand of subcommands.filter(sub => !sub.group)) {
            this.commandRunners.set(
                `${path}/${subcommand.name}`,
                [run, subcommand.run]
            );
            resolved.push(subcommand as any);
        }
        return resolved;
    }
    public set(data: GenericAppCommandData) {
        const type = data.type ?? ApplicationCommandType.ChatInput;
        const name = this.formatName(data.name, type);
        const dmPermission = data.dmPermission ?? false
        const commandData = { ...data, name, type, dmPermission } as StoredAppCommandData;
        this.collection.set(name, commandData);
        this.commandRunners.set(`/${type}/${name}`, [data.run]);

        if ("autocomplete" in data && data.autocomplete) {
            this.autocompleteRunners.set(
                `/${type}/${name}`, data.autocomplete
            );
        }

        return commandData;
    }
    public build() {
        return Array
            .from(this.collection.values())
            .map(raw => {
                const {
                    options, modules, description,
                    descriptionLocalizations, ...data
                } = raw;

                const path = `/${data.type}/${data.name}`;

                const buildedOptions = this.buildOptions([
                    ...options ?? [],
                    ...this.resolveModules(
                        modules ?? [], path, data.run
                    )
                ] as any, path)

                const slashData = data.type === ApplicationCommandType.ChatInput
                    ? {
                        description: description ?? data.name,
                        descriptionLocalizations,
                        ...(buildedOptions.length >= 1 
                            ? { options: buildedOptions }
                            : {}
                        )
                    }
                    : {}
                return { ...data, ...slashData }
            }) as any[] as BuildedCommandData[];
    }
    public addLog(data: GenericAppCommandData) {
        const [icon] = this.getTitle(data.type);
        this.logs.push(ck.green(`${icon} > ${ck.underline.blue(data.name)} ✓`));
    }
    public addModule(commandName: string, module: CommandModule) {
        const command = this.collection.get(commandName);
        if (!command) return;
        command.modules ??= [];
        command.modules.push(module);
    }
}
