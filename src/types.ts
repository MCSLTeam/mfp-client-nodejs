import MFPClientV1 from "./v1/client";

export type MFPClientInfo = {
    host: string
    port: number
    username: string,
    password: string,
    secure?: boolean
    version?: number,
    reconnectOnClose?: boolean
};

export interface IMFPClient extends EventTarget {
    connect(): Promise<void>;

    close(): void;

    connected(): boolean;

    closed(): boolean;

    executeAction(action: string, params: any): Promise<any>;
}

export const clients = {
    v1: MFPClientV1
}