export default class Retcode {
    public readonly name: string;
    public readonly code: number;
    public static readonly OK = new Retcode('OK', 0);
    public static readonly UNKNOWN = new Retcode('Unknown', -1);

    constructor(name: string, code: number) {
        this.name = name;
        this.code = code;
    }

    static of(code: number) {
        return Object.values(Retcode).find(r => r instanceof Retcode && r.code === code) ?? this.UNKNOWN;
    }
}