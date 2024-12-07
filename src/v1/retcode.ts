export default class RetcodeV1 {
    public readonly name: string;
    public readonly code: number;
    public static readonly OK = new RetcodeV1('OK', 0);
    public static readonly UNKNOWN = new RetcodeV1('Unknown', -1);

    constructor(name: string, code: number) {
        this.name = name;
        this.code = code;
    }

    static of(code: number) {
        return Object.values(RetcodeV1).find(r => r instanceof RetcodeV1 && r.code === code) ?? this.UNKNOWN;
    }
}