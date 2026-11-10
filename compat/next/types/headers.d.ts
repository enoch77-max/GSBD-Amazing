export declare function headers(): Promise<Headers>;
export declare function cookies(): Promise<Map<string, { name: string; value: string }>>;
export declare function draftMode(): Promise<{ isEnabled: boolean; enable(): void; disable(): void }>;
