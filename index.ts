import {nanoid} from 'nanoid';
import {sleep} from './src/utils';
import Retcode from './src/retcode';
import {
    MFPActionResponse,
    MFPActions,
    MFPClientEvents,
    MFPClientInfo,
    MFPServerEvents,
    MFPServerInfo
} from './src/types';
import axios from 'axios';

export default class MFPClient extends EventTarget {
    public readonly clientInfo: MFPClientInfo;
    private _serverInfo?: MFPServerInfo;
    private _websocket: WebSocket | null = null;
    private _actionRes: Map<string, MFPActionResponse> = new Map();
    private _pingInterval: any;
    private readonly _reconnectOnClose: boolean;

    constructor(info: MFPClientInfo, reconnectOnClose: boolean = true) {
        super();
        let secure = false;
        try {
            secure = location.protocol == 'https:'
        } catch (ignored) {
            // nodejs
        }
        info.port = info.port ?? 11451;
        info.secure = info.secure ?? secure;
        this.clientInfo = info;
        this._reconnectOnClose = reconnectOnClose;
    }

    async getServerInfo(): Promise<MFPServerInfo> {
        if (!this._serverInfo) {
            const data = (await axios(this.getInfoUrl())).data
            if (data.apiVersion != 'v1') throw Error('Unsupported api version')
            this._serverInfo = data
            this.dispatchEvent(new CustomEvent('info', {
                detail: data
            }));
            return this.getServerInfo()
        }
        return this._serverInfo;
    }

    public async tryConnect(): Promise<boolean> {
        try {
            await this.getServerInfo()
            return true
        } catch (e) {
            return false
        }
    }

    public async subtoken(expires: number = 30, permissions: string[] = ['*']): Promise<string> {
        if (this.clientInfo.token.includes('.')) // jwt
            throw new Error('Not a main token')
        if (permissions.some(p => !/^(([a-zA-Z-_]+|\*{1,2})\.)*([a-zA-Z-_]+|\*{1,2})$/gm.test(p)))
            throw new Error('Invalid permission')
        return (await axios(this.getSubtokenUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: {
                token: this.clientInfo.token,
                expires: expires,
                permissions: permissions.join(',')
            }
        })).data
    }

    getInfoUrl(): string {
        return `${this.clientInfo.secure ? 'https' : 'http'}://${this.clientInfo.host}:${this.clientInfo.port}/info`;
    }

    getSubtokenUrl(): string {
        return `${this.clientInfo.secure ? 'https' : 'http'}://${this.clientInfo.host}:${this.clientInfo.port}/subtoken`;
    }

    getWsUrl(token: string): string {
        return `${this.clientInfo.secure ? 'wss' : 'ws'}://${this.clientInfo.host}:${this.clientInfo.port}/api/v1?token=${token}`;
    }

    async connect() {
        clearInterval(this._pingInterval)
        await this.getServerInfo()
        this._websocket = new WebSocket(this.getWsUrl(this.clientInfo.token));
        this._websocket?.addEventListener('open', () => {
            this.dispatchEvent(new CustomEvent('open'));
            console.log(this.logPrefix() + 'Connected to server');
        });
        this._websocket?.addEventListener('close', (e) => {
            clearInterval(this._pingInterval)
            this.dispatchEvent(new CustomEvent('close', {
                detail: {
                    reconnect: this._reconnectOnClose,
                    code: e.code,
                    reason: e.reason,
                    wasClean: e.wasClean
                }
            }));
            if (this._reconnectOnClose && e.reason != 'mfpclient-close') {
                console.log(this.logPrefix() + 'Disconnected from server, reconnecting');
                try {
                    this.connect();
                } catch (e) {
                    console.error(this.logPrefix() + 'Failed reconnecting to server: ', e);
                }
            } else {
                console.log(this.logPrefix() + 'Disconnected from server');
            }
        });
        this._websocket?.addEventListener('message', (e) => {
            let data;
            try {
                data = JSON.parse(e.data);
            } catch (ex) {
                console.warn(this.logPrefix() + 'Error parsing data received from MFPServer: ', e.data, ex);
            }
            if (data.event) {
                console.debug(this.logPrefix() + 'Event triggered: ', data)
                this.dispatchEvent(new CustomEvent(data.event, {
                    detail: {
                        data: data.data,
                        time: data.time
                    }
                }));
            } else if (data.status) {
                console.debug(this.logPrefix() + 'Action executed: ', data);
                this._actionRes.set(data.echo, {
                    status: data.status,
                    retcode: Retcode.of(data.retcode),
                    data: data.data,
                    message: data.message
                });
            } else {
                console.warn(this.logPrefix() + 'Unknown data received from MFPServer: ', data);
            }
        });
        this._pingInterval = setInterval(async () => {
            if (this.connected()) {
                let success = false;
                this.executeAction('ping').then(() => success = true);
                await sleep(10000);
                if (!success) {
                    console.warn(this.logPrefix() + 'Ping took too long, disconnecting');
                    this._websocket?.close(4000, 'mfpclient-pingtoolong');
                }
            }
        }, 60000);
    }

    close() {
        this._websocket?.close(1000, 'mfpclient-close');
    }

    connected() {
        return this._websocket?.readyState === WebSocket.OPEN;
    }

    closed() {
        return this._websocket?.readyState === WebSocket.CLOSED;
    }

    async executeAction(action: MFPActions | string, params: any = {}): Promise<MFPActionResponse> {
        if (!this.connected())
            throw new Error('MFPClient not connected');
        const echo = nanoid(16);
        const data = JSON.stringify({
            action,
            params,
            echo
        });
        console.debug(this.logPrefix() + 'Executing action: ', data);
        this._websocket?.send(data);
        while (!this._actionRes.has(echo)) {
            await sleep(100);
        }
        const res = this._actionRes.get(echo)!;
        this._actionRes.delete(echo);
        return res;
    }

    override addEventListener(type: MFPServerEvents | MFPClientEvents | string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean): void {
        super.addEventListener(type, callback, options);
    }

    override removeEventListener(type: MFPServerEvents | MFPClientEvents | string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean): void {
        super.removeEventListener(type, callback, options);
    }

    private logPrefix() {
        return `[MFPClientV1 - ${this.clientInfo.host}:${this.clientInfo.port}] `;
    }
}

export {MFPActionResponse, MFPActions, MFPClientInfo, MFPServerEvents, MFPClientEvents, Retcode}